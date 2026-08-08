from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_v1_status_check() -> None:
    response = client.get("/v1/status")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_database_health_check() -> None:
    response = client.get("/v1/database/health")
    assert response.status_code == 200
    assert "status" in response.json()
    assert "healthy" in response.json()
