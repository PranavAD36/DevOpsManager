from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlparse

import httpx

from app.core.config import settings


class GitHubIntegrationError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class GitHubRepositoryMetadata:
    owner: str
    name: str
    full_name: str
    html_url: str
    description: str | None
    default_branch: str
    private: bool
    fork: bool
    language: str | None
    stargazers_count: int
    forks_count: int
    open_issues_count: int
    size: int
    created_at: datetime | None
    updated_at: datetime | None
    pushed_at: datetime | None


def parse_github_repository_url(value: str) -> tuple[str, str]:
    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        raise ValueError("Repository URL must be an HTTPS GitHub URL")

    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) != 2:
        raise ValueError("Repository URL must contain an owner and repository name")

    owner, repository = parts
    if repository.endswith(".git"):
        repository = repository[:-4]
    if not owner or not repository or any(character in owner + repository for character in "?#"):
        raise ValueError("Invalid GitHub repository URL")
    return owner, repository


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class GitHubClient:
    base_url = "https://api.github.com"

    async def get_repository(self, owner: str, repo: str) -> GitHubRepositoryMetadata:
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(f"{self.base_url}/repos/{owner}/{repo}", headers=headers)
        except httpx.TimeoutException as exc:
            raise GitHubIntegrationError("GitHub request timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise GitHubIntegrationError("GitHub request failed", 502) from exc

        if response.status_code == 404:
            raise GitHubIntegrationError("GitHub repository not found", 404)
        if response.status_code == 403 and response.headers.get("X-RateLimit-Remaining") == "0":
            raise GitHubIntegrationError("GitHub API rate limit exceeded", 503)
        if response.is_error:
            raise GitHubIntegrationError("GitHub API request failed", 502)

        try:
            data = response.json()
            return GitHubRepositoryMetadata(
                owner=data["owner"]["login"],
                name=data["name"],
                full_name=data["full_name"],
                html_url=data["html_url"],
                description=data.get("description"),
                default_branch=data.get("default_branch") or "main",
                private=bool(data.get("private", False)),
                fork=bool(data.get("fork", False)),
                language=data.get("language"),
                stargazers_count=int(data.get("stargazers_count", 0)),
                forks_count=int(data.get("forks_count", 0)),
                open_issues_count=int(data.get("open_issues_count", 0)),
                size=int(data.get("size", 0)),
                created_at=_parse_datetime(data.get("created_at")),
                updated_at=_parse_datetime(data.get("updated_at")),
                pushed_at=_parse_datetime(data.get("pushed_at")),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise GitHubIntegrationError("GitHub returned malformed repository data", 502) from exc

    async def get_repository_metadata(self, owner: str, repo: str) -> GitHubRepositoryMetadata:
        return await self.get_repository(owner, repo)
