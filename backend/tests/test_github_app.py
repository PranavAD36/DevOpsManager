import asyncio
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.integrations.github_app import GitHubAppService


def test_authorization_url_generation(monkeypatch) -> None:
    monkeypatch.setattr(settings, "github_client_id", "client-id")
    url = GitHubAppService().authorization_url("state-value")
    assert "client_id=client-id" in url
    assert "state=state-value" in url


def test_oauth_exchange_user_and_repository_listing(monkeypatch) -> None:
    monkeypatch.setattr(settings, "github_client_id", "client-id")
    monkeypatch.setattr(settings, "github_client_secret", "client-secret")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/access_token"):
            return httpx.Response(200, json={"access_token": "server-only-token", "expires_in": 3600})
        if request.url.path == "/user":
            assert request.headers["Authorization"] == "Bearer server-only-token"
            return httpx.Response(200, json={"id": 42, "login": "octocat"})
        return httpx.Response(200, json=[{
            "id": 99, "name": "hello-world", "full_name": "octocat/hello-world",
            "owner": {"login": "octocat"}, "private": True, "default_branch": "main",
            "html_url": "https://github.com/octocat/hello-world", "description": "Test repo",
            "permissions": {"admin": False, "push": True, "pull": True},
        }])

    async def run() -> None:
        service = GitHubAppService(transport=httpx.MockTransport(handler))
        token = await service.exchange_code("oauth-code")
        assert token.access_token == "server-only-token"
        assert token.expires_at and token.expires_at > datetime.now(timezone.utc)
        user = await service.get_authenticated_user(token.access_token)
        assert user.login == "octocat"
        repositories = await service.list_repositories(token.access_token)
        assert repositories[0].full_name == "octocat/hello-world"
        assert repositories[0].permissions and repositories[0].permissions["push"] is True

    asyncio.run(run())


def test_callback_inputs_are_required() -> None:
    assert "code" in {"code", "state"}
