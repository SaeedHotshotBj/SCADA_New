# SCADA_New Backend

FastAPI application layer with SQLite persistence for the SCADA_New frontend.

## Start locally (Windows CMD)

```cmd
cd /d F:\SCADA_New\backend
py -m venv .venv
.venv\Scripts\activate
py -m pip install -r requirements.txt
copy .env.example .env
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

OpenAPI documentation: http://127.0.0.1:8000/docs
Health check: http://127.0.0.1:8000/health

The seeded local demonstration account is:
- Email: `admin@demo-cable.local`
- Password: `demo1234`

The seed is created only when the users table is empty. Change the password and replace `SCADA_SECRET_KEY` before using non-demo data. The database path in `.env` is resolved relative to this `backend` folder unless it is absolute.

## API areas

- `/api/auth`: session login/logout, current identity, password change.
- `/api/bootstrap`: initial collections for the browser client.
- `/api/resources/{collection}`: validated CRUD for application resources.
- `/api/operations`: production runs and quantities, batches and weighments, workflow decisions, QC measurements and report execution.
- `/api/edge`: one-time Edge registration, heartbeat, revocation and authenticated telemetry ingestion.
- `/api/telemetry`: latest values, persisted history, explicit simulation-only tag writes and authenticated WebSocket snapshots.
- `/api/analytics`: data-derived overview, production, quality and energy summaries.

## Industrial safety boundary

This is an application backend with explicit simulation/demo functionality. It is **not yet commissioned for machinery control**.

- Demo telemetry is labelled `DEMO`; simulated tag writes do not contact PLCs.
- Edge ingestion accepts readings from an Edge agent with a valid registration token; a real agent, device-side protocol implementation and commissioning test are still required.
- Production and batch state transitions persist application records. They do not start motors, open feeders or control a scale.
- The repository does not yet include a commissioned Modbus TCP/RTU or Siemens S7 driver. Actual PLC I/O requires the exact device models, address maps, data encoding, scaling, safe-state strategy, network policy and hardware-in-loop tests.
- Do not expose the development service directly to the public Internet or connect it to machinery without a separate commissioning and safety review.

## Tests

```cmd
py -m pip install -r requirements-dev.txt
set PYTHONPATH=.
py -m pytest -q tests
```
