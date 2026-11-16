from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.getenv("SCADA_DB_PATH", str(BASE_DIR / "data" / "scada_new.sqlite3"))).expanduser()
SECRET_KEY = os.getenv("SCADA_SECRET_KEY", "development-only-change-me-before-deployment")
SESSION_TTL_HOURS = max(1, int(os.getenv("SCADA_SESSION_TTL_HOURS", "12")))
DEMO_TELEMETRY = os.getenv("SCADA_DEMO_TELEMETRY", "true").lower() in {"1", "true", "yes"}
ALLOW_ORIGINS = [item.strip() for item in os.getenv("SCADA_ALLOW_ORIGINS", "").split(",") if item.strip()]
