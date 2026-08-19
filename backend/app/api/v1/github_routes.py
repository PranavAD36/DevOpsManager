import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db_session
from app.integrations.github_app import GitHubAppError, GitHubAppService
from app.models.core import Project, Repository
from app.schemas.core import ProjectResponse, RepositoryResponse

router = APIRouter(prefix="/github", tags=["github"])
github_app_service = GitHubAppService()

CONNECTION_COOKIE = "devopsmanager_github_connection"
OAUTH_STATE_TTL_SECONDS = 600


def _cookie_options() -> dict[str, object]:
    if settings.frontend_url.startswith("https://"):
        return {"samesite": "none", "secure": True}
    return {"samesite": "lax", "secure": False}


def _oauth_state_secret() -> bytes:
    if not settings.github_client_secret:
        raise ValueError("GitHub OAuth signing secret is not configured")
    return settings.github_client_secret.encode("utf-8")


def _create_signed_oauth_state() -> str:
    payload = {
        "nonce": secrets.token_urlsafe(32),
        "issued_at": int(time.time()),
    }
    encoded_payload = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).rstrip(b"=")
    signature = hmac.new(_oauth_state_secret(), encoded_payload, hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=")
    return f"{encoded_payload.decode('ascii')}.{encoded_signature.decode('ascii')}"


def _verify_signed_oauth_state(state: str) -> bool:
    try:
        encoded_payload, encoded_signature = state.split(".", 1)
        expected_signature = hmac.new(
            _oauth_state_secret(), encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        provided_signature = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
        if not hmac.compare_digest(provided_signature, expected_signature):
            return False
        payload = json.loads(
            base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4))
        )
        issued_at = int(payload["issued_at"])
        return bool(payload["nonce"]) and 0 <= time.time() - issued_at <= OAUTH_STATE_TTL_SECONDS
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        return False


class ConnectRepositoryRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=511)
    owner: str | None = None
    name: str | None = None
    html_url: str | None = None
    default_branch: str = "main"
    description: str | None = None


class ConnectRepositoryResponse(BaseModel):
    project_id: str
    repository_id: str
    project: ProjectResponse
    repository: RepositoryResponse


def _get_access_token(request: Request) -> str:
    cookie_token = request.cookies.get("github_access_token")
    if cookie_token:
        return cookie_token

    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated with GitHub. Please authorize your GitHub account.",
    )


@router.get("/authorize")
async def authorize_github(response: Response) -> dict[str, str]:
    state = _create_signed_oauth_state()
    auth_url = github_app_service.get_authorization_url(state)

    return {"authorization_url": auth_url, "state": state}


@router.get("/callback")
async def github_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
) -> RedirectResponse:
    frontend_base = settings.frontend_url.rstrip("/")
    if error:
        err_msg = error_description or "GitHub authorization was denied"
        return RedirectResponse(url=f"{frontend_base}/github/connect?error={err_msg}", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    if not code or not state or not _verify_signed_oauth_state(state):
        return RedirectResponse(url=f"{frontend_base}/github/connect?error=Invalid+GitHub+authorization+callback", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    try:
        access_token = await github_app_service.exchange_code_for_token(code)
    except GitHubAppError as exc:
        return RedirectResponse(url=f"{frontend_base}/github/connect?error={str(exc)}", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    redirect_url = f"{frontend_base}/github/connect?status=connected"
    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    response.set_cookie(
        key="github_access_token",
        value=access_token,
        httponly=True,
        max_age=86400 * 7,
        **_cookie_options(),
    )
    return response


@router.get("/me")
async def get_github_user(request: Request) -> dict[str, Any]:
    token = _get_access_token(request)
    try:
        user = await github_app_service.get_authenticated_user(token)
        return {
            "id": user.id,
            "login": user.login,
            "name": user.login,
            "avatar_url": "https://github.com/ghost.png",
            "html_url": f"https://github.com/{user.login}",
        }
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/repositories")
async def get_github_repositories(request: Request) -> list[dict[str, Any]]:
    token = _get_access_token(request)
    try:
        return await github_app_service.get_user_repositories(token)
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("/repositories/connect", response_model=ConnectRepositoryResponse, status_code=status.HTTP_201_CREATED)
async def connect_and_select_repository(
    payload: ConnectRepositoryRequest,
    session: AsyncSession = Depends(get_db_session),
) -> ConnectRepositoryResponse:
    full_name = payload.full_name.strip()
    parts = full_name.split("/")
    owner = payload.owner or (parts[0] if len(parts) == 2 else "unknown")
    repo_name = payload.name or (parts[1] if len(parts) == 2 else full_name)
    html_url = payload.html_url or f"https://github.com/{full_name}"

    existing_repo = await session.scalar(
        select(Repository).where(
            Repository.provider == "github",
            Repository.full_name == full_name,
        )
    )

    if existing_repo is not None:
        project = await session.get(Project, existing_repo.project_id)
        if project is None:
            project = Project(name=repo_name, description=payload.description)
            session.add(project)
            await session.flush()
            existing_repo.project_id = project.id
        existing_repo.url = html_url
        existing_repo.default_branch = payload.default_branch
        if payload.description:
            existing_repo.github_description = payload.description
        await session.commit()
        await session.refresh(project)
        await session.refresh(existing_repo)
        return ConnectRepositoryResponse(
            project_id=str(project.id),
            repository_id=str(existing_repo.id),
            project=ProjectResponse.model_validate(project),
            repository=RepositoryResponse.model_validate(existing_repo),
        )

    project = Project(name=repo_name, description=payload.description or f"Repository {full_name}")
    session.add(project)
    await session.flush()

    repository = Repository(
        project_id=project.id,
        provider="github",
        owner=owner,
        name=repo_name,
        full_name=full_name,
        url=html_url,
        default_branch=payload.default_branch,
        github_description=payload.description,
    )
    session.add(repository)
    await session.commit()
    await session.refresh(project)
    await session.refresh(repository)

    return ConnectRepositoryResponse(
        project_id=str(project.id),
        repository_id=str(repository.id),
        project=ProjectResponse.model_validate(project),
        repository=RepositoryResponse.model_validate(repository),
    )
