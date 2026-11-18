from fastapi.testclient import TestClient
from app.main import app


def test_password_change_endpoint():
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local",
            "password": "demo1234",
        })
        assert login.status_code == 200
        response = client.post("/api/auth/change-password", json={
            "old_password": "demo1234",
            "new_password": "Replacement-Password-2026!",
        })
        assert response.status_code == 200, response.text
