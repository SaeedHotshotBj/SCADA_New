from __future__ import annotations

import re
import secrets
import string
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..database import connect, json_dump, json_load, utc_now, audit
from ..dependencies import get_current_user
from ..security import hash_password

router = APIRouter(prefix="/api/resources", tags=["Resources"])

COLLECTIONS = {
    "factories", "plcs", "tags", "alarms", "trends", "reports", "processes",
    "templates", "orders", "units", "qc", "batches", "productionRuns",
    "workflowTasks", "products", "machines", "prices",
}
ROLES = {"Organization Admin", "Factory Admin", "Engineer", "Operator",
         "Production Planner", "Quality Control", "Production Manager"}
TAG_TYPES = {"bool", "int16", "uint16", "int32", "uint32", "float32", "string"}
ENUMS = {
    "plcs.protocol": {"modbus-tcp", "modbus-rtu", "s7", "simulator"},
    "tags.type": TAG_TYPES,
    "tags.access": {"read", "read_write"},
    "users.role": ROLES,
    "users.status": {"فعال", "غیرفعال"},
    "factories.status": {"فعال", "غیرفعال"},
    "orders.status": {"در انتظار", "آزادشده", "در حال تولید", "تکمیل‌شده", "لغوشده"},
    "qc.decision": {"قبول", "مشروط", "رد"},
}


class ResourceInput(BaseModel):
    model_config = ConfigDict(extra="allow")


def clean_payload(collection: str, raw: dict[str, Any], *, creating: bool) -> dict[str, Any]:
    if len(json_dump(raw)) > 24_000:
        raise HTTPException(status_code=413, detail="حجم داده‌ی ارسالی بیش از حد مجاز است.")
    payload = {str(k): v for k, v in raw.items() if k not in {"id", "password_hash", "temporary_password"}}
    for key, value in list(payload.items()):
        if isinstance(value, str):
            payload[key] = value.strip()
            if len(value) > 4000:
                raise HTTPException(status_code=422, detail=f"مقدار فیلد {key} بیش از حد طولانی است.")
        elif isinstance(value, float) and (value != value or abs(value) == float("inf")):
            raise HTTPException(status_code=422, detail=f"مقدار فیلد {key} معتبر نیست.")
    required = {
        "users": ("name", "email", "role"),
        "factories": ("name", "code"),
        "plcs": ("name", "protocol", "address"),
        "tags": ("name", "plc", "type", "address", "access"),
        "alarms": ("name", "severity"),
        "trends": ("name", "tags", "period"),
        "reports": ("name", "type"),
        "processes": ("name", "code"),
        "templates": ("name", "steps"),
        "orders": ("code", "product", "quantity", "unit"),
        "units": ("code", "quantity", "unit"),
        "qc": ("code", "product", "machine", "decision"),
        "batches": ("code", "formula", "target"),
        "productionRuns": ("order", "machine", "product", "target"),
    }
    if creating:
        for field in required.get(collection, ()):
            if field not in payload or payload[field] in (None, ""):
                raise HTTPException(status_code=422, detail=f"فیلد الزامی است: {field}")
    for field, allowed in ENUMS.items():
        name_collection, name_field = field.split(".", 1)
        if collection == name_collection and name_field in payload and payload[name_field] not in allowed:
            raise HTTPException(status_code=422, detail=f"مقدار {name_field} مجاز نیست.")
    if collection == "users" and "email" in payload:
        email = payload["email"].lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise HTTPException(status_code=422, detail="ایمیل معتبر نیست.")
        payload["email"] = email
    if collection in {"orders", "units", "batches", "productionRuns"}:
        for field in ("quantity", "target", "progress"):
            if field in payload:
                try:
                    number = float(payload[field])
                    if number < 0 or number != number or abs(number) == float("inf"):
                        raise ValueError
                    payload[field] = number
                except (ValueError, TypeError):
                    raise HTTPException(status_code=422, detail=f"{field} باید عدد معتبر و غیرمنفی باشد.")
    return payload


def _public_user(row) -> dict:
    return {k: row[k] for k in ("id", "email", "name", "role", "status", "created_at", "updated_at")}



def validate_references(collection: str, payload: dict[str, Any], db) -> None:
    if collection == "tags" and payload.get("plc"):
        plc = db.execute(
            "SELECT 1 FROM resources WHERE collection='plcs' AND id=?",
            (payload["plc"],),
        ).fetchone()
        if plc is None:
            raise HTTPException(status_code=422, detail="PLC انتخاب‌شده در سامانه ثبت نشده است.")
    factory_id = payload.get("factory_id")
    if factory_id:
        factory = db.execute(
            "SELECT 1 FROM resources WHERE collection='factories' AND id=?",
            (factory_id,),
        ).fetchone()
        if factory is None:
            raise HTTPException(status_code=422, detail="کارخانه انتخاب‌شده در سامانه ثبت نشده است.")


def list_records(collection: str, db, limit: int, offset: int, factory_id: str | None) -> list[dict]:
    if collection == "users":
        rows = db.execute(
            "SELECT id,email,name,role,status,created_at,updated_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [_public_user(row) for row in rows]
    query = "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=?"
    params: list[Any] = [collection]
    if factory_id:
        query += " AND (factory_id=? OR factory_id IS NULL)"
        params.append(factory_id)
    query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = db.execute(query, params).fetchall()
    return [{"id": row["id"], **(json_load(row["payload"], {}) or {}),
             **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
             "created_at": row["created_at"], "updated_at": row["updated_at"]} for row in rows]


@router.get("/{collection}")
def list_collection(collection: str, limit: int = Query(500, ge=1, le=1000),
                    offset: int = Query(0, ge=0), factory_id: str | None = None,
                    user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    with connect() as db:
        return {"items": list_records(collection, db, limit, offset, factory_id), "limit": limit, "offset": offset}


@router.post("/{collection}", status_code=201)
def create_record(collection: str, body: ResourceInput, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    if user["role"] not in ROLES - {"Operator"}:
        raise HTTPException(status_code=403, detail="نقش کاربری اجازه‌ی ایجاد رکورد ندارد.")
    payload = clean_payload(collection, body.model_dump(), creating=True)
    record_id = "r-" + uuid.uuid4().hex[:16]
    now = utc_now()
    temporary_password = None
    with connect() as db:
        if collection == "users":
            temporary_password = "".join(secrets.choice(string.ascii_letters + string.digits + "!@#") for _ in range(16))
            db.execute(
                """INSERT INTO users(id,email,name,role,status,password_hash,must_change_password,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (record_id, payload["email"], payload["name"], payload["role"], payload.get("status", "فعال"),
                 hash_password(temporary_password), 1, now, now),
            )
            row = db.execute("SELECT id,email,name,role,status,created_at,updated_at FROM users WHERE id=?", (record_id,)).fetchone()
            result = _public_user(row)
        else:
            validate_references(collection, payload, db)
            factory_id = payload.pop("factory_id", None)
            db.execute(
                "INSERT INTO resources(collection,id,factory_id,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                (collection, record_id, factory_id, json_dump(payload), now, now),
            )
            result = {"id": record_id, **payload, "created_at": now, "updated_at": now}
        audit(db, user["id"], "resource.create", collection, record_id)
    if temporary_password:
        result["temporary_password"] = temporary_password
    return result


@router.get("/{collection}/{record_id}")
def get_record(collection: str, record_id: str, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    with connect() as db:
        if collection == "users":
            row = db.execute("SELECT id,email,name,role,status,created_at,updated_at FROM users WHERE id=?", (record_id,)).fetchone()
            result = _public_user(row) if row else None
        else:
            row = db.execute("SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=? AND id=?", (collection, record_id)).fetchone()
            result = ({"id":row["id"], **json_load(row["payload"], {}), "created_at":row["created_at"], "updated_at":row["updated_at"]} if row else None)
    if result is None:
        raise HTTPException(status_code=404, detail="رکورد پیدا نشد.")
    return result


@router.patch("/{collection}/{record_id}")
def update_record(collection: str, record_id: str, body: ResourceInput, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    if user["role"] not in ROLES - {"Operator"}:
        raise HTTPException(status_code=403, detail="نقش کاربری اجازه‌ی ویرایش رکورد ندارد.")
    changes = clean_payload(collection, body.model_dump(), creating=False)
    now = utc_now()
    with connect() as db:
        if collection == "users":
            allowed = {k:v for k,v in changes.items() if k in {"email","name","role","status"}}
            row = db.execute("SELECT * FROM users WHERE id=?", (record_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="کاربر پیدا نشد.")
            merged = {"email":row["email"],"name":row["name"],"role":row["role"],"status":row["status"],**allowed}
            db.execute("UPDATE users SET email=?,name=?,role=?,status=?,updated_at=? WHERE id=?",
                       (merged["email"],merged["name"],merged["role"],merged["status"],now,record_id))
            result = {"id":record_id, **merged, "updated_at":now}
        else:
            row = db.execute("SELECT * FROM resources WHERE collection=? AND id=?", (collection,record_id)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="رکورد پیدا نشد.")
            merged = {**json_load(row["payload"],{}), **changes}
            validate_references(collection, merged, db)
            factory_id = merged.pop("factory_id", row["factory_id"])
            db.execute("UPDATE resources SET factory_id=?,payload=?,updated_at=? WHERE collection=? AND id=?",
                       (factory_id,json_dump(merged),now,collection,record_id))
            result = {"id":record_id, **merged, "updated_at":now}
        audit(db,user["id"],"resource.update",collection,record_id,{"fields":list(changes)})
    return result


@router.delete("/{collection}/{record_id}", status_code=204)
def delete_record(collection: str, record_id: str, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    if user["role"] not in {"Organization Admin", "Factory Admin"}:
        raise HTTPException(status_code=403, detail="حذف رکورد فقط برای مدیر سامانه یا کارخانه مجاز است.")
    with connect() as db:
        if collection == "users":
            if record_id == user["id"]:
                raise HTTPException(status_code=409, detail="حذف حساب کاربری جاری مجاز نیست.")
            cursor = db.execute("DELETE FROM users WHERE id=?", (record_id,))
        else:
            cursor = db.execute("DELETE FROM resources WHERE collection=? AND id=?", (collection,record_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="رکورد پیدا نشد.")
        audit(db,user["id"],"resource.delete",collection,record_id)
