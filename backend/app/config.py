from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
# Backend-local configuration is loaded first; process environment overrides .env.
load_dotenv(BASE_DIR / ".env", override=False)


def _database_path(raw: str) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = BASE_DIR / path
    return path.resolve()


DB_PATH = _database_path(os.getenv("SCADA_DB_PATH", "data/scada_new.sqlite3"))
DEPLOYMENT_ENV = os.getenv("SCADA_ENV", "development").strip().lower()
SECRET_KEY = os.getenv("SCADA_SECRET_KEY", "development-only-change-me-before-deployment")
SESSION_TTL_HOURS = max(1, int(os.getenv("SCADA_SESSION_TTL_HOURS", "12")))
_default_demo = "false" if DEPLOYMENT_ENV in {"production", "prod"} else "true"
DEMO_TELEMETRY = os.getenv("SCADA_DEMO_TELEMETRY", _default_demo).lower() in {"1", "true", "yes"}
ALLOW_ORIGINS = [item.strip() for item in os.getenv("SCADA_ALLOW_ORIGINS", "").split(",") if item.strip()]

if DEPLOYMENT_ENV in {"production", "prod"}:
    if len(SECRET_KEY) < 32 or SECRET_KEY == "development-only-change-me-before-deployment":
        raise RuntimeError("SCADA_SECRET_KEY must be a unique random value of at least 32 characters in production.")
    if not ALLOW_ORIGINS:
        raise RuntimeError("SCADA_ALLOW_ORIGINS must explicitly list trusted frontend origins in production.")
    if DEMO_TELEMETRY:
        raise RuntimeError("SCADA_DEMO_TELEMETRY must be false in production.")
