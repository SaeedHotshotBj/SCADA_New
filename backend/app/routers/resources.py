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
    "workflowTasks", "products", "machines", "prices", "hmiPages", "machineCalendars", "batchConfigs", "controlPlans",
}
ROLES = {"Organization Admin", "Factory Admin", "Engineer", "Operator",
         "Production Planner", "Quality Control", "Production Manager"}
ADMIN_ROLES = {"Organization Admin", "Factory Admin"}
TAG_TYPES = {"bool", "int16", "uint16", "int32", "uint32", "float32", "string"}
ENUMS = {
    "plcs.protocol": {"modbus-tcp", "modbus-rtu", "s7", "simulator"},
    "tags.type": TAG_TYPES,
    "tags.access": {"read", "read_write"},
    "users.role": ROLES,
    "users.status": {"فعال", "غیرفعال"},
    "alarms.operator": {">", ">=", "<", "<=", "==", "!="},
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
        "plcs": ("name", "protocol", "address", "factory_id"),
        "tags": ("name", "plc", "type", "address", "access"),
        "alarms": ("name", "severity", "tag", "operator", "threshold"),
        "trends": ("name", "tags", "period"),
        "reports": ("name", "type"),
        "processes": ("name", "code"),
        "templates": ("name", "steps"),
        "workflowTasks": ("title", "flow", "from", "status"),
        "orders": ("code", "product", "quantity", "unit"),
        "units": ("code", "quantity", "unit"),
        "qc": ("code", "product", "machine", "decision"),
        "batches": ("code", "formula", "target"),
        "productionRuns": ("order", "machine", "product", "target"),
        "products": ("code", "name", "unit"),
        "machines": ("name", "code"),
        "prices": ("kind", "code", "name", "price", "currency", "unit"),
        "hmiPages": ("name", "machine", "description", "layout"),
        "machineCalendars": ("machine", "year", "month", "days"),
        "batchConfigs": ("code", "name", "loadcell", "formula", "hoppers"),
        "controlPlans": ("product", "process", "sampling_interval", "sample_count", "parameters"),
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
    numeric_fields = {
        "orders": ("quantity", "progress"), "units": ("quantity",),
        "batches": ("target",), "productionRuns": ("target",),
        "prices": ("price",), "batchConfigs": ("samples", "tolerance_percent", "stabilization_seconds"),
        "controlPlans": ("sample_count",), "hmiPages": ("components",),
    }
    if collection in numeric_fields:
        for field in numeric_fields[collection]:
            if field in payload:
                try:
                    number = float(payload[field])
                    if number < 0 or number != number or abs(number) == float("inf"):
                        raise ValueError
                    payload[field] = number
                except (ValueError, TypeError):
                    raise HTTPException(status_code=422, detail=f"{field} باید عدد معتبر و غیرمنفی باشد.")
    if collection == "alarms" and "threshold" in payload:
        try:
            threshold = float(payload["threshold"])
            if threshold != threshold or abs(threshold) == float("inf"):
                raise ValueError
            payload["threshold"] = threshold
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail="آستانه آلارم باید عدد محدود و معتبر باشد.")
    return payload


def _public_user(row) -> dict:
    return {k: row[k] for k in ("id", "email", "name", "role", "status", "created_at", "updated_at")}



def _resource_value_exists(db, collection: str, field: str, value: str) -> bool:
    rows = db.execute(
        "SELECT payload FROM resources WHERE collection=?",
        (collection,),
    ).fetchall()
    return any((json_load(row["payload"], {}) or {}).get(field) == value for row in rows)


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        text = str(value).strip().translate(str.maketrans(
            "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫٬",
            "01234567890123456789.,"
        ))
        number = float(text)
        return number if number == number and abs(number) != float("inf") else None
    except (TypeError, ValueError):
        return None


def validate_references(collection: str, payload: dict[str, Any], db) -> None:
    if collection in {"orders", "productionRuns", "qc", "controlPlans"}:
        product_name = payload.get("product")
        if product_name and not _resource_value_exists(db, "products", "name", product_name):
            raise HTTPException(status_code=422, detail="محصول انتخاب‌شده در سامانه ثبت نشده است.")
    if collection in {"orders", "productionRuns", "qc"}:
        machine_name = payload.get("machine")
        if machine_name and not _resource_value_exists(db, "machines", "name", machine_name):
            raise HTTPException(status_code=422, detail="ماشین انتخاب‌شده در سامانه ثبت نشده است.")
    if collection == "productionRuns":
        order_code = payload.get("order")
        if order_code and not _resource_value_exists(db, "orders", "code", order_code):
            raise HTTPException(status_code=422, detail="سفارش انتخاب‌شده در سامانه ثبت نشده است.")
    if collection == "batchConfigs" and payload.get("weight_tag_id"):
        tag = db.execute(
            "SELECT 1 FROM resources WHERE collection='tags' AND id=?",
            (payload["weight_tag_id"],),
        ).fetchone()
        if tag is None:
            raise HTTPException(status_code=422, detail="تگ لودسل انتخاب‌شده در سامانه ثبت نشده است.")
    if collection == "plcs" and not payload.get("factory_id"):
        raise HTTPException(status_code=422, detail="هر PLC باید به یک کارخانه تخصیص داده شود.")
    if collection == "tags" and payload.get("plc"):
        plc = db.execute(
            "SELECT factory_id FROM resources WHERE collection='plcs' AND id=?",
            (payload["plc"],),
        ).fetchone()
        if plc is None:
            raise HTTPException(status_code=422, detail="PLC انتخاب‌شده در سامانه ثبت نشده است.")
        plc_factory_id = plc["factory_id"]
        tag_factory_id = payload.get("factory_id")
        if tag_factory_id and plc_factory_id and tag_factory_id != plc_factory_id:
            raise HTTPException(status_code=422, detail="تگ و PLC باید به یک کارخانه تخصیص داده شوند.")
        if not tag_factory_id and plc_factory_id:
            payload["factory_id"] = plc_factory_id
    if collection == "alarms" and payload.get("tag"):
        tag = db.execute(
            "SELECT 1 FROM resources WHERE collection='tags' AND id=?",
            (payload["tag"],),
        ).fetchone()
        if tag is None:
            raise HTTPException(status_code=422, detail="تگ انتخاب‌شده برای آلارم در سامانه ثبت نشده است.")
    if collection == "hmiPages":
        if "layout" not in payload:
            raise HTTPException(status_code=422, detail="چیدمان صفحه HMI الزامی است.")
        if payload.get("machine"):
            machine_rows = db.execute(
                "SELECT payload FROM resources WHERE collection='machines'"
            ).fetchall()
            machine_exists = any(
                (json_load(row["payload"], {}) or {}).get("name") == payload["machine"]
                for row in machine_rows
            )
            if not machine_exists:
                raise HTTPException(status_code=422, detail="ماشین انتخاب‌شده برای صفحه HMI در سامانه ثبت نشده است.")
        layout = payload.get("layout")
        if layout is not None:
            if not isinstance(layout, list) or len(layout) > 50:
                raise HTTPException(status_code=422, detail="چیدمان HMI باید آرایه‌ای با حداکثر ۵۰ جزء باشد.")
            supported = {"value", "status", "gauge", "write"}
            for index, component in enumerate(layout):
                if not isinstance(component, dict) or component.get("type") not in supported:
                    raise HTTPException(status_code=422, detail=f"نوع جزء شماره {index + 1} پشتیبانی نمی‌شود.")
                tag_id = component.get("tag_id")
                tag_row = db.execute(
                    "SELECT payload,factory_id FROM resources WHERE collection='tags' AND id=?",
                    (tag_id,),
                ).fetchone()
                if tag_row is None:
                    raise HTTPException(status_code=422, detail=f"تگ جزء شماره {index + 1} پیدا نشد.")
                tag_payload = json_load(tag_row["payload"], {}) or {}
                if component["type"] == "write" and tag_payload.get("access") != "read_write":
                    raise HTTPException(status_code=422, detail=f"تگ جزء شماره {index + 1} فقط خواندنی است.")
                bounds = {}
                for bound in ("min", "max"):
                    if bound in component:
                        number = _finite_number(component[bound])
                        if number is None:
                            raise HTTPException(status_code=422, detail=f"حد {bound} در جزء شماره {index + 1} معتبر نیست.")
                        bounds[bound] = number
                if component["type"] == "gauge" and (
                    "min" not in bounds or "max" not in bounds or bounds["max"] <= bounds["min"]
                ):
                    raise HTTPException(status_code=422, detail=f"حداقل و حداکثر گیج شماره {index + 1} معتبر نیست.")
            payload["components"] = len(layout)
    if collection == "machineCalendars":
        machine_name = payload.get("machine")
        if machine_name and not _resource_value_exists(db, "machines", "name", machine_name):
            raise HTTPException(status_code=422, detail="ماشین انتخاب‌شده برای تقویم ثبت نشده است.")
        days = payload.get("days")
        expected_days = {"شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"}
        if not isinstance(days, list) or len(days) != 7:
            raise HTTPException(status_code=422, detail="تقویم باید دقیقاً شامل هفت روز هفته باشد.")
        names = [day.get("day") for day in days if isinstance(day, dict)]
        if len(names) != 7 or set(names) != expected_days:
            raise HTTPException(status_code=422, detail="روزهای تقویم باید هر هفت روز هفته را بدون تکرار شامل شوند.")
        time_pattern = re.compile(r"^(?:[01]\\d|2[0-3]):[0-5]\\d$")
        for day in days:
            if not isinstance(day.get("enabled"), bool):
                raise HTTPException(status_code=422, detail="وضعیت کاری هر روز باید بولی باشد.")
            start_time, end_time, break_time = day.get("start"), day.get("end"), day.get("break")
            if not all(isinstance(value, str) and time_pattern.fullmatch(value) for value in (start_time, end_time, break_time)):
                raise HTTPException(status_code=422, detail="ساعات شروع، پایان و استراحت باید در قالب HH:MM باشند.")
            start_minutes = int(start_time[:2]) * 60 + int(start_time[3:])
            end_minutes = int(end_time[:2]) * 60 + int(end_time[3:])
            break_minutes = int(break_time[:2]) * 60 + int(break_time[3:])
            if day["enabled"] and (end_minutes <= start_minutes or break_minutes > end_minutes - start_minutes):
                raise HTTPException(status_code=422, detail="پایان شیفت و زمان استراحت برای روز کاری معتبر نیست.")

    if collection == "batchConfigs":
        hoppers = payload.get("hoppers")
        if not isinstance(hoppers, list) or not 1 <= len(hoppers) <= 20:
            raise HTTPException(status_code=422, detail="فرمول بچ باید بین یک تا بیست هاپر داشته باشد.")
        ratios = []
        for index, hopper in enumerate(hoppers):
            if not isinstance(hopper, dict) or not hopper.get("bin") or not hopper.get("material"):
                raise HTTPException(status_code=422, detail=f"اطلاعات هاپر شماره {index + 1} ناقص است.")
            ratio = _finite_number(hopper.get("ratio"))
            target = _finite_number(hopper.get("target"))
            if ratio is None or not 0 <= ratio <= 100:
                raise HTTPException(status_code=422, detail=f"درصد هاپر شماره {index + 1} باید بین صفر تا صد باشد.")
            if target is None or target < 0:
                raise HTTPException(status_code=422, detail=f"وزن هدف هاپر شماره {index + 1} معتبر نیست.")
            ratios.append(ratio)
        if abs(sum(ratios) - 100.0) > 0.01:
            raise HTTPException(status_code=422, detail="مجموع نسبت مواد باید دقیقاً ۱۰۰ درصد باشد.")
        samples = _finite_number(payload.get("samples"))
        tolerance = _finite_number(payload.get("tolerance_percent"))
        stabilization = _finite_number(payload.get("stabilization_seconds"))
        if samples is None or not 1 <= samples <= 100:
            raise HTTPException(status_code=422, detail="تعداد نمونه باید بین ۱ تا ۱۰۰ باشد.")
        if tolerance is None or not 0 <= tolerance <= 100:
            raise HTTPException(status_code=422, detail="تلرانس باید بین صفر تا صد درصد باشد.")
        if stabilization is None or not 0 <= stabilization <= 600:
            raise HTTPException(status_code=422, detail="زمان پایدارسازی باید بین صفر تا ۶۰۰ ثانیه باشد.")
        if payload.get("weight_tag_id"):
            tag_row = db.execute(
                "SELECT payload FROM resources WHERE collection='tags' AND id=?",
                (payload["weight_tag_id"],),
            ).fetchone()
            tag_payload = json_load(tag_row["payload"], {}) or {}
            if tag_payload.get("access") != "read" or tag_payload.get("type") not in {"float32","int16","uint16","int32","uint32"}:
                raise HTTPException(status_code=422, detail="تگ لودسل باید عددی و فقط‌خواندنی باشد.")

    if collection == "controlPlans":
        parameters = payload.get("parameters")
        if not isinstance(parameters, list) or not 1 <= len(parameters) <= 50:
            raise HTTPException(status_code=422, detail="طرح کنترل باید بین یک تا پنجاه پارامتر داشته باشد.")
        if not isinstance(payload.get("approval_required"), bool):
            raise HTTPException(status_code=422, detail="الزام تأیید باید مقدار بولی داشته باشد.")
        sample_count = _finite_number(payload.get("sample_count"))
        if sample_count is None or not 1 <= sample_count <= 1000:
            raise HTTPException(status_code=422, detail="تعداد نمونه باید بین یک تا هزار باشد.")
        for index, parameter in enumerate(parameters):
            if not isinstance(parameter, dict) or not parameter.get("parameter"):
                raise HTTPException(status_code=422, detail=f"پارامتر شماره {index + 1} ناقص است.")
            lower = _finite_number(parameter.get("min")) if parameter.get("min") not in (None, "", "—") else None
            upper = _finite_number(parameter.get("max")) if parameter.get("max") not in (None, "", "—") else None
            if parameter.get("min") not in (None, "", "—") and lower is None:
                raise HTTPException(status_code=422, detail=f"حداقل پارامتر شماره {index + 1} معتبر نیست.")
            if parameter.get("max") not in (None, "", "—") and upper is None:
                raise HTTPException(status_code=422, detail=f"حداکثر پارامتر شماره {index + 1} معتبر نیست.")
            if lower is not None and upper is not None and lower > upper:
                raise HTTPException(status_code=422, detail=f"حدود پارامتر شماره {index + 1} معکوس هستند.")

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
        if collection == "users" and user["role"] not in ADMIN_ROLES:
            rows = db.execute(
                "SELECT id,email,name,role,status,created_at,updated_at FROM users WHERE id=?",
                (user["id"],),
            ).fetchall()
            return {"items": [_public_user(row) for row in rows], "limit": limit, "offset": 0}
        return {"items": list_records(collection, db, limit, offset, factory_id), "limit": limit, "offset": offset}


@router.post("/{collection}", status_code=201)
def create_record(collection: str, body: ResourceInput, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    payload = clean_payload(collection, body.model_dump(), creating=True)
    if collection == "users":
        if user["role"] not in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="مدیریت کاربران فقط برای مدیر سامانه یا کارخانه مجاز است.")
        if payload.get("role") == "Organization Admin" and user["role"] != "Organization Admin":
            raise HTTPException(status_code=403, detail="ایجاد مدیر سازمان فقط برای مدیر سازمان مجاز است.")
    elif user["role"] not in ROLES - {"Operator"}:
        raise HTTPException(status_code=403, detail="نقش کاربری اجازه‌ی ایجاد رکورد ندارد.")
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
            result = {"id": record_id, **payload, **({"factory_id": factory_id} if factory_id else {}),
                      "created_at": now, "updated_at": now}
        audit(db, user["id"], "resource.create", collection, record_id)
    if temporary_password:
        result["temporary_password"] = temporary_password
    return result


@router.get("/{collection}/{record_id}")
def get_record(collection: str, record_id: str, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    if collection == "users" and user["role"] not in ADMIN_ROLES and record_id != user["id"]:
        raise HTTPException(status_code=404, detail="کاربر پیدا نشد.")
    with connect() as db:
        if collection == "users":
            row = db.execute("SELECT id,email,name,role,status,created_at,updated_at FROM users WHERE id=?", (record_id,)).fetchone()
            result = _public_user(row) if row else None
        else:
            row = db.execute("SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=? AND id=?", (collection, record_id)).fetchone()
            result = ({"id":row["id"], **json_load(row["payload"], {}),
                       **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
                       "created_at":row["created_at"], "updated_at":row["updated_at"]} if row else None)
    if result is None:
        raise HTTPException(status_code=404, detail="رکورد پیدا نشد.")
    return result


@router.patch("/{collection}/{record_id}")
def update_record(collection: str, record_id: str, body: ResourceInput, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    changes = clean_payload(collection, body.model_dump(), creating=False)
    if collection == "users":
        if user["role"] not in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="مدیریت کاربران فقط برای مدیر سامانه یا کارخانه مجاز است.")
        if changes.get("role") == "Organization Admin" and user["role"] != "Organization Admin":
            raise HTTPException(status_code=403, detail="تعیین نقش مدیر سازمان فقط برای مدیر سازمان مجاز است.")
    elif user["role"] not in ROLES - {"Operator"}:
        raise HTTPException(status_code=403, detail="نقش کاربری اجازه‌ی ویرایش رکورد ندارد.")
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
            merged = {
                **json_load(row["payload"], {}),
                **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
                **changes,
            }
            validate_references(collection, merged, db)
            factory_id = merged.pop("factory_id", row["factory_id"])
            db.execute("UPDATE resources SET factory_id=?,payload=?,updated_at=? WHERE collection=? AND id=?",
                       (factory_id,json_dump(merged),now,collection,record_id))
            result = {"id":record_id, **merged,
                      **({"factory_id": factory_id} if factory_id else {}),
                      "updated_at":now}
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
