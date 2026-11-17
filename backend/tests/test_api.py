import os
from pathlib import Path

TEST_DB = Path(__file__).parent / "test_scada.sqlite3"
os.environ["SCADA_DB_PATH"] = str(TEST_DB)
os.environ["SCADA_SECRET_KEY"] = "test-secret-key-which-is-long-enough-for-ci"
os.environ["SCADA_DEMO_TELEMETRY"] = "false"

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
            "components":"12","status":"فعال"
        })
        assert hmi.status_code == 201
        assert hmi.json()["components"] == 12

        calendar = client.post("/api/resources/machineCalendars", json={
            "machine":"بانچر","year":"1405","month":"آبان",
            "days":[{"day":"شنبه","enabled":True,"start":"08:00","end":"17:00","break":"01:00"}]
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

        control_plan = client.post("/api/resources/controlPlans", json={
            "product":"محصول تست","process":"اکستروژن","version":"1",
            "sampling_interval":"هر ۳۰ دقیقه","sample_count":"3",
            "parameters":[{"parameter":"قطر","nominal":"2.4","min":"2.3","max":"2.5","unit":"mm","method":"اندازه‌گیری"}]
        })
        assert control_plan.status_code == 201
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
            "role": "Engineer", "status": "فعال"
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
                {"type": "gauge", "tag_id": "t3", "label": "Current", "min": 0, "max": 300},
                {"type": "write", "tag_id": "t7", "label": "Speed setpoint"},
            ],
            "status": "فعال",
        })
        assert valid.status_code == 201
        assert valid.json()["components"] == 2

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
