# SCADA_New

A layered Persian RTL SCADA/HMI application reconstructed from the supplied screen recording.

## Architecture

- **Frontend:** browser-native ES modules, modular feature pages, shared UI components, responsive RTL styles.
- **Backend:** FastAPI application, authenticated HTTP/WebSocket API, SQLite persistence, resource validation, audit history and operation services.
- **Storage:** server-side SQLite database under `backend/data/`; this folder is ignored by Git and is created on first backend start.
- **Tests:** backend API integration tests and frontend JavaScript syntax checks run in GitHub Actions.

## Run on Windows (CMD)

Open two separate CMD windows.

### 1. Start the backend

```cmd
cd /d F:\SCADA_New\backend
py -m venv .venv
.venv\Scripts\activate
py -m pip install -r requirements.txt
copy .env.example .env
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The API docs are available at http://127.0.0.1:8000/docs and health at http://127.0.0.1:8000/health.

### 2. Start the frontend

```cmd
cd /d F:\SCADA_New
py -m http.server 4173
```

Open http://localhost:4173.

### Demonstration login

- Email: `admin@demo-cable.local`
- Password: `demo1234`

The administrator is seeded only when the database is first created. Change this password and set a unique `SCADA_SECRET_KEY` before using any non-demo or network-exposed environment.

## Backend capabilities currently implemented

- Session-based login/logout and current-user endpoint; scrypt password hashes.
- Bootstrap endpoint for frontend state.
- Validated create/read/update/delete operations for the frontend resource groups.
- Audit events for login, CRUD and operational state transitions.
- Edge one-time registration token, token-hash storage, authenticated heartbeat, list and revoke.
- Typed tag value validation, stored telemetry history, WebSocket snapshots and an optional demo telemetry simulator.
- Production run start/stop, batch start/stop, workflow approval, QC decision, report execution history.
- SQLite transactions, foreign-key support, WAL and busy timeout.

## Important industrial safety boundary

This repository is a **software/application demo**, not a commissioned industrial control system.

- Telemetry emitted by the bundled simulator is explicitly marked `DEMO`.
- Tag write endpoint changes only the demonstration database and returns `execution_mode=SIMULATION`.
- Starting/stopping production or batch records updates application state; it does not start a real machine or operate a scale/feeder.
- No live Modbus TCP/RTU or Siemens S7 driver is connected yet. Physical PLC I/O must not be enabled until the exact PLC models, network topology, register/DB address maps, scaling, access policy, safe-state behavior and commissioning tests have been defined.
- Do not expose the development server to the public internet. Use HTTPS, a long secret key, restricted firewall rules, backups and a hardened deployment before any real operational use.

## Project layout

```text
backend/
  app/
    routers/       Auth, resources, operations, Edge and telemetry APIs
    config.py      Runtime configuration
    database.py    SQLite schema, connection and audit helpers
    seed.py        Initial demonstration dataset
    security.py    Password hashing and token utilities
  tests/           API integration tests
src/
  app/             Bootstrap, route handling and UI action delegation
  core/            Shared route metadata and format helpers
  features/        System, BI, PLC, live HMI, planning, QC, production, batch, workflow, reports
  layouts/         Shared application frame and navigation
  services/        API client and frontend state store
  shared/          Reusable UI primitives
styles/            Responsive RTL theme
scripts/           Frontend syntax checks
```

## Checks

From the repository root:

```cmd
npm run check
```

Backend checks (after installing development test tools):

```cmd
cd /d F:\SCADA_New\backend
py -m pip install pytest httpx
set PYTHONPATH=.
py -m pytest -q tests
```
