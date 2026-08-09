import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.integrations.github_app import GitHubAppError, GitHubAppService
from app.models.core import Project, Repository
from app.schemas.core import ProjectResponse, RepositoryResponse

router = APIRouter(prefix="/github", tags=["github"])
github_app_service = GitHubAppService()


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
    state = secrets.token_urlsafe(32)
    auth_url = github_app_service.get_authorization_url(state)

    response.set_cookie(
        key="github_oauth_state",
        value=state,
        httponly=True,
        max_age=600,
        samesite="lax",
        secure=False,
    )

    return {"authorization_url": auth_url, "state": state}


@router.get("/callback")
async def github_callback(
    code: str,
    state: str,
    request: Request,
) -> RedirectResponse:
    stored_state = request.cookies.get("github_oauth_state")
    if not stored_state or stored_state != state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub authorization callback",
        )

    try:
        access_token = await github_app_service.exchange_code_for_token(code)
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    redirect_url = "http://localhost:3000/github/connect?status=connected"
    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    response.set_cookie(
        key="github_access_token",
        value=access_token,
        httponly=True,
        max_age=86400 * 7,
        samesite="lax",
        secure=False,
    )
    response.delete_cookie("github_oauth_state")
    return response


@router.get("/me")
async def get_github_user(request: Request) -> dict[str, Any]:
    token = _get_access_token(request)
    try:
        return await github_app_service.get_authenticated_user(token)
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
