# SCADA_New Backend

FastAPI + SQLite application layer for the SCADA_New browser client.

## Scope and safety boundary

This backend provides authenticated application APIs, persistent records, audit history, reporting jobs, production/batch workflow state, Edge registration/heartbeat, and a clearly marked demo telemetry source. It does **not** claim to control a real PLC. PLC writes are simulation-only until a tested protocol adapter, per-PLC address map, network access policy, and explicit commissioning configuration are supplied. The default configuration rejects physical writes.

## Install and run (Windows CMD)

```cmd
cd /d F:\SCADA_New\backend
py -m venv .venv
.venv\Scripts\activate
py -m pip install -r requirements.txt
copy .env.example .env
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Keep the backend terminal open. From another CMD window:

```cmd
cd /d F:\SCADA_New
py -m http.server 4173
```

Open http://localhost:4173. API documentation is at http://127.0.0.1:8000/docs.

Set a long random `SCADA_SECRET_KEY` before exposing the API beyond localhost. For production use, put the application behind HTTPS and restrict network access. SQLite is intended for this single-server deployment; use managed PostgreSQL only after the deployment topology and backup strategy are decided.

## API groups

- `/api/auth`: login, logout, session identity
- `/api/bootstrap`: authenticated client data snapshot
- `/api/resources/{collection}`: validated CRUD for the modules represented in the UI
- `/api/operations`: state transitions for production runs, batches, workflow approval, QC decisions and report execution
- `/api/edge`: one-time Edge token issue and authenticated heartbeat
- `/api/telemetry` and `/ws/live`: stored samples and explicitly labelled demo telemetry

The database is created automatically at first start. A demonstration administrator is seeded: `admin@demo-cable.local / demo`. Change this password before using non-demo data.
