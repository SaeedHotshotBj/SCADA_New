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


def test_factory_admin_cannot_read_or_modify_another_factory_resources():
    with TestClient(app) as admin:
        _login(admin)
        created_user = admin.post("/api/resources/users", json={
            "name": "Factory One Admin", "email": "factory-one@example.local",
            "role": "Factory Admin", "status": "فعال", "factory_id": "f1"
        })
        assert created_user.status_code == 201, created_user.text
        password = created_user.json()["temporary_password"]

        foreign_tag = admin.post("/api/resources/tags", json={
            "name": "FOREIGN.TAG", "plc": "p1", "type": "float32",
            "address": "40090", "access": "read", "factory_id": "f2"
        })
        assert foreign_tag.status_code == 201, foreign_tag.text
        foreign_tag_id = foreign_tag.json()["id"]

    with TestClient(app) as factory:
        login = factory.post("/api/auth/login", json={
            "email": "factory-one@example.local", "password": password
        })
        assert login.status_code == 200, login.text
        assert login.json()["user"]["must_change_password"] is True

        factories = factory.get("/api/resources/factories")
        assert factories.status_code == 200
        assert {item["id"] for item in factories.json()["items"]} == {"f1"}

        detail = factory.get(f"/api/resources/tags/{foreign_tag_id}")
        assert detail.status_code == 404
        update = factory.patch(f"/api/resources/tags/{foreign_tag_id}", json={"unit": "forbidden"})
        assert update.status_code == 404
        delete = factory.delete(f"/api/resources/tags/{foreign_tag_id}")
        assert delete.status_code == 404


def test_report_filters_are_applied_to_persisted_production_runs():
    with TestClient(app) as client:
        _login(client)
        # The API integration suite shares its CI SQLite file; isolate this
        # assertion from production runs created by earlier test cases.
        existing = client.get("/api/resources/productionRuns")
        assert existing.status_code == 200, existing.text
        for row in existing.json()["items"]:
            deleted = client.delete(f"/api/resources/productionRuns/{row['id']}")
            assert deleted.status_code == 204, deleted.text
        created_ids = []
        for machine in ["بانچر", "کشش مفتول"]:
            created = client.post("/api/resources/productionRuns", json={
                "order": f"PO-REPORT-{len(created_ids) + 1}",
                "machine": machine, "product": "کابل آزمایشی", "target": 1000, "unit": "m"
            })
            assert created.status_code == 201, created.text
            run_id = created.json()["id"]
            created_ids.append(run_id)
            assert client.post(f"/api/operations/production-runs/{run_id}/start").status_code == 200
            assert client.post(f"/api/operations/production-runs/{run_id}/quantity", json={
                "quantity": 25, "unit": "m"
            }).status_code == 201

        report = client.post("/api/operations/reports/rp1/run", json={
            "parameters": {"machine": "بانچر"}
        })
        assert report.status_code == 202, report.text
        tables = report.json()["result"]["tables"]
        assert len(tables["production_runs"]) == 1
        assert tables["production_runs"][0]["machine"] == "بانچر"
        assert report.json()["result"]["summary"]["produced_quantity"] == 25


def test_edge_alarm_rule_triggers_acknowledges_and_returns_to_normal():
    with TestClient(app) as client:
        _login(client)
        alarm = client.post("/api/resources/alarms", json={
            "name": "سرعت بالا", "severity": "زیاد", "tag": "t6",
            "operator": ">", "threshold": 100, "deadband": 5,
            "message": "سرعت از حد مجاز عبور کرد", "status": "فعال"
        })
        assert alarm.status_code == 201, alarm.text

        edge = client.post("/api/edge/register", json={
            "name": "EDGE-ALARM-TEST", "factory_id": "f1"
        })
        assert edge.status_code == 201, edge.text
        token = edge.json()["edge_token"]

        high = client.post("/api/edge/ingest", headers={"X-Edge-Token": token}, json={
            "samples": [{"tag_id": "t6", "value": 120, "quality": "GOOD"}]
        })
        assert high.status_code == 202, high.text
        events = client.get("/api/telemetry/alarms/events")
        assert events.status_code == 200
        active = [item for item in events.json()["items"] if item["alarm_id"] == alarm.json()["id"]]
        assert len(active) == 1
        assert active[0]["state"] == "ACTIVE"
        event_id = active[0]["id"]

        ack = client.post(f"/api/telemetry/alarms/events/{event_id}/acknowledge")
        assert ack.status_code == 200, ack.text
        assert ack.json()["state"] == "ACKNOWLEDGED"

        normal = client.post("/api/edge/ingest", headers={"X-Edge-Token": token}, json={
            "samples": [{"tag_id": "t6", "value": 90, "quality": "GOOD"}]
        })
        assert normal.status_code == 202, normal.text
        events = client.get("/api/telemetry/alarms/events")
        returned = next(item for item in events.json()["items"] if item["id"] == event_id)
        assert returned["state"] == "RETURNED"


def test_factory_configuration_dictionaries_are_persisted_and_bootstrapped():
    with TestClient(app) as client:
        _login(client)
        entries = [
            ("downtimeReasons", {"code": "DWN-TEST", "reason": "توقف آزمون", "group": "فنی"}),
            ("inputTypes", {"code": "IN-TEST", "name": "ورودی تست", "unit": "kg"}),
            ("stopLines", {"code": "SL-TEST", "name": "خط توقف تست"}),
            ("outputTypes", {"code": "OUT-TEST", "name": "قرقره تست", "unit": "kg"}),
            ("documentSequences", {"document": "TEST", "prefix": "TS", "year_pattern": "{YEAR}", "sequence_length": 6}),
            ("productionRules", {"code": "RULE-TEST", "name": "قاعده تست", "rule": "ثبت مقدار قبل از تکمیل", "status": "فعال"}),
        ]
        created = {}
        for collection, payload in entries:
            response = client.post(f"/api/resources/{collection}", json=payload)
            assert response.status_code == 201, response.text
            created[collection] = response.json()["id"]

        bootstrap = client.get("/api/bootstrap")
        assert bootstrap.status_code == 200, bootstrap.text
        for collection, _ in entries:
            assert any(row["id"] == created[collection] for row in bootstrap.json()["data"][collection])

        invalid = client.post("/api/resources/documentSequences", json={
            "document": "BAD", "prefix": "BAD", "year_pattern": "{YEAR}", "sequence_length": -1
        })
        assert invalid.status_code == 422


def test_factory_scope_protects_operations_events_and_report_execution_history():
    with TestClient(app) as client:
        _login(client)
        foreign_run = client.post("/api/resources/productionRuns", json={
            "order": "PO-FOREIGN-001", "machine": "خط دیگر",
            "product": "محصول دیگر", "target": 100, "unit": "m", "factory_id": "f2"
        })
        assert foreign_run.status_code == 201, foreign_run.text
        foreign_run_id = foreign_run.json()["id"]
        foreign_report = client.post("/api/resources/reports", json={
            "name": "گزارش کارخانه دیگر", "type": "روزانه", "factory_id": "f2"
        })
        assert foreign_report.status_code == 201, foreign_report.text
        foreign_report_id = foreign_report.json()["id"]

        created_user = client.post("/api/resources/users", json={
            "name": "مدیر تولید کارخانه اول", "email": "factory-scope@example.local",
            "role": "Production Manager", "status": "فعال", "factory_id": "f1"
        })
        assert created_user.status_code == 201, created_user.text
        password = created_user.json()["temporary_password"]
        assert client.post("/api/auth/logout").status_code == 200
        login = client.post("/api/auth/login", json={
            "email": "factory-scope@example.local", "password": password
        })
        assert login.status_code == 200, login.text

        assert client.post(f"/api/operations/production-runs/{foreign_run_id}/start").status_code == 404
        assert client.get(f"/api/operations/production-runs/{foreign_run_id}/events").status_code == 404
        assert client.post(f"/api/operations/reports/{foreign_report_id}/run",
                           json={"parameters": {}}).status_code == 404
        assert client.get(f"/api/operations/reports/{foreign_report_id}/executions").status_code == 404


def test_edge_without_factory_assignment_cannot_ingest_any_factory_tag():
    with TestClient(app) as client:
        _login(client)
        edge = client.post("/api/edge/register", json={
            "name": "EDGE-UNASSIGNED-TEST", "note": "must be assigned before ingest"
        })
        assert edge.status_code == 201, edge.text
        token = edge.json()["edge_token"]
        response = client.post("/api/edge/ingest", headers={"X-Edge-Token": token}, json={
            "samples": [{"tag_id": "t6", "value": 888.0, "quality": "GOOD"}]
        })
        assert response.status_code == 403
        assert "کارخانه" in response.json()["detail"]
