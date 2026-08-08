from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt

from app.core.config import settings
from app.integrations.github import GitHubIntegrationError


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
    permissions: dict[str, bool] | None


@dataclass(frozen=True)
class GitHubOAuthToken:
    access_token: str
    expires_at: datetime | None


class GitHubAppService:
    base_url = "https://api.github.com"
    oauth_url = "https://github.com/login/oauth"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.transport = transport

    def _require_app_settings(self) -> tuple[int, str, str, Path]:
        if not all((settings.github_app_id, settings.github_client_id, settings.github_client_secret)):
            raise GitHubIntegrationError("GitHub App OAuth is not configured", 503)
        key_path = settings.resolved_github_private_key_path
        if key_path is None or not key_path.is_file():
            raise GitHubIntegrationError("GitHub App private key is not configured", 503)
        return settings.github_app_id, settings.github_client_id, settings.github_client_secret, key_path

    def create_app_jwt(self) -> str:
        app_id, _, _, key_path = self._require_app_settings()
        try:
            private_key = key_path.read_text(encoding="utf-8")
            now = datetime.now(timezone.utc)
            return jwt.encode(
                {"iat": int(now.timestamp()) - 60, "exp": int((now + timedelta(minutes=9)).timestamp()), "iss": str(app_id)},
                private_key,
                algorithm="RS256",
            )
        except (OSError, ValueError, jwt.PyJWTError) as exc:
            raise GitHubIntegrationError("Unable to create GitHub App authentication", 503) from exc

    def authorization_url(self, state: str) -> str:
        client_id = settings.github_client_id
        if not client_id:
            raise GitHubIntegrationError("GitHub App OAuth is not configured", 503)
        query = urlencode({"client_id": client_id, "state": state})
        return f"{self.oauth_url}/authorize?{query}"

    async def exchange_code(self, code: str) -> GitHubOAuthToken:
        _, client_id, client_secret, _ = self._require_app_settings()
        try:
            async with httpx.AsyncClient(timeout=15.0, transport=self.transport) as client:
                response = await client.post(
                    f"{self.oauth_url}/access_token",
                    data={"client_id": client_id, "client_secret": client_secret, "code": code},
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise GitHubIntegrationError("GitHub authorization request failed", 502) from exc
        if response.is_error:
            raise GitHubIntegrationError("GitHub authorization was rejected", 400)
        try:
            data = response.json()
            token = data["access_token"]
            expires_in = data.get("expires_in")
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in)) if expires_in else None
            return GitHubOAuthToken(token, expires_at)
        except (KeyError, TypeError, ValueError) as exc:
            raise GitHubIntegrationError("GitHub returned an invalid authorization response", 502) from exc

    async def get_authenticated_user(self, access_token: str) -> GitHubUser:
        data = await self._get("/user", access_token)
        try:
            return GitHubUser(id=int(data["id"]), login=str(data["login"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise GitHubIntegrationError("GitHub returned an invalid user response", 502) from exc

    async def list_repositories(self, access_token: str) -> list[GitHubAccessibleRepository]:
        data = await self._get("/user/repos?sort=updated&per_page=100", access_token)
        if not isinstance(data, list):
            raise GitHubIntegrationError("GitHub returned an invalid repository response", 502)
        try:
            return [
                GitHubAccessibleRepository(
                    id=int(item["id"]), name=str(item["name"]), full_name=str(item["full_name"]),
                    owner=str(item["owner"]["login"]), private=bool(item.get("private", False)),
                    default_branch=str(item.get("default_branch") or "main"), html_url=str(item["html_url"]),
                    description=item.get("description"), permissions=item.get("permissions"),
                )
                for item in data
            ]
        except (KeyError, TypeError, ValueError) as exc:
            raise GitHubIntegrationError("GitHub returned malformed repository data", 502) from exc

    async def _get(self, path: str, access_token: str) -> Any:
        try:
            async with httpx.AsyncClient(timeout=15.0, transport=self.transport) as client:
                response = await client.get(
                    f"{self.base_url}{path}",
                    headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {access_token}", "X-GitHub-Api-Version": "2022-11-28"},
                )
        except httpx.HTTPError as exc:
            raise GitHubIntegrationError("GitHub request failed", 502) from exc
        if response.status_code == 401:
            raise GitHubIntegrationError("GitHub authorization has expired", 401)
        if response.is_error:
            raise GitHubIntegrationError("GitHub API request failed", 502)
        try:
            return response.json()
        except ValueError as exc:
            raise GitHubIntegrationError("GitHub returned malformed data", 502) from exc
