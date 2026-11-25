# SCADA_New

A layered Persian RTL SCADA/HMI application. The backend-integrated branch is based on the original browser UI branch rebuild-from-video and adds FastAPI, SQLite persistence, server-backed workflows, and PLC protocol adapters without replacing the original layout or theme.

## Architecture

- **Frontend:** browser-native ES modules, modular feature pages, shared UI components and responsive RTL styles.
- **Backend:** FastAPI, cookie-based authenticated HTTP/WebSocket API, resource validation, business-operation services and audit history.
- **Database:** SQLite under backend/data/; created at first startup and ignored by Git.
- **PLC protocols:** Modbus TCP, Modbus RTU and Siemens S7 adapters are included. Live device connectivity still depends on correct network settings, PLC configuration, address map, data types and scaling.
- **Edge:** authenticated Edge registration/heartbeat and batch telemetry ingestion using X-Edge-Token.
- **Tests:** backend API/driver tests and frontend JavaScript syntax checks run in GitHub Actions.

## Run on Windows (CMD)

Use the separate integrated clone at F:\SCADA_New_backend_integrated+. Do not switch or reset the original F:\SCADA_New working folder for this setup. Open two CMD windows.

### 1. Update the integrated branch

~~~cmd
cd /d "F:\SCADA_New_backend_integrated+"
git pull origin backend-integrated
~~~

### 2. Start the backend

~~~cmd
cd /d "F:\SCADA_New_backend_integrated+\backend"
.venv\Scripts\activate.bat
~~~

Install dependencies only if they are not installed in this virtual environment:

~~~cmd
python -m pip install -r requirements.txt
~~~

Create .env only if it does not already exist:

~~~cmd
if not exist .env copy .env.example .env
~~~

Start the API:

~~~cmd
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
~~~

Keep this CMD window open. Health: http://127.0.0.1:8000/health  
API documentation: http://127.0.0.1:8000/docs

### 3. Start the frontend

In the second CMD window:

~~~cmd
cd /d "F:\SCADA_New_backend_integrated+"
py -m http.server 4173 --bind 127.0.0.1
~~~

Open **http://127.0.0.1:4173**. Use 127.0.0.1 for both the frontend and API so the session cookie and API host remain consistent.

### Demonstration login

- Email: admin@demo-cable.local
- Password: demo1234

The initial administrator is seeded only when the database is first created. Change this password and set a unique SCADA_SECRET_KEY before using non-demo data.

## Implemented application services

- Session-based login/logout, current-user endpoint, scrypt password hashes and role checks.
- Bootstrap snapshot and validated CRUD for the resource collections used by the frontend.
- SQLite audit events for login, CRUD, alarms and operational state transitions.
- PLC/tag definitions with factory ownership validation; tags inherit factory scope from their PLC when omitted.
- Modbus TCP/RTU and Siemens S7 protocol adapters with typed reads, scaling, address parsing and guarded writes.
- Edge registration token, token-hash storage, authenticated heartbeat, list/revoke and authenticated batch telemetry ingestion.
- Typed telemetry values, persisted samples, history queries and authenticated WebSocket snapshots.
- Numeric tag alarm rules, acknowledgement and automatic clear transitions.
- Database-derived analytics, period filtering, SQLite storage statistics and audit history.
- Production-run state transitions, quantity/scrap event records, batch state/weighment records, workflow approval, QC decisions and report snapshot execution.
- Data-bound HMI pages with value, status, gauge and simulation-only write components.
- Backend tests for authentication, resource validation, Edge ingestion, alarms, analytics, factory scope, HMI bindings, PLC driver parsing/read-write behavior and operational workflows.

## Important industrial safety boundary

This repository is an application/backend integration project, **not a commissioned industrial control system**.

- Simulator samples are labelled DEMO; Edge-ingested and successfully polled PLC samples are labelled GOOD; tags without a received sample are UNSAMPLED.
- The browser tag-write endpoint changes only the SQLite demo record and returns execution_mode=SIMULATION.
- Physical PLC protocol adapters exist for Modbus TCP/RTU and Siemens S7, but **no real-device hardware-in-the-loop test or plant/site commissioning has been completed**. Passing software tests is not proof of a live PLC connection.
- Physical polling runs only for hardware PLC records explicitly enabled by an engineer. Confirm IP/port or COM settings, Unit ID, Rack/Slot, Siemens PUT/GET and DB access, tag addresses, byte/word order, types, scaling and observed values against the actual device before enabling polling.
- Physical writes are OFF by default. They require a server environment switch, per-PLC permission and safety confirmation, a writable tag, explicit confirmation and read-back verification. Do not enable this on an operating machine without a documented risk assessment, interlocks, emergency-stop validation and safe-state procedure.
- Starting/stopping a production run or batch changes application workflow state only. It does not start a machine, operate a feeder or command a scale.
- Production quantity/scrap entries and QC measurements are application records entered through the UI; they are not automatically derived from machine counters or laboratory instruments.
- Per-hopper weighment rows are manual DEMO entries until a commissioned weighing adapter provides actual measurements.
- Actual OEE, production, energy and scrap KPIs are not calculated until their source tags and calculation rules are configured.
- HMI Designer provides a freeform 1200-pixel layout canvas: cards can be moved by dragging anywhere on the card and resized from the lower-right handle. Pixel positions and sizes are validated by the backend and shared by preview and runtime; overlapping cards are allowed. Existing grid layouts are migrated when opened.
- Automatic report scheduling and PDF/XLSX export are not included; report execution returns a server-side JSON snapshot.
- Do not expose the development server to the public internet. Use HTTPS, a long secret key, restricted firewall rules, backups and a hardened deployment before any operational use.

## Project layout

~~~text
backend/
  app/
    routers/       Auth, resources, operations, Edge, telemetry, analytics and PLC
    config.py      Runtime configuration and backend-local .env
    database.py    SQLite schema, connection and audit helpers
    seed.py        Initial demonstration dataset
    security.py    Password hashing and token utilities
    plc_drivers.py Modbus TCP/RTU and Siemens S7 protocol adapters
    plc_service.py PLC polling and telemetry persistence
  tests/           Backend API and PLC driver tests
src/
  app/             Bootstrap, route handling and UI action delegation
  core/            Shared route metadata and format helpers
  features/        System, BI, equipment, live HMI, planning, QC, production, batch, workflow, reports
  layouts/         Shared application frame and navigation
  services/        API client and server-backed frontend state
  shared/          Reusable UI primitives
styles/            Original responsive RTL theme + HMI runtime widget styles
scripts/           Frontend syntax checks
~~~

## Checks

From the repository root:

~~~cmd
npm run check
~~~

Backend checks (after installing development test tools in the active virtual environment):

~~~cmd
cd /d "F:\SCADA_New_backend_integrated+\backend"
python -m pip install pytest httpx
set PYTHONPATH=.
python -m pytest -q tests
~~~

## مستندات فنی تفصیلی

مستندات فارسی پروژه در پوشه‌ی [docs](./docs/README.md) قرار دارند. از آنجا می‌توانی به معماری، فرانت‌اند و HMI، بک‌اند و API، دیتابیس و Telemetry، PLC و Edge، ماژول‌های کسب‌وکار، نصب و امنیت، تست‌ها و نقشه‌ی راه مقیاس‌پذیری بروی.
