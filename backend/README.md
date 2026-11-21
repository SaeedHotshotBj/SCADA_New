# SCADA_New Backend

FastAPI + SQLite application layer for the SCADA_New browser client.

## Scope and safety boundary

This backend provides authenticated application APIs, persistent records, audit history, production/batch workflow state, Edge registration/heartbeat, demo telemetry, and protocol adapters for Modbus TCP, Modbus RTU and Siemens S7. Physical polling is limited to PLC records explicitly enabled by an engineer. Physical writes remain disabled by default and require a separate server environment switch plus per-PLC write permission and safety confirmation. This is an integration layer, not a safety PLC or a commissioned machine-control system.

## Install and run (Windows CMD)

Use the separate integrated clone at F:\SCADA_New_backend_integrated+.

~~~cmd
cd /d "F:\SCADA_New_backend_integrated+\backend"
.venv\Scripts\activate.bat
python -m pip install -r requirements.txt
if not exist .env copy .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
~~~

Keep the backend terminal open. From another CMD window:

~~~cmd
cd /d "F:\SCADA_New_backend_integrated+"
py -m http.server 4173 --bind 127.0.0.1
~~~

Open http://127.0.0.1:4173. API documentation is at http://127.0.0.1:8000/docs. Use 127.0.0.1 for both frontend and API.

Set a long random SCADA_SECRET_KEY before exposing the API beyond localhost. For production use, put the application behind HTTPS and restrict network access. SQLite is intended for this single-server deployment; use managed PostgreSQL only after the deployment topology and backup strategy are decided.

## API groups

- /api/auth: login, logout, session identity and password change
- /api/bootstrap: authenticated client data snapshot
- /api/resources/{collection}: validated CRUD for the modules represented in the UI
- /api/operations: state transitions for production runs, batches, workflow approval, QC decisions and report execution
- /api/edge: one-time Edge token issue and authenticated heartbeat
- /api/telemetry: stored samples, explicit DEMO/SIMULATION tag writes, and authenticated Edge batch ingest at /api/telemetry/edge/ingest using X-Edge-Token
- /api/analytics: database-derived counters, SQLite storage measurements and audit history
- /api/telemetry/ws/live: authenticated live snapshots with per-tag quality/source labels
- /api/plc/{id}/test, /api/plc/{id}/poll, /api/plc/{id}/status: authenticated PLC connection test, immediate mapped-tag read and connection status
- /api/plc/tags/{tag_id}/write: physical write with explicit confirmation, read-back verification and audit record; denied unless all safety gates are enabled

The database is created automatically at first start. A demonstration administrator is seeded: admin@demo-cable.local / demo1234. Change this password and set a unique SCADA_SECRET_KEY before using non-demo data.

## Real PLC commissioning (local network first)

1. Install dependencies from requirements.txt. Modbus TCP uses PyModbus; Modbus RTU additionally uses the operating-system serial port and pySerial; Siemens S7 uses python-snap7.
2. In Equipment → PLCs create the controller. For Modbus TCP, enter IP:port (normally port 502) and Unit ID. For Modbus RTU, enter the serial port (for example COM3) and set baudrate/parity/stopbits. For S7, enter the PLC IP (normally port 102), Rack (normally 0) and Slot (normally 1).
3. Add tags with protocol-appropriate addresses. Modbus accepts five-digit references (00014 coil, 10001 discrete input, 30001 input register, 40045 holding register) and zero-based offsets when an address area is selected. For 32-bit values set byte/word order to match the PLC. Apply scale and offset only when the device stores engineering values as raw integers. Set each PLC poll interval (for example 500 ms) independently from history_interval (default 5 s); the current tag value is refreshed on every poll while Trend/history samples are recorded at the slower history interval. SCADA_PLC_HISTORY_RETENTION_DAYS controls retention (default 30 days).
4. Siemens addresses include DB5.DBD4, DB7.DBW2, DB5.DBX0.0, M10.0, MW10, I0.0 and Q0.0. S7-1200 must be configured by the site engineer for PUT/GET access; absolute DB addressing normally requires non-optimized DB access. For a native Siemens STRING, set tag type string, string_format=s7, a DB byte address such as DB5.DBB0, and the maximum character length. Its two-byte max/current-length header is handled by the driver. Raw byte arrays use string_format=raw. For Modbus strings, length is the number of 16-bit registers, not bytes. Confirm rack/slot and DB offsets with the actual TIA Portal project.
5. First press **Test connection**, then **Read now**. Only after values, addresses, data types, signedness, byte/word order, units and scaling are independently checked should the PLC be enabled for background polling.
6. Physical writes are OFF by default. For an isolated test bench only, the server administrator must set SCADA_PLC_WRITES_ENABLED=true, and a privileged engineer must explicitly set allow_writes and safety_confirmed on that individual PLC. The API then demands the exact confirmation phrase WRITE TO PLC and performs a read-back verification. Never enable this on an operating machine without a documented risk assessment, interlocks, emergency-stop validation and a safe-state procedure.

The polling service marks samples GOOD only after a successful device read and BAD on a failed mapped-tag read. The demo generator never overwrites a tag whose latest source is Edge or a physical PLC. The connection test does not write to the controller. Production/batch Start/Stop transitions remain application workflow records; they do not infer a machine command from a tag name or actuate equipment automatically. Production counter capture, per-hopper weighing sequences, machine interlocks, OEE/energy calculations and recipe/download sequences need a site-specific signal map and validated process logic; generic tag communication does not guess these relationships. No hardware-in-the-loop or plant commissioning test has been performed in CI.
