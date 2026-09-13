import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

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
    name: str | None = None
    avatar_url: str | None = None
    html_url: str | None = None


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


@dataclass(frozen=True)
class GitHubRepositoryFile:
    path: str
    content: str


@dataclass(frozen=True)
class GitHubFileVersion:
    path: str
    content: str
    sha: str


@dataclass(frozen=True)
class GitHubCommitResult:
    sha: str
    html_url: str


class GitHubAppService:
    base_url = "https://api.github.com"
    github_oauth_url = "https://github.com/login/oauth"
    oauth_url = "https://github.com/login/oauth"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.transport = transport

    def get_authorization_url(self, state: str) -> str:
        client_id = settings.github_client_id
        redirect_uri = getattr(settings, "github_callback_url", settings.github_redirect_uri)
        if not client_id or client_id.startswith("mock_") or client_id.startswith("your-"):
            return f"{redirect_uri}?code=mock_auth_code&state={state}"
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": "repo,read:user",
        }
        return f"{self.github_oauth_url}/authorize?{urlencode(params)}"

    def authorization_url(self, state: str) -> str:
        return self.get_authorization_url(state)

    async def get_file(self, access_token: str, owner: str, repository: str, path: str, branch: str) -> GitHubFileVersion:
        if _is_mock_token(access_token):
            return GitHubFileVersion(path, "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/')\ndef index(): return {'status': 'ok'}\n", "mock-file-sha")
        headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        async with httpx.AsyncClient(timeout=20.0, transport=self.transport) as client:
            response = await client.get(f"{self.base_url}/repos/{owner}/{repository}/contents/{quote(path, safe='/')}", params={"ref": branch}, headers=headers)
        if response.status_code == 401: raise GitHubAppError("Invalid or expired GitHub access token", 401)
        if response.status_code == 403: raise GitHubAppError("GitHub repository access denied or rate limit exceeded", 403)
        if response.status_code == 404: raise GitHubAppError("Repository file not found", 404)
        if response.is_error: raise GitHubAppError("Failed to fetch latest GitHub file", 502)
        data = response.json()
        try: content = base64.b64decode(data["content"]).decode("utf-8")
        except (KeyError, ValueError, UnicodeDecodeError) as exc: raise GitHubAppError("GitHub file content is invalid", 422) from exc
        return GitHubFileVersion(path, content, str(data["sha"]))

    async def update_file(self, access_token: str, owner: str, repository: str, path: str, branch: str, content: str, sha: str, message: str) -> GitHubCommitResult:
        if _is_mock_token(access_token):
            return GitHubCommitResult("mock-commit-sha", f"https://github.com/{owner}/{repository}/commit/mock-commit-sha")
        headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        payload = {"message": message, "content": base64.b64encode(content.encode()).decode(), "sha": sha, "branch": branch}
        async with httpx.AsyncClient(timeout=20.0, transport=self.transport) as client:
            response = await client.put(f"{self.base_url}/repos/{owner}/{repository}/contents/{quote(path, safe='/')}", json=payload, headers=headers)
        if response.status_code == 401: raise GitHubAppError("Invalid or expired GitHub access token", 401)
        if response.status_code == 403: raise GitHubAppError("GitHub repository write access denied or rate limit exceeded", 403)
        if response.status_code in (409, 422): raise GitHubAppError("The file changed on GitHub since this analysis was created. Please re-run the analysis before applying this suggestion.", 409)
        if response.is_error: raise GitHubAppError("GitHub could not commit the approved change", 502)
        commit = response.json().get("commit", {})
        return GitHubCommitResult(str(commit.get("sha", "")), str(commit.get("html_url", "")))

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
        if _is_mock_token(access_token):
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
        return GitHubUser(
            id=int(data["id"]),
            login=str(data["login"]),
            name=data.get("name") or str(data["login"]),
            avatar_url=data.get("avatar_url") or "https://github.com/ghost.png",
            html_url=data.get("html_url") or f"https://github.com/{data['login']}",
        )

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

    async def get_public_user_repositories(self, username: str) -> list[dict]:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"

        try:
            async with httpx.AsyncClient(timeout=15.0, transport=self.transport) as client:
                response = await client.get(
                    f"{self.base_url}/users/{quote(username, safe='')}/repos?sort=updated&per_page=100",
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise GitHubAppError("GitHub request timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise GitHubAppError("GitHub request failed", 502) from exc

        if response.status_code == 404:
            raise GitHubAppError(f"GitHub user '{username}' not found", 404)
        if response.is_error:
            raise GitHubAppError(f"Failed to fetch public repositories for '{username}'", 502)

        data = response.json()
        return [
            {
                "id": int(item["id"]),
                "name": str(item["name"]),
                "full_name": str(item["full_name"]),
                "html_url": str(item["html_url"]),
                "description": item.get("description"),
                "default_branch": str(item.get("default_branch") or "main"),
                "private": bool(item.get("private", False)),
                "owner": {"login": str(item["owner"]["login"]) if isinstance(item.get("owner"), dict) else str(item.get("owner") or username)},
                "stargazers_count": int(item.get("stargazers_count", 0)),
                "forks_count": int(item.get("forks_count", 0)),
                "language": item.get("language"),
            }
            for item in data
        ]

    async def list_repositories(self, access_token: str) -> list[GitHubAccessibleRepository]:
        if _is_mock_token(access_token):
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

    async def get_repository_source_files(
        self,
        access_token: str,
        owner: str,
        repository: str,
        branch: str,
        max_files: int = 40,
        max_file_bytes: int = 12000,
        max_total_bytes: int = 120000,
    ) -> list[GitHubRepositoryFile]:
        if _is_mock_token(access_token):
            return [
                GitHubRepositoryFile(
                    path="app/main.py",
                    content="from fastapi import FastAPI\napp = FastAPI()\n@app.get('/')\ndef index(): return {'status': 'ok'}\n",
                ),
                GitHubRepositoryFile(
                    path="README.md",
                    content="# Sample Project\nThis is a sample project for testing.\n",
                ),
            ]
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        try:
            async with httpx.AsyncClient(timeout=20.0, transport=self.transport) as client:
                ref_response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repository}/git/refs/heads/{quote(branch, safe='')}",
                    headers=headers,
                )
                if ref_response.status_code == 401:
                    raise GitHubAppError("Invalid or expired GitHub access token", 401)
                if ref_response.is_error:
                    raise GitHubAppError("Failed to fetch GitHub repository ref", 502)
                ref_data = ref_response.json()
                object_sha = str(ref_data.get("object", {}).get("sha") or "")
                object_type = str(ref_data.get("object", {}).get("type") or "")
                if not object_sha:
                    raise GitHubAppError("Failed to resolve GitHub repository branch SHA", 502)

                tree_sha = object_sha
                if object_type == "commit":
                    commit_response = await client.get(
                        f"{self.base_url}/repos/{owner}/{repository}/commits/{object_sha}",
                        headers=headers,
                    )
                    if commit_response.status_code == 401:
                        raise GitHubAppError("Invalid or expired GitHub access token", 401)
                    if commit_response.is_error:
                        raise GitHubAppError(f"Failed to resolve GitHub repository tree SHA (HTTP {commit_response.status_code}): {commit_response.text}", 502)
                    commit_data = commit_response.json()
                    tree_sha = str(
                        (commit_data.get("commit", {}).get("tree", {}).get("sha")
                         or commit_data.get("tree", {}).get("sha")
                         or "")
                    )

                if not tree_sha:
                    raise GitHubAppError("Failed to resolve GitHub repository tree SHA: empty tree_sha returned", 502)

                tree_url = f"{self.base_url}/repos/{owner}/{repository}/git/trees/{tree_sha}"
                tree_response = await client.get(tree_url, params={"recursive": "1"}, headers=headers)
                if tree_response.status_code == 401:
                    raise GitHubAppError("Invalid or expired GitHub access token", 401)
                if tree_response.is_error:
                    raise GitHubAppError(f"Failed to fetch GitHub repository tree (HTTP {tree_response.status_code}): {tree_response.text}", 502)
                tree = tree_response.json()

                files: list[GitHubRepositoryFile] = []
                total_bytes = 0
                for entry in tree.get("tree", []):
                    path = str(entry.get("path", ""))
                    size = int(entry.get("size", 0) or 0)
                    if (
                        entry.get("type") != "blob"
                        or not _is_relevant_source_path(path)
                        or size > max_file_bytes
                        or len(files) >= max_files
                        or total_bytes + size > max_total_bytes
                    ):
                        continue
                    content_response = await client.get(
                        f"{self.base_url}/repos/{owner}/{repository}/contents/{quote(path, safe='/')}",
                        params={"ref": branch},
                        headers=headers,
                    )
                    if content_response.status_code == 404:
                        continue
                    if content_response.is_error:
                        raise GitHubAppError("Failed to fetch GitHub repository file", 502)
                    content_data = content_response.json()
                    if content_data.get("encoding") != "base64" or not content_data.get("content"):
                        continue
                    try:
                        content = base64.b64decode(content_data["content"]).decode("utf-8")
                    except (ValueError, UnicodeDecodeError):
                        continue
                    if len(content.encode("utf-8")) > max_file_bytes:
                        continue
                    files.append(GitHubRepositoryFile(path=path, content=content))
                    total_bytes += len(content.encode("utf-8"))
                return files
        except GitHubAppError:
            raise
        except httpx.TimeoutException as exc:
            raise GitHubAppError("GitHub repository content request timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise GitHubAppError("GitHub repository content request failed", 502) from exc

    def _generate_jwt(self) -> str:
        app_id = settings.github_app_id
        private_key_path = settings.resolved_github_private_key_path
        if not app_id or not private_key_path or not private_key_path.exists():
            if _is_mock_token(app_id or ""):
                return "mock_jwt"
            raise GitHubAppError("GitHub App ID or Private Key is missing/invalid", 500)
        
        with open(private_key_path, "rb") as f:
            private_key = f.read()

        now = int(datetime.now(timezone.utc).timestamp())
        payload = {
            "iat": now - 60,
            "exp": now + (10 * 60),
            "iss": app_id
        }
        return jwt.encode(payload, private_key, algorithm="RS256")

    async def get_installation_access_token(self, installation_id: int) -> str:
        if installation_id == 0 or getattr(settings, "github_client_id", "").startswith("mock_"):
            return "mock_installation_token"
        
        jwt_token = self._generate_jwt()
        headers = {
            "Authorization": f"Bearer {jwt_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        async with httpx.AsyncClient(timeout=15.0, transport=self.transport) as client:
            response = await client.post(
                f"{self.base_url}/app/installations/{installation_id}/access_tokens",
                headers=headers
            )
        if response.is_error:
            raise GitHubAppError(f"Failed to generate installation token (HTTP {response.status_code}): {response.text}", 502)
        return response.json()["token"]

    async def get_pull_request_diff(self, access_token: str, owner: str, repository: str, pr_number: int) -> str:
        if _is_mock_token(access_token):
            return "diff --git a/test.py b/test.py\n+ print('hello')"
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github.v3.diff",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        async with httpx.AsyncClient(timeout=30.0, transport=self.transport) as client:
            # We follow redirects for the diff
            response = await client.get(
                f"{self.base_url}/repos/{owner}/{repository}/pulls/{pr_number}",
                headers=headers,
                follow_redirects=True
            )
        if response.is_error:
            raise GitHubAppError(f"Failed to fetch PR diff (HTTP {response.status_code})", 502)
        return response.text

    async def create_pull_request_review(self, access_token: str, owner: str, repository: str, pr_number: int, commit_id: str, comments: list[dict]) -> None:
        if _is_mock_token(access_token):
            return
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        payload = {
            "commit_id": commit_id,
            "event": "COMMENT",
            "comments": comments
        }
        async with httpx.AsyncClient(timeout=20.0, transport=self.transport) as client:
            response = await client.post(
                f"{self.base_url}/repos/{owner}/{repository}/pulls/{pr_number}/reviews",
                json=payload,
                headers=headers
            )
        if response.is_error:
            raise GitHubAppError(f"Failed to create PR review (HTTP {response.status_code}): {response.text}", 502)


def _is_relevant_source_path(path: str) -> bool:
    excluded_parts = {".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv", "venv", "env"}
    parts = set(path.replace("\\", "/").split("/"))
    if parts & excluded_parts:
        return False
    filename = path.rsplit("/", 1)[-1].lower()
    if filename in {".env", "id_rsa", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"}:
        return False
    if filename.endswith((".pem", ".key", ".p12", ".pfx")):
        return False
    return filename.endswith(
        (
            ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rs", ".rb", ".php",
            ".cs", ".cpp", ".c", ".h", ".sql", ".yaml", ".yml", ".json", ".toml", ".ini",
            ".md", ".dockerfile",
        )
    ) or filename in {"dockerfile", "makefile", "readme"}


def _is_mock_token(token: str) -> bool:
    if token.startswith("mock_token_") or token.startswith("mock_"):
        return True
    return False

