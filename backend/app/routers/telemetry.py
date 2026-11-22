from __future__ import annotations

import asyncio
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from ..config import PLC_HISTORY_RETENTION_DAYS
from ..database import connect, json_dump, json_load, utc_now, audit
from ..dependencies import get_current_user
from ..security import token_hash

router = APIRouter(prefix="/api/telemetry", tags=["Telemetry"])


class TagWrite(BaseModel):
    value: Any
    reason: str = Field(default="manual-demo-write", max_length=200)


class EdgeTelemetrySample(BaseModel):
    tag_id: str = Field(min_length=1, max_length=128)
    value: Any
    sampled_at: datetime | None = None


class EdgeTelemetryBatch(BaseModel):
    samples: list[EdgeTelemetrySample] = Field(min_length=1, max_length=500)


def _validate_edge_value(kind: str, value: Any) -> Any:
    if kind == "bool":
        if type(value) is not bool:
            raise HTTPException(422, "مقدار BOOL باید true یا false باشد.")
        return value
    if kind in {"int16", "uint16", "int32", "uint32"}:
        if isinstance(value, bool) or not isinstance(value, int):
            raise HTTPException(422, "مقدار تگ صحیح باید عدد صحیح باشد.")
        bounds = {
            "int16": (-32768, 32767),
            "uint16": (0, 65535),
            "int32": (-2147483648, 2147483647),
            "uint32": (0, 4294967295),
        }
        low, high = bounds[kind]
        if not low <= value <= high:
            raise HTTPException(422, "مقدار خارج از محدوده نوع داده است.")
        return value
    if kind == "float32":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise HTTPException(422, "مقدار REAL باید عدد محدود باشد.")
        return float(value)
    if kind == "string":
        if not isinstance(value, str) or len(value) > 1024:
            raise HTTPException(422, "مقدار STRING معتبر نیست.")
        return value
    raise HTTPException(422, "نوع داده تگ پشتیبانی نمی‌شود.")


def _numeric_value(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _tag_rows(db, factory_id: str | None = None):
    if factory_id:
        rows = db.execute(
            "SELECT id,factory_id,payload,updated_at FROM resources WHERE collection='tags' AND (factory_id=? OR factory_id IS NULL)",
            (factory_id,),
        ).fetchall()
    else:
        rows = db.execute("SELECT id,factory_id,payload,updated_at FROM resources WHERE collection='tags'").fetchall()
    output=[]
    for row in rows:
        payload=json_load(row["payload"],{}) or {}
        output.append({"id":row["id"],**payload,"factory_id":row["factory_id"],"updated_at":row["updated_at"]})
    return output


def _evaluate_tag_alarms(db, tag_id: str, value: Any, evaluated_at: str | None = None) -> list[dict]:
    """Evaluate configured numeric alarm rules for one tag and persist transitions.

    Rule fields: tag (tag id or name), operator, threshold, optional enabled.
    The alarm record's status is the event state; condition_active tracks whether
    the process condition is still present after an operator acknowledges it.
    """
    numeric = _numeric_value(value)
    if numeric is None:
        return []
    now = evaluated_at or utc_now()
    tag_row = db.execute(
        "SELECT payload FROM resources WHERE collection='tags' AND id=?",
        (tag_id,),
    ).fetchone()
    if tag_row is None:
        return []
    tag_payload = json_load(tag_row["payload"], {}) or {}
    tag_name = tag_payload.get("name")
    rows = db.execute(
        "SELECT id,payload FROM resources WHERE collection='alarms'"
    ).fetchall()
    transitions: list[dict] = []
    comparators = {
        ">": lambda actual, limit: actual > limit,
        ">=": lambda actual, limit: actual >= limit,
        "<": lambda actual, limit: actual < limit,
        "<=": lambda actual, limit: actual <= limit,
        "==": lambda actual, limit: actual == limit,
        "!=": lambda actual, limit: actual != limit,
    }
    for row in rows:
        alarm = json_load(row["payload"], {}) or {}
        configured_tag = str(alarm.get("tag") or "")
        if configured_tag not in {tag_id, str(tag_name or "")}:
            continue
        if alarm.get("status") == "غیرفعال" or alarm.get("enabled") is False:
            continue
        operator = alarm.get("operator")
        comparator = comparators.get(operator)
        threshold = _numeric_value(alarm.get("threshold"))
        if comparator is None or threshold is None:
            continue
        condition = comparator(numeric, threshold)
        was_active = bool(alarm.get("condition_active", False))
        previous_status = alarm.get("status", "فعال")
        if condition:
            alarm["condition_active"] = True
            alarm["last_value"] = value
            alarm["evaluated_at"] = now
            if not was_active:
                alarm["status"] = "فعال"
                alarm["triggered_at"] = now
                alarm["trigger_count"] = int(alarm.get("trigger_count", 0)) + 1
                transitions.append({"id": row["id"], "status": "فعال", "value": value})
                audit(
                    db, None, "alarm.triggered", "alarms", row["id"],
                    {"tag_id": tag_id, "value": value, "operator": operator, "threshold": threshold},
                )
            elif previous_status not in {"تأییدشده", "فعال"}:
                alarm["status"] = "فعال"
                transitions.append({"id": row["id"], "status": "فعال", "value": value})
        else:
            alarm["last_value"] = value
            alarm["evaluated_at"] = now
            if was_active:
                alarm["condition_active"] = False
                alarm["status"] = "رفع‌شده"
                alarm["resolved_at"] = now
                transitions.append({"id": row["id"], "status": "رفع‌شده", "value": value})
                audit(
                    db, None, "alarm.cleared", "alarms", row["id"],
                    {"tag_id": tag_id, "value": value, "operator": operator, "threshold": threshold},
                )
        db.execute(
            "UPDATE resources SET payload=?,updated_at=? WHERE collection='alarms' AND id=?",
            (json_dump(alarm), now, row["id"]),
        )
    return transitions


def _latest_sample_map(db) -> dict[str, dict]:
    rows = db.execute(
        """SELECT s.id,s.tag_id,s.value_json,s.quality,s.source,s.sampled_at
           FROM telemetry_samples s
           JOIN (
             SELECT tag_id,MAX(id) AS max_id
             FROM telemetry_samples
             GROUP BY tag_id
           ) latest ON latest.max_id=s.id"""
    ).fetchall()
    return {row["tag_id"]: dict(row) for row in rows}


@router.get("/latest")
def latest(user: dict = Depends(get_current_user)):
    with connect() as db:
        factory_id = None if user["role"] == "Organization Admin" else user.get("factory_id")
        tags = _tag_rows(db, factory_id)
        if factory_id:
            edges = db.execute("SELECT id,name,status,last_seen FROM edge_devices WHERE factory_id=? ORDER BY created_at", (factory_id,)).fetchall()
        else:
            edges = db.execute("SELECT id,name,status,last_seen FROM edge_devices ORDER BY created_at").fetchall()
        samples = _latest_sample_map(db)
    items = []
    for tag in tags:
        sample = samples.get(tag["id"])
        physical_plc = str(tag.get("last_source") or "").startswith("plc:")
        items.append({
            "tag_id": tag["id"],
            "name": tag.get("name"),
            "value": tag.get("value") if physical_plc else json_load(sample["value_json"]) if sample else tag.get("value"),
            "unit": tag.get("unit", ""),
            "type": tag.get("type"),
            "quality": tag.get("last_quality") if physical_plc else sample["quality"] if sample else "UNSAMPLED",
            "source": tag.get("last_source") if physical_plc else sample["source"] if sample else "seed",
            "sampled_at": (tag.get("last_poll_at") or tag["updated_at"]) if physical_plc else sample["sampled_at"] if sample else tag["updated_at"],
        })
    qualities = {item["quality"] for item in items}
    return {
        "items": items,
        "edges": [dict(edge) for edge in edges],
        "quality": next(iter(qualities)) if len(qualities) == 1 else "MIXED",
        "note": "برای PLC فیزیکی مقدار جاری از آخرین Poll و تاریخچه از نمونه‌های زمان‌بندی‌شده خوانده می‌شود؛ مقدار seed به‌عنوان UNSAMPLED مشخص است.",
    }


@router.get("/history")
def history(tag_id: str, hours: int | None = Query(None, ge=1, le=744),
            seconds: int | None = Query(None, ge=1, le=2678400),
            limit: int = Query(2000, ge=1, le=100000),
            user: dict = Depends(get_current_user)):
    if hours is not None and seconds is not None:
        raise HTTPException(422, "بازه تاریخچه را فقط با ساعت یا ثانیه ارسال کنید.")
    window = timedelta(seconds=seconds) if seconds is not None else timedelta(hours=hours or 24)
    since = (datetime.now(timezone.utc) - window).isoformat(timespec="seconds")
    with connect() as db:
        tag = db.execute(
            "SELECT factory_id FROM resources WHERE collection='tags' AND id=?", (tag_id,)
        ).fetchone()
        if tag is None or (user["role"] != "Organization Admin" and tag["factory_id"] not in {None, user.get("factory_id")}):
            raise HTTPException(404, "تگ پیدا نشد.")
        if user["role"] == "Organization Admin":
            rows=db.execute(
                "SELECT tag_id,value_json,quality,source,sampled_at FROM telemetry_samples WHERE tag_id=? AND sampled_at>=? ORDER BY sampled_at DESC,id DESC LIMIT ?",
                (tag_id,since,limit),
            ).fetchall()
        else:
            rows=db.execute(
                "SELECT tag_id,value_json,quality,source,sampled_at FROM telemetry_samples WHERE tag_id=? AND factory_id=? AND sampled_at>=? ORDER BY sampled_at DESC,id DESC LIMIT ?",
                (tag_id,user.get("factory_id"),since,limit),
            ).fetchall()
    return {"items":[{"tag_id":r["tag_id"],"value":json_load(r["value_json"]),
                      "quality":r["quality"],"source":r["source"],"sampled_at":r["sampled_at"]} for r in reversed(rows)]}


@router.post("/edge/ingest")
def ingest_edge_telemetry(
    body: EdgeTelemetryBatch,
    x_edge_token: str | None = Header(default=None, alias="X-Edge-Token"),
):
    """Persist samples sent by an authenticated Edge agent.

    This endpoint records data only. It never translates a sample into a PLC write.
    """
    if not x_edge_token:
        raise HTTPException(401, "توکن Edge ارسال نشده است.")

    received_at = utc_now()
    accepted: list[dict[str, Any]] = []
    with connect() as db:
        edge = db.execute(
            "SELECT id,factory_id,status FROM edge_devices WHERE token_hash=?",
            (token_hash(x_edge_token),),
        ).fetchone()
        if edge is None or edge["status"] == "REVOKED":
            raise HTTPException(401, "توکن Edge معتبر نیست یا لغو شده است.")
        if not edge["factory_id"]:
            raise HTTPException(403, "Edge باید پیش از ارسال داده به یک کارخانه تخصیص داده شود.")

        for sample in body.samples:
            row = db.execute(
                "SELECT id,factory_id,payload FROM resources WHERE collection='tags' AND id=?",
                (sample.tag_id,),
            ).fetchone()
            if row is None:
                raise HTTPException(404, f"تگ {sample.tag_id} ثبت نشده است.")
            if row["factory_id"] != edge["factory_id"]:
                raise HTTPException(403, "Edge اجازه ارسال داده برای کارخانه این تگ را ندارد.")

            tag = json_load(row["payload"], {}) or {}
            value = _validate_edge_value(str(tag.get("type", "")), sample.value)
            tag["last_source"] = f"edge:{edge['id']}"
            tag["last_quality"] = "GOOD"
            sampled_at = sample.sampled_at or datetime.now(timezone.utc)
            if sampled_at.tzinfo is None:
                raise HTTPException(422, "زمان نمونه باید timezone داشته باشد.")
            sampled_at_text = sampled_at.astimezone(timezone.utc).isoformat(timespec="seconds")

            tag["value"] = value
            db.execute(
                "UPDATE resources SET payload=?,updated_at=? WHERE collection='tags' AND id=?",
                (json_dump(tag), sampled_at_text, sample.tag_id),
            )
            db.execute(
                "INSERT INTO telemetry_samples(factory_id,tag_id,value_json,quality,source,sampled_at) "
                "VALUES(?,?,?,?,?,?)",
                (
                    row["factory_id"], sample.tag_id, json_dump(value),
                    "GOOD", f"edge:{edge['id']}", sampled_at_text,
                ),
            )
            alarm_transitions = _evaluate_tag_alarms(db, sample.tag_id, value, sampled_at_text)
            accepted.append({
                "alarm_transitions": alarm_transitions,
                "tag_id": sample.tag_id,
                "value": value,
                "quality": "GOOD",
                "sampled_at": sampled_at_text,
            })

        db.execute(
            "UPDATE edge_devices SET status='ONLINE',last_seen=?,updated_at=? WHERE id=?",
            (received_at, received_at, edge["id"]),
        )
        db.execute(
            "INSERT INTO audit_events(actor_id,action,collection,record_id,details,created_at) "
            "VALUES(?,?,?,?,?,?)",
            (
                None, "edge.telemetry_ingest", "edge_devices", edge["id"],
                json_dump({"accepted_samples": len(accepted), "tag_ids": [item["tag_id"] for item in accepted]}),
                received_at,
            ),
        )

    return {
        "edge_id": edge["id"],
        "status": "ONLINE",
        "accepted_samples": len(accepted),
        "items": accepted,
        "mode": "EDGE_INGEST",
        "note": "نمونه‌ها در SQLite ذخیره شدند؛ این endpoint فرمانی به PLC ارسال نمی‌کند.",
    }


@router.post("/tags/{tag_id}/write")
def write_tag(tag_id: str, body: TagWrite, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Engineer", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی نوشتن مقدار تگ را ندارد.")
    with connect() as db:
        row=db.execute("SELECT payload,factory_id FROM resources WHERE collection='tags' AND id=?",(tag_id,)).fetchone()
        if not row or (user["role"] != "Organization Admin" and row["factory_id"] not in {None, user.get("factory_id")}):
            raise HTTPException(404,"تگ پیدا نشد.")
        tag=json_load(row["payload"],{}) or {}
        if tag.get("access") != "read_write":
            raise HTTPException(403,"این تگ فقط خواندنی است.")
        kind=tag.get("type")
        value=body.value
        if kind == "bool":
            if not isinstance(value,bool):
                raise HTTPException(422,"مقدار تگ BOOL باید true یا false باشد.")
        elif kind in {"int16","uint16","int32","uint32"}:
            if isinstance(value,bool) or not isinstance(value,int):
                raise HTTPException(422,"مقدار تگ صحیح باید عدد صحیح باشد.")
            bounds={"int16":(-32768,32767),"uint16":(0,65535),"int32":(-2147483648,2147483647),"uint32":(0,4294967295)}
            lo,hi=bounds[kind]
            if not lo <= value <= hi:
                raise HTTPException(422,"مقدار خارج از محدوده‌ی نوع داده است.")
        elif kind == "float32":
            if isinstance(value,bool) or not isinstance(value,(float,int)) or not math.isfinite(float(value)):
                raise HTTPException(422,"مقدار REAL باید عدد محدود باشد.")
            value=float(value)
        elif kind == "string":
            if not isinstance(value,str) or len(value)>1024:
                raise HTTPException(422,"مقدار STRING معتبر نیست.")
        else:
            raise HTTPException(422,"نوع داده‌ی تگ پشتیبانی نمی‌شود.")
        tag["value"]=value
        db.execute("UPDATE resources SET payload=?,updated_at=? WHERE collection='tags' AND id=?",
                   (json_dump(tag),utc_now(),tag_id))
        db.execute(
            "INSERT INTO telemetry_samples(factory_id,tag_id,value_json,quality,source,sampled_at) VALUES(?,?,?,?,?,?)",
            (row["factory_id"],tag_id,json_dump(value),"DEMO","web-write-simulation",utc_now()),
        )
        alarm_transitions = _evaluate_tag_alarms(db, tag_id, value)
    return {"tag_id":tag_id,"value":value,"quality":"DEMO","alarm_transitions":alarm_transitions,"execution_mode":"SIMULATION",
            "warning":"مقدار فقط در پایگاه داده‌ی دمو تغییر کرد؛ به PLC واقعی نوشته نشد."}


async def demo_simulator_loop(stop_event: asyncio.Event) -> None:
    """Generate explicitly labelled demonstration samples; never talks to PLC hardware."""
    random.seed(1024)
    while not stop_event.is_set():
        try:
            with connect() as db:
                tags=_tag_rows(db)
                plc_rows = db.execute(
                    "SELECT id,payload FROM resources WHERE collection='plcs'"
                ).fetchall()
                physical_plc_ids = {
                    row["id"] for row in plc_rows
                    if (json_load(row["payload"], {}) or {}).get("protocol") in {"modbus-tcp", "modbus-rtu", "s7"}
                }
                now=utc_now()
                for tag in tags:
                    if tag.get("access") != "read" or tag.get("type") not in {"float32","int16","uint16","int32","uint32"}:
                        continue
                    # Edge and physical PLC sources own their tags; never replace them with DEMO values.
                    if str(tag.get("last_source") or "").startswith(("edge:", "plc:")):
                        continue
                    if str(tag.get("plc") or "") in physical_plc_ids:
                        continue
                    old=_numeric_value(tag.get("value"))
                    if old is None:
                        continue
                    delta=max(abs(old)*0.008,0.05)
                    value=round(max(0.0,old+random.uniform(-delta,delta)),4)
                    payload={k:v for k,v in tag.items() if k not in {"id","factory_id","updated_at"}}
                    payload["value"]=value
                    payload["last_source"]="demo-simulator"
                    payload["last_quality"]="DEMO"
                    payload["last_poll_at"]=now
                    last_history_at = payload.get("last_history_at")
                    history_due = True
                    if last_history_at:
                        try:
                            history_due = (datetime.now(timezone.utc) - datetime.fromisoformat(last_history_at)).total_seconds() >= 5
                        except (TypeError, ValueError):
                            history_due = True
                    if history_due:
                        payload["last_history_at"]=now
                    db.execute("UPDATE resources SET payload=?,updated_at=? WHERE collection='tags' AND id=?",
                               (json_dump(payload),now,tag["id"]))
                    if history_due:
                        db.execute(
                            "INSERT INTO telemetry_samples(factory_id,tag_id,value_json,quality,source,sampled_at) VALUES(?,?,?,?,?,?)",
                            (tag.get("factory_id"),tag["id"],json_dump(value),"DEMO","demo-simulator",now),
                        )
                    _evaluate_tag_alarms(db, tag["id"], value, now)
                db.execute(
                    "DELETE FROM telemetry_samples WHERE sampled_at < ?",
                    ((datetime.now(timezone.utc)-timedelta(days=PLC_HISTORY_RETENTION_DAYS)).isoformat(timespec="seconds"),),
                )
        except Exception:
            # A transient storage failure must not terminate the application loop.
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=1)
        except asyncio.TimeoutError:
            continue


async def websocket_identity(websocket: WebSocket) -> dict | None:
    token = websocket.cookies.get("scada_session")
    if not token:
        return None
    now = utc_now()
    with connect() as db:
        row = db.execute(
            """SELECT u.id,u.role,u.factory_id FROM sessions s
               JOIN users u ON u.id=s.user_id
               WHERE s.token_hash=? AND s.expires_at>? AND u.status='فعال'""",
            (token_hash(token), now),
        ).fetchone()
    if row is None:
        return None
    identity = dict(row)
    if identity["role"] != "Organization Admin" and not identity.get("factory_id"):
        return None
    return identity


@router.websocket("/ws/live")
async def live_socket(websocket: WebSocket):
    user = await websocket_identity(websocket)
    if not user:
        await websocket.close(code=4401)
        return
    requested_interval = websocket.query_params.get("interval_ms")
    interval_ms = 1000 if requested_interval == "1000" else 5000
    await websocket.accept()
    try:
        while True:
            with connect() as db:
                factory_id = None if user["role"] == "Organization Admin" else user.get("factory_id")
                tags = _tag_rows(db, factory_id)
                samples = _latest_sample_map(db)
                if factory_id:
                    plc_rows = db.execute(
                        "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection='plcs' AND (factory_id=? OR factory_id IS NULL)",
                        (factory_id,),
                    ).fetchall()
                    alarm_rows = db.execute(
                        "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection='alarms' AND (factory_id=? OR factory_id IS NULL)",
                        (factory_id,),
                    ).fetchall()
                else:
                    plc_rows = db.execute(
                        "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection='plcs'"
                    ).fetchall()
                    alarm_rows = db.execute(
                        "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection='alarms'"
                    ).fetchall()
                plcs = [
                    {"id": row["id"], **(json_load(row["payload"], {}) or {}),
                     **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
                     "created_at": row["created_at"], "updated_at": row["updated_at"]}
                    for row in plc_rows
                ]
                alarms = [
                    {"id": row["id"], **(json_load(row["payload"], {}) or {}),
                     **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
                     "created_at": row["created_at"], "updated_at": row["updated_at"]}
                    for row in alarm_rows
                ]
            items = []
            for tag in tags:
                sample = samples.get(tag["id"])
                realtime_source = str(tag.get("last_source") or "").startswith(("plc:", "demo-simulator"))
                items.append({
                    "tag_id": tag["id"],
                    "name": tag.get("name"),
                    "value": tag.get("value") if realtime_source else json_load(sample["value_json"]) if sample else tag.get("value"),
                    "unit": tag.get("unit", ""),
                    "quality": tag.get("last_quality") if realtime_source else sample["quality"] if sample else "UNSAMPLED",
                    "source": tag.get("last_source") if realtime_source else sample["source"] if sample else "seed",
                    "sampled_at": (tag.get("last_poll_at") or tag.get("updated_at")) if realtime_source else sample["sampled_at"] if sample else tag.get("updated_at"),
                })
            qualities = {item["quality"] for item in items}
            await websocket.send_json({
                "type": "telemetry.snapshot",
                "quality": next(iter(qualities)) if len(qualities) == 1 else "MIXED",
                "items": items,
                "plcs": plcs,
                "alarms": alarms,
            })
            await asyncio.sleep(interval_ms / 1000)
    except WebSocketDisconnect:
        return
