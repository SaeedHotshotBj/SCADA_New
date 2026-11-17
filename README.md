# SCADA_New

A layered Persian RTL SCADA/HMI application. The `backend-integrated` branch is based on the original browser UI branch `rebuild-from-video` and adds FastAPI, SQLite persistence and server-backed UI workflows without replacing the original layout or theme.

## Architecture

- **Frontend:** browser-native ES modules, modular feature pages, shared UI components and responsive RTL styles.
- **Backend:** FastAPI, cookie-based authenticated HTTP/WebSocket API, resource validation, business-operation services and audit history.
- **Database:** SQLite under `backend/data/`; the directory is created at first startup and ignored by Git.
- **Edge:** authenticated Edge registration/heartbeat and batch telemetry ingestion using `X-Edge-Token`.
- **Tests:** backend API tests and frontend JavaScript syntax checks run in GitHub Actions.

## Run on Windows (CMD)

Use the `backend-integrated` branch. Open two separate CMD windows.

### 1. Get the integrated branch (once)

From your existing project folder:

```cmd
cd /d F:\SCADA_New
git fetch origin
git switch backend-integrated
```

If the branch has not yet been created locally:

```cmd
git fetch origin backend-integrated
git switch -c backend-integrated --track origin/backend-integrated
```

### 2. Start the backend

```cmd
cd /d F:\SCADA_New\backend
py -m venv .venv
.venv\Scripts\activate
py -m pip install -r requirements.txt
```

Create `.env` only if it does not already exist:

```cmd
copy .env.example .env
```

Then start the API:

```cmd
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Keep this CMD window open. Health: http://127.0.0.1:8000/health  
API documentation: http://127.0.0.1:8000/docs

### 3. Start the frontend

In the second CMD window:

```cmd
cd /d F:\SCADA_New
py -m http.server 4173 --bind 127.0.0.1
```

Open **http://127.0.0.1:4173**. Use the same host name for the site and API so the session cookie is sent consistently.

### Demonstration login

- Email: `admin@demo-cable.local`
- Password: `demo1234`

The initial administrator is seeded only when the database is first created. Change the password and set a unique `SCADA_SECRET_KEY` before using non-demo data.

## Implemented application services

- Session-based login/logout, current-user endpoint, scrypt password hashes and role checks.
- Bootstrap snapshot and validated CRUD for the resource collections used by the frontend.
- SQLite audit events for login, CRUD, alarms and operational state transitions.
- PLC/tag definitions with factory ownership validation; tags inherit factory scope from their PLC when omitted.
- Edge registration token, token-hash storage, authenticated heartbeat, list/revoke and authenticated batch telemetry ingestion.
- Typed telemetry values, persisted samples, history queries and authenticated WebSocket snapshots.
- Numeric tag alarm rules, acknowledgement and automatic clear transitions on new samples.
- Database-derived analytics, period filtering, SQLite storage statistics and audit history.
- Production-run state transitions, batch state/cancel transitions, workflow approval, QC decision and report snapshot execution.
- Data-bound HMI pages with `value`, `status`, `gauge` and simulation-only `write` components.
- Backend integration tests for auth, resource validation, Edge ingestion, alarms, analytics, factory scope and HMI bindings.

## Important industrial safety boundary

This repository is an application/backend demo, **not a commissioned industrial control system**.

- Simulator samples are labelled `DEMO`; Edge-ingested samples are labelled `GOOD`; tags without a received sample are `UNSAMPLED`.
- The browser tag-write endpoint changes only the SQLite demo record and returns `execution_mode=SIMULATION`.
- Starting/stopping a production run or batch changes application state only. It does not start a machine, operate a feeder or command a scale.
- **No live Modbus TCP/RTU or Siemens S7 driver is connected.** Physical PLC I/O requires the exact PLC models, network topology, register/DB maps, scaling, access policy, safe-state behavior and commissioning tests.
- Load-cell data is displayed only when an assigned tag has a received sample; per-hopper actual weights and actuator sequences still require a commissioned weighing adapter.
- HMI page layout is currently configured as a validated JSON component list, not a drag-and-drop editor.
- BI reports only values derived from stored records. OEE, measured production quantity, energy and scrap remain unavailable until their source tags and calculation rules are defined.
- Do not expose the development server to the public internet. Use HTTPS, a long secret key, restricted firewall rules, backups and a hardened deployment before any operational use.

## Project layout

```text
backend/
  app/
    routers/       Auth, resources, operations, Edge, telemetry, analytics
    config.py      Runtime configuration and backend-local .env
    database.py    SQLite schema, connection and audit helpers
    seed.py        Initial demonstration dataset
    security.py    Password hashing and token utilities
  tests/           Backend API integration tests
src/
  app/             Bootstrap, route handling and UI action delegation
  core/            Shared route metadata and format helpers
  features/        System, BI, equipment, live HMI, planning, QC, production, batch, workflow, reports
  layouts/         Shared application frame and navigation
  services/        API client and server-backed frontend state
  shared/          Reusable UI primitives
styles/            Original responsive RTL theme + HMI runtime widget styles
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
