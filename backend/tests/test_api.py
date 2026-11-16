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
