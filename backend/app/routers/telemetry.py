from __future__ import annotations

import asyncio
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from ..database import connect, json_dump, json_load, utc_now
from ..dependencies import get_current_user
from ..security import token_hash

router = APIRouter(prefix="/api/telemetry", tags=["Telemetry"])


class TagWrite(BaseModel):
    value: Any
    reason: str = Field(default="manual-demo-write", max_length=200)


def _numeric_value(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _tag_rows(db):
    rows = db.execute("SELECT id,factory_id,payload,updated_at FROM resources WHERE collection='tags'").fetchall()
    output=[]
    for row in rows:
        payload=json_load(row["payload"],{}) or {}
        output.append({"id":row["id"],**payload,"factory_id":row["factory_id"],"updated_at":row["updated_at"]})
    return output


@router.get("/latest")
def latest(user: dict = Depends(get_current_user)):
    with connect() as db:
        tags = _tag_rows(db)
        edges = db.execute("SELECT id,name,status,last_seen FROM edge_devices ORDER BY created_at").fetchall()
    return {"items":[{"tag_id":t["id"],"name":t.get("name"),"value":t.get("value"),
                      "unit":t.get("unit",""),"type":t.get("type"),"quality":"DEMO",
                      "source":"demo-seed-or-simulator","sampled_at":t["updated_at"]} for t in tags],
            "edges":[dict(e) for e in edges],
            "note":"مقادیر دارای quality=DEMO هستند و داده‌ی PLC واقعی محسوب نمی‌شوند."}


@router.get("/history")
def history(tag_id: str, hours: int = Query(24, ge=1, le=744),
            limit: int = Query(2000, ge=1, le=10000),
            user: dict = Depends(get_current_user)):
    since=(datetime.now(timezone.utc)-timedelta(hours=hours)).isoformat(timespec="seconds")
    with connect() as db:
        rows=db.execute(
            "SELECT tag_id,value_json,quality,source,sampled_at FROM telemetry_samples WHERE tag_id=? AND sampled_at>=? ORDER BY sampled_at DESC LIMIT ?",
            (tag_id,since,limit),
        ).fetchall()
    return {"items":[{"tag_id:r["tag_id"],"value":json_load(r["value_json"]),
                      "quality":r["quality"],"source":r["source"],"sampled_at":r["sampled_at"]} for r in reversed(rows)]}


@router.post("/tags/{tag_id}/write")
def write_tag(tag_id: str, body: TagWrite, user: dict = Depends(get_current_user)):
    with connect() as db:
        row=db.execute("SELECT payload,factory_id FROM resources WHERE collection='tags' AND id=?",(tag_id,)).fetchone()
        if not row:
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
    return {"tag_id":tag_id,"value":value,"quality":"DEMO","execution_mode":"SIMULATION",
            "warning":"مقدار فقط در پایگاه داده‌ی دمو تغییر کرد؛ به PLC واقعی نوشته نشد."}


async def demo_simulator_loop(stop_event: asyncio.Event) -> None:
    """Generate explicitly labelled demonstration samples; never talks to PLC hardware."""
    random.seed(1024)
    while not stop_event.is_set():
        try:
            with connect() as db:
                tags=_tag_rows(db)
                now=utc_now()
                for tag in tags:
                    if tag.get("access") != "read" or tag.get("type") not in {"float32","int16","uint16","int32","uint32"}:
                        continue
                    old=_numeric_value(tag.get("value"))
                    if old is None:
                        continue
                    delta=max(abs(old)*0.008,0.05)
                    value=round(max(0.0,old+random.uniform(-delta,delta)),4)
                    payload={k:v for k,v in tag.items() if k not in {"id","factory_id","updated_at"}}
                    payload["value"]=value
                    db.execute("UPDATE resources SET payload=?,updated_at=? WHERE collection='tags' AND id=?",
                               (json_dump(payload),now,tag["id"]))
                    db.execute(
                        "INSERT INTO telemetry_samples(factory_id,tag_id,value_json,quality,source,sampled_at) VALUES(?,?,?,?,?,?)",
                        (tag.get("factory_id"),tag["id"],json_dump(value),"DEMO","demo-simulator",now),
                    )
                db.execute(
                    "DELETE FROM telemetry_samples WHERE sampled_at < ?",
                    ((datetime.now(timezone.utc)-timedelta(days=30)).isoformat(timespec="seconds"),),
                )
        except Exception:
            # A transient storage failure must not terminate the application loop.
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=5)
        except asyncio.TimeoutError:
            continue


async def websocket_identity(websocket: WebSocket) -> bool:
    token=websocket.cookies.get("scada_session")
    if not token:
        return False
    now=utc_now()
    with connect() as db:
        row=db.execute(
            "SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='فعال'",
            (token_hash(token),now),
        ).fetchone()
    return row is not None


@router.websocket("/ws/live")
async def live_socket(websocket: WebSocket):
    if not await websocket_identity(websocket):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    try:
        while True:
            with connect() as db:
                tags=_tag_rows(db)
            await websocket.send_json({
                "type":"telemetry.snapshot",
                "quality":"DEMO",
                "items":[{"tag_id":t["id"],"name":t.get("name"),"value":t.get("value"),
                          "unit":t.get("unit",""),"quality":"DEMO","sampled_at":t.get("updated_at")} for t in tags],
            })
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        return
