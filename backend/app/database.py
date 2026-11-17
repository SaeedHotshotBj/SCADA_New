from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from .config import DB_PATH


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=15, isolation_level="DEFERRED")
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=15000")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def row_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def json_dump(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def json_load(value: str | None, default=None):
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def initialize_schema() -> None:
    schema = """
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'فعال',
      password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS resources (
      collection TEXT NOT NULL, id TEXT NOT NULL, factory_id TEXT,
      payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_resources_collection ON resources(collection, updated_at);
    CREATE TABLE IF NOT EXISTS edge_devices (
      id TEXT PRIMARY KEY, factory_id TEXT, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
      token_hash TEXT, metadata TEXT NOT NULL DEFAULT '{}', last_seen TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS telemetry_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT, factory_id TEXT, tag_id TEXT NOT NULL,
      value_json TEXT NOT NULL, quality TEXT NOT NULL, source TEXT NOT NULL,
      sampled_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_tag_time ON telemetry_samples(tag_id, sampled_at DESC);
    CREATE TABLE IF NOT EXISTS batch_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL,
      event TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS report_executions (
      id TEXT PRIMARY KEY, report_id TEXT NOT NULL, status TEXT NOT NULL,
      parameters TEXT NOT NULL DEFAULT '{}', result TEXT NOT NULL DEFAULT '{}',
      requested_by TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT NOT NULL,
      collection TEXT, record_id TEXT, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS production_run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, event TEXT NOT NULL,
      quantity REAL, unit TEXT, details TEXT NOT NULL DEFAULT '{}',
      actor_id TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_run_events_time ON production_run_events(run_id, created_at);
    CREATE TABLE IF NOT EXISTS batch_weighments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL, hopper_key TEXT NOT NULL,
      material TEXT NOT NULL, target_weight REAL NOT NULL, actual_weight REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg', tolerance_percent REAL NOT NULL DEFAULT 0,
      result TEXT NOT NULL, quality TEXT NOT NULL DEFAULT 'DEMO',
      source TEXT NOT NULL DEFAULT 'manual-demo', actor_id TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_batch_weighments_time ON batch_weighments(batch_id, created_at);
    CREATE TABLE IF NOT EXISTS workflow_task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, decision TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '', actor_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qc_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, qc_id TEXT NOT NULL, parameter TEXT NOT NULL,
      nominal REAL, minimum REAL, maximum REAL, actual REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '', result TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      inspector_id TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_qc_measurements_time ON qc_measurements(qc_id, created_at);
    CREATE TABLE IF NOT EXISTS alarm_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, alarm_id TEXT NOT NULL, tag_id TEXT,
      value_json TEXT, severity TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ACTIVE',
      message TEXT NOT NULL DEFAULT '', triggered_at TEXT NOT NULL,
      acknowledged_by TEXT, acknowledged_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_alarm_events_state ON alarm_events(state, triggered_at);
    """
    with connect() as db:
        db.executescript(schema)
        # Lightweight forward-compatible migration for databases created by earlier builds.
        user_columns = {row["name"] for row in db.execute("PRAGMA table_info(users)").fetchall()}
        if "factory_id" not in user_columns:
            db.execute("ALTER TABLE users ADD COLUMN factory_id TEXT")


def audit(db: sqlite3.Connection, actor_id: str | None, action: str,
          collection: str | None = None, record_id: str | None = None, details: dict | None = None) -> None:
    db.execute(
        "INSERT INTO audit_events(actor_id, action, collection, record_id, details, created_at) VALUES(?,?,?,?,?,?)",
        (actor_id, action, collection, record_id, json_dump(details or {}), utc_now()),
    )
