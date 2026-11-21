import math
import struct
import sys
import types

import pytest

from app.plc_drivers import (
    PLCDriverError,
    decode_modbus_registers,
    encode_modbus_registers,
    parse_modbus_address,
    parse_s7_address,
    S7Session,
    write_plc_tag,
)


@pytest.mark.parametrize(
    ("address", "expected"),
    [
        ("00001", ("coil", 0)),
        ("00014", ("coil", 13)),
        ("10001", ("discrete_input", 0)),
        ("30001", ("input_register", 0)),
        ("40045", ("holding_register", 44)),
    ],
)
def test_modbus_reference_addresses_are_one_based(address, expected):
    assert parse_modbus_address({"address": address}) == expected


def test_modbus_explicit_zero_based_address_and_area():
    tag = {"address": "45", "address_area": "holding_register", "address_base": 0}
    assert parse_modbus_address(tag) == ("holding_register", 45)
    tag["address_base"] = 1
    assert parse_modbus_address(tag) == ("holding_register", 44)
    assert parse_modbus_address({"address": "40045", "address_area": "auto"}) == ("holding_register", 44)
    with pytest.raises(PLCDriverError):
        parse_modbus_address({"address": "40045", "address_area": "coil"})


def test_modbus_rejects_unknown_or_out_of_range_address():
    with pytest.raises(PLCDriverError):
        parse_modbus_address({"address": "not-an-address"})
    with pytest.raises(PLCDriverError):
        parse_modbus_address({"address": "70000", "address_area": "holding_register"})


@pytest.mark.parametrize(
    ("kind", "value"),
    [
        ("int16", -1234),
        ("uint16", 65000),
        ("int32", -12345678),
        ("uint32", 4000000000),
        ("float32", 123.625),
    ],
)
def test_modbus_register_numeric_round_trip(kind, value):
    registers = encode_modbus_registers(value, kind)
    actual = decode_modbus_registers(registers, kind)
    if kind == "float32":
        assert math.isclose(actual, value, rel_tol=1e-6)
    else:
        assert actual == value


def test_modbus_float_word_order_round_trip():
    value = 178.125
    registers = encode_modbus_registers(value, "float32", word_order="little")
    actual = decode_modbus_registers(registers, "float32", word_order="little")
    assert math.isclose(actual, value, rel_tol=1e-6)


def test_modbus_boolean_and_string_round_trip():
    assert decode_modbus_registers([1], "bool") is True
    registers = encode_modbus_registers("PLC", "string", length=2)
    assert len(registers) == 2
    assert decode_modbus_registers(registers, "string", length=4) == "PLC"


def test_modbus_rejects_non_finite_and_out_of_range_values():
    with pytest.raises(PLCDriverError):
        encode_modbus_registers(float("nan"), "float32")
    with pytest.raises(PLCDriverError):
        encode_modbus_registers(40000, "int16")


@pytest.mark.parametrize(
    ("address", "kind", "expected"),
    [
        ("DB5.DBD4", "float32", {"area": "DB", "db_number": 5, "offset": 4, "size": 4}),
        ("DB7.DBW2", "int16", {"area": "DB", "db_number": 7, "offset": 2, "size": 2}),
        ("DB5.DBX0.1", "bool", {"area": "DB", "db_number": 5, "offset": 0, "bit": 1}),
        ("M10.0", "bool", {"area": "M", "db_number": 0, "offset": 10, "bit": 0}),
        ("MW10", "int16", {"area": "M", "db_number": 0, "offset": 10, "size": 2}),
        ("I0.0", "bool", {"area": "I", "db_number": 0, "offset": 0, "bit": 0}),
        ("Q0.0", "bool", {"area": "Q", "db_number": 0, "offset": 0, "bit": 0}),
    ],
)
def test_s7_address_parser(address, kind, expected):
    parsed = parse_s7_address(address, kind)
    for key, value in expected.items():
        assert parsed[key] == value


def test_s7_string_uses_configured_byte_length():
    parsed = parse_s7_address("DB5.DBB0", "string", length=32)
    assert parsed["size"] == 32


def test_s7_rejects_bad_bit_and_type_width():
    with pytest.raises(PLCDriverError):
        parse_s7_address("M10.8", "bool")
    with pytest.raises(PLCDriverError):
        parse_s7_address("DB5.DBD4", "int16")



def test_s7_native_string_header_read_and_write_round_trip():
    class MemoryPLC:
        def __init__(self):
            self.memory = bytearray([20, 3]) + bytearray(b"ABC") + bytearray(17)

        def db_read(self, db_number, start, size):
            assert db_number == 5
            return self.memory[start:start + size]

        def db_write(self, db_number, start, data):
            assert db_number == 5
            self.memory[start:start + len(data)] = data

    session = object.__new__(S7Session)
    session.client = MemoryPLC()
    tag = {
        "address": "DB5.DBB0",
        "type": "string",
        "length": 20,
        "string_format": "s7",
    }
    assert session.read(tag) == "ABC"
    session.write(tag, "READY")
    assert session.read(tag) == "READY"
    assert session.client.memory[0] == 20
    assert session.client.memory[1] == 5



def test_modbus_session_read_and_scaled_write_with_fake_client(monkeypatch):
    class Response:
        def __init__(self, registers=None):
            self.registers = registers or []

        def isError(self):
            return False

    class FakeClient:
        def __init__(self, host, port=502, timeout=2):
            self.registers = {0: 10}
            self.closed = False

        def connect(self):
            return True

        def close(self):
            self.closed = True

        def read_holding_registers(self, address, count=1, device_id=1):
            return Response([self.registers.get(address + index, 0) for index in range(count)])

        def write_register(self, address, value, device_id=1):
            self.registers[address] = value
            return Response()

    package = types.ModuleType("pymodbus")
    package.__path__ = []
    client_module = types.ModuleType("pymodbus.client")
    client_module.ModbusTcpClient = FakeClient
    monkeypatch.setitem(sys.modules, "pymodbus", package)
    monkeypatch.setitem(sys.modules, "pymodbus.client", client_module)

    plc = {"protocol": "modbus-tcp", "address": "127.0.0.1:502", "unit": 1}
    tag = {"id": "t", "type": "int16", "address": "40001", "scale": 2, "offset": 5}
    from app.plc_drivers import ModbusSession

    with ModbusSession(plc) as session:
        assert session.read(tag) == 25
    write_plc_tag(plc, tag, 45)


def test_s7_real_value_read_and_write_with_fake_memory():
    class MemoryPLC:
        def __init__(self):
            self.memory = bytearray(16)
            self.memory[4:8] = struct.pack(">f", 12.5)

        def db_read(self, db_number, start, size):
            return self.memory[start:start + size]

        def db_write(self, db_number, start, data):
            self.memory[start:start + len(data)] = data

    session = object.__new__(S7Session)
    session.client = MemoryPLC()
    tag = {"address": "DB5.DBD4", "type": "float32"}
    assert math.isclose(session.read(tag), 12.5)
    session.write(tag, 18.75)
    assert math.isclose(session.read(tag), 18.75)
