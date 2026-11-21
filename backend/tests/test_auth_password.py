from fastapi.testclient import TestClient
from app.main import app


def test_password_change_endpoint():
    with TestClient(app) as client:
        admin = client.post("/api/auth/login", json={
            "email": "admin@demo-cable.local",
            "password": "demo1234",
        })
        assert admin.status_code == 200

        email = f"password-change-{id(client)}@example.local"
        created = client.post("/api/resources/users", json={
            "name": "Password Change Test",
            "email": email,
            "role": "Engineer",
            "status": "فعال",
            "factory_id": "f1",
        })
        assert created.status_code == 201, created.text
        temporary = created.json()["temporary_password"]

        assert client.post("/api/auth/logout").status_code == 200
        login = client.post("/api/auth/login", json={
            "email": email,
            "password": temporary,
        })
        assert login.status_code == 200, login.text
        assert login.json()["user"]["must_change_password"] is True

        changed = client.post("/api/auth/change-password", json={
            "old_password": temporary,
            "new_password": "Replacement-Password-2026!",
        })
        assert changed.status_code == 200, changed.text
        identity = client.get("/api/auth/me")
        assert identity.status_code == 200
        assert identity.json()["user"]["must_change_password"] is False

        assert client.post("/api/auth/logout").status_code == 200
        assert client.post("/api/auth/login", json={
            "email": email,
            "password": temporary,
        }).status_code == 401
        final_login = client.post("/api/auth/login", json={
            "email": email,
            "password": "Replacement-Password-2026!",
        })
        assert final_login.status_code == 200, final_login.text
