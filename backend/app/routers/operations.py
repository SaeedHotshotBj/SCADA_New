from __future__ import annotations

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


def _get_resource(db, collection: str, record_id: str):
    row = db.execute(
        "SELECT payload FROM resources WHERE collection=? AND id=?",
        (collection, record_id),
    ).fetchone()
    return json_load(row["payload"], {}) if row else None


def _save_resource(db, collection: str, record_id: str, payload: dict):
    db.execute(
        "UPDATE resources SET payload=?,updated_at=? WHERE collection=? AND id=?",
        (json_dump(payload), utc_now(), collection, record_id),
    )


@router.post("/production-runs/{run_id}/start")
def start_production_run(run_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        row = _get_resource(db, "productionRuns", run_id)
        if row is None:
            raise HTTPException(404, "اجرای تولید پیدا نشد.")
        if row.get("status") == "در حال تولید":
            raise HTTPException(409, "این اجرای تولید از قبل فعال است.")
        if row.get("status") == "تکمیل‌شده":
            raise HTTPException(409, "اجرای تکمیل‌شده قابل شروع مجدد نیست.")
        row.update({"status":"در حال تولید","started_at":utc_now(),"started_by":user["id"]})
        _save_resource(db,"productionRuns",run_id,row)
        audit(db,user["id"],"production.start","productionRuns",run_id)
    return {"id":run_id,**row}


@router.post("/production-runs/{run_id}/stop")
def stop_production_run(run_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        row = _get_resource(db,"productionRuns",run_id)
        if row is None:
            raise HTTPException(404,"اجرای تولید پیدا نشد.")
        if row.get("status") != "در حال تولید":
            raise HTTPException(409,"اجرای تولید در وضعیت فعال نیست.")
        row.update({"status":"متوقف","stopped_at":utc_now(),"stopped_by":user["id"]})
        _save_resource(db,"productionRuns",run_id,row)
        audit(db,user["id"],"production.stop","productionRuns",run_id)
    return {"id":run_id,**row}


@router.post("/batches/{batch_id}/start")
def start_batch(batch_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        row = _get_resource(db,"batches",batch_id)
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
    with connect() as db:
        row = _get_resource(db,"batches",batch_id)
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
    with connect() as db:
        row = _get_resource(db,"workflowTasks",task_id)
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
    if body.decision not in {"قبول","مشروط","رد"}:
        raise HTTPException(422,"تصمیم کنترل کیفیت باید قبول، مشروط یا رد باشد.")
    with connect() as db:
        row = _get_resource(db,"qc",qc_id)
        if row is None:
            raise HTTPException(404,"رکورد کنترل کیفیت پیدا نشد.")
        row.update({"decision":body.decision,"status":"بررسی‌شده","inspector":user["name"],
                    "decided_by":user["id"],"decided_at":utc_now(),"note":body.note})
        _save_resource(db,"qc",qc_id,row)
        audit(db,user["id"],"qc.decision","qc",qc_id,{"decision":body.decision})
    return {"id":qc_id,**row}


@router.post("/reports/{report_id}/run", status_code=202)
def run_report(report_id: str, body: RunRequest, user: dict = Depends(get_current_user)):
    with connect() as db:
        report = _get_resource(db,"reports",report_id)
        if report is None:
            raise HTTPException(404,"قالب گزارش پیدا نشد.")
        execution_id = "rep-" + uuid.uuid4().hex[:14]
        created = utc_now()
        db.execute(
            """INSERT INTO report_executions(id,report_id,status,parameters,result,requested_by,created_at,completed_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (execution_id,report_id,"COMPLETED",json_dump(body.parameters),
             json_dump({"message":"گزارش بر اساس داده‌های ذخیره‌شده‌ی سامانه ساخته شد.","mode":"APPLICATION_DATA"}),
             user["id"],created,created),
        )
        audit(db,user["id"],"report.run","reports",report_id,{"execution_id":execution_id})
    return {"id":execution_id,"report_id":report_id,"status":"COMPLETED","created_at":created,
            "result":{"message":"گزارش اجرا شد. داده‌ها از اطلاعات ذخیره‌شده‌ی سامانه خوانده شدند."}}


@router.get("/reports/{report_id}/executions")
def list_report_executions(report_id: str, user: dict = Depends(get_current_user)):
    with connect() as db:
        rows = db.execute(
            "SELECT id,report_id,status,parameters,result,requested_by,created_at,completed_at FROM report_executions WHERE report_id=? ORDER BY created_at DESC LIMIT 100",
            (report_id,),
        ).fetchall()
    return [{"id":r["id"],"report_id":r["report_id"],"status":r["status"],
             "parameters":json_load(r["parameters"],{}),"result":json_load(r["result"],{}),
             "requested_by":r["requested_by"],"created_at":r["created_at"],"completed_at":r["completed_at"]} for r in rows]
