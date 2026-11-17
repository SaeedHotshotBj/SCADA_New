# SCADA_New

Persian RTL SCADA/HMI browser application with a separate FastAPI application backend.

## Frontend reference

The original screens and RTL styles are kept as the visual reference. Backend code lives under `backend/`; the API client is isolated in the frontend service layer. Backend work must not replace the visual components or styles.

## Run on Windows (CMD)

Start two CMD windows.

### Backend

```cmd
cd /d F:\SCADA_New\backend
py -m venv .venv
.venv\Scripts\activate
py -m pip install -r requirements.txt
copy .env.example .env
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

API docs: http://127.0.0.1:8000/docs
Health: http://127.0.0.1:8000/health

### Frontend

```cmd
cd /d F:\SCADA_New
py -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173.

Local demonstration login: `admin@demo-cable.local` / `demo1234`. Change it before using any non-demo data.

## Backend capability and limits

Authentication, server-side resource storage, operation histories, Edge registration/heartbeat/telemetry ingestion, telemetry history, WebSocket snapshots and data-derived analytics are implemented. Demo telemetry and web writes are labelled as simulation. The application does not issue physical PLC or load-cell commands. A commissioned Modbus TCP/RTU or Siemens S7 driver, per-device address map and hardware-in-loop commissioning tests are not included.

## Checks

```cmd
cd /d F:\SCADA_New\backend
py -m pip install -r requirements-dev.txt
set PYTHONPATH=.
py -m pytest -q tests
```

At the repository root, run `npm run check` for JavaScript syntax validation.
