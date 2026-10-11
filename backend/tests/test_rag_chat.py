from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.services import rag_service
from app.services.ai_service import AIProviderError

TEST_HEADERS = {"Authorization": "Bearer test-token"}


def _create_project_and_repository(client: TestClient) -> tuple[str, str]:
    project = client.post(
        "/v1/projects",
        json={"name": f"RAG test {uuid4()}"},
        headers=TEST_HEADERS,
    ).json()
    repository = client.post(
        f"/v1/projects/{project['id']}/repositories",
        json={
            "owner": "octocat",
            "name": "hello-world",
            "full_name": "octocat/hello-world",
            "url": "https://github.com/octocat/hello-world",
        },
        headers=TEST_HEADERS,
    ).json()
    return project["id"], repository["id"]


def test_repo_chat_answers_with_provider_output() -> None:
    files = [SimpleNamespace(path="app.py", content="def add(a, b):\n    return a + b\n")]
    leaked_token = "ghp_" + "B" * 30
    with patch.object(
        rag_service.GitHubAppService,
        "get_repository_source_files",
        new=AsyncMock(return_value=files),
    ), patch.object(
        rag_service,
        "complete_text",
        new=AsyncMock(return_value=f"`add` returns the sum (app.py). Token: {leaked_token}"),
    ), TestClient(app) as client:
        _, repository_id = _create_project_and_repository(client)
        response = client.post(
            f"/v1/rag/{repository_id}/chat",
            json={"query": "What does add do?"},
            headers=TEST_HEADERS,
        )

    assert response.status_code == 200
    assert "app.py" in response.json()["answer"]
    assert leaked_token not in response.text


def test_repo_chat_reports_ai_provider_failure() -> None:
    files = [SimpleNamespace(path="app.py", content="print('hello')\n")]
    with patch.object(
        rag_service.GitHubAppService,
        "get_repository_source_files",
        new=AsyncMock(return_value=files),
    ), patch.object(
        rag_service,
        "complete_text",
        new=AsyncMock(side_effect=AIProviderError("OPENROUTER_API_KEY is not configured")),
    ), TestClient(app) as client:
        _, repository_id = _create_project_and_repository(client)
        response = client.post(
            f"/v1/rag/{repository_id}/chat",
            json={"query": "hi"},
            headers=TEST_HEADERS,
        )

    assert response.status_code == 503
    assert "not available" in response.json()["detail"]


def test_select_relevant_chunks_prefers_matching_file() -> None:
    files = [
        SimpleNamespace(path="auth.py", content="def login(user):\n    return authenticate(user)\n"),
        SimpleNamespace(path="maths.py", content="def add(a, b):\n    return a + b\n"),
    ]

    chunks = rag_service.select_relevant_chunks(files, "where is login handled?")

    assert chunks
    assert chunks[0][0] == "auth.py"
