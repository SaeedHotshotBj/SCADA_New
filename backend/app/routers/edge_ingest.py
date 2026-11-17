from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from ..database import connect, json_dump, json_load, utc_now, audit
from ..security import token_hash

router = APIRouter(prefix="/api/edge", tags=["Edge ingestion"])


class EdgeSample(BaseModel):
    tag_id: str = Field(min_length=1, max_length=120)
    value: Any
    quality: str = Field(default="GOOD", pattern="^(GOOD|UNCERTAIN|BAD)$")
    sampled_at: datetime | None = None


class EdgeIngestRequest(BaseModel):
    samples: list[EdgeSample] = Field(min_length=1, max_length=500)
    sequence: int | None = Field(default=None, ge=0)
    edge_time: datetime | None = None


def _validate_value(kind: str, value: Any) -> Any:
    if kind == "bool":
        if not isinstance(value, bool):
            raise HTTPException(422, "مقدار BOOL باید true یا false باشد.")
        return value
    if kind in {"int16", "uint16", "int32", "uint32"}:
        if isinstance(value, bool) or not isinstance(value, int):
            raise HTTPException(422, "مقدار تگ صحیح باید عدد صحیح باشد.")
        bounds = {"int16": (-32768, 32767), "uint16": (0, 65535),
                  "int32": (-2147483648, 2147483647), "uint32": (0, 4294967295)}
        low, high = bounds[kind]
        if not low <= value <= high:
            raise HTTPException(422, "مقدار خارج از محدوده نوع داده تگ است.")
        return value
    if kind == "float32":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise HTTPException(422, "مقدار FLOAT32 باید عدد محدود باشد.")
        return float(value)
    if kind == "string":
        if not isinstance(value, str) or len(value) > 1024:
            raise HTTPException(422, "مقدار STRING معتبر نیست.")
        return value
    raise HTTPException(422, "نوع داده تگ پشتیبانی نمی‌شود.")



def _alarm_condition(value: Any, operator: str, threshold: float, active: bool, deadband: float) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        return False
    value = float(value)
    if operator == ">":
        return value > threshold - (deadband if active else 0)
    if operator == ">=":
        return value >= threshold - (deadband if active else 0)
    if operator == "<":
        return value < threshold + (deadband if active else 0)
    if operator == "<=":
        return value <= threshold + (deadband if active else 0)
    if operator == "==":
        tolerance = deadband if active else 0
        return abs(value - threshold) <= tolerance
    if operator == "!=":
        tolerance = deadband if active else 0
        return abs(value - threshold) > tolerance
    return False


def _evaluate_alarm_rules(db, tag_row, tag: dict, value: Any, quality: str) -> int:
    if quality != "GOOD":
        return 0
    rows = db.execute(
        """SELECT id,payload FROM resources WHERE collection='alarms'
           AND (factory_id=? OR factory_id IS NULL)""",
        (tag_row["factory_id"],),
    ).fetchall()
    created = 0
    for row in rows:
        rule = json_load(row["payload"], {}) or {}
        if rule.get("status", "فعال") != "فعال":
            continue
        if rule.get("tag") not in {tag_row["id"], tag.get("name")}:
            continue
        try:
            threshold = float(rule.get("threshold"))
            deadband = max(0.0, float(rule.get("deadband") or 0))
        except (TypeError, ValueError):
            continue
        operator = str(rule.get("operator") or "")
        existing = db.execute(
            """SELECT id,state FROM alarm_events WHERE alarm_id=?
               AND state IN ('ACTIVE','ACKNOWLEDGED') ORDER BY triggered_at DESC LIMIT 1""",
            (row["id"],),
        ).fetchone()
        is_active = _alarm_condition(value, operator, threshold, existing is not None, deadband)
        if is_active and existing is None:
            db.execute(
                """INSERT INTO alarm_events(alarm_id,tag_id,value_json,severity,state,message,triggered_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (row["id"], tag_row["id"], json_dump(value), str(rule.get("severity") or "متوسط"),
                 "ACTIVE", str(rule.get("message") or rule.get("name") or "Alarm"), utc_now()),
            )
            created += 1
        elif is_active and existing is not None:
            db.execute(
                "UPDATE alarm_events SET value_json=? WHERE id=?",
                (json_dump(value), existing["id"]),
            )
        elif not is_active and existing is not None:
            db.execute(
                "UPDATE alarm_events SET state='RETURNED' WHERE id=?",
                (existing["id"],),
            )
    return created

@router.post("/ingest", status_code=202)
def ingest_samples(body: EdgeIngestRequest, x_edge_token: str | None = Header(default=None)):
    if not x_edge_token:
        raise HTTPException(401, "توکن Edge ارسال نشده است.")
    now = datetime.now(timezone.utc)
    accepted = 0
    with connect() as db:
        edge = db.execute(
            "SELECT id,factory_id,status FROM edge_devices WHERE token_hash=?",
            (token_hash(x_edge_token),),
        ).fetchone()
        if edge is None or edge["status"] == "REVOKED":
            raise HTTPException(401, "توکن Edge معتبر نیست یا لغو شده است.")
        for sample in body.samples:
            tag_row = db.execute(
                "SELECT id,factory_id,payload FROM resources WHERE collection='tags' AND id=?",
                (sample.tag_id,),
            ).fetchone()
            if tag_row is None:
                raise HTTPException(404, f"تگ {sample.tag_id} در سامانه ثبت نشده است.")
            if edge["factory_id"] and tag_row["factory_id"] != edge["factory_id"]:
                raise HTTPException(403, "Edge اجازه ارسال داده برای این تگ را ندارد.")
            tag = json_load(tag_row["payload"], {}) or {}
            value = _validate_value(tag.get("type", ""), sample.value)
            sampled_at = sample.sampled_at or now
            if sampled_at.tzinfo is None:
                sampled_at = sampled_at.replace(tzinfo=timezone.utc)
            age = (now - sampled_at.astimezone(timezone.utc)).total_seconds()
            if age > 86400 or age < -60:
                raise HTTPException(422, "زمان نمونه خارج از محدوده قابل قبول است.")
            tag["value"] = value
            tag["last_quality"] = sample.quality
            tag["last_source"] = "edge:" + edge["id"]
            db.execute(
                "UPDATE resources SET payload=?,updated_at=? WHERE collection='tags' AND id=?",
                (json_dump(tag), utc_now(), sample.tag_id),
            )
            db.execute(
                """INSERT INTO telemetry_samples(factory_id,tag_id,value_json,quality,source,sampled_at)
                   VALUES(?,?,?,?,?,?)""",
                (tag_row["factory_id"], sample.tag_id, json_dump(value), sample.quality,
                 "edge:" + edge["id"], sampled_at.astimezone(timezone.utc).isoformat(timespec="seconds")),
            )
            _evaluate_alarm_rules(db, tag_row, tag, value, sample.quality)
            accepted += 1
        db.execute(
            "UPDATE edge_devices SET status='ONLINE',last_seen=?,updated_at=? WHERE id=?",
            (utc_now(), utc_now(), edge["id"]),
        )
        audit(db, None, "edge.ingest", "edge_devices", edge["id"],
              {"accepted": accepted, "sequence": body.sequence})
    return {"ok": True, "edge_id": edge["id"], "accepted": accepted,
            "received_at": utc_now(), "quality": "EDGE_REPORTED"}
