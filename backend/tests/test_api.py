import os
from pathlib import Path

TEST_DB = Path(__file__).parent / "test_scada.sqlite3"
os.environ["SCADA_DB_PATH"] = str(TEST_DB)
os.environ["SCADA_SECRET_KEY"] = "test-secret-key-which-is-long-enough-for-ci"
os.environ["SCADA_DEMO_TELEMETRY"] = "false"
os.environ["SCADA_PLC_WRITES_ENABLED"] = "false"

from fastapi.testclient import TestClient
from app.main import app


def test_health_and_authentication():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/bootstrap").status_code == 401
        login = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        assert login.status_code == 200
        assert "scada_session" in client.cookies
        snapshot = client.get("/api/bootstrap")
        assert snapshot.status_code == 200
        assert "tags" in snapshot.json()["data"]
        assert len(snapshot.json()["data"]["tags"]) >= 1
        assert client.post("/api/auth/logout").status_code == 200
        assert client.get("/api/bootstrap").status_code == 401


def test_validated_resources_and_tag_write():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={"email":"admin@demo-cable.local","password":"demo1234"})
        invalid = client.post("/api/resources/plcs", json={
            "name":"bad plc","protocol":"made-up","address":"127.0.0.1"
        })
        assert invalid.status_code == 422
        invalid_tag = client.post("/api/resources/tags", json={
            "name":"TEST.Bad","plc":"missing-plc","type":"float32","address":"40100",
            "access":"read_write","unit":"Hz","value":10.0
        })
        assert invalid_tag.status_code == 422
        created = client.post("/api/resources/tags", json={
            "name":"TEST.Setpoint","plc":"p1","type":"float32","address":"40099",
            "access":"read_write","unit":"Hz","value":10.0
        })
        assert created.status_code == 201
        tag_id = created.json()["id"]
        written = client.post(f"/api/telemetry/tags/{tag_id}/write", json={"value":22.5})
        assert written.status_code == 200
        assert written.json()["value"] == 22.5
        readonly = client.post("/api/telemetry/tags/t6/write", json={"value":10.0})
        assert readonly.status_code == 403
        bad_type = client.post(f"/api/telemetry/tags/{tag_id}/write", json={"value":"fast"})
        assert bad_type.status_code == 422


def test_production_workflow_qc_batch_and_report_transitions():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={"email":"admin@demo-cable.local","password":"demo1234"})
        product = client.post("/api/resources/products", json={
            "code": "PROD-RUN-TEST", "name": "کابل تست", "unit": "m", "status": "فعال"
        })
        assert product.status_code == 201
        order = client.post("/api/resources/orders", json={
            "code": "PO-TEST", "product": "کابل تست", "quantity": 100,
            "unit": "m", "machine": "بانچر", "status": "آزادشده"
        })
        assert order.status_code == 201
        run = client.post("/api/resources/productionRuns", json={
            "order":"PO-TEST","machine":"بانچر","product":"کابل تست","target":100
        })
        assert run.status_code == 201
        run_id = run.json()["id"]
        assert client.post(f"/api/operations/production-runs/{run_id}/start").status_code == 200
        assert client.post(f"/api/operations/production-runs/{run_id}/start").status_code == 409
        assert client.post(f"/api/operations/production-runs/{run_id}/stop").status_code == 200

        task = client.post("/api/resources/workflowTasks", json={
            "title":"تأیید تست","flow":"CI","from":"تست","status":"در انتظار"
        }).json()
        assert client.post(f"/api/operations/workflow-tasks/{task['id']}/approve").status_code == 200

        qc = client.post("/api/resources/qc", json={
            "code":"QC-TEST","product":"کابل تست","machine":"بانچر","decision":"مشروط"
        }).json()
        assert client.post(f"/api/operations/qc/{qc['id']}/decision",
                           json={"decision":"قبول","note":"تست"}).status_code == 200

        batch = client.post("/api/resources/batches", json={
            "code":"BATCH-TEST","formula":"TEST","target":50
        }).json()
        assert client.post(f"/api/operations/batches/{batch['id']}/start").status_code == 200
        assert client.post(f"/api/operations/batches/{batch['id']}/stop").status_code == 200
        cancelled = client.post(f"/api/operations/batches/{batch['id']}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "لغوشده"

        report = client.post("/api/resources/reports", json={
            "name":"گزارش تست","type":"روزانه","tags":1
        }).json()
        execution = client.post(f"/api/operations/reports/{report['id']}/run", json={"parameters":{}})
        assert execution.status_code == 202
        result = execution.json()["result"]
        assert result["mode"] == "APPLICATION_DATA"
        assert result["summary"]["tag_count"] >= 1
        assert "telemetry_samples" in result["tables"]
        history = client.get(f"/api/operations/reports/{report['id']}/executions")
        assert history.status_code == 200 and history.json()
        details = client.get(f"/api/operations/reports/{report['id']}/executions/{execution.json()['id']}")
        assert details.status_code == 200


def test_edge_token_and_heartbeat():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={"email":"admin@demo-cable.local","password":"demo1234"})
        response = client.post("/api/edge/register", json={
            "name":"EDGE-CI-01","factory_id":"f1","note":"test"
        })
        assert response.status_code == 201
        token = response.json()["edge_token"]
        assert len(token) > 20
        beat = client.post("/api/edge/heartbeat", headers={"X-Edge-Token":token}, json={
            "version":"ci-test","hostname":"runner","cpu_percent":5,"memory_percent":30
        })
        assert beat.status_code == 200
        assert beat.json()["status"] == "ONLINE"
        assert client.post("/api/edge/heartbeat", headers={"X-Edge-Token":"wrong"}, json={}).status_code == 401



def test_hmi_and_operational_configuration_resources():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={"email":"admin@demo-cable.local","password":"demo1234"})

        product = client.post("/api/resources/products", json={
            "code":"PROD-CI","name":"محصول تست","unit":"m","status":"فعال"
        })
        assert product.status_code == 201

        price = client.post("/api/resources/prices", json={
            "kind":"مواد اولیه","code":"MAT-CI","name":"ماده تست",
            "price":"1250.5","currency":"ریال","unit":"kg","valid_from":"1405-08-01"
        })
        assert price.status_code == 201
        assert price.json()["price"] == 1250.5

        hmi = client.post("/api/resources/hmiPages", json={
            "name":"صفحه تست","machine":"بانچر","description":"CI test",
            "layout":[{"type":"value","tag_id":"t3","label":"جریان"}],"status":"فعال"
        })
        assert hmi.status_code == 201
        assert hmi.json()["components"] == 1

        invalid_gauge = client.post("/api/resources/hmiPages", json={
            "name":"گیج نامعتبر","machine":"بانچر","description":"invalid gauge",
            "layout":[{"type":"gauge","tag_id":"t3","min":100,"max":10}],"status":"فعال"
        })
        assert invalid_gauge.status_code == 422

        industrial_layout = [
            {"type":"motor","label":"Motor M1","run_tag_id":"t1","fault_tag_id":"t4","speed_tag_id":"t6"},
            {"type":"pump","label":"Pump P1","run_tag_id":"t1"},
            {"type":"tank","label":"Tank T1","level_tag_id":"t6","min":0,"max":250},
            {"type":"valve","label":"Valve V1","open_tag_id":"t1","fault_tag_id":"t4"},
            {"type":"needle","label":"Pressure","tag_id":"t6","min":0,"max":16},
            {"type":"chart","label":"Speed trend","tag_id":"t6","chart_kind":"line","history_hours":6},
            {"type":"indicator","label":"Ready","tag_id":"t1"},
            {"type":"thermometer","label":"Temperature","tag_id":"t6","min":0,"max":200},
            {"type":"conveyor","label":"Conveyor","run_tag_id":"t1","fault_tag_id":"t4"},
            {"type":"fan","label":"Fan","run_tag_id":"t1","speed_tag_id":"t6"},
        ]
        industrial_hmi = client.post("/api/resources/hmiPages", json={
            "name":"صفحه شماتیک صنعتی","machine":"بانچر","description":"Industrial widget validation",
            "layout":industrial_layout,"status":"فعال"
        })
        assert industrial_hmi.status_code == 201, industrial_hmi.text
        assert industrial_hmi.json()["components"] == len(industrial_layout)

        invalid_motor_binding = client.post("/api/resources/hmiPages", json={
            "name":"موتور با تگ نامعتبر","machine":"بانچر","description":"A motor run binding must be BOOL",
            "layout":[{"type":"motor","run_tag_id":"t6"}],"status":"فعال"
        })
        assert invalid_motor_binding.status_code == 422

        invalid_needle_binding = client.post("/api/resources/hmiPages", json={
            "name":"گیج با تگ بولی","machine":"بانچر","description":"A needle requires numeric data",
            "layout":[{"type":"needle","tag_id":"t1","min":0,"max":100}],"status":"فعال"
        })
        assert invalid_needle_binding.status_code == 422

        invalid_component = client.post("/api/resources/hmiPages", json={
            "name":"جزء ناشناخته","machine":"بانچر","description":"Unknown component is rejected",
            "layout":[{"type":"robot","tag_id":"t6"}],"status":"فعال"
        })
        assert invalid_component.status_code == 422

        days = [
            {"day":day,"enabled":True,"start":"08:00","end":"17:00","break":"01:00"}
            for day in ["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"]
        ]
        calendar = client.post("/api/resources/machineCalendars", json={
            "machine":"بانچر","year":"1405","month":"آبان","days":days
        })
        assert calendar.status_code == 201

        batch_config = client.post("/api/resources/batchConfigs", json={
            "code":"BATCH-CI","name":"تست خط","loadcell":"Loadcell-01",
            "samples":"5","tolerance_percent":"0.5","stabilization_seconds":"3",
            "formula":"فرمول تست","hoppers":[
                {"bin":"H1","material":"PVC","ratio":60,"target":60},
                {"bin":"H2","material":"افزودنی","ratio":40,"target":40}
            ]
        })
        assert batch_config.status_code == 201
        assert batch_config.json()["samples"] == 5
        invalid_batch_config = client.post("/api/resources/batchConfigs", json={
            "code":"BATCH-CI-BAD","name":"فرمول نامعتبر","loadcell":"Loadcell-01",
            "samples":5,"tolerance_percent":0.5,"stabilization_seconds":3,
            "formula":"bad ratio","hoppers":[
                {"bin":"H1","material":"PVC","ratio":60,"target":60},
                {"bin":"H2","material":"افزودنی","ratio":30,"target":30}
            ]
        })
        assert invalid_batch_config.status_code == 422

        control_plan = client.post("/api/resources/controlPlans", json={
            "product":"محصول تست","process":"اکستروژن","version":"1",
            "sampling_interval":"هر ۳۰ دقیقه","sample_count":"3","approval_required":True,
            "parameters":[{"parameter":"قطر","nominal":"2.4","min":"2.3","max":"2.5","unit":"mm","method":"اندازه‌گیری"}]
        })
        assert control_plan.status_code == 201
        invalid_control_plan = client.post("/api/resources/controlPlans", json={
            "product":"محصول تست","process":"اکستروژن","version":"bad",
            "sampling_interval":"هر ۳۰ دقیقه","sample_count":3,"approval_required":True,
            "parameters":[{"parameter":"قطر","nominal":"2.4","min":"2.6","max":"2.3","unit":"mm","method":"اندازه‌گیری"}]
        })
        assert invalid_control_plan.status_code == 422
        snapshot = client.get("/api/bootstrap").json()["data"]
        assert any(row["id"] == hmi.json()["id"] for row in snapshot["hmiPages"])
        assert any(row["id"] == calendar.json()["id"] for row in snapshot["machineCalendars"])
        assert any(row["id"] == batch_config.json()["id"] for row in snapshot["batchConfigs"])
        assert any(row["id"] == control_plan.json()["id"] for row in snapshot["controlPlans"])



def test_user_management_is_admin_only_and_bootstrap_hides_other_users():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        created = client.post("/api/resources/users", json={
            "name": "مهندس تست", "email": "engineer-ci@example.local",
            "role": "Engineer", "status": "فعال", "factory_id": "f1"
        })
        assert created.status_code == 201
        temporary_password = created.json()["temporary_password"]
        user_id = created.json()["id"]

        assert client.post("/api/auth/logout").status_code == 200
        login = client.post("/api/auth/login", json={
            "email": "engineer-ci@example.local", "password": temporary_password
        })
        assert login.status_code == 200

        snapshot = client.get("/api/bootstrap")
        assert snapshot.status_code == 200
        visible_users = snapshot.json()["data"]["users"]
        assert [item["id"] for item in visible_users] == [user_id]

        denied_create = client.post("/api/resources/users", json={
            "name": "ادمین غیرمجاز", "email": "bad-admin@example.local",
            "role": "Organization Admin", "status": "فعال"
        })
        assert denied_create.status_code == 403

        denied_escalation = client.patch(f"/api/resources/users/{user_id}", json={
            "role": "Organization Admin"
        })
        assert denied_escalation.status_code == 403

        denied_other_user_read = client.get("/api/resources/users/u-admin")
        assert denied_other_user_read.status_code == 404


def test_edge_telemetry_ingest_validates_scope_and_persists_history():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        registered = client.post("/api/edge/register", json={
            "name": "EDGE-INGEST-CI", "factory_id": "f1", "note": "telemetry ingest test"
        })
        assert registered.status_code == 201
        token = registered.json()["edge_token"]

        ingest = client.post(
            "/api/telemetry/edge/ingest",
            headers={"X-Edge-Token": token},
            json={"samples": [{"tag_id": "t6", "value": 145.75}]},
        )
        assert ingest.status_code == 200
        assert ingest.json()["accepted_samples"] == 1
        assert ingest.json()["items"][0]["quality"] == "GOOD"

        latest = client.get("/api/telemetry/latest")
        assert latest.status_code == 200
        current = next(item for item in latest.json()["items"] if item["tag_id"] == "t6")
        assert current["value"] == 145.75
        assert current["quality"] == "GOOD"
        assert current["source"].startswith("edge:")

        history = client.get("/api/telemetry/history?tag_id=t6&hours=24")
        assert history.status_code == 200
        assert any(item["value"] == 145.75 and item["quality"] == "GOOD" for item in history.json()["items"])

        invalid_type = client.post(
            "/api/telemetry/edge/ingest",
            headers={"X-Edge-Token": token},
            json={"samples": [{"tag_id": "t6", "value": "not-a-number"}]},
        )
        assert invalid_type.status_code == 422

        assert client.post(
            "/api/telemetry/edge/ingest",
            headers={"X-Edge-Token": "not-a-real-token"},
            json={"samples": [{"tag_id": "t6", "value": 1.0}]},
        ).status_code == 401


def test_analytics_summary_storage_and_audit_are_database_backed():
    with TestClient(app) as client:
        unauthenticated = client.get("/api/analytics/summary")
        assert unauthenticated.status_code == 401

        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        summary = client.get("/api/analytics/summary")
        assert summary.status_code == 200
        body = summary.json()
        assert body["kpis"]["tag_count"] >= 1
        assert "oee" in body["derived_metrics"]
        assert body["derived_metrics"]["oee"] is None
        assert isinstance(body["production_by_day"], list)
        short_period = client.get("/api/analytics/summary?days=1")
        assert short_period.status_code == 200
        assert short_period.json()["period_days"] == 1
        assert "telemetry_samples_period" in short_period.json()["kpis"]

        storage = client.get("/api/analytics/storage")
        assert storage.status_code == 200
        storage_body = storage.json()
        assert storage_body["engine"] == "SQLite"
        assert storage_body["tag_count"] >= 1
        assert "telemetry_by_tag" in storage_body

        audit = client.get("/api/analytics/audit?limit=10")
        assert audit.status_code == 200
        assert isinstance(audit.json(), list)


def test_numeric_alarm_rule_triggers_acknowledges_and_clears_from_edge_samples():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        alarm = client.post("/api/resources/alarms", json={
            "name": "High speed",
            "severity": "زیاد",
            "tag": "t6",
            "operator": ">",
            "threshold": 100,
            "status": "فعال",
        })
        assert alarm.status_code == 201
        alarm_id = alarm.json()["id"]

        registered = client.post("/api/edge/register", json={
            "name": "EDGE-ALARM-CI", "factory_id": "f1", "note": "alarm test"
        })
        assert registered.status_code == 201
        token = registered.json()["edge_token"]

        triggered = client.post(
            "/api/telemetry/edge/ingest",
            headers={"X-Edge-Token": token},
            json={"samples": [{"tag_id": "t6", "value": 130.0}]},
        )
        assert triggered.status_code == 200
        assert any(item["id"] == alarm_id and item["status"] == "فعال"
                   for item in triggered.json()["items"][0]["alarm_transitions"])

        active = client.get("/api/resources/alarms").json()["items"]
        active_alarm = next(item for item in active if item["id"] == alarm_id)
        assert active_alarm["condition_active"] is True
        assert active_alarm["trigger_count"] == 1

        acknowledged = client.patch(
            f"/api/resources/alarms/{alarm_id}", json={"status": "تأییدشده"}
        )
        assert acknowledged.status_code == 200
        still_high = client.post(
            "/api/telemetry/edge/ingest",
            headers={"X-Edge-Token": token},
            json={"samples": [{"tag_id": "t6", "value": 125.0}]},
        )
        assert still_high.status_code == 200
        confirmed = next(item for item in client.get("/api/resources/alarms").json()["items"]
                         if item["id"] == alarm_id)
        assert confirmed["status"] == "تأییدشده"
        assert confirmed["condition_active"] is True

        cleared = client.post(
            "/api/telemetry/edge/ingest",
            headers={"X-Edge-Token": token},
            json={"samples": [{"tag_id": "t6", "value": 90.0}]},
        )
        assert cleared.status_code == 200
        assert any(item["id"] == alarm_id and item["status"] == "رفع‌شده"
                   for item in cleared.json()["items"][0]["alarm_transitions"])
        resolved = next(item for item in client.get("/api/resources/alarms").json()["items"]
                        if item["id"] == alarm_id)
        assert resolved["condition_active"] is False
        assert resolved["status"] == "رفع‌شده"


def test_plc_tag_factory_ownership_is_enforced_and_returned():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        factory = client.post("/api/resources/factories", json={
            "name": "کارخانه دوم تست", "code": "FACTORY-CI-2", "status": "فعال"
        })
        assert factory.status_code == 201
        factory_id = factory.json()["id"]

        plc = client.post("/api/resources/plcs", json={
            "factory_id": factory_id,
            "name": "PLC کارخانه دوم",
            "protocol": "simulator",
            "address": "127.0.0.1:1503",
            "unit": "1",
        })
        assert plc.status_code == 201
        assert plc.json()["factory_id"] == factory_id

        mismatched_tag = client.post("/api/resources/tags", json={
            "factory_id": factory_id,
            "name": "TEST.Mismatched",
            "plc": "p1",
            "type": "float32",
            "address": "40101",
            "access": "read",
            "unit": "A",
        })
        assert mismatched_tag.status_code == 422

        inherited_tag = client.post("/api/resources/tags", json={
            "name": "TEST.FactoryTwo",
            "plc": plc.json()["id"],
            "type": "float32",
            "address": "40102",
            "access": "read",
            "unit": "A",
        })
        assert inherited_tag.status_code == 201
        assert inherited_tag.json()["factory_id"] == factory_id


def test_hmi_layout_validates_tag_bindings_and_write_access():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        valid = client.post("/api/resources/hmiPages", json={
            "name": "HMI test",
            "machine": "بانچر",
            "description": "layout validation",
            "layout": [
                {"type": "gauge", "tag_id": "t3", "label": "Current", "min": 0, "max": 300, "grid_col": 1, "grid_row": 1, "grid_w": 6, "grid_h": 4},
                {"type": "chart", "tag_id": "t3", "label": "Short trend", "chart_kind": "line", "history_seconds": 1, "grid_col": 7, "grid_row": 1, "grid_w": 6, "grid_h": 4},
                {"type": "write", "tag_id": "t7", "label": "Speed setpoint"},
            ],
            "status": "فعال",
        })
        assert valid.status_code == 201
        assert valid.json()["components"] == 3
        assert valid.json()["layout"][0]["grid_w"] == 6
        assert valid.json()["layout"][1]["grid_col"] == 7

        freeform_hmi = client.post("/api/resources/hmiPages", json={
            "name": "HMI freeform",
            "machine": "بانچر",
            "description": "free pixel positioning, arbitrary dimensions and overlapping cards",
            "layout": [
                {"type": "gauge", "tag_id": "t3", "x": 1040, "y": 620, "width": 160, "height": 300},
                {"type": "chart", "tag_id": "t3", "x": 1040, "y": 620, "width": 160, "height": 300},
            ],
            "status": "فعال",
        })
        assert freeform_hmi.status_code == 201, freeform_hmi.text
        assert freeform_hmi.json()["layout"][0]["x"] == 1040
        assert freeform_hmi.json()["layout"][0]["width"] == 160
        assert freeform_hmi.json()["layout"][1]["y"] == 620

        invalid_freeform = client.post("/api/resources/hmiPages", json={
            "name": "HMI out of canvas",
            "machine": "بانچر",
            "description": "card exceeds freeform canvas boundary",
            "layout": [{
                "type": "gauge", "tag_id": "t3",
                "x": 1081, "y": 620, "width": 120, "height": 300,
            }],
            "status": "فعال",
        })
        assert invalid_freeform.status_code == 422

        incomplete_freeform = client.post("/api/resources/hmiPages", json={
            "name": "HMI incomplete geometry",
            "machine": "بانچر",
            "description": "freeform geometry must include all four values",
            "layout": [{
                "type": "gauge", "tag_id": "t3",
                "x": 100, "y": 100, "width": 300,
            }],
            "status": "فعال",
        })
        assert incomplete_freeform.status_code == 422

        read_only_write = client.post("/api/resources/hmiPages", json={
            "name": "Invalid HMI",
            "machine": "بانچر",
            "description": "write to read-only tag",
            "layout": [{"type": "write", "tag_id": "t3"}],
            "status": "فعال",
        })
        assert read_only_write.status_code == 422

        missing_tag = client.post("/api/resources/hmiPages", json={
            "name": "Invalid HMI 2",
            "machine": "بانچر",
            "description": "unknown tag",
            "layout": [{"type": "value", "tag_id": "missing"}],
            "status": "فعال",
        })
        assert missing_tag.status_code == 422

        invalid_chart_range = client.post("/api/resources/hmiPages", json={
            "name": "Invalid chart range",
            "machine": "بانچر",
            "description": "unsupported history window",
            "layout": [{"type": "chart", "tag_id": "t3", "history_seconds": 7}],
            "status": "فعال",
        })
        assert invalid_chart_range.status_code == 422

        invalid_grid = client.post("/api/resources/hmiPages", json={
            "name": "Invalid HMI card geometry",
            "machine": "بانچر",
            "description": "card extends beyond twelve columns",
            "layout": [{
                "type": "gauge", "tag_id": "t3", "min": 0, "max": 100,
                "grid_col": 11, "grid_row": 1, "grid_w": 4, "grid_h": 3,
            }],
            "status": "فعال",
        })
        assert invalid_grid.status_code == 422

        invalid_row = client.post("/api/resources/hmiPages", json={
            "name": "Invalid HMI row",
            "machine": "بانچر",
            "description": "grid row out of accepted range",
            "layout": [{
                "type": "gauge", "tag_id": "t3", "min": 0, "max": 100,
                "grid_col": 1, "grid_row": 1001, "grid_w": 12, "grid_h": 3,
            }],
            "status": "فعال",
        })
        assert invalid_row.status_code == 422

        stacked_row = client.post("/api/resources/hmiPages", json={
            "name": "Valid HMI single column",
            "machine": "بانچر",
            "description": "full width card at a long row index",
            "layout": [{
                "type": "gauge", "tag_id": "t3", "min": 0, "max": 100,
                "grid_col": 1, "grid_row": 589, "grid_w": 12, "grid_h": 12,
            }],
            "status": "فعال",
        })
        assert stacked_row.status_code == 201, stacked_row.text
        assert stacked_row.json()["layout"][0]["grid_row"] == 589
        assert stacked_row.json()["layout"][0]["grid_w"] == 12


def test_resource_update_returns_factory_scope_and_user_update_is_safe():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        factory = client.post("/api/resources/factories", json={
            "name": "Factory Update Test", "code": "FACTORY-UPD", "status": "فعال"
        })
        assert factory.status_code == 201
        factory_id = factory.json()["id"]

        plc = client.post("/api/resources/plcs", json={
            "factory_id": factory_id, "name": "PLC update", "protocol": "simulator",
            "address": "127.0.0.1:1601", "unit": "1"
        })
        assert plc.status_code == 201
        updated_plc = client.patch(
            f"/api/resources/plcs/{plc.json()['id']}",
            json={"address": "127.0.0.1:1602"}
        )
        assert updated_plc.status_code == 200
        assert updated_plc.json()["factory_id"] == factory_id
        assert updated_plc.json()["address"] == "127.0.0.1:1602"

        created_user = client.post("/api/resources/users", json={
            "name": "User Update Test", "email": "user-update@example.local",
            "role": "Engineer", "status": "فعال", "factory_id": factory_id
        })
        assert created_user.status_code == 201
        user_id = created_user.json()["id"]
        updated_user = client.patch(
            f"/api/resources/users/{user_id}",
            json={"name": "Updated Engineer"}
        )
        assert updated_user.status_code == 200
        assert updated_user.json()["name"] == "Updated Engineer"


def test_edge_registration_requires_factory_scope():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        response = client.post("/api/edge/register", json={
            "name": "EDGE-WITHOUT-FACTORY", "note": "must be rejected"
        })
        assert response.status_code == 422


def test_disabled_alarm_rule_does_not_remain_active_and_can_be_reenabled():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        alarm = client.post("/api/resources/alarms", json={
            "name": "Disable test", "severity": "متوسط", "tag": "t6",
            "operator": ">", "threshold": 50, "status": "فعال"
        })
        assert alarm.status_code == 201
        alarm_id = alarm.json()["id"]
        edge = client.post("/api/edge/register", json={
            "name": "EDGE-DISABLE-CI", "factory_id": "f1"
        })
        assert edge.status_code == 201
        headers = {"X-Edge-Token": edge.json()["edge_token"]}

        first = client.post("/api/telemetry/edge/ingest", headers=headers,
                            json={"samples": [{"tag_id": "t6", "value": 70.0}]})
        assert first.status_code == 200
        assert any(item["id"] == alarm_id for item in first.json()["items"][0]["alarm_transitions"])

        disabled = client.patch(f"/api/resources/alarms/{alarm_id}", json={
            "status": "غیرفعال", "condition_active": False
        })
        assert disabled.status_code == 200

        while_disabled = client.post("/api/telemetry/edge/ingest", headers=headers,
                                     json={"samples": [{"tag_id": "t6", "value": 80.0}]})
        assert while_disabled.status_code == 200
        assert while_disabled.json()["items"][0]["alarm_transitions"] == []

        reenabled = client.patch(f"/api/resources/alarms/{alarm_id}", json={
            "status": "فعال", "condition_active": False
        })
        assert reenabled.status_code == 200
        after_enable = client.post("/api/telemetry/edge/ingest", headers=headers,
                                   json={"samples": [{"tag_id": "t6", "value": 90.0}]})
        assert any(item["id"] == alarm_id for item in after_enable.json()["items"][0]["alarm_transitions"])


def test_demo_simulator_never_overwrites_a_tag_owned_by_edge():
    import asyncio
    from app.routers.telemetry import demo_simulator_loop

    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        edge = client.post("/api/edge/register", json={
            "name": "EDGE-AUTHORITY-TEST", "factory_id": "f1", "note": "simulator must not overwrite"
        })
        assert edge.status_code == 201, edge.text
        token = edge.json()["edge_token"]
        ingested = client.post("/api/telemetry/edge/ingest", headers={"X-Edge-Token": token}, json={
            "samples": [{"tag_id": "t6", "value": 123.45}]
        })
        assert ingested.status_code == 200, ingested.text

        async def one_simulator_cycle():
            stop_event = asyncio.Event()
            task = asyncio.create_task(demo_simulator_loop(stop_event))
            await asyncio.sleep(0.05)
            stop_event.set()
            await task

        asyncio.run(one_simulator_cycle())
        latest_response = client.get("/api/telemetry/latest")
        assert latest_response.status_code == 200
        latest = next(item for item in latest_response.json()["items"] if item["tag_id"] == "t6")
        assert latest["value"] == 123.45
        assert latest["quality"] == "GOOD"
        assert latest["source"].startswith("edge:")


def test_factory_user_cannot_operate_on_foreign_factory_runs_batches_or_reports():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })

        product = client.post("/api/resources/products", json={
            "factory_id": "f2", "code": "F2-PROD", "name": "محصول کارخانه دوم",
            "unit": "m", "status": "فعال"
        })
        assert product.status_code == 201, product.text
        machine = client.post("/api/resources/machines", json={
            "factory_id": "f2", "name": "ماشین کارخانه دوم", "code": "F2-M1",
            "status": "آماده‌به‌کار"
        })
        assert machine.status_code == 201, machine.text
        order = client.post("/api/resources/orders", json={
            "factory_id": "f2", "code": "F2-ORDER-001",
            "product": "محصول کارخانه دوم", "machine": "ماشین کارخانه دوم",
            "quantity": 100, "unit": "m", "status": "آزادشده"
        })
        assert order.status_code == 201, order.text
        run = client.post("/api/resources/productionRuns", json={
            "factory_id": "f2", "order": "F2-ORDER-001",
            "machine": "ماشین کارخانه دوم", "product": "محصول کارخانه دوم",
            "target": 100, "unit": "m"
        })
        assert run.status_code == 201, run.text
        batch = client.post("/api/resources/batches", json={
            "factory_id": "f2", "code": "F2-BATCH-001", "formula": "F2-FORMULA",
            "target": 50
        })
        assert batch.status_code == 201, batch.text
        report = client.post("/api/resources/reports", json={
            "factory_id": "f2", "name": "گزارش کارخانه دوم", "type": "روزانه"
        })
        assert report.status_code == 201, report.text

        user = client.post("/api/resources/users", json={
            "factory_id": "f1", "name": "مدیر تولید کارخانه اول",
            "email": "factory-one-manager@example.local",
            "role": "Production Manager", "status": "فعال"
        })
        assert user.status_code == 201, user.text
        temporary_password = user.json()["temporary_password"]
        client.post("/api/auth/logout")
        login = client.post("/api/auth/login", json={
            "email": "factory-one-manager@example.local",
            "password": temporary_password
        })
        assert login.status_code == 200, login.text

        run_id = run.json()["id"]
        batch_id = batch.json()["id"]
        report_id = report.json()["id"]
        assert client.post(f"/api/operations/production-runs/{run_id}/start").status_code == 404
        assert client.get(f"/api/operations/production-runs/{run_id}/events").status_code == 404
        assert client.get(f"/api/operations/batches/{batch_id}/weighments").status_code == 404
        assert client.post(f"/api/operations/reports/{report_id}/run",
                           json={"parameters": {}}).status_code == 404
        assert client.get(f"/api/operations/reports/{report_id}/executions").status_code == 404



def test_physical_plc_routes_test_connection_and_manual_poll_without_hardware(monkeypatch):
    from app.routers import plc as plc_router

    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        assert login.status_code == 200

        created = client.post("/api/resources/plcs", json={
            "name": "PLC TCP QA",
            "protocol": "modbus-tcp",
            "address": "127.0.0.1:502",
            "unit": 1,
            "poll": "500 ms",
            "enabled": False,
            "allow_writes": False,
            "safety_confirmed": False,
            "factory_id": "f1",
        })
        assert created.status_code == 201, created.text
        plc_id = created.json()["id"]

        unsafe_plc = client.post("/api/resources/plcs", json={
            "name": "PLC Unsafe Write",
            "protocol": "modbus-tcp",
            "address": "127.0.0.1:502",
            "unit": 1,
            "allow_writes": True,
            "safety_confirmed": False,
            "factory_id": "f1",
        })
        assert unsafe_plc.status_code == 422

        bad_map = client.post("/api/resources/tags", json={
            "name": "Bad coil float",
            "plc": plc_id,
            "type": "float32",
            "address": "00001",
            "access": "read",
            "unit": "A",
        })
        assert bad_map.status_code == 422

        monkeypatch.setattr(
            plc_router, "test_plc_connection",
            lambda plc: {"connected": True, "protocol": plc["protocol"]},
        )
        tested = client.post(f"/api/plc/{plc_id}/test")
        assert tested.status_code == 200, tested.text
        assert tested.json()["connected"] is True
        assert tested.json()["status"] == "ONLINE"

        monkeypatch.setattr(
            plc_router, "poll_plc_once",
            lambda selected, factory: {
                "plc_id": selected, "status": "ONLINE", "read_count": 3,
                "tag_count": 3, "errors": [], "sampled_at": "2026-01-01T00:00:00+00:00",
            },
        )
        polled = client.post(f"/api/plc/{plc_id}/poll")
        assert polled.status_code == 200, polled.text
        assert polled.json()["read_count"] == 3

        status = client.get(f"/api/plc/{plc_id}/status")
        assert status.status_code == 200
        assert status.json()["connection_status"] == "ONLINE"


def test_physical_plc_write_is_disabled_by_default():
    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        response = client.post("/api/plc/tags/t1/write", json={
            "value": True,
            "confirmation": "WRITE TO PLC",
            "reason": "CI safety gate test",
        })
        assert response.status_code == 403
        assert "غیرفعال" in response.json()["detail"]



def test_plc_poller_persists_good_and_bad_quality_and_latest_live_value(monkeypatch):
    from app import plc_service

    with TestClient(app) as client:
        client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local", "password": "demo1234"
        })
        plc_response = client.post("/api/resources/plcs", json={
            "name": "PLC Polling QA",
            "protocol": "modbus-tcp",
            "address": "127.0.0.1:502",
            "unit": 1,
            "poll": "500 ms",
            "history_interval": "5 s",
            "enabled": False,
            "allow_writes": False,
            "safety_confirmed": False,
            "factory_id": "f1",
        })
        assert plc_response.status_code == 201, plc_response.text
        plc_id = plc_response.json()["id"]

        good_tag = client.post("/api/resources/tags", json={
            "name": "QA temperature",
            "plc": plc_id,
            "type": "float32",
            "address": "40001",
            "access": "read",
            "unit": "°C",
        })
        bad_tag = client.post("/api/resources/tags", json={
            "name": "QA pressure",
            "plc": plc_id,
            "type": "int16",
            "address": "40003",
            "access": "read",
            "unit": "bar",
        })
        assert good_tag.status_code == 201, good_tag.text
        assert bad_tag.status_code == 201, bad_tag.text
        good_id, bad_id = good_tag.json()["id"], bad_tag.json()["id"]

        monkeypatch.setattr(plc_service, "read_plc_tags", lambda _plc, _tags: {
            good_id: {"ok": True, "value": 25.5},
            bad_id: {"ok": False, "error": "simulated read timeout"},
        })
        result = plc_service.poll_plc_once(plc_id, "f1")
        assert result["status"] == "DEGRADED"
        assert result["read_count"] == 1
        assert result["tag_count"] == 2

        latest = client.get("/api/telemetry/latest")
        assert latest.status_code == 200, latest.text
        by_id = {item["tag_id"]: item for item in latest.json()["items"]}
        assert by_id[good_id]["value"] == 25.5
        assert by_id[good_id]["quality"] == "GOOD"
        assert by_id[good_id]["source"] == f"plc:{plc_id}"
        assert by_id[bad_id]["quality"] == "BAD"
        assert by_id[bad_id]["source"] == f"plc:{plc_id}"



def test_plc_history_interval_throttles_persistent_samples():
    from app.plc_service import _history_due

    saved = {"last_history_at": "2026-11-17T10:00:00+00:00"}
    assert _history_due(saved, "2026-11-17T10:00:04+00:00", 5) is False
    assert _history_due(saved, "2026-11-17T10:00:05+00:00", 5) is True
    assert _history_due({}, "2026-11-17T10:00:00+00:00", 5) is True


def test_batch_weighments_apply_configured_zero_tolerance_and_require_all_hoppers():
    from uuid import uuid4

    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local",
            "password": "demo1234",
        })
        assert login.status_code == 200

        suffix = uuid4().hex[:8]
        config_response = client.post("/api/resources/batchConfigs", json={
            "code": f"BATCH-TOL-{suffix}",
            "name": "Zero tolerance test",
            "loadcell": "TEST-LOADCELL",
            "samples": 5,
            "tolerance_percent": 0,
            "stabilization_seconds": 1,
            "formula": f"FORMULA-TOL-{suffix}",
            "hoppers": [
                {"bin": "H1", "material": "PVC", "ratio": 60, "target": 60},
                {"bin": "H2", "material": "Additive", "ratio": 40, "target": 40},
            ],
        })
        assert config_response.status_code == 201, config_response.text
        config = config_response.json()

        batch_response = client.post("/api/resources/batches", json={
            "code": f"BATCH-RUN-{suffix}",
            "formula": config["formula"],
            "target": 100,
            "config_id": config["id"],
            "tolerance_percent": 0,
            "hoppers": config["hoppers"],
        })
        assert batch_response.status_code == 201, batch_response.text
        batch_id = batch_response.json()["id"]
        assert client.post(f"/api/operations/batches/{batch_id}/start").status_code == 200

        incomplete = client.post(
            f"/api/operations/batches/{batch_id}/weighments",
            json={"items": [
                {"hopper_key": "H1", "material": "PVC", "target_weight": 60, "actual_weight": 60}
            ]},
        )
        assert incomplete.status_code == 422

        outside_zero_tolerance = client.post(
            f"/api/operations/batches/{batch_id}/weighments",
            json={"items": [
                {"hopper_key": "H1", "material": "PVC", "target_weight": 60, "actual_weight": 60.1},
                {"hopper_key": "H2", "material": "Additive", "target_weight": 40, "actual_weight": 40},
            ]},
        )
        assert outside_zero_tolerance.status_code == 201, outside_zero_tolerance.text
        measured = {item["hopper_key"]: item for item in outside_zero_tolerance.json()["items"]}
        assert measured["H1"]["result"] == "OUT_OF_TOLERANCE"
        assert measured["H2"]["result"] == "IN_TOLERANCE"
        assert client.post(f"/api/operations/batches/{batch_id}/complete").status_code == 409

        corrected = client.post(
            f"/api/operations/batches/{batch_id}/weighments",
            json={"items": [
                {"hopper_key": "H1", "material": "PVC", "target_weight": 60, "actual_weight": 60},
                {"hopper_key": "H2", "material": "Additive", "target_weight": 40, "actual_weight": 40},
            ]},
        )
        assert corrected.status_code == 201, corrected.text
        assert all(item["result"] == "IN_TOLERANCE" for item in corrected.json()["items"])
        completed = client.post(f"/api/operations/batches/{batch_id}/complete")
        assert completed.status_code == 200, completed.text
        assert completed.json()["status"] == "تکمیل‌شده"


def test_telemetry_history_supports_seconds_and_legacy_hours_windows():
    from datetime import datetime, timedelta, timezone

    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local",
            "password": "demo1234",
        })
        assert login.status_code == 200

        plc = client.post("/api/resources/plcs", json={
            "name": "History range test PLC",
            "protocol": "simulator",
            "address": "127.0.0.1:1505",
            "unit": 1,
            "factory_id": "f1",
        })
        assert plc.status_code == 201, plc.text

        tag = client.post("/api/resources/tags", json={
            "name": "History range test tag",
            "plc": plc.json()["id"],
            "type": "float32",
            "address": "40001",
            "access": "read",
            "unit": "bar",
        })
        assert tag.status_code == 201, tag.text
        tag_id = tag.json()["id"]

        edge = client.post("/api/edge/register", json={
            "name": "History range test edge",
            "factory_id": "f1",
        })
        assert edge.status_code == 201, edge.text

        now = datetime.now(timezone.utc)
        old_sample = (now - timedelta(seconds=90)).isoformat()
        recent_sample = (now - timedelta(seconds=20)).isoformat()
        ingested = client.post(
            "/api/telemetry/edge/ingest",
            headers={"X-Edge-Token": edge.json()["edge_token"]},
            json={"samples": [
                {"tag_id": tag_id, "value": 11.5, "sampled_at": old_sample},
                {"tag_id": tag_id, "value": 22.5, "sampled_at": recent_sample},
            ]},
        )
        assert ingested.status_code == 200, ingested.text

        short = client.get(f"/api/telemetry/history?tag_id={tag_id}&seconds=60")
        assert short.status_code == 200, short.text
        assert [item["value"] for item in short.json()["items"]] == [22.5]

        minute_window = client.get(f"/api/telemetry/history?tag_id={tag_id}&seconds=120")
        assert minute_window.status_code == 200, minute_window.text
        assert [item["value"] for item in minute_window.json()["items"]] == [11.5, 22.5]

        legacy_hours = client.get(f"/api/telemetry/history?tag_id={tag_id}&hours=1")
        assert legacy_hours.status_code == 200, legacy_hours.text
        assert [item["value"] for item in legacy_hours.json()["items"]] == [11.5, 22.5]

        invalid = client.get(f"/api/telemetry/history?tag_id={tag_id}&seconds=0")
        assert invalid.status_code == 422

        ambiguous = client.get(f"/api/telemetry/history?tag_id={tag_id}&seconds=60&hours=1")
        assert ambiguous.status_code == 422

def test_hmi_page_and_widget_theme_presets_are_validated_and_persisted():
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local",
            "password": "demo1234",
        })
        assert login.status_code == 200

        created = client.post("/api/resources/hmiPages", json={
            "name": "Themed HMI",
            "machine": "بانچر",
            "description": "Page and widget theme persistence",
            "theme": "dark",
            "layout": [
                {"type": "value", "tag_id": "t3", "theme": "blue"},
                {"type": "chart", "tag_id": "t6", "theme": "inherit", "history_seconds": 3600},
            ],
            "status": "فعال",
        })
        assert created.status_code == 201, created.text
        assert created.json()["theme"] == "dark"
        assert created.json()["layout"][0]["theme"] == "blue"
        assert created.json()["layout"][1]["theme"] == "inherit"

        invalid_page_theme = client.post("/api/resources/hmiPages", json={
            "name": "Invalid page theme",
            "machine": "بانچر",
            "description": "Reject untrusted CSS values",
            "theme": "url(javascript:alert(1))",
            "layout": [{"type": "value", "tag_id": "t3"}],
            "status": "فعال",
        })
        assert invalid_page_theme.status_code == 422

        invalid_widget_theme = client.post("/api/resources/hmiPages", json={
            "name": "Invalid widget theme",
            "machine": "بانچر",
            "description": "Reject untrusted per-widget CSS values",
            "theme": "light",
            "layout": [{"type": "value", "tag_id": "t3", "theme": "expression(alert(1))"}],
            "status": "فعال",
        })
        assert invalid_widget_theme.status_code == 422

def test_hmi_media_upload_and_secure_retrieval():
    from app.database import connect
    from app.routers.hmi_media import MEDIA_DIR

    media_id = None
    media_path = None
    video_id = None
    video_path = None
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"test-image-bytes"
    mp4_bytes = b"\x00\x00\x00\x18ftypisom" + b"test-video-bytes"
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local",
            "password": "demo1234",
        })
        assert login.status_code == 200

        uploaded = client.post(
            "/api/hmi/media",
            files={"file": ("operator-panel.png", png_bytes, "image/png")},
        )
        assert uploaded.status_code == 200, uploaded.text
        asset = uploaded.json()
        media_id = asset["id"]
        media_path = MEDIA_DIR / (media_id + ".png")
        assert len(media_id) == 32
        assert asset["media_type"] == "image"
        assert asset["content_type"] == "image/png"
        assert asset["filename"] == "operator-panel.png"
        assert media_path.is_file()

        video_upload = client.post(
            "/api/hmi/media",
            files={"file": ("machine-cycle.mp4", mp4_bytes, "video/mp4")},
        )
        assert video_upload.status_code == 200, video_upload.text
        video_asset = video_upload.json()
        video_id = video_asset["id"]
        video_path = MEDIA_DIR / (video_id + ".mp4")
        assert video_asset["media_type"] == "video"
        assert video_asset["content_type"] == "video/mp4"
        assert video_path.is_file()
        video_retrieved = client.get(video_asset["url"])
        assert video_retrieved.status_code == 200
        assert video_retrieved.headers["content-type"].startswith("video/mp4")
        assert video_retrieved.content == mp4_bytes

        retrieved = client.get(asset["url"])
        assert retrieved.status_code == 200
        assert retrieved.headers["content-type"].startswith("image/png")
        assert retrieved.content == png_bytes
        assert retrieved.headers["x-content-type-options"] == "nosniff"

        saved_page = client.post("/api/resources/hmiPages", json={
            "name": "Media HMI",
            "machine": "بانچر",
            "description": "Persistent uploaded visual",
            "theme": "industrial",
            "layout": [{
                "type": "media",
                "media_id": media_id,
                "media_fit": "cover",
                "media_loop": True,
                "media_muted": True,
                "media_controls": True,
                "media_autoplay": False,
            }],
            "status": "فعال",
        })
        assert saved_page.status_code == 201, saved_page.text
        assert saved_page.json()["layout"][0]["media_id"] == media_id

        invalid_reference = client.post("/api/resources/hmiPages", json={
            "name": "Invalid media reference",
            "machine": "بانچر",
            "description": "Must reject nonexistent media IDs",
            "layout": [{"type": "media", "media_id": "0" * 32}],
            "status": "فعال",
        })
        assert invalid_reference.status_code == 422

        unsafe_svg = client.post(
            "/api/hmi/media",
            files={"file": ("unsafe.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "image/svg+xml")},
        )
        assert unsafe_svg.status_code == 422

        unsupported = client.post(
            "/api/hmi/media",
            files={"file": ("notes.txt", b"not a visual asset", "text/plain")},
        )
        assert unsupported.status_code == 415

        assert client.post("/api/auth/logout").status_code == 200
        unauthorized = client.get(asset["url"])
        assert unauthorized.status_code == 401

    if media_id:
        with connect() as db:
            db.execute("DELETE FROM hmi_media WHERE id=?", (media_id,))
    if media_path:
        media_path.unlink(missing_ok=True)
    if video_id:
        with connect() as db:
            db.execute("DELETE FROM hmi_media WHERE id=?", (video_id,))
    if video_path:
        video_path.unlink(missing_ok=True)


def test_live_telemetry_websocket_supports_one_second_snapshots():
    import time

    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local",
            "password": "demo1234",
        })
        assert login.status_code == 200

        with client.websocket_connect("/api/telemetry/ws/live?interval_ms=1000") as websocket:
            first = websocket.receive_json()
            first_received = time.monotonic()
            second = websocket.receive_json()
            elapsed = time.monotonic() - first_received

        assert first["type"] == "telemetry.snapshot"
        assert second["type"] == "telemetry.snapshot"
        assert 0.85 <= elapsed <= 2.5, f"Expected one-second WebSocket cadence, received {elapsed:.3f}s"
