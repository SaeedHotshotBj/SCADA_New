from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from .config import PLC_HISTORY_RETENTION_DAYS
from .database import connect, json_dump, json_load, utc_now
from .plc_drivers import PLCDriverError, read_plc_tags


def _poll_seconds(value: Any) -> float:
    text = str(value or "1000 ms").strip().lower()
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(ms|millisecond|milliseconds|s|sec|second|seconds)?", text)
    if not match:
        return 1.0
    number = float(match.group(1))
    unit = match.group(2) or "ms"
    seconds = number / 1000 if unit in {"ms", "millisecond", "milliseconds"} else number
    return max(0.1, min(seconds, 60.0))




def _history_due(payload: dict[str, Any], now: str, interval_seconds: float) -> bool:
    previous = payload.get("last_history_at")
    if not previous:
        return True
    try:
        previous_dt = datetime.fromisoformat(str(previous).replace("Z", "+00:00"))
        now_dt = datetime.fromisoformat(str(now).replace("Z", "+00:00"))
        if previous_dt.tzinfo is None:
            previous_dt = previous_dt.replace(tzinfo=timezone.utc)
        if now_dt.tzinfo is None:
            now_dt = now_dt.replace(tzinfo=timezone.utc)
        # utc_now() is second precision, so sub-second history intervals are not useful.
        return (now_dt - previous_dt).total_seconds() >= max(1.0, interval_seconds)
    except (TypeError, ValueError):
        return True


def _read_plc_and_tags(plc_id: str, factory_id: str | None = None):
    with connect() as db:
        row = db.execute(
            "SELECT id,factory_id,payload FROM resources WHERE collection='plcs' AND id=?",
            (plc_id,),
        ).fetchone()
        if row is None:
            return None, []
        if factory_id is not None and row["factory_id"] != factory_id:
            return None, []
        plc = {"id": row["id"], "factory_id": row["factory_id"], **(json_load(row["payload"], {}) or {})}
        rows = db.execute(
            "SELECT id,factory_id,payload FROM resources WHERE collection='tags' AND json_extract(payload,'$.plc')=?",
            (plc_id,),
        ).fetchall()
        tags = [
            {"id": tag["id"], "factory_id": tag["factory_id"], **(json_load(tag["payload"], {}) or {})}
            for tag in rows
            if tag["factory_id"] == plc["factory_id"]
        ]
    return plc, tags


def poll_plc_once(plc_id: str, factory_id: str | None = None) -> dict[str, Any]:
    """Read all mapped tags once and persist each result with GOOD/BAD quality."""
    plc, tags = _read_plc_and_tags(plc_id, factory_id)
    if plc is None:
        raise PLCDriverError("PLC پیدا نشد یا در کارخانه دیگری قرار دارد.")
    if not tags:
        raise PLCDriverError("برای این PLC هیچ تگی تعریف نشده است.")
    try:
        results = read_plc_tags(plc, tags)
        connection_error = None
    except Exception as exc:
        connection_error = str(exc)
        results = {tag["id"]: {"ok": False, "error": connection_error} for tag in tags}

    now = utc_now()
    history_interval = _poll_seconds(plc.get("history_interval", "5 s"))
    good = 0
    errors: list[str] = []
    with connect() as db:
        for tag in tags:
            result = results.get(tag["id"], {"ok": False, "error": "پاسخی برای تگ دریافت نشد."})
            current = db.execute(
                "SELECT id,factory_id,payload FROM resources WHERE collection='tags' AND id=?",
                (tag["id"],),
            ).fetchone()
            if current is None or current["factory_id"] != plc["factory_id"]:
                continue
            payload = json_load(current["payload"], {}) or {}
            if result.get("ok"):
                value = result["value"]
                payload["value"] = value
                payload["last_source"] = f"plc:{plc_id}"
                payload["last_quality"] = "GOOD"
                payload["last_poll_at"] = now
                payload.pop("last_error", None)
                if _history_due(payload, now, history_interval):
                    db.execute(
                        "INSERT INTO telemetry_samples(factory_id,tag_id,value_json,quality,source,sampled_at) VALUES(?,?,?,?,?,?)",
                        (current["factory_id"], tag["id"], json_dump(value), "GOOD", f"plc:{plc_id}", now),
                    )
                    payload["last_history_at"] = now
                from .routers.telemetry import _evaluate_tag_alarms
                _evaluate_tag_alarms(db, tag["id"], value, now)
                good += 1
            else:
                error = str(result.get("error") or "خواندن تگ ناموفق بود.")
                payload["last_source"] = f"plc:{plc_id}"
                payload["last_quality"] = "BAD"
                payload["last_poll_at"] = now
                payload["last_error"] = error[:500]
                errors.append(f'{tag.get("name", tag["id"])}: {error}')
                # Keep the last known value visible while marking it BAD/stale.
                if _history_due(payload, now, history_interval):
                    db.execute(
                        "INSERT INTO telemetry_samples(factory_id,tag_id,value_json,quality,source,sampled_at) VALUES(?,?,?,?,?,?)",
                        (current["factory_id"], tag["id"], json_dump(payload.get("value")), "BAD", f"plc:{plc_id}", now),
                    )
                    payload["last_history_at"] = now
            db.execute(
                "UPDATE resources SET payload=?,updated_at=? WHERE collection='tags' AND id=?",
                (json_dump(payload), now, tag["id"]),
            )

        plc_row = db.execute(
            "SELECT payload FROM resources WHERE collection='plcs' AND id=?",
            (plc_id,),
        ).fetchone()
        plc_payload = json_load(plc_row["payload"], {}) or {}
        if good == len(tags):
            status = "ONLINE"
        elif good:
            status = "DEGRADED"
        else:
            status = "OFFLINE"
        plc_payload.update({
            "connection_status": status,
            "last_poll": now,
            "last_test_at": now,
            "last_success": now if good else plc_payload.get("last_success"),
            "last_error": "; ".join(errors)[:1000] if errors else "",
            "last_good_tags": good,
            "mapped_tags": len(tags),
        })
        db.execute(
            "UPDATE resources SET payload=?,updated_at=? WHERE collection='plcs' AND id=?",
            (json_dump(plc_payload), now, plc_id),
        )

    return {
        "plc_id": plc_id,
        "status": status,
        "read_count": good,
        "tag_count": len(tags),
        "errors": errors,
        "sampled_at": now,
    }


async def plc_poll_loop(stop_event: asyncio.Event) -> None:
    """Poll only PLCs explicitly enabled in the resource configuration."""
    next_due: dict[str, float] = {}
    last_cleanup = 0.0
    while not stop_event.is_set():
        try:
            with connect() as db:
                rows = db.execute(
                    "SELECT id,factory_id,payload FROM resources WHERE collection='plcs'"
                ).fetchall()
            enabled: dict[str, dict[str, Any]] = {}
            for row in rows:
                plc = {"id": row["id"], "factory_id": row["factory_id"], **(json_load(row["payload"], {}) or {})}
                is_enabled = plc.get("enabled") is True or str(plc.get("active", "")).strip().lower() in {"بله", "yes", "true", "1"}
                if is_enabled and plc.get("protocol") in {"modbus-tcp", "modbus-rtu", "s7"}:
                    enabled[row["id"]] = plc
            for stale_id in set(next_due) - set(enabled):
                next_due.pop(stale_id, None)

            now_mono = time.monotonic()
            if now_mono - last_cleanup >= 3600:
                cutoff = (datetime.now(timezone.utc) - timedelta(days=PLC_HISTORY_RETENTION_DAYS)).isoformat(timespec="seconds")
                with connect() as db:
                    db.execute("DELETE FROM telemetry_samples WHERE sampled_at < ?", (cutoff,))
                last_cleanup = now_mono
            due = [plc_id for plc_id in enabled if now_mono >= next_due.get(plc_id, 0)]
            if due:
                async def poll_one(plc_id: str):
                    try:
                        await asyncio.to_thread(poll_plc_once, plc_id)
                    except Exception:
                        # Status is persisted by poll_plc_once whenever the PLC exists.
                        pass
                    next_due[plc_id] = time.monotonic() + _poll_seconds(enabled[plc_id].get("poll"))

                await asyncio.gather(*(poll_one(plc_id) for plc_id in due))
        except Exception:
            # A transient database or network issue must not terminate polling for all PLCs.
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=0.1)
        except asyncio.TimeoutError:
            continue
