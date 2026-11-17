from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import PLC_WRITES_ENABLED
from ..database import connect, json_dump, json_load, utc_now, audit
from ..dependencies import get_current_user
from ..plc_drivers import PLCDriverError, test_plc_connection, write_plc_tag
from ..plc_service import poll_plc_once
from .telemetry import _evaluate_tag_alarms, _validate_edge_value

router = APIRouter(prefix="/api/plc", tags=["PLC hardware"])


class PhysicalWrite(BaseModel):
    value: Any
    confirmation: str = Field(min_length=1, max_length=40)
    reason: str = Field(default="manual-engineering-write", max_length=300)


def _authorized_factory(row_factory: str | None, user: dict) -> bool:
    return user.get("role") == "Organization Admin" or row_factory == user.get("factory_id")


def _load_plc(plc_id: str, user: dict) -> dict[str, Any]:
    with connect() as db:
        row = db.execute(
            "SELECT id,factory_id,payload FROM resources WHERE collection='plcs' AND id=?",
            (plc_id,),
        ).fetchone()
    if row is None or not _authorized_factory(row["factory_id"], user):
        raise HTTPException(404, "PLC پیدا نشد.")
    return {"id": row["id"], "factory_id": row["factory_id"], **(json_load(row["payload"], {}) or {})}


def _set_plc_status(plc_id: str, status: str, error: str = "") -> None:
    now = utc_now()
    with connect() as db:
        row = db.execute(
            "SELECT payload FROM resources WHERE collection='plcs' AND id=?",
            (plc_id,),
        ).fetchone()
        if row is None:
            return
        payload = json_load(row["payload"], {}) or {}
        payload["connection_status"] = status
        payload["last_test_at"] = now
        payload["last_error"] = error[:1000]
        if status == "ONLINE":
            payload["last_success"] = now
        db.execute(
            "UPDATE resources SET payload=?,updated_at=? WHERE collection='plcs' AND id=?",
            (json_dump(payload), now, plc_id),
        )


def _require_engineering_role(user: dict) -> None:
    if user.get("role") not in {"Organization Admin", "Factory Admin", "Engineer"}:
        raise HTTPException(403, "این عملیات فقط برای مدیران یا نقش مهندس مجاز است.")


@router.get("/{plc_id}/status")
def plc_status(plc_id: str, user: dict = Depends(get_current_user)):
    plc = _load_plc(plc_id, user)
    return {
        "plc_id": plc_id,
        "protocol": plc.get("protocol"),
        "enabled": bool(plc.get("enabled")),
        "connection_status": plc.get("connection_status", "NOT_TESTED"),
        "last_test_at": plc.get("last_test_at"),
        "last_poll": plc.get("last_poll"),
        "last_success": plc.get("last_success"),
        "last_error": plc.get("last_error", ""),
        "last_good_tags": plc.get("last_good_tags", 0),
        "mapped_tags": plc.get("mapped_tags", 0),
    }


@router.post("/{plc_id}/test")
async def test_connection(plc_id: str, user: dict = Depends(get_current_user)):
    _require_engineering_role(user)
    plc = _load_plc(plc_id, user)
    if plc.get("protocol") == "simulator":
        return {"plc_id": plc_id, "status": "SIMULATOR", "connected": True,
                "note": "این PLC شبیه‌ساز است و ارتباط سخت‌افزاری ندارد."}
    try:
        result = await asyncio.to_thread(test_plc_connection, plc)
    except PLCDriverError as exc:
        _set_plc_status(plc_id, "OFFLINE", str(exc))
        return {"plc_id": plc_id, "status": "OFFLINE", "connected": False, "error": str(exc)}
    _set_plc_status(plc_id, "ONLINE")
    return {"plc_id": plc_id, "status": "ONLINE", **result}


@router.post("/{plc_id}/poll")
async def poll_now(plc_id: str, user: dict = Depends(get_current_user)):
    _require_engineering_role(user)
    plc = _load_plc(plc_id, user)
    if plc.get("protocol") == "simulator":
        raise HTTPException(409, "PLC شبیه‌ساز از طریق مولد داده DEMO به‌روزرسانی می‌شود.")
    try:
        return await asyncio.to_thread(poll_plc_once, plc_id, plc.get("factory_id"))
    except PLCDriverError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/tags/{tag_id}/write")
async def write_physical_tag(tag_id: str, body: PhysicalWrite,
                             user: dict = Depends(get_current_user)):
    """Physical writes require a global env switch, per-PLC opt-in and an explicit confirmation."""
    _require_engineering_role(user)
    if not PLC_WRITES_ENABLED:
        raise HTTPException(403, "نوشتن فیزیکی غیرفعال است؛ SCADA_PLC_WRITES_ENABLED باید فقط پس از بررسی ایمنی فعال شود.")
    if body.confirmation != "WRITE TO PLC":
        raise HTTPException(422, "برای تأیید نوشتن، عبارت دقیق WRITE TO PLC را ارسال کنید.")

    with connect() as db:
        row = db.execute(
            "SELECT id,factory_id,payload FROM resources WHERE collection='tags' AND id=?",
            (tag_id,),
        ).fetchone()
        if row is None or not _authorized_factory(row["factory_id"], user):
            raise HTTPException(404, "تگ پیدا نشد.")
        tag = {"id": row["id"], "factory_id": row["factory_id"], **(json_load(row["payload"], {}) or {})}
        plc_row = db.execute(
            "SELECT id,factory_id,payload FROM resources WHERE collection='plcs' AND id=?",
            (tag.get("plc"),),
        ).fetchone()
        if plc_row is None or plc_row["factory_id"] != row["factory_id"]:
            raise HTTPException(422, "PLC متصل به تگ معتبر نیست.")
        plc = {"id": plc_row["id"], "factory_id": plc_row["factory_id"], **(json_load(plc_row["payload"], {}) or {})}
        if not plc.get("enabled"):
            raise HTTPException(409, "ابتدا ارتباط این PLC را در تنظیمات فعال کنید.")
        if not plc.get("allow_writes") or not plc.get("safety_confirmed"):
            raise HTTPException(403, "نوشتن فیزیکی برای این PLC مجاز نشده یا تأیید ایمنی ثبت نشده است.")
        if tag.get("access") != "read_write":
            raise HTTPException(403, "این تگ فقط خواندنی است.")
        if plc.get("protocol") == "simulator":
            raise HTTPException(409, "برای PLC شبیه‌ساز از مسیر نوشتن Demo استفاده کنید.")

    try:
        value = _validate_edge_value(str(tag.get("type", "")), body.value)
        await asyncio.to_thread(write_plc_tag, plc, tag, value)
    except (PLCDriverError, HTTPException) as exc:
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(502, f"نوشتن یا تأیید بازخوانی PLC ناموفق بود: {exc}") from exc

    now = utc_now()
    source = f"plc:{plc['id']}"
    with connect() as db:
        current = db.execute(
            "SELECT payload FROM resources WHERE collection='tags' AND id=? AND factory_id=?",
            (tag_id, row["factory_id"]),
        ).fetchone()
        if current is None:
            raise HTTPException(404, "تگ در زمان ثبت نتیجه پیدا نشد.")
        payload = json_load(current["payload"], {}) or {}
        payload.update({"value": value, "last_source": source, "last_quality": "GOOD"})
        payload.pop("last_error", None)
        db.execute(
            "UPDATE resources SET payload=?,updated_at=? WHERE collection='tags' AND id=?",
            (json_dump(payload), now, tag_id),
        )
        db.execute(
            "INSERT INTO telemetry_samples(factory_id,tag_id,value_json,quality,source,sampled_at) VALUES(?,?,?,?,?,?)",
            (row["factory_id"], tag_id, json_dump(value), "GOOD", source, now),
        )
        transitions = _evaluate_tag_alarms(db, tag_id, value, now)
        audit(db, user["id"], "plc.tag.write", "tags", tag_id,
              {"plc_id": plc["id"], "reason": body.reason, "value": value, "verified": True})
    return {
        "tag_id": tag_id,
        "plc_id": plc["id"],
        "value": value,
        "quality": "GOOD",
        "source": source,
        "execution_mode": "PHYSICAL_PLC",
        "verified_by_readback": True,
        "alarm_transitions": transitions,
        "written_at": now,
    }
