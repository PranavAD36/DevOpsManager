from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from app.api.v1 import core_routes
from app.integrations.github import GitHubIntegrationError, GitHubRepositoryMetadata, parse_github_repository_url
from app.main import app


def metadata() -> GitHubRepositoryMetadata:
    return GitHubRepositoryMetadata(
        owner="octocat",
        name="hello-world",
        full_name="octocat/hello-world",
        html_url="https://github.com/octocat/hello-world",
        description="A test repository",
        default_branch="main",
        private=False,
        fork=False,
        language="Python",
        stargazers_count=10,
        forks_count=2,
        open_issues_count=1,
        size=100,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        pushed_at=datetime.now(timezone.utc),
    )


def test_parse_github_repository_url() -> None:
    assert parse_github_repository_url("https://github.com/octocat/hello-world.git") == ("octocat", "hello-world")


def test_invalid_github_url_rejected() -> None:
    try:
        parse_github_repository_url("https://gitlab.com/octocat/hello-world")
    except ValueError:
        pass
    else:
        raise AssertionError("Expected invalid GitHub URL to be rejected")


def test_github_metadata_service_with_mocked_http() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/repos/octocat/hello-world"
        return httpx.Response(
            200,
            json={
                "owner": {"login": "octocat"}, "name": "hello-world", "full_name": "octocat/hello-world",
                "html_url": "https://github.com/octocat/hello-world", "description": "A test repository",
                "default_branch": "main", "private": False, "fork": False, "language": "Python",
                "stargazers_count": 10, "forks_count": 2, "open_issues_count": 1, "size": 100,
                "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-02T00:00:00Z", "pushed_at": "2026-01-03T00:00:00Z",
            },
        )

    async def run() -> None:
        from app.integrations.github import GitHubClient
        result = await GitHubClient(transport=httpx.MockTransport(handler)).get_repository("octocat", "hello-world")
        assert result.full_name == "octocat/hello-world"

    import asyncio
    asyncio.run(run())


def test_connect_duplicate_refresh_and_analysis_requires_github_auth(monkeypatch) -> None:
    async def fake_metadata(owner: str, repo: str) -> GitHubRepositoryMetadata:
        assert owner == "octocat"
        assert repo == "hello-world"
        return metadata()

    monkeypatch.setattr(core_routes.github_client, "get_repository_metadata", fake_metadata)
    with TestClient(app) as client:
        project = client.post("/v1/projects", json={"name": f"GitHub test {uuid4()}"}).json()
        project_id = project["id"]
        try:
            first = client.post(f"/v1/projects/{project_id}/repositories/connect", json={"url": "https://github.com/octocat/hello-world"})
            assert first.status_code == 201
            repository_id = first.json()["id"]
            second = client.post(f"/v1/projects/{project_id}/repositories/connect", json={"url": "https://github.com/octocat/hello-world.git"})
            assert second.status_code == 200
            assert second.json()["id"] == repository_id
            assert client.post(f"/v1/repositories/{repository_id}/refresh").status_code == 200
            analysis = client.post(f"/v1/repositories/{repository_id}/analysis-runs")
            assert analysis.status_code == 401
        finally:
            assert client.delete(f"/v1/projects/{project_id}").status_code == 204


def test_github_not_found_and_missing_project(monkeypatch) -> None:
    async def missing_metadata(owner: str, repo: str) -> GitHubRepositoryMetadata:
        raise GitHubIntegrationError("GitHub repository not found", 404)

    monkeypatch.setattr(core_routes.github_client, "get_repository_metadata", missing_metadata)
    with TestClient(app) as client:
        assert client.post(f"/v1/projects/{uuid4()}/repositories/connect", json={"url": "https://github.com/octocat/missing"}).status_code == 404
        project_id = client.post("/v1/projects", json={"name": f"Invalid URL {uuid4()}"}).json()["id"]
        try:
            assert client.post(f"/v1/projects/{project_id}/repositories/connect", json={"url": "https://example.com/repo"}).status_code == 400
        finally:
            assert client.delete(f"/v1/projects/{project_id}").status_code == 204


def test_github_oauth_flow_endpoints() -> None:
    with TestClient(app) as client:
        auth_resp = client.get("/v1/github/authorize")
        assert auth_resp.status_code == 200
        data = auth_resp.json()
        assert "authorization_url" in data
        assert "state" in data
        state = data["state"]

        client.cookies.update(auth_resp.cookies)

        callback_resp = client.get(
            f"/v1/github/callback?code=mock_auth_code&state={state}",
            follow_redirects=False,
        )
        assert callback_resp.status_code == 307

        client.cookies.update(callback_resp.cookies)

        me_resp = client.get("/v1/github/me")
        assert me_resp.status_code == 200
        assert "login" in me_resp.json()

        repos_resp = client.get("/v1/github/repositories")
        assert repos_resp.status_code == 200
        repos = repos_resp.json()
        assert isinstance(repos, list)
        assert len(repos) > 0

        connect_resp = client.post(
            "/v1/github/repositories/connect",
            json={
                "full_name": "PranavAD36/Advanced-Web-Development-Frameworks",
                "html_url": "https://github.com/PranavAD36/Advanced-Web-Development-Frameworks",
                "default_branch": "main",
                "description": "Sample framework project",
            },
        )
        assert connect_resp.status_code == 201
        res_json = connect_resp.json()
        assert "project_id" in res_json
        assert "repository_id" in res_json

        client.delete(f"/v1/projects/{res_json['project_id']}")
