from fastapi.testclient import TestClient

from app.main import app


def _login(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={
        "email": "admin@demo-cable.local", "password": "demo1234"
    })
    assert response.status_code == 200, response.text


def test_production_quantity_events_and_completion_are_persisted():
    with TestClient(app) as client:
        _login(client)
        order = client.post("/api/resources/orders", json={
            "code": "PO-QTY-TEST", "product": "کابل قدرت NYY 4×16mm²",
            "machine": "بانچر", "quantity": 100, "unit": "m", "status": "آزادشده"
        })
        assert order.status_code == 201, order.text
        created = client.post("/api/resources/productionRuns", json={
            "order": "PO-QTY-TEST", "machine": "بانچر",
            "product": "کابل قدرت NYY 4×16mm²", "target": 100, "unit": "m"
        })
        assert created.status_code == 201, created.text
        run_id = created.json()["id"]
        assert client.post(f"/api/operations/production-runs/{run_id}/start").status_code == 200

        recorded = client.post(f"/api/operations/production-runs/{run_id}/quantity", json={
            "quantity": 25, "scrap_quantity": 1.5, "unit": "m", "note": "test sample"
        })
        assert recorded.status_code == 201, recorded.text
        assert recorded.json()["quantity_actual"] == 25
        assert recorded.json()["scrap_quantity"] == 1.5
        assert recorded.json()["progress"] == 25

        events = client.get(f"/api/operations/production-runs/{run_id}/events")
        assert events.status_code == 200
        assert [event["event"] for event in events.json()] == ["START", "QUANTITY"]

        completed = client.post(f"/api/operations/production-runs/{run_id}/complete")
        assert completed.status_code == 200
        assert completed.json()["status"] == "تکمیل‌شده"
        denied = client.post(f"/api/operations/production-runs/{run_id}/quantity", json={
            "quantity": 1, "unit": "m"
        })
        assert denied.status_code == 409


def test_batch_weighments_enforce_hopper_coverage_and_tolerance():
    with TestClient(app) as client:
        _login(client)
        config = client.post("/api/resources/batchConfigs", json={
            "code": "BATCH-CONFIG-QA", "name": "خط تست", "loadcell": "LOADCELL-QA",
            "formula": "فرمول QA", "samples": 5, "tolerance_percent": 0.5,
            "stabilization_seconds": 3,
            "hoppers": [
                {"bin": "H1", "material": "PVC", "ratio": 60, "target": 60},
                {"bin": "H2", "material": "افزودنی", "ratio": 40, "target": 40}
            ]
        })
        assert config.status_code == 201, config.text
        batch = client.post("/api/resources/batches", json={
            "code": "BATCH-QA-001", "formula": "فرمول QA", "target": 100,
            "config_id": config.json()["id"], "tolerance_percent": 0.5
        })
        assert batch.status_code == 201, batch.text
        batch_id = batch.json()["id"]
        assert client.post(f"/api/operations/batches/{batch_id}/start").status_code == 200

        incomplete = client.post(f"/api/operations/batches/{batch_id}/weighments", json={
            "items": [{"hopper_key": "H1", "material": "PVC",
                       "target_weight": 60, "actual_weight": 60.1, "unit": "kg"}]
        })
        assert incomplete.status_code == 422

        out_of_tolerance = client.post(f"/api/operations/batches/{batch_id}/weighments", json={
            "items": [
                {"hopper_key": "H1", "material": "PVC", "target_weight": 60, "actual_weight": 62, "unit": "kg"},
                {"hopper_key": "H2", "material": "افزودنی", "target_weight": 40, "actual_weight": 40, "unit": "kg"}
            ]
        })
        assert out_of_tolerance.status_code == 201, out_of_tolerance.text
        assert out_of_tolerance.json()["items"][0]["result"] == "OUT_OF_TOLERANCE"
        assert client.post(f"/api/operations/batches/{batch_id}/complete").status_code == 409

        corrected = client.post(f"/api/operations/batches/{batch_id}/weighments", json={
            "items": [
                {"hopper_key": "H1", "material": "PVC", "target_weight": 60, "actual_weight": 60.1, "unit": "kg"},
                {"hopper_key": "H2", "material": "افزودنی", "target_weight": 40, "actual_weight": 39.9, "unit": "kg"}
            ]
        })
        assert corrected.status_code == 201, corrected.text
        history = client.get(f"/api/operations/batches/{batch_id}/weighments")
        assert history.status_code == 200 and len(history.json()["items"]) == 4
        completed = client.post(f"/api/operations/batches/{batch_id}/complete")
        assert completed.status_code == 200
        assert completed.json()["status"] == "تکمیل‌شده"


def test_qc_measurements_are_persisted_and_failures_change_decision():
    with TestClient(app) as client:
        _login(client)
        qc = client.post("/api/resources/qc", json={
            "code": "QC-MEASURE-001", "product": "کابل قدرت NYY 4×16mm²",
            "machine": "اکسترودر عایق", "decision": "مشروط"
        })
        assert qc.status_code == 201, qc.text
        result = client.post(f"/api/operations/qc/{qc.json()['id']}/measurements", json={
            "parameter": "قطر عایق", "actual": 2.6, "nominal": 2.4,
            "minimum": 2.3, "maximum": 2.5, "unit": "mm", "note": "test"
        })
        assert result.status_code == 201, result.text
        assert result.json()["result"] == "FAIL"
        record = client.get(f"/api/resources/qc/{qc.json()['id']}")
        assert record.status_code == 200
        assert record.json()["decision"] == "رد"
        assert len(record.json()["measurements"]) == 1
