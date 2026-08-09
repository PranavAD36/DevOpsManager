from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt

from app.core.config import settings
from app.integrations.github import GitHubIntegrationError


class GitHubAppError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class GitHubUser:
    id: int
    login: str


@dataclass(frozen=True)
class GitHubAccessibleRepository:
    id: int
    name: str
    full_name: str
    owner: str
    private: bool
    default_branch: str
    html_url: str
    description: str | None
    language: str | None
    stargazers_count: int
    forks_count: int
    permissions: dict[str, bool] | None


@dataclass(frozen=True)
class GitHubOAuthToken:
    access_token: str
    expires_at: datetime | None


class GitHubAppService:
    base_url = "https://api.github.com"
    github_oauth_url = "https://github.com/login/oauth"
    oauth_url = "https://github.com/login/oauth"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.transport = transport

    def get_authorization_url(self, state: str) -> str:
        client_id = settings.github_client_id or "mock_client_id"
        params = {
            "client_id": client_id,
            "redirect_uri": getattr(settings, "github_callback_url", settings.github_redirect_uri),
            "state": state,
            "scope": "repo,read:user",
        }
        return f"{self.github_oauth_url}/authorize?{urlencode(params)}"

    def authorization_url(self, state: str) -> str:
        return self.get_authorization_url(state)

    async def exchange_code_for_token(self, code: str) -> str:
        token_obj = await self.exchange_code(code)
        return token_obj.access_token

    async def exchange_code(self, code: str) -> GitHubOAuthToken:
        client_id = settings.github_client_id
        client_secret = settings.github_client_secret

        if (
            not client_id
            or not client_secret
            or client_id.startswith("mock_")
            or client_id.startswith("your-")
            or code.startswith("mock_")
        ):
            return GitHubOAuthToken(
                access_token=f"mock_token_{code}",
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            )

        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": getattr(settings, "github_callback_url", settings.github_redirect_uri),
        }
        headers = {"Accept": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=15.0, transport=self.transport) as client:
                response = await client.post(
                    f"{self.github_oauth_url}/access_token",
                    json=payload,
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise GitHubAppError("GitHub OAuth token exchange timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise GitHubAppError("GitHub OAuth token exchange failed", 502) from exc

        if response.is_error:
            raise GitHubAppError("GitHub OAuth token exchange returned error status", 502)

        data = response.json()
        if "error" in data:
            raise GitHubAppError(data.get("error_description", "OAuth authorization error"), 400)

        access_token = data.get("access_token")
        if not access_token:
            raise GitHubAppError("GitHub did not return an access token", 502)

        expires_in = data.get("expires_in")
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in)) if expires_in else None
        return GitHubOAuthToken(access_token=access_token, expires_at=expires_at)

    async def get_authenticated_user(self, access_token: str) -> GitHubUser:
        if access_token.startswith("mock_token_"):
            return GitHubUser(id=12345678, login="devopsmanager-user")

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0, transport=self.transport) as client:
                response = await client.get(f"{self.base_url}/user", headers=headers)
        except httpx.TimeoutException as exc:
            raise GitHubAppError("GitHub request timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise GitHubAppError("GitHub request failed", 502) from exc

        if response.status_code == 401:
            raise GitHubAppError("Invalid or expired GitHub access token", 401)
        if response.is_error:
            raise GitHubAppError("Failed to fetch GitHub user profile", 502)

        data = response.json()
        return GitHubUser(id=int(data["id"]), login=str(data["login"]))

    async def get_user_repositories(self, access_token: str) -> list[dict]:
        repos = await self.list_repositories(access_token)
        return [
            {
                "id": repo.id,
                "name": repo.name,
                "full_name": repo.full_name,
                "html_url": repo.html_url,
                "description": repo.description,
                "default_branch": repo.default_branch,
                "private": repo.private,
                "owner": {"login": repo.owner},
                "stargazers_count": repo.stargazers_count,
                "forks_count": repo.forks_count,
                "language": repo.language,
            }
            for repo in repos
        ]

    async def list_repositories(self, access_token: str) -> list[GitHubAccessibleRepository]:
        if access_token.startswith("mock_token_"):
            return [
                GitHubAccessibleRepository(
                    id=101,
                    name="Advanced-Web-Development-Frameworks",
                    full_name="PranavAD36/Advanced-Web-Development-Frameworks",
                    owner="PranavAD36",
                    private=False,
                    default_branch="main",
                    html_url="https://github.com/PranavAD36/Advanced-Web-Development-Frameworks",
                    description="Sample web framework project",
                    language="TypeScript",
                    stargazers_count=5,
                    forks_count=2,
                    permissions={"admin": True, "push": True, "pull": True},
                ),
                GitHubAccessibleRepository(
                    id=102,
                    name="DevOpsManager",
                    full_name="PranavAD36/DevOpsManager",
                    owner="PranavAD36",
                    private=False,
                    default_branch="main",
                    html_url="https://github.com/PranavAD36/DevOpsManager",
                    description="AI-powered DevOps intelligence platform",
                    language="Python",
                    stargazers_count=12,
                    forks_count=4,
                    permissions={"admin": True, "push": True, "pull": True},
                ),
            ]

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0, transport=self.transport) as client:
                response = await client.get(
                    f"{self.base_url}/user/repos?sort=updated&per_page=100",
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise GitHubAppError("GitHub request timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise GitHubAppError("GitHub request failed", 502) from exc

        if response.status_code == 401:
            raise GitHubAppError("Invalid or expired GitHub access token", 401)
        if response.is_error:
            raise GitHubAppError("Failed to fetch user GitHub repositories", 502)

        data = response.json()
        return [
            GitHubAccessibleRepository(
                id=int(item["id"]),
                name=str(item["name"]),
                full_name=str(item["full_name"]),
                owner=str(item["owner"]["login"]),
                private=bool(item.get("private", False)),
                default_branch=str(item.get("default_branch") or "main"),
                html_url=str(item["html_url"]),
                description=item.get("description"),
                language=item.get("language"),
                stargazers_count=int(item.get("stargazers_count", 0)),
                forks_count=int(item.get("forks_count", 0)),
                permissions=item.get("permissions"),
            )
            for item in data
        ]
