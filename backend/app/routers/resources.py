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
HMI_CHART_RANGE_SECONDS = {5, 10, 30, 60, 300, 600, 900, 1800, 3600, 21600, 43200, 86400}
ENUMS = {
    "plcs.protocol": {"modbus-tcp", "modbus-rtu", "s7", "simulator"},
    "tags.type": TAG_TYPES,
    "tags.access": {"read", "read_write"},
    "tags.string_format": {"raw", "s7"},
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
        "plcs": ("unit", "rack", "slot", "baudrate", "bytesize", "stopbits"),
        "tags": ("address_base", "bit", "length"),
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

    if collection == "plcs":
        for field in ("enabled", "allow_writes", "safety_confirmed"):
            if field in payload and not isinstance(payload[field], bool):
                raise HTTPException(status_code=422, detail=f"{field} باید مقدار بولی داشته باشد.")
        if payload.get("allow_writes") and not payload.get("safety_confirmed"):
            raise HTTPException(status_code=422, detail="برای اجازه نوشتن فیزیکی باید بررسی ایمنی PLC نیز تأیید شده باشد.")
        for field in ("poll", "history_interval"):
            if field in payload and payload[field] not in (None, ""):
                match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(ms|millisecond|milliseconds|s|sec|second|seconds)?", str(payload[field]).strip().lower())
                if not match:
                    raise HTTPException(status_code=422, detail=f"فرمت {field} معتبر نیست؛ از مقدارهایی مانند 500 ms یا 5 s استفاده کنید.")
                number = float(match.group(1))
                seconds = number / 1000 if match.group(2) in (None, "ms", "millisecond", "milliseconds") else number
                minimum = 0.1 if field == "poll" else 1.0
                if not minimum <= seconds <= 60:
                    raise HTTPException(status_code=422, detail=f"مقدار {field} باید بین {minimum} و ۶۰ ثانیه باشد.")
        if "unit" in payload and not 0 <= payload["unit"] <= 255:
            raise HTTPException(status_code=422, detail="Unit ID باید بین صفر تا ۲۵۵ باشد.")
        if "rack" in payload and not 0 <= payload["rack"] <= 7:
            raise HTTPException(status_code=422, detail="Rack باید بین صفر تا هفت باشد.")
        if "slot" in payload and not 0 <= payload["slot"] <= 31:
            raise HTTPException(status_code=422, detail="Slot باید بین صفر تا ۳۱ باشد.")
        if "baudrate" in payload and not 300 <= payload["baudrate"] <= 115200:
            raise HTTPException(status_code=422, detail="Baud rate خارج از محدوده پشتیبانی‌شده است.")
        if "bytesize" in payload and payload["bytesize"] not in {7, 8}:
            raise HTTPException(status_code=422, detail="Data bits باید ۷ یا ۸ باشد.")
        if "stopbits" in payload and payload["stopbits"] not in {1, 2}:
            raise HTTPException(status_code=422, detail="Stop bits باید ۱ یا ۲ باشد.")
        if "parity" in payload and payload["parity"] not in {"N", "E", "O"}:
            raise HTTPException(status_code=422, detail="Parity باید N، E یا O باشد.")
        if payload.get("protocol") == "modbus-rtu":
            if not payload.get("address"):
                raise HTTPException(status_code=422, detail="برای Modbus RTU باید پورت سریال مانند COM3 وارد شود.")
        elif payload.get("protocol") in {"modbus-tcp", "s7"} and not payload.get("address"):
            raise HTTPException(status_code=422, detail="آدرس IP کنترلر الزامی است.")

    if collection == "tags":
        if "address_area" in payload and payload["address_area"] not in {
            "auto", "coil", "discrete_input", "input_register", "holding_register"
        }:
            raise HTTPException(status_code=422, detail="ناحیه Modbus معتبر نیست.")
        if "address_base" in payload and payload["address_base"] not in {0, 1}:
            raise HTTPException(status_code=422, detail="مبنای آدرس باید صفر یا یک باشد.")
        for field in ("byte_order", "word_order"):
            if field in payload and payload[field] not in {"big", "little"}:
                raise HTTPException(status_code=422, detail=f"{field} باید big یا little باشد.")
        for field in ("scale", "offset"):
            if field in payload:
                number = _finite_number(payload[field])
                if number is None:
                    raise HTTPException(status_code=422, detail=f"{field} باید عدد محدود باشد.")
                payload[field] = number
        if "scale" in payload and payload["scale"] == 0:
            raise HTTPException(status_code=422, detail="Scale نمی‌تواند صفر باشد.")
        if "bit" in payload and not 0 <= payload["bit"] <= 15:
            raise HTTPException(status_code=422, detail="شماره Bit باید بین صفر تا پانزده باشد.")
        if "length" in payload and not 1 <= payload["length"] <= 254:
            raise HTTPException(status_code=422, detail="طول داده باید بین یک تا ۲۵۴ باشد.")
        if payload.get("string_format") == "s7" and (
            payload.get("type") != "string" or not payload.get("length")
        ):
            raise HTTPException(status_code=422, detail="قالب Siemens STRING فقط برای نوع string و با تعیین طول قابل استفاده است.")
    return payload


def _public_user(row) -> dict:
    return {k: row[k] for k in ("id", "email", "name", "role", "status", "factory_id", "created_at", "updated_at")}



def _resource_value_exists(db, collection: str, field: str, value: str,
                           factory_id: str | None = None) -> bool:
    if factory_id:
        rows = db.execute(
            "SELECT payload FROM resources WHERE collection=? AND (factory_id=? OR factory_id IS NULL)",
            (collection, factory_id),
        ).fetchall()
    else:
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
    scope_factory = payload.get("factory_id")
    if collection in {"orders", "productionRuns", "qc", "controlPlans"}:
        product_name = payload.get("product")
        if product_name and not _resource_value_exists(db, "products", "name", product_name, scope_factory):
            raise HTTPException(status_code=422, detail="محصول انتخاب‌شده در سامانه ثبت نشده است.")
    if collection in {"orders", "productionRuns", "qc"}:
        machine_name = payload.get("machine")
        if machine_name and not _resource_value_exists(db, "machines", "name", machine_name, scope_factory):
            raise HTTPException(status_code=422, detail="ماشین انتخاب‌شده در سامانه ثبت نشده است.")
    if collection == "productionRuns":
        order_code = payload.get("order")
        if order_code and not _resource_value_exists(db, "orders", "code", order_code, scope_factory):
            raise HTTPException(status_code=422, detail="سفارش انتخاب‌شده در سامانه ثبت نشده است.")
    if collection == "batchConfigs" and payload.get("weight_tag_id"):
        tag = db.execute(
            "SELECT factory_id FROM resources WHERE collection='tags' AND id=?",
            (payload["weight_tag_id"],),
        ).fetchone()
        if tag is None or (scope_factory and tag["factory_id"] not in {None, scope_factory}):
            raise HTTPException(status_code=422, detail="تگ لودسل انتخاب‌شده در سامانه ثبت نشده است.")
    if collection == "plcs" and not payload.get("factory_id"):
        raise HTTPException(status_code=422, detail="هر PLC باید به یک کارخانه تخصیص داده شود.")
    if collection == "tags" and payload.get("plc"):
        plc = db.execute(
            "SELECT factory_id,payload FROM resources WHERE collection='plcs' AND id=?",
            (payload["plc"],),
        ).fetchone()
        if plc is None:
            raise HTTPException(status_code=422, detail="PLC انتخاب‌شده در سامانه ثبت نشده است.")
        plc_payload = json_load(plc["payload"], {}) or {}
        protocol = plc_payload.get("protocol")
        if payload.get("string_format") == "s7" and protocol != "s7":
            raise HTTPException(status_code=422, detail="قالب Siemens STRING فقط برای PLC با پروتکل S7 مجاز است.")
        if protocol == "s7" and payload.get("address_area") not in (None, "", "auto"):
            raise HTTPException(status_code=422, detail="ناحیه Modbus برای تگ S7 کاربرد ندارد.")
        if protocol == "s7" and payload.get("type") == "string" and not payload.get("length"):
            raise HTTPException(status_code=422, detail="برای رشته S7 باید طول داده مشخص شود.")
        if protocol in {"modbus-tcp", "modbus-rtu"}:
            area = payload.get("address_area")
            address = str(payload.get("address", "")).strip().upper()
            aliases = {"COIL": "coil", "DI": "discrete_input", "IR": "input_register", "HR": "holding_register"}
            if ":" in address:
                area = aliases.get(address.split(":", 1)[0], area)
            if not area or area == "auto":
                area = {"0": "coil", "1": "discrete_input", "3": "input_register", "4": "holding_register"}.get(address[0]) if len(address) >= 5 and address[0] in "0134" else "holding_register"
            if area in {"coil", "discrete_input"} and payload.get("type") != "bool":
                raise HTTPException(status_code=422, detail="Coil و Discrete Input فقط برای تگ BOOL قابل استفاده هستند.")
            if area in {"discrete_input", "input_register"} and payload.get("access") == "read_write":
                raise HTTPException(status_code=422, detail="ناحیه ورودی Modbus فقط خواندنی است؛ برای نوشتن از Coil یا Holding Register استفاده کنید.")
            if payload.get("length") and payload.get("type") == "string" and payload["length"] > 120:
                raise HTTPException(status_code=422, detail="رشته Modbus حداکثر می‌تواند ۱۲۰ رجیستر داشته باشد.")
        plc_factory_id = plc["factory_id"]
        tag_factory_id = payload.get("factory_id")
        if tag_factory_id and plc_factory_id and tag_factory_id != plc_factory_id:
            raise HTTPException(status_code=422, detail="تگ و PLC باید به یک کارخانه تخصیص داده شوند.")
        if not tag_factory_id and plc_factory_id:
            payload["factory_id"] = plc_factory_id
    if collection == "alarms" and payload.get("tag"):
        tag = db.execute(
            "SELECT factory_id FROM resources WHERE collection='tags' AND id=?",
            (payload["tag"],),
        ).fetchone()
        if tag is None or (scope_factory and tag["factory_id"] not in {None, scope_factory}):
            raise HTTPException(status_code=422, detail="تگ انتخاب‌شده برای آلارم در سامانه ثبت نشده است.")
    if collection == "hmiPages":
        if "layout" not in payload:
            raise HTTPException(status_code=422, detail="چیدمان صفحه HMI الزامی است.")
        if payload.get("machine"):
            if scope_factory:
                machine_rows = db.execute(
                    "SELECT payload FROM resources WHERE collection='machines' AND (factory_id=? OR factory_id IS NULL)",
                    (scope_factory,),
                ).fetchall()
            else:
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
            supported = {
                "value", "status", "gauge", "write", "indicator", "needle",
                "thermometer", "chart", "motor", "pump", "fan", "conveyor",
                "tank", "valve",
            }
            required_bindings = {
                "value": {"tag_id"}, "status": {"tag_id"}, "gauge": {"tag_id"},
                "write": {"tag_id"}, "indicator": {"tag_id"}, "needle": {"tag_id"},
                "thermometer": {"tag_id"}, "chart": {"tag_id"},
                "motor": {"run_tag_id"}, "pump": {"run_tag_id"},
                "fan": {"run_tag_id"}, "conveyor": {"run_tag_id"},
                "tank": {"level_tag_id"}, "valve": {"open_tag_id"},
            }
            boolean_bindings = {"run_tag_id", "fault_tag_id", "open_tag_id"}
            numeric_bindings = {"speed_tag_id", "level_tag_id"}
            for index, component in enumerate(layout):
                number_in_layout = index + 1
                if not isinstance(component, dict) or component.get("type") not in supported:
                    raise HTTPException(status_code=422, detail=f"نوع جزء شماره {number_in_layout} پشتیبانی نمی‌شود.")
                component_type = component["type"]
                fields = set(required_bindings[component_type])
                if component_type in {"motor", "pump", "fan", "conveyor", "valve"}:
                    fields.update({"fault_tag_id"})
                if component_type in {"motor", "pump", "fan"}:
                    fields.add("speed_tag_id")
                fields.update(required_bindings[component_type])
                for field in fields:
                    tag_id = component.get(field)
                    if not tag_id:
                        if field in required_bindings[component_type]:
                            raise HTTPException(
                                status_code=422,
                                detail=f"اتصال الزامی {field} برای جزء شماره {number_in_layout} انتخاب نشده است.",
                            )
                        continue
                    tag_row = db.execute(
                        "SELECT payload,factory_id FROM resources WHERE collection='tags' AND id=?",
                        (tag_id,),
                    ).fetchone()
                    if tag_row is None or (scope_factory and tag_row["factory_id"] not in {None, scope_factory}):
                        raise HTTPException(
                            status_code=422,
                            detail=f"تگ اتصال‌یافته به جزء شماره {number_in_layout} پیدا نشد یا متعلق به کارخانه دیگری است.",
                        )
                    tag_payload = json_load(tag_row["payload"], {}) or {}
                    must_be_boolean = field in boolean_bindings or (
                        component_type == "indicator" and field == "tag_id"
                    )
                    must_be_numeric = field in numeric_bindings or (
                        component_type in {"gauge", "needle", "thermometer", "chart"} and field == "tag_id"
                    )
                    if must_be_boolean and tag_payload.get("type") != "bool":
                        raise HTTPException(
                            status_code=422,
                            detail=f"اتصال {field} در جزء شماره {number_in_layout} باید از نوع BOOL باشد.",
                        )
                    if must_be_numeric and tag_payload.get("type") not in {"int16", "uint16", "int32", "uint32", "float32"}:
                        raise HTTPException(
                            status_code=422,
                            detail=f"اتصال {field} در جزء شماره {number_in_layout} باید عددی باشد.",
                        )
                    if component_type == "write" and tag_payload.get("access") != "read_write":
                        raise HTTPException(status_code=422, detail=f"تگ جزء شماره {number_in_layout} فقط خواندنی است.")
                bounds = {}
                for bound in ("min", "max"):
                    if bound in component:
                        bound_value = _finite_number(component[bound])
                        if bound_value is None:
                            raise HTTPException(status_code=422, detail=f"حد {bound} در جزء شماره {number_in_layout} معتبر نیست.")
                        bounds[bound] = bound_value
                if component_type in {"gauge", "needle", "thermometer", "tank"}:
                    lower = bounds.get("min", 0)
                    upper = bounds.get("max", 100)
                    if upper <= lower:
                        raise HTTPException(
                            status_code=422,
                            detail=f"حداقل و حداکثر در جزء شماره {number_in_layout} معتبر نیست.",
                        )
                if component_type == "chart":
                    if component.get("chart_kind", "line") not in {"line", "bar"}:
                        raise HTTPException(status_code=422, detail=f"نوع نمودار جزء شماره {number_in_layout} معتبر نیست.")
                    if "history_seconds" in component:
                        history_seconds = component.get("history_seconds")
                        if type(history_seconds) is not int or history_seconds not in HMI_CHART_RANGE_SECONDS:
                            raise HTTPException(status_code=422, detail=f"بازه زمانی نمودار جزء شماره {number_in_layout} معتبر نیست.")
                    elif component.get("history_hours", 1) not in (1, 6, 24):
                        raise HTTPException(status_code=422, detail=f"بازه تاریخچه نمودار جزء شماره {number_in_layout} معتبر نیست.")
            payload["components"] = len(layout)
    if collection == "machineCalendars":
        machine_name = payload.get("machine")
        if machine_name and not _resource_value_exists(db, "machines", "name", machine_name, scope_factory):
            raise HTTPException(status_code=422, detail="ماشین انتخاب‌شده برای تقویم ثبت نشده است.")
        days = payload.get("days")
        expected_days = {"شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"}
        if not isinstance(days, list) or len(days) != 7:
            raise HTTPException(status_code=422, detail="تقویم باید دقیقاً شامل هفت روز هفته باشد.")
        names = [day.get("day") for day in days if isinstance(day, dict)]
        if len(names) != 7 or set(names) != expected_days:
            raise HTTPException(status_code=422, detail="روزهای تقویم باید هر هفت روز هفته را بدون تکرار شامل شوند.")
        time_pattern = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
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
                "SELECT payload,factory_id FROM resources WHERE collection='tags' AND id=?",
                (payload["weight_tag_id"],),
            ).fetchone()
            if tag_row is None or (scope_factory and tag_row["factory_id"] not in {None, scope_factory}):
                raise HTTPException(status_code=422, detail="تگ لودسل به کارخانه‌ی دیگری تعلق دارد.")
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


def list_records(collection: str, db, limit: int, offset: int,
                 factory_id: str | None, user: dict) -> list[dict]:
    is_org_admin = user["role"] == "Organization Admin"
    selected_factory = factory_id if is_org_admin else user.get("factory_id")
    if collection == "users":
        query = "SELECT id,email,name,role,status,factory_id,created_at,updated_at FROM users"
        params: list[Any] = []
        if not is_org_admin:
            query += " WHERE factory_id=?"
            params.append(selected_factory)
        elif selected_factory:
            query += " WHERE factory_id=?"
            params.append(selected_factory)
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        rows = db.execute(query, params).fetchall()
        return [_public_user(row) for row in rows]
    if collection == "factories":
        if is_org_admin:
            query = "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection='factories'"
            params = []
            if selected_factory:
                query += " AND id=?"
                params.append(selected_factory)
        else:
            query = "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection='factories' AND id=?"
            params = [selected_factory]
    else:
        query = "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=?"
        params = [collection]
        if selected_factory:
            query += " AND (factory_id=? OR factory_id IS NULL)" if is_org_admin else " AND (factory_id=? OR factory_id IS NULL)"
            params.append(selected_factory)
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
    if user["role"] != "Organization Admin" and factory_id and factory_id != user.get("factory_id"):
        raise HTTPException(status_code=403, detail="دسترسی به کارخانه‌ی انتخاب‌شده مجاز نیست.")
    if collection == "users" and user["role"] not in ADMIN_ROLES:
        with connect() as db:
            rows = db.execute(
                "SELECT id,email,name,role,status,factory_id,created_at,updated_at FROM users WHERE id=?",
                (user["id"],),
            ).fetchall()
        return {"items": [_public_user(row) for row in rows], "limit": limit, "offset": 0}
    with connect() as db:
        return {"items": list_records(collection, db, limit, offset, factory_id, user),
                "limit": limit, "offset": offset}


@router.post("/{collection}", status_code=201)
def create_record(collection: str, body: ResourceInput, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    payload = clean_payload(collection, body.model_dump(), creating=True)
    is_org_admin = user["role"] == "Organization Admin"
    if collection == "users":
        if user["role"] not in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="مدیریت کاربران فقط برای مدیر سامانه یا کارخانه مجاز است.")
        target_role = payload.get("role")
        requested_factory = payload.get("factory_id")
        if not is_org_admin:
            if target_role in {"Organization Admin", "Factory Admin"}:
                raise HTTPException(status_code=403, detail="مدیر کارخانه فقط می‌تواند کاربران عادی همان کارخانه را ایجاد کند.")
            if requested_factory and requested_factory != user.get("factory_id"):
                raise HTTPException(status_code=403, detail="ایجاد کاربر برای کارخانه‌ی دیگر مجاز نیست.")
            payload["factory_id"] = user["factory_id"]
        elif target_role == "Organization Admin":
            if requested_factory:
                raise HTTPException(status_code=422, detail="مدیر سازمان نباید به یک کارخانه محدود شود.")
            payload["factory_id"] = None
        else:
            if not requested_factory:
                raise HTTPException(status_code=422, detail="برای کاربر غیرمدیر سازمان، انتخاب کارخانه الزامی است.")
    elif collection == "factories":
        if not is_org_admin:
            raise HTTPException(status_code=403, detail="ایجاد کارخانه فقط برای مدیر سازمان مجاز است.")
    else:
        if user["role"] not in ROLES - {"Operator"}:
            raise HTTPException(status_code=403, detail="نقش کاربری اجازه‌ی ایجاد رکورد ندارد.")
        if collection in {"plcs", "tags"} and user["role"] not in {"Organization Admin", "Factory Admin", "Engineer"}:
            raise HTTPException(status_code=403, detail="تعریف PLC و نگاشت تگ فقط برای مدیر یا مهندس مجاز است.")
        if collection == "plcs" and user["role"] == "Engineer" and (payload.get("allow_writes") or payload.get("safety_confirmed")):
            raise HTTPException(status_code=403, detail="فعال‌سازی نوشتن فیزیکی و تأیید ایمنی فقط برای مدیر کارخانه یا سازمان مجاز است.")
        requested_factory = payload.get("factory_id")
        if not is_org_admin:
            if requested_factory and requested_factory != user.get("factory_id"):
                raise HTTPException(status_code=403, detail="ثبت رکورد برای کارخانه‌ی دیگر مجاز نیست.")
            payload["factory_id"] = user["factory_id"]
    record_id = "r-" + uuid.uuid4().hex[:16]
    now = utc_now()
    temporary_password = None
    with connect() as db:
        if collection == "users":
            target_factory = payload.get("factory_id")
            if target_factory:
                exists = db.execute(
                    "SELECT 1 FROM resources WHERE collection='factories' AND id=?", (target_factory,)
                ).fetchone()
                if not exists:
                    raise HTTPException(status_code=422, detail="کارخانه‌ی انتخاب‌شده در سامانه ثبت نشده است.")
            if not is_org_admin and target_factory != user.get("factory_id"):
                raise HTTPException(status_code=403, detail="تخصیص کاربر به کارخانه‌ی دیگر مجاز نیست.")
            temporary_password = "".join(secrets.choice(string.ascii_letters + string.digits + "!@#") for _ in range(16))
            db.execute(
                """INSERT INTO users(id,email,name,role,status,factory_id,password_hash,must_change_password,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (record_id, payload["email"], payload["name"], payload["role"], payload.get("status", "فعال"),
                 target_factory, hash_password(temporary_password), 1, now, now),
            )
            row = db.execute(
                "SELECT id,email,name,role,status,factory_id,created_at,updated_at FROM users WHERE id=?",
                (record_id,),
            ).fetchone()
            result = _public_user(row)
        else:
            validate_references(collection, payload, db)
            factory_value = payload.pop("factory_id", None)
            db.execute(
                "INSERT INTO resources(collection,id,factory_id,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                (collection, record_id, factory_value, json_dump(payload), now, now),
            )
            result = {"id": record_id, **payload,
                      **({"factory_id": factory_value} if factory_value else {}),
                      "created_at": now, "updated_at": now}
        audit(db, user["id"], "resource.create", collection, record_id,
              {"factory_id": payload.get("factory_id")})
    if temporary_password:
        result["temporary_password"] = temporary_password
    return result


@router.get("/{collection}/{record_id}")
def get_record(collection: str, record_id: str, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    is_org_admin = user["role"] == "Organization Admin"
    if collection == "factories" and not is_org_admin and record_id != user.get("factory_id"):
        raise HTTPException(status_code=404, detail="کارخانه پیدا نشد.")
    if collection == "users" and user["role"] not in ADMIN_ROLES and record_id != user["id"]:
        raise HTTPException(status_code=404, detail="کاربر پیدا نشد.")
    with connect() as db:
        if collection == "users":
            query = "SELECT id,email,name,role,status,factory_id,created_at,updated_at FROM users WHERE id=?"
            params = [record_id]
            if user["role"] == "Factory Admin":
                query += " AND factory_id=?"
                params.append(user.get("factory_id"))
            row = db.execute(query, params).fetchone()
            result = _public_user(row) if row else None
        else:
            row = db.execute(
                "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=? AND id=?",
                (collection, record_id),
            ).fetchone()
            if row and not is_org_admin and row["factory_id"] not in {None, user.get("factory_id")}:
                row = None
            result = ({"id": row["id"], **(json_load(row["payload"], {}) or {}),
                       **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
                       "created_at": row["created_at"], "updated_at": row["updated_at"]} if row else None)
    if result is None:
        raise HTTPException(status_code=404, detail="رکورد پیدا نشد.")
    return result


@router.patch("/{collection}/{record_id}")
def update_record(collection: str, record_id: str, body: ResourceInput,
                  user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    changes = clean_payload(collection, body.model_dump(), creating=False)
    is_org_admin = user["role"] == "Organization Admin"
    if collection == "factories" and not is_org_admin:
        raise HTTPException(status_code=403, detail="ویرایش مشخصات کارخانه فقط برای مدیر سازمان مجاز است.")
    if collection == "users":
        if user["role"] not in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="مدیریت کاربران فقط برای مدیر سامانه یا کارخانه مجاز است.")
        if changes.get("role") == "Organization Admin" and not is_org_admin:
            raise HTTPException(status_code=403, detail="تعیین نقش مدیر سازمان فقط برای مدیر سازمان مجاز است.")
        if changes.get("role") == "Factory Admin" and not is_org_admin:
            raise HTTPException(status_code=403, detail="تعیین نقش مدیر کارخانه فقط برای مدیر سازمان مجاز است.")
    elif user["role"] not in ROLES - {"Operator"}:
        raise HTTPException(status_code=403, detail="نقش کاربری اجازه‌ی ویرایش رکورد ندارد.")
    if collection in {"plcs", "tags"} and user["role"] not in {"Organization Admin", "Factory Admin", "Engineer"}:
        raise HTTPException(status_code=403, detail="ویرایش PLC و نگاشت تگ فقط برای مدیر یا مهندس مجاز است.")
    if collection == "plcs" and user["role"] == "Engineer" and (changes.get("allow_writes") is True or changes.get("safety_confirmed") is True):
        raise HTTPException(status_code=403, detail="فعال‌سازی نوشتن فیزیکی و تأیید ایمنی فقط برای مدیر کارخانه یا سازمان مجاز است.")
    now = utc_now()
    with connect() as db:
        if collection == "users":
            row = db.execute("SELECT * FROM users WHERE id=?", (record_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="کاربر پیدا نشد.")
            if not is_org_admin and row["factory_id"] != user.get("factory_id"):
                raise HTTPException(status_code=404, detail="کاربر پیدا نشد.")
            allowed = {key: value for key, value in changes.items()
                       if key in {"email", "name", "role", "status", "factory_id"}}
            merged = {
                "email": row["email"], "name": row["name"], "role": row["role"],
                "status": row["status"], "factory_id": row["factory_id"], **allowed
            }
            if not is_org_admin and merged["factory_id"] != user.get("factory_id"):
                raise HTTPException(status_code=403, detail="تغییر تخصیص کارخانه‌ی کاربر مجاز نیست.")
            if merged["role"] == "Organization Admin":
                if merged["factory_id"]:
                    raise HTTPException(status_code=422, detail="مدیر سازمان نباید به یک کارخانه محدود شود.")
            else:
                factory = db.execute(
                    "SELECT 1 FROM resources WHERE collection='factories' AND id=?", (merged["factory_id"],)
                ).fetchone()
                if not factory:
                    raise HTTPException(status_code=422, detail="کاربر غیرمدیر سازمان باید به یک کارخانه‌ی معتبر تخصیص داده شود.")
            db.execute(
                "UPDATE users SET email=?,name=?,role=?,status=?,factory_id=?,updated_at=? WHERE id=?",
                (merged["email"], merged["name"], merged["role"], merged["status"],
                 merged["factory_id"], now, record_id),
            )
            result = {"id": record_id, **merged, "updated_at": now}
        else:
            row = db.execute(
                "SELECT * FROM resources WHERE collection=? AND id=?", (collection, record_id)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="رکورد پیدا نشد.")
            if not is_org_admin and row["factory_id"] != user.get("factory_id"):
                raise HTTPException(status_code=404, detail="رکورد پیدا نشد یا در کارخانه‌ی دیگری قرار دارد.")
            merged = {
                **(json_load(row["payload"], {}) or {}),
                **({"factory_id": row["factory_id"]} if row["factory_id"] else {}),
                **changes,
            }
            requested_factory = merged.get("factory_id", row["factory_id"])
            if not is_org_admin and requested_factory != user.get("factory_id"):
                raise HTTPException(status_code=403, detail="انتقال رکورد به کارخانه‌ی دیگر مجاز نیست.")
            validate_references(collection, merged, db)
            factory_value = merged.pop("factory_id", row["factory_id"])
            db.execute(
                "UPDATE resources SET factory_id=?,payload=?,updated_at=? WHERE collection=? AND id=?",
                (factory_value, json_dump(merged), now, collection, record_id),
            )
            result = {"id": record_id, **merged,
                      **({"factory_id": factory_value} if factory_value else {}),
                      "updated_at": now}
        audit(db, user["id"], "resource.update", collection, record_id,
              {"fields": list(changes)})
    return result


@router.delete("/{collection}/{record_id}", status_code=204)
def delete_record(collection: str, record_id: str, user: dict = Depends(get_current_user)):
    if collection not in COLLECTIONS and collection != "users":
        raise HTTPException(status_code=404, detail="مجموعه‌ی درخواستی تعریف نشده است.")
    is_org_admin = user["role"] == "Organization Admin"
    if not is_org_admin and user["role"] != "Factory Admin":
        raise HTTPException(status_code=403, detail="حذف رکورد فقط برای مدیر سامانه یا کارخانه مجاز است.")
    with connect() as db:
        if collection == "users":
            if record_id == user["id"]:
                raise HTTPException(status_code=409, detail="حذف حساب کاربری جاری مجاز نیست.")
            row = db.execute("SELECT factory_id FROM users WHERE id=?", (record_id,)).fetchone()
            if not row or (not is_org_admin and row["factory_id"] != user.get("factory_id")):
                raise HTTPException(status_code=404, detail="کاربر پیدا نشد.")
            cursor = db.execute("DELETE FROM users WHERE id=?", (record_id,))
        elif collection == "factories":
            if not is_org_admin:
                raise HTTPException(status_code=403, detail="حذف کارخانه فقط برای مدیر سازمان مجاز است.")
            cursor = db.execute("DELETE FROM resources WHERE collection=? AND id=?", (collection, record_id))
        else:
            row = db.execute(
                "SELECT factory_id FROM resources WHERE collection=? AND id=?", (collection, record_id)
            ).fetchone()
            if not row or (not is_org_admin and row["factory_id"] != user.get("factory_id")):
                raise HTTPException(status_code=404, detail="رکورد پیدا نشد.")
            cursor = db.execute("DELETE FROM resources WHERE collection=? AND id=?", (collection, record_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="رکورد پیدا نشد.")
        audit(db, user["id"], "resource.delete", collection, record_id)
