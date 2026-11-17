from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
import math
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ..database import connect, json_load
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


def _records(db, collection: str) -> list[dict[str, Any]]:
    rows = db.execute(
        "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=?",
        (collection,),
    ).fetchall()
    result = []
    for row in rows:
        item = json_load(row["payload"], {}) or {}
        item.update({"id": row["id"], "created_at": row["created_at"], "updated_at": row["updated_at"]})
        if row["factory_id"]:
            item["factory_id"] = row["factory_id"]
        result.append(item)
    return result


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _in_period(item: dict, start: datetime | None, end: datetime | None) -> bool:
    raw = item.get("started_at") or item.get("created_at") or item.get("updated_at")
    if not raw:
        return False
    try:
        value = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return (start is None or value >= start) and (end is None or value <= end)


def _period(start_date: str | None, end_date: str | None) -> tuple[datetime | None, datetime | None]:
    try:
        start = datetime.combine(date.fromisoformat(start_date), datetime.min.time(), timezone.utc) if start_date else None
        end = datetime.combine(date.fromisoformat(end_date), datetime.max.time(), timezone.utc) if end_date else None
    except ValueError:
        raise HTTPException(422, "تاریخ باید با قالب YYYY-MM-DD ارسال شود.")
    if start and end and start > end:
        raise HTTPException(422, "تاریخ شروع نباید بعد از تاریخ پایان باشد.")
    return start, end


@router.get("/overview")
def overview(user: dict = Depends(get_current_user)):
    with connect() as db:
        factories = _records(db, "factories")
        plcs = _records(db, "plcs")
        tags = _records(db, "tags")
        alarms = _records(db, "alarms")
        orders = _records(db, "orders")
        runs = _records(db, "productionRuns")
        batches = _records(db, "batches")
        qc = _records(db, "qc")
        sample_count = db.execute("SELECT COUNT(*) FROM telemetry_samples").fetchone()[0]
        last_sample = db.execute("SELECT MAX(sampled_at) FROM telemetry_samples").fetchone()[0]
        edge_counts = {
            row["status"]: row["count"]
            for row in db.execute("SELECT status,COUNT(*) AS count FROM edge_devices GROUP BY status").fetchall()
        }

    actual = [_number(run.get("quantity_actual")) for run in runs]
    actual = [value for value in actual if value is not None]
    accepted_qc = sum(1 for row in qc if row.get("decision") == "قبول")
    rejected_qc = sum(1 for row in qc if row.get("decision") == "رد")
    pending_qc = sum(1 for row in qc if row.get("status") in {None, "در انتظار", "در حال بررسی"})
    active_alarms = sum(1 for row in alarms if row.get("status") not in {"تأییدشده", "غیرفعال", "بسته"})
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mode": "DEMO" if sample_count and any(row.get("quality") == "DEMO" for row in []) else "APPLICATION_DATA",
        "data_quality_note": "این شاخص‌ها فقط از رکوردهای ذخیره‌شده در برنامه محاسبه شده‌اند؛ داده PLC واقعی تنها پس از اتصال Edge مجاز است.",
        "metrics": {
            "factory_count": len(factories),
            "active_factory_count": sum(1 for row in factories if row.get("status") == "فعال"),
            "plc_count": len(plcs),
            "tag_count": len(tags),
            "alarm_definition_count": len(alarms),
            "active_alarm_count": active_alarms,
            "order_count": len(orders),
            "running_order_count": sum(1 for row in orders if row.get("status") == "در حال تولید"),
            "production_run_count": len(runs),
            "running_production_run_count": sum(1 for row in runs if row.get("status") == "در حال تولید"),
            "recorded_production_quantity": round(sum(actual), 4),
            "batch_count": len(batches),
            "running_batch_count": sum(1 for row in batches if row.get("status") == "در حال توزین"),
            "qc_record_count": len(qc),
            "qc_accepted_count": accepted_qc,
            "qc_rejected_count": rejected_qc,
            "qc_pending_count": pending_qc,
            "telemetry_sample_count": sample_count,
            "edge_status_counts": edge_counts,
        },
        "last_telemetry_at": last_sample,
    }


@router.get("/production")
def production(
    start_date: str | None = None,
    end_date: str | None = None,
    machine: str | None = None,
    product: str | None = None,
    status: str | None = None,
    user: dict = Depends(get_current_user),
):
    start, end = _period(start_date, end_date)
    with connect() as db:
        rows = _records(db, "productionRuns")
    selected = [
        row for row in rows
        if _in_period(row, start, end)
        and (not machine or row.get("machine") == machine)
        and (not product or row.get("product") == product)
        and (not status or row.get("status") == status)
    ]
    by_day: dict[str, dict[str, float]] = defaultdict(lambda: {"quantity": 0.0, "scrap": 0.0, "runs": 0})
    for row in selected:
        stamp = str(row.get("started_at") or row.get("created_at") or "")[:10]
        day = by_day[stamp]
        day["quantity"] += _number(row.get("quantity_actual")) or 0.0
        day["scrap"] += _number(row.get("scrap_quantity")) or 0.0
        day["runs"] += 1
    total = sum(_number(row.get("quantity_actual")) or 0.0 for row in selected)
    scrap = sum(_number(row.get("scrap_quantity")) or 0.0 for row in selected)
    return {
        "filters": {"start_date": start_date, "end_date": end_date, "machine": machine, "product": product, "status": status},
        "summary": {"run_count": len(selected), "quantity_actual": round(total, 4), "scrap_quantity": round(scrap, 4)},
        "by_day": [{"date": key, **{k: round(v, 4) if isinstance(v, float) else v for k, v in value.items()}}
                   for key, value in sorted(by_day.items()) if key],
        "items": selected,
        "mode": "APPLICATION_DATA",
    }


@router.get("/quality")
def quality(
    start_date: str | None = None,
    end_date: str | None = None,
    product: str | None = None,
    machine: str | None = None,
    user: dict = Depends(get_current_user),
):
    start, end = _period(start_date, end_date)
    with connect() as db:
        rows = _records(db, "qc")
        measurements = db.execute(
            "SELECT qc_id,parameter,actual,minimum,maximum,result,created_at FROM qc_measurements ORDER BY created_at DESC LIMIT 2000"
        ).fetchall()
    selected = [row for row in rows if _in_period(row, start, end)
                and (not product or row.get("product") == product)
                and (not machine or row.get("machine") == machine)]
    counts = {key: sum(1 for row in selected if row.get("decision") == key) for key in ("قبول", "مشروط", "رد")}
    total = len(selected)
    return {
        "filters": {"start_date": start_date, "end_date": end_date, "product": product, "machine": machine},
        "summary": {"total": total, "accepted": counts["قبول"], "conditional": counts["مشروط"],
                    "rejected": counts["رد"], "acceptance_percent": round(counts["قبول"] * 100 / total, 2) if total else None},
        "measurements": [dict(row) for row in measurements],
        "items": selected,
        "mode": "APPLICATION_DATA",
    }


@router.get("/energy")
def energy(
    tag_id: str | None = None,
    hours: int = Query(24, ge=1, le=744),
    user: dict = Depends(get_current_user),
):
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
    with connect() as db:
        if tag_id:
            tag = db.execute("SELECT id,payload FROM resources WHERE collection='tags' AND id=?", (tag_id,)).fetchone()
            if tag is None:
                raise HTTPException(404, "تگ پیدا نشد.")
            tag_ids = [tag_id]
        else:
            tag_rows = db.execute("SELECT id,payload FROM resources WHERE collection='tags'").fetchall()
            tag_ids = [row["id"] for row in tag_rows if (json_load(row["payload"], {}) or {}).get("unit") in {"kWh", "MWh"}]
        result = {}
        for selected_id in tag_ids:
            samples = db.execute(
                "SELECT value_json,quality,source,sampled_at FROM telemetry_samples WHERE tag_id=? AND sampled_at>=? ORDER BY sampled_at",
                (selected_id, since),
            ).fetchall()
            numeric = []
            for sample in samples:
                value = _number(json_load(sample["value_json"]))
                if value is not None:
                    numeric.append((value, sample["sampled_at"], sample["quality"], sample["source"]))
            if numeric:
                first, last = numeric[0], numeric[-1]
                delta = last[0] - first[0]
                result[selected_id] = {
                    "first_value": first[0], "last_value": last[0],
                    "delta": round(delta, 6) if delta >= 0 else None,
                    "sample_count": len(numeric), "first_sampled_at": first[1], "last_sampled_at": last[1],
                    "quality": last[2], "source": last[3],
                }
            else:
                result[selected_id] = {"sample_count": 0, "delta": None, "note": "برای بازه انتخاب‌شده نمونه عددی ذخیره نشده است."}
    return {"hours": hours, "items": result, "mode": "APPLICATION_DATA"}
