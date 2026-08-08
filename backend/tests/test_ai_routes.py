from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_analyze_repo_success() -> None:
    payload = {
        "repo_name": "DevOpsManager",
        "branch": "main",
        "prompt": "Test AI analysis",
        "provider": "openai"
    }
    response = client.post("/v1/ai/analyze-repo", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["repo_name"] == "DevOpsManager"
    assert data["provider_used"] == "openai"
    assert "summary" in data
    assert isinstance(data["recommendations"], list)


def test_analyze_repo_invalid_provider() -> None:
    payload = {
        "repo_name": "DevOpsManager",
        "provider": "invalid-provider"
    }
    response = client.post("/v1/ai/analyze-repo", json=payload)
    assert response.status_code == 422  # Pydantic validation error
