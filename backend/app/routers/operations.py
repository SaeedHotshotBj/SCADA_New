from __future__ import annotations

import math
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..database import connect, json_dump, json_load, utc_now, audit
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/operations", tags=["Operations"])


class DecisionRequest(BaseModel):
    decision: str = Field(min_length=1, max_length=40)
    note: str = Field(default="", max_length=2000)


class RunRequest(BaseModel):
    parameters: dict[str, Any] = Field(default_factory=dict)


def _get_resource(db, collection: str, record_id: str, user: dict | None = None):
    row = db.execute(
        "SELECT payload,factory_id FROM resources WHERE collection=? AND id=?",
        (collection, record_id),
    ).fetchone()
    if row is None:
        return None
    if user and user.get("role") != "Organization Admin":
        if collection == "factories" and record_id != user.get("factory_id"):
            return None
        if collection != "factories" and row["factory_id"] not in (None, user.get("factory_id")):
            return None
    return json_load(row["payload"], {})


def _save_resource(db, collection: str, record_id: str, payload: dict):
    db.execute(
        "UPDATE resources SET payload=?,updated_at=? WHERE collection=? AND id=?",
        (json_dump(payload), utc_now(), collection, record_id),
    )


@router.post("/production-runs/{run_id}/start")
def start_production_run(run_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی شروع تولید ندارد.")
    with connect() as db:
        row = _get_resource(db, "productionRuns", run_id, user)
        if row is None:
            raise HTTPException(404, "اجرای تولید پیدا نشد.")
        if row.get("status") == "در حال تولید":
            raise HTTPException(409, "این اجرای تولید از قبل فعال است.")
        if row.get("status") == "تکمیل‌شده":
            raise HTTPException(409, "اجرای تکمیل‌شده قابل شروع مجدد نیست.")
        started = utc_now()
        row.update({"status":"در حال تولید","started_at":started,"started_by":user["id"]})
        _save_resource(db,"productionRuns",run_id,row)
        db.execute(
            "INSERT INTO production_run_events(run_id,event,details,actor_id,created_at) VALUES(?,?,?,?,?)",
            (run_id,"START",json_dump({"order":row.get("order"),"machine":row.get("machine")}),user["id"],started),
        )
        audit(db,user["id"],"production.start","productionRuns",run_id)
    return {"id":run_id,**row}


@router.post("/production-runs/{run_id}/stop")
def stop_production_run(run_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی توقف تولید را ندارد.")
    with connect() as db:
        row = _get_resource(db, "productionRuns", run_id, user)
        if row is None:
            raise HTTPException(404,"اجرای تولید پیدا نشد.")
        if row.get("status") != "در حال تولید":
            raise HTTPException(409,"اجرای تولید در وضعیت فعال نیست.")
        stopped = utc_now()
        row.update({"status":"متوقف","stopped_at":stopped,"stopped_by":user["id"]})
        _save_resource(db,"productionRuns",run_id,row)
        db.execute(
            "INSERT INTO production_run_events(run_id,event,details,actor_id,created_at) VALUES(?,?,?,?,?)",
            (run_id,"STOP",json_dump({"quantity_actual":row.get("quantity_actual",0)}),user["id"],stopped),
        )
        audit(db,user["id"],"production.stop","productionRuns",run_id)
    return {"id":run_id,**row}


@router.post("/batches/{batch_id}/start")
def start_batch(batch_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی شروع بچ را ندارد.")
    with connect() as db:
        row = _get_resource(db, "batches", batch_id, user)
        if row is None:
            raise HTTPException(404,"بچ پیدا نشد.")
        if row.get("status") == "در حال توزین":
            raise HTTPException(409,"بچ در حال توزین است.")
        row.update({"status":"در حال توزین","started_at":utc_now(),"started_by":user["id"]})
        _save_resource(db,"batches",batch_id,row)
        db.execute("INSERT INTO batch_events(batch_id,event,payload,created_at) VALUES(?,?,?,?)",
                   (batch_id,"START",json_dump({"mode":"SIMULATION","actor":user["id"]}),utc_now()))
        audit(db,user["id"],"batch.start","batches",batch_id,{"mode":"SIMULATION"})
    return {"id":batch_id,**row,"execution_mode":"SIMULATION"}


@router.post("/batches/{batch_id}/stop")
def stop_batch(batch_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی توقف بچ را ندارد.")
    with connect() as db:
        row = _get_resource(db, "batches", batch_id, user)
        if row is None:
            raise HTTPException(404,"بچ پیدا نشد.")
        if row.get("status") != "در حال توزین":
            raise HTTPException(409,"بچ در حال توزین نیست.")
        row.update({"status":"متوقف‌شده","stopped_at":utc_now(),"stopped_by":user["id"]})
        _save_resource(db,"batches",batch_id,row)
        db.execute("INSERT INTO batch_events(batch_id,event,payload,created_at) VALUES(?,?,?,?)",
                   (batch_id,"STOP",json_dump({"mode":"SIMULATION","actor":user["id"]}),utc_now()))
        audit(db,user["id"],"batch.stop","batches",batch_id,{"mode":"SIMULATION"})
    return {"id":batch_id,**row,"execution_mode":"SIMULATION"}


@router.post("/workflow-tasks/{task_id}/approve")
def approve_workflow_task(task_id: str, body: DecisionRequest | None = None,
                          user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Production Planner", "Quality Control"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی تأیید این وظیفه را ندارد.")
    with connect() as db:
        row = _get_resource(db, "workflowTasks", task_id, user)
        if row is None:
            raise HTTPException(404,"وظیفه گردش‌کار پیدا نشد.")
        if row.get("status") != "در انتظار":
            raise HTTPException(409,"این وظیفه قبلاً رسیدگی شده است.")
        row.update({"status":"تکمیل‌شده","approved_by":user["id"],
                    "approved_at":utc_now(),"note":body.note if body else ""})
        _save_resource(db,"workflowTasks",task_id,row)
        audit(db,user["id"],"workflow.approve","workflowTasks",task_id)
    return {"id":task_id,**row}


@router.post("/qc/{qc_id}/decision")
def decide_qc(qc_id: str, body: DecisionRequest, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Quality Control"}:
        raise HTTPException(403, "ثبت تصمیم کنترل کیفیت فقط برای نقش‌های مجاز امکان‌پذیر است.")
    if body.decision not in {"قبول","مشروط","رد"}:
        raise HTTPException(422,"تصمیم کنترل کیفیت باید قبول، مشروط یا رد باشد.")
    with connect() as db:
        row = _get_resource(db, "qc", qc_id, user)
        if row is None:
            raise HTTPException(404,"رکورد کنترل کیفیت پیدا نشد.")
        row.update({"decision":body.decision,"status":"بررسی‌شده","inspector":user["name"],
                    "decided_by":user["id"],"decided_at":utc_now(),"note":body.note})
        _save_resource(db,"qc",qc_id,row)
        audit(db,user["id"],"qc.decision","qc",qc_id,{"decision":body.decision})
    return {"id":qc_id,**row}


@router.post("/reports/{report_id}/run", status_code=202)
def run_report(report_id: str, body: RunRequest, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Engineer", "Production Manager", "Production Planner"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی اجرای گزارش را ندارد.")

    params = body.parameters or {}
    start_date = str(params.get("start_date") or params.get("date_from") or "").strip()
    end_date = str(params.get("end_date") or params.get("date_to") or "").strip()
    for field_name, value in (("start_date", start_date), ("end_date", end_date)):
        if value:
            try:
                from datetime import date as _date
                _date.fromisoformat(value)
            except ValueError:
                raise HTTPException(422, f"{field_name} باید با قالب YYYY-MM-DD باشد.")
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "تاریخ شروع نباید بعد از تاریخ پایان باشد.")

    machine = str(params.get("machine") or "").strip()
    product = str(params.get("product") or "").strip()
    status_filter = str(params.get("status") or "").strip()
    order_filter = str(params.get("order") or params.get("order_code") or "").strip()
    tag_filter = str(params.get("tag_id") or "").strip()

    def row_date(item: dict) -> str:
        return str(item.get("started_at") or item.get("created_at") or item.get("updated_at") or "")[:10]

    def matches(item: dict, *, use_machine: bool = False, use_product: bool = True) -> bool:
        stamp = row_date(item)
        if start_date and (not stamp or stamp < start_date):
            return False
        if end_date and (not stamp or stamp > end_date):
            return False
        if use_machine and machine and str(item.get("machine") or "") != machine:
            return False
        if use_product and product and str(item.get("product") or "") != product:
            return False
        if status_filter and str(item.get("status") or "") != status_filter:
            return False
        if order_filter and str(item.get("order") or item.get("code") or "") != order_filter:
            return False
        return True

    with connect() as db:
        report = _get_resource(db, "reports", report_id, user)
        if report is None:
            raise HTTPException(404, "قالب گزارش پیدا نشد.")
        execution_id = "rep-" + uuid.uuid4().hex[:14]
        created = utc_now()
        is_org = user["role"] == "Organization Admin"
        factory_id = user.get("factory_id")

        def collection_snapshot(collection: str, limit: int = 500) -> list[dict]:
            if is_org:
                rows = db.execute(
                    """SELECT id,factory_id,payload,created_at,updated_at FROM resources
                       WHERE collection=? ORDER BY updated_at DESC LIMIT ?""",
                    (collection, limit),
                ).fetchall()
            else:
                rows = db.execute(
                    """SELECT id,factory_id,payload,created_at,updated_at FROM resources
                       WHERE collection=? AND (factory_id=? OR factory_id IS NULL)
                       ORDER BY updated_at DESC LIMIT ?""",
                    (collection, factory_id, limit),
                ).fetchall()
            return [
                {"id": row["id"], **(json_load(row["payload"], {}) or {}),
                 "factory_id": row["factory_id"], "created_at": row["created_at"],
                 "updated_at": row["updated_at"]}
                for row in rows
            ]

        plcs = collection_snapshot("plcs", 1000)
        tags = collection_snapshot("tags", 1000)
        orders = [row for row in collection_snapshot("orders") if matches(row)]
        runs = [row for row in collection_snapshot("productionRuns") if matches(row, use_machine=True)]
        qc_records = [row for row in collection_snapshot("qc") if matches(row, use_machine=True)]
        alarms = [row for row in collection_snapshot("alarms") if matches(row, use_machine=True, use_product=False)]
        batches = [row for row in collection_snapshot("batches") if matches(row, use_product=False)]
        sample_sql = "SELECT tag_id,value_json,quality,source,sampled_at FROM telemetry_samples WHERE 1=1"
        sample_args: list[Any] = []
        if not is_org:
            sample_sql += " AND (factory_id=? OR factory_id IS NULL)"
            sample_args.append(factory_id)
        if tag_filter:
            sample_sql += " AND tag_id=?"
            sample_args.append(tag_filter)
        if start_date:
            sample_sql += " AND substr(sampled_at,1,10)>=?"
            sample_args.append(start_date)
        if end_date:
            sample_sql += " AND substr(sampled_at,1,10)<=?"
            sample_args.append(end_date)
        sample_sql += " ORDER BY sampled_at DESC LIMIT 1000"
        recent_samples = db.execute(sample_sql, sample_args).fetchall()

        report_result = {
            "mode": "APPLICATION_DATA",
            "generated_at": created,
            "report": {"id": report_id, **report},
            "filters": params,
            "summary": {
                "plc_count": len(plcs),
                "tag_count": len(tags),
                "alarm_count": len(alarms),
                "active_alarm_count": sum(1 for item in alarms if item.get("status") not in {"تأییدشده", "غیرفعال", "بسته"}),
                "order_count": len(orders),
                "production_run_count": len(runs),
                "running_count": sum(1 for item in runs if item.get("status") == "در حال تولید"),
                "produced_quantity": round(sum(float(item.get("quantity_actual") or 0) for item in runs), 4),
                "qc_record_count": len(qc_records),
                "batch_count": len(batches),
                "telemetry_sample_count": len(recent_samples),
            },
            "tables": {
                "plcs": plcs,
                "tags": tags,
                "orders": orders,
                "production_runs": runs,
                "quality_records": qc_records,
                "alarms": alarms,
                "batches": batches,
                "telemetry_samples": [
                    {"tag_id": row["tag_id"], "value": json_load(row["value_json"]),
                     "quality": row["quality"], "source": row["source"], "sampled_at": row["sampled_at"]}
                    for row in recent_samples
                ],
            },
        }
        report["last_run_at"] = created
        report["last_execution_id"] = execution_id
        _save_resource(db, "reports", report_id, report)
        db.execute(
            """INSERT INTO report_executions(id,report_id,status,parameters,result,requested_by,created_at,completed_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (execution_id, report_id, "COMPLETED", json_dump(params),
             json_dump(report_result), user["id"], created, created),
        )
        audit(db, user["id"], "report.run", "reports", report_id, {"execution_id": execution_id})
    return {"id": execution_id, "report_id": report_id, "status": "COMPLETED",
            "created_at": created, "result": report_result}


@router.get("/reports/{report_id}/executions/{execution_id}")
def get_report_execution(report_id: str, execution_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        report = _get_resource(db, "reports", report_id, user)
        if report is None:
            raise HTTPException(404, "قالب گزارش پیدا نشد.")
        row = db.execute(
            "SELECT id,report_id,status,parameters,result,requested_by,created_at,completed_at FROM report_executions WHERE report_id=? AND id=?",
            (report_id, execution_id),
        ).fetchone()
    if row is None or (user["role"] != "Organization Admin" and row["requested_by"] != user["id"]):
        raise HTTPException(404, "اجرای گزارش پیدا نشد.")
    return {"id":row["id"],"report_id":row["report_id"],"status":row["status"],
            "parameters":json_load(row["parameters"],{}),"result":json_load(row["result"],{}),
            "requested_by":row["requested_by"],"created_at":row["created_at"],"completed_at":row["completed_at"]}


@router.get("/reports/{report_id}/executions")
def list_report_executions(report_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        report = _get_resource(db, "reports", report_id, user)
        if report is None:
            raise HTTPException(404, "قالب گزارش پیدا نشد.")
        if user["role"] == "Organization Admin":
            rows = db.execute(
                "SELECT id,report_id,status,parameters,result,requested_by,created_at,completed_at FROM report_executions WHERE report_id=? ORDER BY created_at DESC LIMIT 100",
                (report_id,),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT id,report_id,status,parameters,result,requested_by,created_at,completed_at FROM report_executions WHERE report_id=? AND requested_by=? ORDER BY created_at DESC LIMIT 100",
                (report_id, user["id"]),
            ).fetchall()
    return [{"id":r["id"],"report_id":r["report_id"],"status":r["status"],
             "parameters":json_load(r["parameters"],{}),"result":json_load(r["result"],{}),
             "requested_by":r["requested_by"],"created_at":r["created_at"],"completed_at":r["completed_at"]} for r in rows]


class ProductionQuantityRequest(BaseModel):
    quantity: float = Field(gt=0, le=1_000_000_000)
    scrap_quantity: float = Field(default=0, ge=0, le=1_000_000_000)
    unit: str = Field(default="", max_length=24)
    note: str = Field(default="", max_length=1000)


class HopperWeighment(BaseModel):
    hopper_key: str = Field(min_length=1, max_length=80)
    material: str = Field(min_length=1, max_length=120)
    target_weight: float = Field(gt=0, le=100_000_000)
    actual_weight: float = Field(ge=0, le=100_000_000)
    unit: str = Field(default="kg", max_length=12)


class BatchWeighmentsRequest(BaseModel):
    items: list[HopperWeighment] = Field(min_length=1, max_length=100)
    note: str = Field(default="", max_length=1000)


class QCMeasurementRequest(BaseModel):
    parameter: str = Field(min_length=1, max_length=120)
    actual: float
    nominal: float | None = None
    minimum: float | None = None
    maximum: float | None = None
    unit: str = Field(default="", max_length=24)
    note: str = Field(default="", max_length=1000)


@router.post("/production-runs/{run_id}/quantity", status_code=201)
def record_production_quantity(run_id: str, body: ProductionQuantityRequest,
                               user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه ثبت مقدار تولید را ندارد.")
    if not math.isfinite(body.quantity) or not math.isfinite(body.scrap_quantity):
        raise HTTPException(422, "مقادیر تولید باید عدد محدود باشند.")
    with connect() as db:
        row = _get_resource(db, "productionRuns", run_id, user)
        if row is None:
            raise HTTPException(404, "اجرای تولید پیدا نشد.")
        if row.get("status") != "در حال تولید":
            raise HTTPException(409, "ثبت مقدار فقط برای اجرای فعال مجاز است.")
        target = float(row.get("target") or 0)
        previous = float(row.get("quantity_actual") or 0)
        previous_scrap = float(row.get("scrap_quantity") or 0)
        total = previous + body.quantity
        scrap = previous_scrap + body.scrap_quantity
        row.update({
            "quantity_actual": round(total, 6),
            "scrap_quantity": round(scrap, 6),
            "progress": min(100.0, round(total * 100 / target, 2)) if target > 0 else None,
            "last_quantity_at": utc_now(),
        })
        _save_resource(db, "productionRuns", run_id, row)
        cur = db.execute(
            """INSERT INTO production_run_events(run_id,event,quantity,unit,details,actor_id,created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (run_id, "QUANTITY", body.quantity, body.unit or row.get("unit", ""),
             json_dump({"scrap_quantity": body.scrap_quantity, "note": body.note}),
             user["id"], utc_now()),
        )
        audit(db, user["id"], "production.quantity", "productionRuns", run_id,
              {"quantity": body.quantity, "scrap_quantity": body.scrap_quantity})
        event_id = cur.lastrowid
    return {"id": run_id, **row, "event_id": event_id, "execution_mode": "APPLICATION_DATA"}


@router.post("/production-runs/{run_id}/complete")
def complete_production_run(run_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه تکمیل تولید را ندارد.")
    with connect() as db:
        row = _get_resource(db, "productionRuns", run_id, user)
        if row is None:
            raise HTTPException(404, "اجرای تولید پیدا نشد.")
        if row.get("status") != "در حال تولید":
            raise HTTPException(409, "فقط اجرای فعال را می‌توان تکمیل کرد.")
        row.update({"status": "تکمیل‌شده", "completed_at": utc_now(), "completed_by": user["id"]})
        _save_resource(db, "productionRuns", run_id, row)
        db.execute(
            "INSERT INTO production_run_events(run_id,event,details,actor_id,created_at) VALUES(?,?,?,?,?)",
            (run_id, "COMPLETED", json_dump({"quantity_actual": row.get("quantity_actual", 0)}),
             user["id"], utc_now()),
        )
        audit(db, user["id"], "production.complete", "productionRuns", run_id)
    return {"id": run_id, **row}


@router.get("/production-runs/{run_id}/events")
def production_run_events(run_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        run = _get_resource(db, "productionRuns", run_id, user)
        if run is None:
            raise HTTPException(404, "اجرای تولید پیدا نشد.")
        rows = db.execute(
            "SELECT id,event,quantity,unit,details,actor_id,created_at FROM production_run_events WHERE run_id=? ORDER BY created_at,id",
            (run_id,),
        ).fetchall()
    return [{"id": row["id"], "event": row["event"], "quantity": row["quantity"],
             "unit": row["unit"], "details": json_load(row["details"], {}),
             "actor_id": row["actor_id"], "created_at": row["created_at"]} for row in rows]


@router.post("/batches/{batch_id}/weighments", status_code=201)
def record_batch_weighments(batch_id: str, body: BatchWeighmentsRequest,
                            user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه ثبت توزین را ندارد.")
    with connect() as db:
        batch = _get_resource(db, "batches", batch_id, user)
        if batch is None:
            raise HTTPException(404, "بچ پیدا نشد.")
        if batch.get("status") != "در حال توزین":
            raise HTTPException(409, "ثبت توزین فقط برای بچ در حال توزین مجاز است.")
        tolerance = float(batch.get("tolerance_percent", 0.5) or 0.5)
        if tolerance < 0 or tolerance > 100:
            raise HTTPException(422, "درصد تلرانس بچ معتبر نیست.")
        config_id = batch.get("batch_config_id")
        if config_id:
            config = _get_resource(db, "batchConfigs", config_id, user)
            if config is None:
                raise HTTPException(409, "تنظیمات خط مرتبط با این بچ دیگر وجود ندارد.")
            expected = {str(item.get("bin")) for item in (config.get("hoppers") or []) if item.get("bin")}
            submitted = [item.hopper_key for item in body.items]
            if len(submitted) != len(set(submitted)) or set(submitted) != expected:
                raise HTTPException(422, "برای هر هاپر تعریف‌شده دقیقاً یک وزن ارسال کنید.")
        results = []
        for item in body.items:
            deviation = abs(item.actual_weight - item.target_weight) * 100 / item.target_weight
            result = "IN_TOLERANCE" if deviation <= tolerance else "OUT_OF_TOLERANCE"
            cur = db.execute(
                """INSERT INTO batch_weighments(batch_id,hopper_key,material,target_weight,actual_weight,
                   unit,tolerance_percent,result,quality,source,actor_id,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (batch_id, item.hopper_key, item.material, item.target_weight, item.actual_weight,
                 item.unit, tolerance, result, "DEMO", "manual-demo-entry", user["id"], utc_now()),
            )
            results.append({"id": cur.lastrowid, "hopper_key": item.hopper_key,
                            "target_weight": item.target_weight, "actual_weight": item.actual_weight,
                            "deviation_percent": round(deviation, 4), "result": result, "quality": "DEMO"})
        db.execute(
            "INSERT INTO batch_events(batch_id,event,payload,created_at) VALUES(?,?,?,?)",
            (batch_id, "WEIGHMENT", json_dump({"items": results, "note": body.note, "quality": "DEMO"}), utc_now()),
        )
        audit(db, user["id"], "batch.weighment", "batches", batch_id,
              {"items": len(results), "out_of_tolerance": sum(1 for item in results if item["result"] == "OUT_OF_TOLERANCE")})
    return {"batch_id": batch_id, "items": results, "execution_mode": "SIMULATION",
            "warning": "این مقادیر دستی/آزمایشی هستند و از لودسل واقعی دریافت نشده‌اند."}


@router.get("/batches/{batch_id}/weighments")
def list_batch_weighments(batch_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        batch = _get_resource(db, "batches", batch_id, user)
        if batch is None:
            raise HTTPException(404, "بچ پیدا نشد.")
        rows = db.execute(
            """SELECT id,hopper_key,material,target_weight,actual_weight,unit,tolerance_percent,
               result,quality,source,actor_id,created_at FROM batch_weighments
               WHERE batch_id=? ORDER BY created_at,id""", (batch_id,)
        ).fetchall()
    return {"items": [dict(row) for row in rows]}


@router.post("/batches/{batch_id}/complete")
def complete_batch(batch_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه تکمیل بچ را ندارد.")
    with connect() as db:
        batch = _get_resource(db, "batches", batch_id, user)
        if batch is None:
            raise HTTPException(404, "بچ پیدا نشد.")
        if batch.get("status") != "در حال توزین":
            raise HTTPException(409, "فقط بچ در حال توزین را می‌توان تکمیل کرد.")
        rows = db.execute(
            "SELECT hopper_key,result FROM batch_weighments WHERE batch_id=? ORDER BY created_at DESC,id DESC",
            (batch_id,),
        ).fetchall()
        latest = {}
        for row in rows:
            latest.setdefault(row["hopper_key"], row["result"])
        if not latest:
            raise HTTPException(409, "برای این بچ هنوز هیچ توزینی ثبت نشده است.")
        config_id = batch.get("batch_config_id")
        if config_id:
            config = _get_resource(db, "batchConfigs", config_id, user)
            if config is None:
                raise HTTPException(409, "تنظیمات خط مرتبط با این بچ دیگر وجود ندارد.")
            expected = {str(item.get("bin")) for item in (config.get("hoppers") or []) if item.get("bin")}
            if set(latest) != expected:
                raise HTTPException(409, "توزین همه هاپرهای تعریف‌شده باید ثبت شود.")
        if any(result != "IN_TOLERANCE" for result in latest.values()):
            raise HTTPException(409, "حداقل یک هاپر خارج از تلرانس است؛ پیش از تکمیل باید اصلاح یا تعیین تکلیف شود.")
        batch.update({"status": "تکمیل‌شده", "completed_at": utc_now(), "completed_by": user["id"]})
        _save_resource(db, "batches", batch_id, batch)
        db.execute(
            "INSERT INTO batch_events(batch_id,event,payload,created_at) VALUES(?,?,?,?)",
            (batch_id, "COMPLETED", json_dump({"hopper_count": len(latest), "quality": "DEMO"}), utc_now()),
        )
        audit(db, user["id"], "batch.complete", "batches", batch_id, {"hopper_count": len(latest)})
    return {"id": batch_id, **batch, "execution_mode": "SIMULATION"}


@router.post("/workflow-tasks/{task_id}/decision")
def decide_workflow_task(task_id: str, body: DecisionRequest,
                         user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Production Planner", "Quality Control"}:
        raise HTTPException(403, "نقش کاربری اجازه تصمیم‌گیری برای این وظیفه را ندارد.")
    decision = body.decision.strip().lower()
    if decision not in {"approve", "reject", "تأیید", "رد"}:
        raise HTTPException(422, "تصمیم باید approve یا reject باشد.")
    accepted = decision in {"approve", "تأیید"}
    with connect() as db:
        row = _get_resource(db, "workflowTasks", task_id, user)
        if row is None:
            raise HTTPException(404, "وظیفه گردش‌کار پیدا نشد.")
        if row.get("status") != "در انتظار":
            raise HTTPException(409, "این وظیفه قبلاً تعیین تکلیف شده است.")
        row.update({
            "status": "تکمیل‌شده" if accepted else "ردشده",
            "decision": "تأیید" if accepted else "رد",
            "decided_by": user["id"], "decided_at": utc_now(), "note": body.note,
        })
        _save_resource(db, "workflowTasks", task_id, row)
        db.execute(
            "INSERT INTO workflow_task_events(task_id,decision,note,actor_id,created_at) VALUES(?,?,?,?,?)",
            (task_id, row["decision"], body.note, user["id"], utc_now()),
        )
        audit(db, user["id"], "workflow.decision", "workflowTasks", task_id, {"decision": row["decision"]})
    return {"id": task_id, **row}


@router.post("/qc/{qc_id}/measurements", status_code=201)
def record_qc_measurement(qc_id: str, body: QCMeasurementRequest,
                          user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Quality Control"}:
        raise HTTPException(403, "نقش کاربری اجازه ثبت اندازه‌گیری QC را ندارد.")
    numeric = [body.actual, body.nominal, body.minimum, body.maximum]
    if any(value is not None and not math.isfinite(value) for value in numeric):
        raise HTTPException(422, "مقادیر اندازه‌گیری باید اعداد محدود باشند.")
    if body.minimum is not None and body.maximum is not None and body.minimum > body.maximum:
        raise HTTPException(422, "حداقل مجاز نباید بیشتر از حداکثر مجاز باشد.")
    passed = (body.minimum is None or body.actual >= body.minimum) and (body.maximum is None or body.actual <= body.maximum)
    result = "PASS" if passed else "FAIL"
    with connect() as db:
        row = _get_resource(db, "qc", qc_id, user)
        if row is None:
            raise HTTPException(404, "رکورد کنترل کیفیت پیدا نشد.")
        cur = db.execute(
            """INSERT INTO qc_measurements(qc_id,parameter,nominal,minimum,maximum,actual,unit,
               result,note,inspector_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (qc_id, body.parameter, body.nominal, body.minimum, body.maximum, body.actual,
             body.unit, result, body.note, user["id"], utc_now()),
        )
        measurements = list(row.get("measurements") or [])
        measurements.append({"id": cur.lastrowid, "parameter": body.parameter, "nominal": body.nominal,
                             "minimum": body.minimum, "maximum": body.maximum, "actual": body.actual,
                             "unit": body.unit, "result": result, "note": body.note})
        row["measurements"] = measurements
        row["status"] = "بررسی‌شده"
        if result == "FAIL":
            row["decision"] = "رد"
        _save_resource(db, "qc", qc_id, row)
        audit(db, user["id"], "qc.measurement", "qc", qc_id,
              {"parameter": body.parameter, "result": result})
    return {"id": cur.lastrowid, "qc_id": qc_id, "result": result,
            "measurement": body.model_dump(), "mode": "MANUAL_ENTRY"}
