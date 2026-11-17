from __future__ import annotations

import importlib
import math
import re
import struct
from contextlib import AbstractContextManager
from typing import Any


class PLCDriverError(RuntimeError):
    """A protocol, connection, address, or device-level PLC error."""


_MODBUS_AREAS = {
    "coil": "coil", "coils": "coil", "0": "coil",
    "discrete": "discrete_input", "discrete_input": "discrete_input",
    "input": "input_register", "input_register": "input_register", "ir": "input_register",
    "holding": "holding_register", "holding_register": "holding_register", "hr": "holding_register",
}
_REFERENCE_BASES = {
    "coil": 1,
    "discrete_input": 10001,
    "input_register": 30001,
    "holding_register": 40001,
}


def _as_int(value: Any, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _finite(value: Any, default: float) -> float:
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def _parse_host_port(address: str, default_port: int) -> tuple[str, int]:
    value = str(address or "").strip()
    if not value:
        raise PLCDriverError("آدرس PLC خالی است.")
    if "://" in value:
        from urllib.parse import urlsplit
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        port = parsed.port or default_port
    elif value.startswith("[") and "]" in value:
        host, _, suffix = value[1:].partition("]")
        port = int(suffix[1:]) if suffix.startswith(":") else default_port
    elif value.count(":") == 1:
        host, raw_port = value.rsplit(":", 1)
        port = int(raw_port)
    else:
        host, port = value, default_port
    if not host or not 1 <= int(port) <= 65535:
        raise PLCDriverError("آدرس یا شماره پورت PLC معتبر نیست.")
    return host, int(port)


def parse_modbus_address(tag: dict[str, Any], plc: dict[str, Any] | None = None) -> tuple[str, int]:
    """Return (area, zero-based PDU offset).

    Five-digit Modbus reference notation is accepted:
    00001=coil, 10001=discrete input, 30001=input register, 40001=holding register.
    Otherwise an explicit address_area/area and address_base (0 or 1) may be used.
    """
    plc = plc or {}
    raw = str(tag.get("address", "")).strip().upper()
    if not re.fullmatch(r"\d{1,6}", raw):
        match = re.fullmatch(r"(COIL|DI|IR|HR)\s*:\s*(\d+)", raw)
        if not match:
            raise PLCDriverError(f"آدرس Modbus نامعتبر است: {raw}")
        alias = {"COIL": "coil", "DI": "discrete_input",
                 "IR": "input_register", "HR": "holding_register"}
        area = alias[match.group(1)]
        address = int(match.group(2))
        base = _as_int(tag.get("address_base", plc.get("address_base", 0)), 0)
        offset = address - base
    else:
        address = int(raw)
        explicit = str(tag.get("address_area") or tag.get("area") or "").strip().lower()
        if explicit == "auto":
            explicit = ""
        area = _MODBUS_AREAS.get(explicit)
        if explicit and area is None:
            raise PLCDriverError(f"ناحیه Modbus ناشناخته است: {explicit}")
        if area is None and len(raw) >= 5:
            first = raw[0]
            if first == "0":
                area = "coil"
            elif first == "1":
                area = "discrete_input"
            elif first == "3":
                area = "input_register"
            elif first == "4":
                area = "holding_register"
        if area is not None and len(raw) >= 5:
            detected_area = {"0": "coil", "1": "discrete_input",
                             "3": "input_register", "4": "holding_register"}.get(raw[0])
            if detected_area and explicit and detected_area != area:
                raise PLCDriverError("ناحیه انتخاب‌شده با پیشوند آدرس مرجع Modbus سازگار نیست.")
            reference_base = _REFERENCE_BASES[area]
            if address >= reference_base and address < reference_base + 10000:
                offset = address - reference_base
            elif area == "coil" and raw.startswith("0"):
                offset = address - 1
            else:
                base = _as_int(tag.get("address_base", plc.get("address_base", 0)), 0)
                offset = address - base
        else:
            if area is None:
                area = "holding_register"
            base = _as_int(tag.get("address_base", plc.get("address_base", 0)), 0)
            offset = address - base
    if area not in _REFERENCE_BASES or not 0 <= offset <= 65535:
        raise PLCDriverError("ناحیه یا شماره آدرس Modbus خارج از محدوده است.")
    return area, offset


def _ordered_register_bytes(registers: list[int], byte_order: str = "big",
                            word_order: str = "big") -> bytes:
    chunks = [int(value).to_bytes(2, "big", signed=False) for value in registers]
    if byte_order.lower() == "little":
        chunks = [chunk[::-1] for chunk in chunks]
    if word_order.lower() == "little":
        chunks.reverse()
    return b"".join(chunks)


def _registers_from_bytes(data: bytes, byte_order: str = "big",
                          word_order: str = "big") -> list[int]:
    raw = data + (b"\x00" if len(data) % 2 else b"")
    chunks = [raw[index:index + 2] for index in range(0, len(raw), 2)]
    if word_order.lower() == "little":
        chunks.reverse()
    if byte_order.lower() == "little":
        chunks = [chunk[::-1] for chunk in chunks]
    return [int.from_bytes(chunk, "big") for chunk in chunks]


def decode_modbus_registers(registers: list[int], kind: str,
                            byte_order: str = "big", word_order: str = "big",
                            length: int | None = None) -> Any:
    kind = str(kind).lower()
    data = _ordered_register_bytes(registers, byte_order, word_order)
    formats = {
        "int16": (">h", 2), "uint16": (">H", 2),
        "int32": (">i", 4), "uint32": (">I", 4), "float32": (">f", 4),
    }
    if kind == "bool":
        return bool(registers[0])
    if kind == "string":
        limit = int(length or len(data))
        return data[:limit].split(b"\x00", 1)[0].decode("utf-8", errors="replace")
    fmt = formats.get(kind)
    if not fmt:
        raise PLCDriverError(f"نوع داده Modbus پشتیبانی نمی‌شود: {kind}")
    if len(data) < fmt[1]:
        raise PLCDriverError("تعداد رجیسترهای خوانده‌شده برای نوع داده کافی نیست.")
    value = struct.unpack(fmt[0], data[:fmt[1]])[0]
    if isinstance(value, float) and not math.isfinite(value):
        raise PLCDriverError("PLC مقدار NaN یا بی‌نهایت برگردانده است.")
    return value


def encode_modbus_registers(value: Any, kind: str, byte_order: str = "big",
                            word_order: str = "big", length: int | None = None) -> list[int]:
    kind = str(kind).lower()
    formats = {
        "int16": (">h", 2), "uint16": (">H", 2),
        "int32": (">i", 4), "uint32": (">I", 4), "float32": (">f", 4),
    }
    if kind == "bool":
        if type(value) is not bool:
            raise PLCDriverError("مقدار BOOL باید true یا false باشد.")
        return [1 if value else 0]
    if kind == "string":
        if not isinstance(value, str):
            raise PLCDriverError("مقدار STRING باید متن باشد.")
        size = int(length or max(1, (len(value.encode("utf-8")) + 1) // 2))
        if not 1 <= size <= 120:
            raise PLCDriverError("طول STRING باید بین ۱ تا ۱۲۰ رجیستر باشد.")
        data = value.encode("utf-8")[:size * 2].ljust(size * 2, b"\x00")
        return _registers_from_bytes(data, byte_order, word_order)
    fmt = formats.get(kind)
    if not fmt:
        raise PLCDriverError(f"نوع داده Modbus پشتیبانی نمی‌شود: {kind}")
    if kind == "float32":
        number = _finite(value, float("nan"))
        if not math.isfinite(number):
            raise PLCDriverError("مقدار REAL باید عدد محدود باشد.")
        value = number
    else:
        if isinstance(value, bool) or not isinstance(value, int):
            raise PLCDriverError("مقدار تگ صحیح باید عدد صحیح باشد.")
    try:
        data = struct.pack(fmt[0], value)
    except (struct.error, OverflowError) as exc:
        raise PLCDriverError("مقدار خارج از محدوده نوع داده است.") from exc
    return _registers_from_bytes(data, byte_order, word_order)


def parse_s7_address(address: str, kind: str, length: int | None = None) -> dict[str, Any]:
    """Parse S7 address strings such as DB5.DBD4, DB7.DBW2, DB5.DBX0.1, M10.0, MW10, I0.0."""
    value = str(address or "").strip().upper().replace(" ", "")
    db_match = re.fullmatch(r"DB(?P<db>\d+)\.DB(?P<width>[XBW D])(?P<offset>\d+)(?:\.(?P<bit>\d+))?", value)
    if db_match:
        item = db_match.groupdict()
        area = "DB"
        db_number = int(item["db"])
        width = item["width"].replace(" ", "")
        offset = int(item["offset"])
        bit = int(item["bit"]) if item["bit"] is not None else None
    else:
        match = re.fullmatch(r"(?P<area>[MIQ])(?:(?P<width>[XBW D]))?(?P<offset>\d+)(?:\.(?P<bit>\d+))?", value)
        if not match:
            raise PLCDriverError(f"آدرس S7 نامعتبر است: {value}")
        item = match.groupdict()
        area = item["area"]
        width = (item["width"] or ("X" if item["bit"] is not None else "")).replace(" ", "")
        db_number = 0
        offset = int(item["offset"])
        bit = int(item["bit"]) if item["bit"] is not None else None

    if bit is not None and not 0 <= bit <= 7:
        raise PLCDriverError("شماره بیت S7 باید بین صفر تا هفت باشد.")
    if width == "X" and bit is None:
        raise PLCDriverError("آدرس بیت S7 باید مانند M10.0 یا DB5.DBX0.0 نوشته شود.")
    sizes = {"X": 1, "B": 1, "W": 2, "D": 4, "": {"bool": 1, "int16": 2, "uint16": 2,
             "int32": 4, "uint32": 4, "float32": 4, "string": int(length or 1)}.get(kind, 0)}
    size = sizes.get(width, 0)
    if kind == "string" and length is not None:
        size = int(length)
    if not size or (kind == "string" and not 1 <= size <= 1024) or offset < 0 or offset > 65535 or db_number > 65535:
        raise PLCDriverError("نوع آدرس یا محدوده حافظه S7 معتبر نیست.")
    if kind == "bool" and bit is None:
        raise PLCDriverError("برای تگ BOOL در S7 باید آدرس بیت مشخص شود.")
    if kind != "bool" and bit is not None:
        raise PLCDriverError("آدرس بیت فقط برای تگ BOOL مجاز است.")
    expected = {"int16": 2, "uint16": 2, "int32": 4, "uint32": 4, "float32": 4}
    if kind in expected and size != expected[kind]:
        raise PLCDriverError(f"عرض آدرس با نوع داده {kind} سازگار نیست.")
    if width == "X" and kind != "bool":
        raise PLCDriverError("آدرس X فقط برای نوع BOOL مجاز است.")
    return {"area": area, "db_number": db_number, "offset": offset, "bit": bit, "size": size, "width": width}


def _engineering_value(raw: Any, tag: dict[str, Any]) -> Any:
    if isinstance(raw, bool) or isinstance(raw, str):
        return raw
    scale = _finite(tag.get("scale", 1), 1)
    offset = _finite(tag.get("offset", 0), 0)
    if scale == 0:
        raise PLCDriverError("ضریب Scale نمی‌تواند صفر باشد.")
    value = float(raw) * scale + offset
    if not math.isfinite(value):
        raise PLCDriverError("مقدار مقیاس‌شده معتبر نیست.")
    return value if isinstance(raw, float) or scale != 1 or offset != 0 else int(value)


def _raw_value(value: Any, tag: dict[str, Any]) -> Any:
    if isinstance(value, bool) or isinstance(value, str):
        return value
    scale = _finite(tag.get("scale", 1), 1)
    offset = _finite(tag.get("offset", 0), 0)
    if scale == 0:
        raise PLCDriverError("ضریب Scale نمی‌تواند صفر باشد.")
    raw = (float(value) - offset) / scale
    if not math.isfinite(raw):
        raise PLCDriverError("مقدار خام محاسبه‌شده معتبر نیست.")
    if str(tag.get("type")) in {"int16", "uint16", "int32", "uint32"}:
        if not raw.is_integer():
            raise PLCDriverError("مقدار پس از اعمال Scale باید عدد صحیح باشد.")
        return int(raw)
    return raw


def _check_response(response: Any) -> None:
    if response is None:
        raise PLCDriverError("PLC پاسخ معتبر ارسال نکرد.")
    is_error = getattr(response, "isError", None)
    if callable(is_error) and is_error():
        raise PLCDriverError(f"خطای Modbus: {response}")


class ModbusSession(AbstractContextManager):
    def __init__(self, plc: dict[str, Any]):
        self.plc = plc
        self.client = None
        self.unit_id = _as_int(plc.get("unit", plc.get("unit_id", 1)), 1)
        if not 0 <= self.unit_id <= 255:
            raise PLCDriverError("Unit ID باید بین صفر تا ۲۵۵ باشد.")

    def __enter__(self):
        protocol = self.plc.get("protocol")
        try:
            modbus = importlib.import_module("pymodbus.client")
            timeout = max(0.2, min(_finite(self.plc.get("timeout"), 2.0), 15.0))
            if protocol == "modbus-tcp":
                host, port = _parse_host_port(self.plc.get("address", ""), 502)
                self.client = modbus.ModbusTcpClient(host, port=port, timeout=timeout)
            elif protocol == "modbus-rtu":
                self.client = modbus.ModbusSerialClient(
                    port=str(self.plc.get("address", "")).strip(),
                    baudrate=_as_int(self.plc.get("baudrate"), 9600),
                    bytesize=_as_int(self.plc.get("bytesize"), 8),
                    parity=str(self.plc.get("parity", "N")).upper(),
                    stopbits=_as_int(self.plc.get("stopbits"), 1),
                    timeout=timeout,
                )
            else:
                raise PLCDriverError("پروتکل Modbus پشتیبانی نمی‌شود.")
            if not self.client.connect():
                raise PLCDriverError("اتصال Modbus برقرار نشد؛ IP، پورت، Unit ID و شبکه را بررسی کنید.")
            return self
        except PLCDriverError:
            self.close()
            raise
        except Exception as exc:
            self.close()
            raise PLCDriverError(f"خطای راه‌اندازی Modbus: {exc}") from exc

    def close(self):
        if self.client is not None:
            try:
                self.client.close()
            finally:
                self.client = None

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def _call(self, method_name: str, **kwargs):
        method = getattr(self.client, method_name, None)
        if method is None:
            raise PLCDriverError(f"تابع {method_name} در کتابخانه Modbus وجود ندارد.")
        try:
            import inspect
            parameters = inspect.signature(method).parameters
            unit_key = "device_id" if "device_id" in parameters else "slave"
        except (TypeError, ValueError):
            unit_key = "device_id"
        kwargs[unit_key] = self.unit_id
        try:
            return method(**kwargs)
        except TypeError as exc:
            # Compatibility with PyModbus versions whose keyword is named slave.
            alternate = "slave" if unit_key == "device_id" else "device_id"
            kwargs.pop(unit_key, None)
            kwargs[alternate] = self.unit_id
            try:
                return method(**kwargs)
            except TypeError:
                raise exc

    def read(self, tag: dict[str, Any]) -> Any:
        area, offset = parse_modbus_address(tag, self.plc)
        kind = str(tag.get("type", "")).lower()
        if area in {"coil", "discrete_input"}:
            if kind != "bool":
                raise PLCDriverError("Coil و Discrete Input فقط برای تگ BOOL قابل استفاده هستند.")
            method = "read_coils" if area == "coil" else "read_discrete_inputs"
            response = self._call(method, address=offset, count=1)
            _check_response(response)
            bits = getattr(response, "bits", None)
            if not bits:
                raise PLCDriverError("پاسخ Modbus فاقد مقدار Bit است.")
            raw = bool(bits[0])
        else:
            length = int(tag.get("length") or (1 if kind in {"bool", "int16", "uint16"} else 2 if kind in {"int32", "uint32", "float32"} else 8))
            if kind == "bool" and tag.get("bit") is not None:
                length = 1
            if not 1 <= length <= 120:
                raise PLCDriverError("تعداد رجیستر برای خواندن معتبر نیست.")
            method = "read_input_registers" if area == "input_register" else "read_holding_registers"
            response = self._call(method, address=offset, count=length)
            _check_response(response)
            registers = getattr(response, "registers", None)
            if registers is None:
                raise PLCDriverError("پاسخ Modbus فاقد رجیستر است.")
            if kind == "bool" and tag.get("bit") is not None:
                bit = _as_int(tag.get("bit"), -1)
                if not 0 <= bit <= 15:
                    raise PLCDriverError("شماره بیت رجیستر باید بین صفر تا پانزده باشد.")
                raw = bool(int(registers[0]) & (1 << bit))
            else:
                raw = decode_modbus_registers(
                    list(registers), kind, str(tag.get("byte_order", "big")),
                    str(tag.get("word_order", "big")),
                    int(tag["length"]) * 2 if kind == "string" and tag.get("length") else None,
                )
        return _engineering_value(raw, tag)

    def write(self, tag: dict[str, Any], value: Any) -> None:
        area, offset = parse_modbus_address(tag, self.plc)
        kind = str(tag.get("type", "")).lower()
        raw = _raw_value(value, tag)
        if kind == "bool" and area == "coil":
            response = self._call("write_coil", address=offset, value=bool(raw))
        elif area == "coil":
            raise PLCDriverError("ناحیه Coil فقط برای تگ BOOL قابل نوشتن است.")
        elif area in {"discrete_input", "input_register"}:
            raise PLCDriverError("ناحیه ورودی Modbus فقط خواندنی است.")
        elif kind == "bool" and tag.get("bit") is not None:
            bit = _as_int(tag.get("bit"), -1)
            if not 0 <= bit <= 15:
                raise PLCDriverError("شماره بیت رجیستر باید بین صفر تا پانزده باشد.")
            current = self._call("read_holding_registers", address=offset, count=1)
            _check_response(current)
            word = int(current.registers[0])
            mask = 1 << bit
            word = (word | mask) if raw else (word & ~mask)
            response = self._call("write_register", address=offset, value=word)
        else:
            length = int(tag.get("length") or (8 if kind == "string" else 1 if kind in {"int16", "uint16"} else 2))
            registers = encode_modbus_registers(
                raw, kind, str(tag.get("byte_order", "big")),
                str(tag.get("word_order", "big")), length,
            )
            if len(registers) == 1:
                response = self._call("write_register", address=offset, value=registers[0])
            else:
                response = self._call("write_registers", address=offset, values=registers)
        _check_response(response)


class S7Session(AbstractContextManager):
    def __init__(self, plc: dict[str, Any]):
        self.plc = plc
        self.client = None
        self.area_enum = None

    def __enter__(self):
        try:
            package = importlib.import_module("s7")
            type_module = importlib.import_module("s7.type")
            client_class = getattr(package, "Client")
            self.area_enum = getattr(type_module, "Area")
            host, port = _parse_host_port(self.plc.get("address", ""), 102)
            self.client = client_class()
            connected = self.client.connect(
                host,
                _as_int(self.plc.get("rack"), 0),
                _as_int(self.plc.get("slot"), 1),
                tcp_port=port,
            )
            if connected is False:
                raise PLCDriverError("ارتباط S7 برقرار نشد؛ IP، Rack، Slot و تنظیمات PUT/GET را بررسی کنید.")
            return self
        except PLCDriverError:
            self.close()
            raise
        except Exception as exc:
            self.close()
            raise PLCDriverError(f"خطای راه‌اندازی Siemens S7: {exc}") from exc

    def close(self):
        if self.client is not None:
            try:
                self.client.disconnect()
            except Exception:
                pass
            self.client = None

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def _read_bytes(self, location: dict[str, Any]) -> bytes:
        area, db_number, offset, size = (
            location["area"], location["db_number"], location["offset"], location["size"]
        )
        if area == "DB":
            data = self.client.db_read(db_number, offset, size)
        elif area == "M":
            data = self.client.mb_read(offset, size)
        elif area in {"I", "Q"}:
            memory_area = self.area_enum.PE if area == "I" else self.area_enum.PA
            data = self.client.read_area(memory_area, 0, offset, size)
        else:
            raise PLCDriverError("ناحیه حافظه S7 پشتیبانی نمی‌شود.")
        return bytes(data)

    def _write_bytes(self, location: dict[str, Any], data: bytes) -> None:
        area, db_number, offset = location["area"], location["db_number"], location["offset"]
        payload = bytearray(data)
        if area == "DB":
            self.client.db_write(db_number, offset, payload)
        elif area == "M":
            self.client.mb_write(offset, len(payload), payload)
        elif area == "Q":
            self.client.write_area(self.area_enum.PA, 0, offset, payload)
        else:
            raise PLCDriverError("نوشتن در ناحیه ورودی I مجاز نیست.")

    def read(self, tag: dict[str, Any]) -> Any:
        kind = str(tag.get("type", "")).lower()
        location = parse_s7_address(tag.get("address", ""), kind, tag.get("length"))
        if kind == "string" and str(tag.get("string_format", "raw")).lower() == "s7":
            if location["area"] != "DB" or not tag.get("length"):
                raise PLCDriverError("برای S7 STRING باید آدرس DB و حداکثر طول تعریف شود.")
            maximum = int(tag["length"])
            if not 1 <= maximum <= 254:
                raise PLCDriverError("حداکثر طول Siemens STRING باید بین ۱ تا ۲۵۴ باشد.")
            location["size"] = maximum + 2
        data = self._read_bytes(location)
        if kind == "bool":
            raw = bool(data[0] & (1 << int(location["bit"])))
        elif kind == "string":
            if str(tag.get("string_format", "raw")).lower() == "s7":
                if len(data) < 2:
                    raise PLCDriverError("داده دریافتی برای هدر Siemens STRING کافی نیست.")
                maximum, current = data[0], data[1]
                if maximum != int(tag["length"]):
                    raise PLCDriverError("طول تعریف‌شده در تگ با MaxLength داخل Siemens STRING برابر نیست.")
                if current > maximum or current > len(data) - 2:
                    raise PLCDriverError("هدر STRING در PLC معتبر نیست.")
                raw = data[2:2 + current].decode("latin-1")
            else:
                raw = data.split(b"\x00", 1)[0].decode("utf-8", errors="replace")
        else:
            formats = {"int16": ">h", "uint16": ">H", "int32": ">i", "uint32": ">I", "float32": ">f"}
            fmt = formats.get(kind)
            if not fmt:
                raise PLCDriverError(f"نوع داده S7 پشتیبانی نمی‌شود: {kind}")
            raw = struct.unpack(fmt, data[:location["size"]])[0]
        return _engineering_value(raw, tag)

    def write(self, tag: dict[str, Any], value: Any) -> None:
        kind = str(tag.get("type", "")).lower()
        location = parse_s7_address(tag.get("address", ""), kind, tag.get("length"))
        if kind == "string" and str(tag.get("string_format", "raw")).lower() == "s7":
            if location["area"] != "DB" or not tag.get("length"):
                raise PLCDriverError("برای S7 STRING باید آدرس DB و حداکثر طول تعریف شود.")
            maximum = int(tag["length"])
            if not 1 <= maximum <= 254:
                raise PLCDriverError("حداکثر طول Siemens STRING باید بین ۱ تا ۲۵۴ باشد.")
            location["size"] = maximum + 2
        if location["area"] == "I":
            raise PLCDriverError("نوشتن در ناحیه ورودی I در PLC مجاز نیست.")
        raw = _raw_value(value, tag)
        if kind == "bool":
            current = bytearray(self._read_bytes(location))
            mask = 1 << int(location["bit"])
            current[0] = (current[0] | mask) if raw else (current[0] & ~mask)
            data = bytes(current)
        elif kind == "string":
            if not isinstance(raw, str):
                raise PLCDriverError("مقدار STRING باید متن باشد.")
            size = int(tag.get("length") or location["size"])
            if str(tag.get("string_format", "raw")).lower() == "s7":
                header = self._read_bytes(location)
                if len(header) < 2 or header[0] != size:
                    raise PLCDriverError("MaxLength داخل DB با طول تنظیم‌شده در تگ مطابقت ندارد؛ نوشتن متوقف شد.")
                try:
                    encoded = raw.encode("latin-1")
                except UnicodeEncodeError as exc:
                    raise PLCDriverError("Siemens STRING کلاسیک فقط نویسه‌های Latin-1 را می‌پذیرد.") from exc
                if len(encoded) > size:
                    raise PLCDriverError("متن از حداکثر طول تعریف‌شده Siemens STRING بلندتر است.")
                data = bytes([size, len(encoded)]) + encoded.ljust(size, b"\x00")
            else:
                if not 1 <= size <= 1024:
                    raise PLCDriverError("طول STRING باید بین ۱ تا ۱۰۲۴ بایت باشد.")
                data = raw.encode("utf-8")[:size].ljust(size, b"\x00")
        else:
            formats = {"int16": ">h", "uint16": ">H", "int32": ">i", "uint32": ">I", "float32": ">f"}
            try:
                data = struct.pack(formats[kind], raw)
            except (KeyError, struct.error, OverflowError) as exc:
                raise PLCDriverError("مقدار خارج از محدوده نوع داده S7 است.") from exc
        self._write_bytes(location, data)


def _session(plc: dict[str, Any]):
    protocol = str(plc.get("protocol", "")).lower()
    if protocol in {"modbus-tcp", "modbus-rtu"}:
        return ModbusSession(plc)
    if protocol == "s7":
        return S7Session(plc)
    if protocol == "simulator":
        raise PLCDriverError("PLC شبیه‌ساز به درایور سخت‌افزاری متصل نمی‌شود.")
    raise PLCDriverError(f"پروتکل PLC پشتیبانی نمی‌شود: {protocol}")


def test_plc_connection(plc: dict[str, Any]) -> dict[str, Any]:
    with _session(plc):
        return {"connected": True, "protocol": plc.get("protocol")}


def read_plc_tags(plc: dict[str, Any], tags: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    with _session(plc) as session:
        for tag in tags:
            try:
                results[tag["id"]] = {"ok": True, "value": session.read(tag)}
            except Exception as exc:
                results[tag["id"]] = {"ok": False, "error": str(exc)}
    return results


def write_plc_tag(plc: dict[str, Any], tag: dict[str, Any], value: Any) -> None:
    with _session(plc) as session:
        session.write(tag, value)
        verified = session.read(tag)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isclose(float(verified), float(value), rel_tol=0.001, abs_tol=0.001):
            raise PLCDriverError(f"مقدار نوشته‌شده با مقدار خوانده‌شده برابر نیست: {verified}")
    elif verified != value:
        raise PLCDriverError(f"تأیید بازخوانی نوشتن ناموفق بود: {verified}")
