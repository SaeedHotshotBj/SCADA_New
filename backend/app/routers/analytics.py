from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query

from ..config import DB_PATH
from ..database import connect, json_load
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


def _records(db, collection: str) -> list[dict]:
    rows = db.execute(
        "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=?",
        (collection,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            **(json_load(row["payload"], {}) or {}),
            **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


@router.get("/summary")
def summary(user: dict = Depends(get_current_user)):
    """Return measured application counters. It deliberately does not invent OEE,
    production output, energy or scrap values when no source records exist."""
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=24)).isoformat(timespec="seconds")
    week_start = (now - timedelta(days=6)).date()
    with connect() as db:
        counts = {
            row["collection"]: row["count"]
            for row in db.execute(
                "SELECT collection,COUNT(*) AS count FROM resources GROUP BY collection"
            ).fetchall()
        }
        orders = _records(db, "orders")
        runs = _records(db, "productionRuns")
        qc = _records(db, "qc")
        alarms = _records(db, "alarms")
        batches = _records(db, "batches")
        machines = _records(db, "machines")
        sample_count_24h = db.execute(
            "SELECT COUNT(*) FROM telemetry_samples WHERE sampled_at>=?", (since,)
        ).fetchone()[0]
        latest_sample = db.execute(
            "SELECT sampled_at,quality,source FROM telemetry_samples ORDER BY sampled_at DESC LIMIT 1"
        ).fetchone()
        audit_rows = db.execute(
            "SELECT action,collection,record_id,created_at FROM audit_events ORDER BY created_at DESC LIMIT 10"
        ).fetchall()

    run_status = Counter(str(item.get("status", "نامشخص")) for item in runs)
    order_status = Counter(str(item.get("status", "نامشخص")) for item in orders)
    qc_status = Counter(str(item.get("decision", "در انتظار")) for item in qc)
    pending_qc = sum(1 for item in qc if item.get("status") != "بررسی‌شده")
    active_alarms = sum(
        1 for item in alarms
        if item.get("status") not in {"تأییدشده", "غیرفعال", "رفع‌شده"}
    )
    active_batches = sum(1 for item in batches if item.get("status") == "در حال توزین")

    production_by_day = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        count = 0
        for item in runs:
            raw = item.get("started_at")
            if raw:
                try:
                    if datetime.fromisoformat(str(raw).replace("Z", "+00:00")).date() == day:
                        count += 1
                except ValueError:
                    continue
        production_by_day.append({"day": day.isoformat(), "runs": count})

    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "data_quality": (
            "UNSAMPLED" if latest_sample is None
            else "DEMO" if latest_sample["quality"] == "DEMO"
            else latest_sample["quality"]
        ),
        "kpis": {
            "factory_count": counts.get("factories", 0),
            "plc_count": counts.get("plcs", 0),
            "tag_count": counts.get("tags", 0),
            "machine_count": len(machines),
            "order_count": len(orders),
            "active_order_count": sum(1 for item in orders if item.get("status") in {"آزادشده", "در حال تولید"}),
            "production_run_count": len(runs),
            "running_count": run_status.get("در حال تولید", 0),
            "stopped_count": run_status.get("متوقف", 0),
            "completed_run_count": run_status.get("تکمیل‌شده", 0),
            "active_alarm_count": active_alarms,
            "qc_record_count": len(qc),
            "pending_qc_count": pending_qc,
            "batch_count": len(batches),
            "active_batch_count": active_batches,
            "telemetry_samples_24h": sample_count_24h,
        },
        "distributions": {
            "run_status": [{"name": key, "count": value} for key, value in sorted(run_status.items())],
            "order_status": [{"name": key, "count": value} for key, value in sorted(order_status.items())],
            "qc_decisions": [{"name": key, "count": value} for key, value in sorted(qc_status.items())],
        },
        "production_by_day": production_by_day,
        "latest_telemetry": dict(latest_sample) if latest_sample else None,
        "recent_activity": [dict(row) for row in audit_rows],
        "derived_metrics": {
            "oee": None,
            "actual_production_quantity": None,
            "energy_consumption": None,
            "scrap_quantity": None,
            "note": "این شاخص‌ها تا زمان ثبت داده‌ی واقعی و تعریف مبنای محاسبه، عمداً محاسبه نمی‌شوند.",
        },
    }


@router.get("/storage")
def storage_summary(user: dict = Depends(get_current_user)):
    database_size = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    wal_path = Path(str(DB_PATH) + "-wal")
    shm_path = Path(str(DB_PATH) + "-shm")
    wal_size = wal_path.stat().st_size if wal_path.exists() else 0
    shm_size = shm_path.stat().st_size if shm_path.exists() else 0
    with connect() as db:
        sample_count = db.execute("SELECT COUNT(*) FROM telemetry_samples").fetchone()[0]
        tag_count = db.execute("SELECT COUNT(*) FROM resources WHERE collection='tags'").fetchone()[0]
        oldest = db.execute("SELECT MIN(sampled_at) FROM telemetry_samples").fetchone()[0]
        newest = db.execute("SELECT MAX(sampled_at) FROM telemetry_samples").fetchone()[0]
        groups = db.execute(
            "SELECT tag_id,COUNT(*) AS sample_count,MIN(sampled_at) AS first_sample,"
            "MAX(sampled_at) AS last_sample FROM telemetry_samples GROUP BY tag_id ORDER BY sample_count DESC"
        ).fetchall()
        tag_rows = db.execute(
            "SELECT id,payload FROM resources WHERE collection='tags'"
        ).fetchall()
    tag_meta = {row["id"]: (json_load(row["payload"], {}) or {}) for row in tag_rows}
    by_tag = [
        {
            "tag_id": row["tag_id"],
            "tag_name": tag_meta.get(row["tag_id"], {}).get("name", row["tag_id"]),
            "type": tag_meta.get(row["tag_id"], {}).get("type", "—"),
            "unit": tag_meta.get(row["tag_id"], {}).get("unit", ""),
            "sample_count": row["sample_count"],
            "first_sample": row["first_sample"],
            "last_sample": row["last_sample"],
        }
        for row in groups
    ]
    total_bytes = database_size + wal_size + shm_size
    return {
        "engine": "SQLite",
        "database_bytes": database_size,
        "wal_bytes": wal_size,
        "shm_bytes": shm_size,
        "total_bytes": total_bytes,
        "telemetry_sample_count": sample_count,
        "tag_count": tag_count,
        "oldest_sample_at": oldest,
        "newest_sample_at": newest,
        "retention_days": 30,
        "telemetry_by_tag": by_tag,
        "telemetry_mode": "DEMO_OR_EDGE",
    }


@router.get("/audit")
def audit_history(
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    with connect() as db:
        rows = db.execute(
            "SELECT id,actor_id,action,collection,record_id,details,created_at "
            "FROM audit_events ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "actor_id": row["actor_id"],
            "action": row["action"],
            "collection": row["collection"],
            "record_id": row["record_id"],
            "details": json_load(row["details"], {}),
            "created_at": row["created_at"],
        }
        for row in rows
    ]
