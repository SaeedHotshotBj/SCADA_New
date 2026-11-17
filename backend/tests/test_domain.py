from fastapi.testclient import TestClient

from app.main import app


def _login(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={
        "email": "admin@demo-cable.local", "password": "demo1234"
    })
    assert response.status_code == 200, response.text


def test_production_quantity_is_persisted_and_cannot_be_recorded_after_completion():
    with TestClient(app) as client:
        _login(client)
        created = client.post("/api/resources/productionRuns", json={
            "order": "PO-DOMAIN-001", "machine": "بانچر",
            "product": "کابل آزمایشی", "target": 1000, "unit": "m"
        })
        assert created.status_code == 201, created.text
        run_id = created.json()["id"]
        assert client.post(f"/api/operations/production-runs/{run_id}/start").status_code == 200
        quantity = client.post(f"/api/operations/production-runs/{run_id}/quantity", json={
            "quantity": 120, "scrap_quantity": 2, "unit": "m", "note": "domain test"
        })
        assert quantity.status_code == 201, quantity.text
        assert quantity.json()["quantity_actual"] == 120
        assert quantity.json()["scrap_quantity"] == 2
        events = client.get(f"/api/operations/production-runs/{run_id}/events")
        assert events.status_code == 200
        assert any(event["event"] == "QUANTITY" for event in events.json())
        assert client.post(f"/api/operations/production-runs/{run_id}/complete").status_code == 200
        denied = client.post(f"/api/operations/production-runs/{run_id}/quantity", json={
            "quantity": 1, "scrap_quantity": 0
        })
        assert denied.status_code == 409


def test_batch_weighments_enforce_tolerance_before_completion():
    with TestClient(app) as client:
        _login(client)
        created = client.post("/api/resources/batches", json={
            "code": "BATCH-DOMAIN-001", "formula": "TEST-FORMULA",
            "target": 100, "tolerance_percent": 0.5
        })
        assert created.status_code == 201, created.text
        batch_id = created.json()["id"]
        assert client.post(f"/api/operations/batches/{batch_id}/start").status_code == 200
        bad = client.post(f"/api/operations/batches/{batch_id}/weighments", json={
            "items": [{
                "hopper_key": "H1", "material": "PVC",
                "target_weight": 100, "actual_weight": 102, "unit": "kg"
            }]
        })
        assert bad.status_code == 201, bad.text
        assert bad.json()["items"][0]["result"] == "OUT_OF_TOLERANCE"
        blocked = client.post(f"/api/operations/batches/{batch_id}/complete")
        assert blocked.status_code == 409
        good = client.post(f"/api/operations/batches/{batch_id}/weighments", json={
            "items": [{
                "hopper_key": "H1", "material": "PVC",
                "target_weight": 100, "actual_weight": 100.2, "unit": "kg"
            }]
        })
        assert good.status_code == 201, good.text
        completed = client.post(f"/api/operations/batches/{batch_id}/complete")
        assert completed.status_code == 200
        assert completed.json()["status"] == "تکمیل‌شده"


def test_edge_ingestion_updates_tag_and_records_source_quality():
    with TestClient(app) as client:
        _login(client)
        edge = client.post("/api/edge/register", json={
            "name": "EDGE-DOMAIN-TEST", "factory_id": "f1", "note": "integration test"
        })
        assert edge.status_code == 201, edge.text
        token = edge.json()["edge_token"]
        ingested = client.post("/api/edge/ingest", headers={"X-Edge-Token": token}, json={
            "sequence": 10,
            "samples": [{"tag_id": "t6", "value": 111.25, "quality": "GOOD"}]
        })
        assert ingested.status_code == 202, ingested.text
        assert ingested.json()["accepted"] == 1
        history = client.get("/api/telemetry/history", params={"tag_id": "t6", "hours": 24})
        assert history.status_code == 200
        assert any(item["value"] == 111.25 and item["quality"] == "GOOD"
                   and item["source"].startswith("edge:") for item in history.json()["items"])


def test_qc_measurement_and_workflow_rejection_are_auditable_transitions():
    with TestClient(app) as client:
        _login(client)
        qc = client.post("/api/resources/qc", json={
            "code": "QC-DOMAIN-001", "product": "محصول تست",
            "machine": "اکسترودر", "decision": "مشروط"
        })
        assert qc.status_code == 201, qc.text
        result = client.post(f"/api/operations/qc/{qc.json()['id']}/measurements", json={
            "parameter": "قطر عایق", "actual": 2.6, "minimum": 2.3,
            "maximum": 2.5, "nominal": 2.4, "unit": "mm"
        })
        assert result.status_code == 201, result.text
        assert result.json()["result"] == "FAIL"

        task = client.post("/api/resources/workflowTasks", json={
            "title": "وظیفه قابل رد", "status": "در انتظار"
        })
        assert task.status_code == 201, task.text
        decision = client.post(
            f"/api/operations/workflow-tasks/{task.json()['id']}/decision",
            json={"decision": "reject", "note": "عدم انطباق در آزمون"}
        )
        assert decision.status_code == 200, decision.text
        assert decision.json()["status"] == "ردشده"


def test_analytics_endpoints_return_persisted_records_not_static_dashboard_numbers():
    with TestClient(app) as client:
        _login(client)
        overview = client.get("/api/analytics/overview")
        assert overview.status_code == 200, overview.text
        metrics = overview.json()["metrics"]
        assert metrics["factory_count"] >= 1
        assert "recorded_production_quantity" in metrics

        production = client.get("/api/analytics/production")
        quality = client.get("/api/analytics/quality")
        energy = client.get("/api/analytics/energy", params={"hours": 24})
        assert production.status_code == 200
        assert quality.status_code == 200
        assert energy.status_code == 200
        assert production.json()["mode"] == "APPLICATION_DATA"
        assert "acceptance_percent" in quality.json()["summary"]
        assert "items" in energy.json()
