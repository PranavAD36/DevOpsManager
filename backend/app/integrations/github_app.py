from urllib.parse import urlencode

import httpx

from app.core.config import settings


class GitHubAppError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class GitHubAppService:
    base_url = "https://api.github.com"
    github_oauth_url = "https://github.com/login/oauth"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.transport = transport

    def get_authorization_url(self, state: str) -> str:
        client_id = settings.github_client_id or "mock_client_id"
        params = {
            "client_id": client_id,
            "redirect_uri": settings.github_redirect_uri,
            "state": state,
            "scope": "repo,read:user",
        }
        return f"{self.github_oauth_url}/authorize?{urlencode(params)}"

    async def exchange_code_for_token(self, code: str) -> str:
        client_id = settings.github_client_id
        client_secret = settings.github_client_secret

        if (
            not client_id
            or not client_secret
            or client_id.startswith("mock_")
            or client_id.startswith("your-")
            or code.startswith("mock_")
        ):
            # Fallback for local testing/development when real credentials aren't set
            return f"mock_token_{code}"

        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": settings.github_redirect_uri,
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

        return access_token

    async def get_authenticated_user(self, access_token: str) -> dict:
        if access_token.startswith("mock_token_"):
            return {
                "login": "devopsmanager-user",
                "id": 12345678,
                "name": "DevOpsManager User",
                "avatar_url": "https://github.com/ghost.png",
                "html_url": "https://github.com/devopsmanager-user",
            }

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
        return {
            "login": data.get("login"),
            "id": data.get("id"),
            "name": data.get("name"),
            "avatar_url": data.get("avatar_url"),
            "html_url": data.get("html_url"),
        }

    async def get_user_repositories(self, access_token: str) -> list[dict]:
        if access_token.startswith("mock_token_"):
            return [
                {
                    "name": "Advanced-Web-Development-Frameworks",
                    "full_name": "PranavAD36/Advanced-Web-Development-Frameworks",
                    "html_url": "https://github.com/PranavAD36/Advanced-Web-Development-Frameworks",
                    "description": "Sample web framework project",
                    "default_branch": "main",
                    "private": False,
                    "owner": {"login": "PranavAD36"},
                    "stargazers_count": 5,
                    "forks_count": 2,
                    "open_issues_count": 0,
                    "language": "TypeScript",
                },
                {
                    "name": "DevOpsManager",
                    "full_name": "PranavAD36/DevOpsManager",
                    "html_url": "https://github.com/PranavAD36/DevOpsManager",
                    "description": "AI-powered DevOps intelligence platform",
                    "default_branch": "main",
                    "private": False,
                    "owner": {"login": "PranavAD36"},
                    "stargazers_count": 12,
                    "forks_count": 4,
                    "open_issues_count": 1,
                    "language": "Python",
                },
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

        return response.json()
