from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from ..database import connect, json_dump, json_load, utc_now, audit
from ..dependencies import get_current_user
from ..security import new_token, token_hash

router = APIRouter(prefix="/api/edge", tags=["Edge"])


class EdgeRegistration(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    factory_id: str | None = None
    note: str = Field(default="", max_length=500)


class Heartbeat(BaseModel):
    version: str = Field(default="unknown", max_length=80)
    hostname: str = Field(default="", max_length=120)
    cpu_percent: float | None = Field(default=None, ge=0, le=100)
    memory_percent: float | None = Field(default=None, ge=0, le=100)
    disk_percent: float | None = Field(default=None, ge=0, le=100)
    plc_connections: int = Field(default=0, ge=0, le=1000)
    pending_count: int = Field(default=0, ge=0)


@router.post("/register", status_code=201)
def register_edge(body: EdgeRegistration, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin","Factory Admin"}:
        raise HTTPException(403,"ثبت Edge فقط برای مدیر سامانه یا کارخانه مجاز است.")
    now = utc_now()
    edge_id = "edge-" + new_token()[:14]
    token = new_token()
    with connect() as db:
        if body.factory_id:
            exists = db.execute("SELECT 1 FROM resources WHERE collection='factories' AND id=?", (body.factory_id,)).fetchone()
            if not exists:
                raise HTTPException(404,"کارخانه انتخاب‌شده پیدا نشد.")
        db.execute(
            """INSERT INTO edge_devices(id,factory_id,name,status,token_hash,metadata,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (edge_id,body.factory_id,body.name,"PENDING",token_hash(token),
             json_dump({"note":body.note}),now,now),
        )
        audit(db,user["id"],"edge.register","edge_devices",edge_id,{"factory_id":body.factory_id})
    # The raw secret is returned once and is never retrievable from the database.
    return {"id":edge_id,"name":body.name,"status":"PENDING","edge_token":token,
            "install_hint":"این توکن فقط در زمان ثبت نمایش داده می‌شود؛ آن را در فایل تنظیمات Edge نگه دارید."}


@router.get("")
def list_edges(user: dict = Depends(get_current_user)):
    with connect() as db:
        rows = db.execute(
            "SELECT id,factory_id,name,status,metadata,last_seen,created_at,updated_at FROM edge_devices ORDER BY created_at DESC"
        ).fetchall()
    return {"items":[{"id":r["id"],"factory_id":r["factory_id"],"name":r["name"],"status":r["status"],
                      "metadata":json_load(r["metadata"],{}),"last_seen":r["last_seen"],
                      "created_at":r["created_at"],"updated_at":r["updated_at"]} for r in rows]}


@router.post("/heartbeat")
def heartbeat(body: Heartbeat, x_edge_token: str | None = Header(default=None)):
    if not x_edge_token:
        raise HTTPException(401,"توکن Edge ارسال نشده است.")
    now = utc_now()
    metadata = body.model_dump()
    with connect() as db:
        row = db.execute("SELECT id FROM edge_devices WHERE token_hash=?", (token_hash(x_edge_token),)).fetchone()
        if not row:
            raise HTTPException(401,"توکن Edge معتبر نیست.")
        db.execute(
            "UPDATE edge_devices SET status='ONLINE',metadata=?,last_seen=?,updated_at=? WHERE id=?",
            (json_dump(metadata),now,now,row["id"]),
        )
        audit(db,None,"edge.heartbeat","edge_devices",row["id"],{"version":body.version})
    return {"ok":True,"edge_id":row["id"],"status":"ONLINE","received_at":now}


@router.post("/{edge_id}/revoke")
def revoke_edge(edge_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in {"Organization Admin","Factory Admin"}:
        raise HTTPException(403,"دسترسی کافی ندارید.")
    with connect() as db:
        cur = db.execute("UPDATE edge_devices SET status='REVOKED',token_hash=NULL,updated_at=? WHERE id=?", (utc_now(),edge_id))
        if cur.rowcount == 0:
            raise HTTPException(404,"Edge پیدا نشد.")
        audit(db,user["id"],"edge.revoke","edge_devices",edge_id)
    return {"id":edge_id,"status":"REVOKED"}
