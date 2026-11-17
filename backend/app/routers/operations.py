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
        "SELECT factory_id,payload FROM resources WHERE collection=? AND id=?",
        (collection, record_id),
    ).fetchone()
    if row is None:
        return None
    if user and user.get("role") != "Organization Admin" and row["factory_id"] != user.get("factory_id"):
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
        row = _get_resource(db,"productionRuns",run_id,user)
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
        row = _get_resource(db,"batches",batch_id,user)
        if row is None:
            raise HTTPException(404,"بچ پیدا نشد.")
        if row.get("status") == "در حال توزین":
            raise HTTPException(409,"بچ در حال توزین است.")
        if row.get("status") in {"تکمیل‌شده", "لغوشده"}:
            raise HTTPException(409,"بچ تکمیل‌شده یا لغوشده قابل شروع مجدد نیست.")
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
        row = _get_resource(db,"batches",batch_id,user)
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


@router.post("/batches/{batch_id}/cancel")
def cancel_batch(batch_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Operator"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی لغو بچ را ندارد.")
    with connect() as db:
        row = _get_resource(db, "batches", batch_id, user)
        if row is None:
            raise HTTPException(404, "بچ پیدا نشد.")
        if row.get("status") == "در حال توزین":
            raise HTTPException(409, "ابتدا بچ را متوقف کنید، سپس آن را لغو کنید.")
        if row.get("status") in {"لغوشده", "تکمیل‌شده"}:
            raise HTTPException(409, "بچ قبلاً نهایی شده و قابل لغو مجدد نیست.")
        row.update({
            "status": "لغوشده",
            "cancelled_at": utc_now(),
            "cancelled_by": user["id"],
        })
        _save_resource(db, "batches", batch_id, row)
        db.execute(
            "INSERT INTO batch_events(batch_id,event,payload,created_at) VALUES(?,?,?,?)",
            (batch_id, "CANCEL", json_dump({"mode": "SIMULATION", "actor": user["id"]}), utc_now()),
        )
        audit(db, user["id"], "batch.cancel", "batches", batch_id, {"mode": "SIMULATION"})
    return {"id": batch_id, **row, "execution_mode": "SIMULATION"}


@router.post("/workflow-tasks/{task_id}/approve")
def approve_workflow_task(task_id: str, body: DecisionRequest | None = None,
                          user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin", "Factory Admin", "Production Manager", "Production Planner", "Quality Control"}:
        raise HTTPException(403, "نقش کاربری اجازه‌ی تأیید این وظیفه را ندارد.")
    with connect() as db:
        row = _get_resource(db,"workflowTasks",task_id,user)
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
        row = _get_resource(db,"qc",qc_id,user)
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
    with connect() as db:
        report = _get_resource(db,"reports",report_id,user)
        if report is None:
            raise HTTPException(404,"قالب گزارش پیدا نشد.")
        execution_id = "rep-" + uuid.uuid4().hex[:14]
        created = utc_now()

        def collection_snapshot(collection: str, limit: int = 200) -> list[dict]:
            if user["role"] == "Organization Admin":
                rows = db.execute(
                    "SELECT id,factory_id,payload,updated_at FROM resources WHERE collection=? ORDER BY updated_at DESC LIMIT ?",
                    (collection, limit),
                ).fetchall()
            else:
                rows = db.execute(
                    "SELECT id,factory_id,payload,updated_at FROM resources WHERE collection=? AND factory_id=? ORDER BY updated_at DESC LIMIT ?",
                    (collection, user["factory_id"], limit),
                ).fetchall()
            return [
                {"id": row["id"], **(json_load(row["payload"], {}) or {}),
                 **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
                 "updated_at": row["updated_at"]}
                for row in rows
            ]

        tags = collection_snapshot("tags", 1000)
        orders = collection_snapshot("orders")
        runs = collection_snapshot("productionRuns")
        qc_records = collection_snapshot("qc")
        alarms = collection_snapshot("alarms")
        batches = collection_snapshot("batches")
        if user["role"] == "Organization Admin":
            recent_samples = db.execute(
                "SELECT tag_id,value_json,quality,source,sampled_at FROM telemetry_samples ORDER BY sampled_at DESC LIMIT 500"
            ).fetchall()
            plc_count = db.execute("SELECT COUNT(*) FROM resources WHERE collection='plcs'").fetchone()[0]
        else:
            recent_samples = db.execute(
                "SELECT tag_id,value_json,quality,source,sampled_at FROM telemetry_samples WHERE factory_id=? ORDER BY sampled_at DESC LIMIT 500",
                (user["factory_id"],),
            ).fetchall()
            plc_count = db.execute(
                "SELECT COUNT(*) FROM resources WHERE collection='plcs' AND factory_id=?",
                (user["factory_id"],),
            ).fetchone()[0]
        report_result = {
            "mode": "APPLICATION_DATA",
            "generated_at": created,
            "report": {"id": report_id, **report},
            "filters": body.parameters,
            "summary": {
                "plc_count": plc_count,
                "tag_count": len(tags),
                "alarm_count": len(alarms),
                "active_alarm_count": sum(1 for item in alarms if item.get("status") not in {"تأییدشده", "غیرفعال"}),
                "order_count": len(orders),
                "production_run_count": len(runs),
                "running_count": sum(1 for item in runs if item.get("status") == "در حال تولید"),
                "qc_record_count": len(qc_records),
                "batch_count": len(batches),
            },
            "tables": {
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
        db.execute(
            """INSERT INTO report_executions(id,report_id,status,parameters,result,requested_by,created_at,completed_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (execution_id,report_id,"COMPLETED",json_dump(body.parameters),
             json_dump(report_result),user["id"],created,created),
        )
        audit(db,user["id"],"report.run","reports",report_id,{"execution_id":execution_id})
    return {"id":execution_id,"report_id":report_id,"status":"COMPLETED","created_at":created,
            "result":report_result}


@router.get("/reports/{report_id}/executions/{execution_id}")
def get_report_execution(report_id: str, execution_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        if _get_resource(db, "reports", report_id, user) is None:
            raise HTTPException(404, "قالب گزارش پیدا نشد.")
        row = db.execute(
            "SELECT id,report_id,status,parameters,result,requested_by,created_at,completed_at FROM report_executions WHERE report_id=? AND id=?",
            (report_id, execution_id),
        ).fetchone()
    if row is None:
        raise HTTPException(404, "اجرای گزارش پیدا نشد.")
    return {"id":row["id"],"report_id":row["report_id"],"status":row["status"],
            "parameters":json_load(row["parameters"],{}),"result":json_load(row["result"],{}),
            "requested_by":row["requested_by"],"created_at":row["created_at"],"completed_at":row["completed_at"]}


@router.get("/reports/{report_id}/executions")
def list_report_executions(report_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        if _get_resource(db, "reports", report_id, user) is None:
            raise HTTPException(404, "قالب گزارش پیدا نشد.")
        rows = db.execute(
            "SELECT id,report_id,status,parameters,result,requested_by,created_at,completed_at FROM report_executions WHERE report_id=? ORDER BY created_at DESC LIMIT 100",
            (report_id,),
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
        total = float(row.get("quantity_actual") or 0) + body.quantity
        scrap = float(row.get("scrap_quantity") or 0) + body.scrap_quantity
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
    return {"id": run_id, **row, "event_id": cur.lastrowid, "execution_mode": "APPLICATION_DATA"}


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
        completed = utc_now()
        row.update({"status": "تکمیل‌شده", "completed_at": completed, "completed_by": user["id"]})
        _save_resource(db, "productionRuns", run_id, row)
        db.execute(
            "INSERT INTO production_run_events(run_id,event,details,actor_id,created_at) VALUES(?,?,?,?,?)",
            (run_id, "COMPLETED", json_dump({"quantity_actual": row.get("quantity_actual", 0)}), user["id"], completed),
        )
        audit(db, user["id"], "production.complete", "productionRuns", run_id)
    return {"id": run_id, **row}


@router.get("/production-runs/{run_id}/events")
def production_run_events(run_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        if user["role"] == "Organization Admin":
            exists = db.execute(
                "SELECT 1 FROM resources WHERE collection='productionRuns' AND id=?", (run_id,)
            ).fetchone()
        else:
            exists = db.execute(
                "SELECT 1 FROM resources WHERE collection='productionRuns' AND id=? AND factory_id=?",
                (run_id, user["factory_id"]),
            ).fetchone()
        if not exists:
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
        if not 0 <= tolerance <= 100:
            raise HTTPException(422, "درصد تلرانس بچ معتبر نیست.")
        config_id = batch.get("config_id") or batch.get("batch_config_id")
        config = _get_resource(db, "batchConfigs", config_id, user) if config_id else None
        if config is None and batch.get("formula"):
            if user["role"] == "Organization Admin":
                config_row = db.execute(
                    "SELECT id,payload FROM resources WHERE collection='batchConfigs' ORDER BY updated_at DESC"
                ).fetchall()
            else:
                config_row = db.execute(
                    "SELECT id,payload FROM resources WHERE collection='batchConfigs' AND factory_id=? ORDER BY updated_at DESC",
                    (user["factory_id"],),
                ).fetchall()
            for item in config_row:
                candidate = json_load(item["payload"], {}) or {}
                if batch.get("formula") in {candidate.get("formula"), candidate.get("name"), candidate.get("code")}:
                    config = candidate
                    break
        expected = {str(item.get("bin")) for item in (config or {}).get("hoppers", []) if item.get("bin")}
        submitted = [item.hopper_key for item in body.items]
        if expected and (len(submitted) != len(set(submitted)) or set(submitted) != expected):
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
        if user["role"] == "Organization Admin":
            exists = db.execute("SELECT 1 FROM resources WHERE collection='batches' AND id=?", (batch_id,)).fetchone()
        else:
            exists = db.execute(
                "SELECT 1 FROM resources WHERE collection='batches' AND id=? AND factory_id=?",
                (batch_id, user["factory_id"]),
            ).fetchone()
        if not exists:
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
        config_id = batch.get("config_id") or batch.get("batch_config_id")
        config = _get_resource(db, "batchConfigs", config_id, user) if config_id else None
        expected = {str(item.get("bin")) for item in (config or {}).get("hoppers", []) if item.get("bin")}
        if expected and set(latest) != expected:
            raise HTTPException(409, "توزین همه هاپرهای تعریف‌شده باید ثبت شود.")
        if any(result != "IN_TOLERANCE" for result in latest.values()):
            raise HTTPException(409, "حداقل یک هاپر خارج از تلرانس است؛ پیش از تکمیل باید اصلاح یا تعیین تکلیف شود.")
        completed = utc_now()
        batch.update({"status": "تکمیل‌شده", "completed_at": completed, "completed_by": user["id"]})
        _save_resource(db, "batches", batch_id, batch)
        db.execute(
            "INSERT INTO batch_events(batch_id,event,payload,created_at) VALUES(?,?,?,?)",
            (batch_id, "COMPLETED", json_dump({"hopper_count": len(latest), "quality": "DEMO"}), completed),
        )
        audit(db, user["id"], "batch.complete", "batches", batch_id, {"hopper_count": len(latest)})
    return {"id": batch_id, **batch, "execution_mode": "SIMULATION"}


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
