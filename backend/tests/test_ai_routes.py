from fastapi.testclient import TestClient
from app.core.config import settings
from app.services import ai_service
from app.main import app

client = TestClient(app)


def test_analyze_repo_success(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openrouter_api_key", "test-key")

    async def fake_openrouter(prompt: str) -> str:
        return '{"summary":"Reviewed repository","issues":[]}'

    monkeypatch.setattr(ai_service, "_call_openrouter", fake_openrouter)
    payload = {
        "repo_name": "DevOpsManager",
        "branch": "main",
        "prompt": "Test AI analysis",
        "provider": "openrouter"
    }
    response = client.post("/v1/ai/analyze-repo", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["repo_name"] == "DevOpsManager"
    assert data["provider_used"] == "openrouter"
    assert "summary" in data
    assert isinstance(data["recommendations"], list)


def test_analyze_repo_invalid_provider() -> None:
    payload = {
        "repo_name": "DevOpsManager",
        "provider": "invalid-provider"
    }
    response = client.post("/v1/ai/analyze-repo", json=payload)
    assert response.status_code == 422  # Pydantic validation error
