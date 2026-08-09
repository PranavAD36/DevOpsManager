import secrets
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db_session
from app.integrations.github import GitHubClient, GitHubIntegrationError
from app.integrations.github_app import GitHubAppService
from app.models.core import Project, Repository
from app.models.github import GitHubConnection
from app.schemas.github import (
    GitHubAuthorizationResponse,
    GitHubCallbackError,
    GitHubConnectionResponse,
    GitHubRepositoryAccessResponse,
    GitHubRepositoryConnect,
)
from app.api.v1.core_routes import apply_github_metadata

router = APIRouter(prefix="/github", tags=["github"])
github_app = GitHubAppService()
github_metadata_client = GitHubClient()
CONNECTION_COOKIE = "devopsmanager_github_connection"
STATE_COOKIE = "devopsmanager_github_oauth_state"


def github_error(error: GitHubIntegrationError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=str(error))


async def get_connection(connection_id: str | None, session: AsyncSession) -> GitHubConnection:
    if not connection_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Connect a GitHub account first")
    try:
        connection_uuid = UUID(connection_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid GitHub connection") from exc
    connection = await session.get(GitHubConnection, connection_uuid)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Connect a GitHub account first")
    return connection


@router.get("/authorize", response_model=GitHubAuthorizationResponse)
async def authorize(response: Response) -> GitHubAuthorizationResponse:
    state = secrets.token_urlsafe(32)
    try:
        authorization_url = github_app.authorization_url(state)
    except GitHubIntegrationError as exc:
        raise github_error(exc) from exc
    response.set_cookie(STATE_COOKIE, state, httponly=True, secure=settings.is_production, samesite="lax", max_age=600)
    return GitHubAuthorizationResponse(authorization_url=authorization_url)


@router.get("/callback", responses={400: {"model": GitHubCallbackError}})
async def callback(
    response: Response,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    oauth_state: str | None = Cookie(default=None, alias=STATE_COOKIE),
    session: AsyncSession = Depends(get_db_session),
):
    if error:
        raise HTTPException(status_code=400, detail=error_description or "GitHub authorization was denied")
    if not code or not state or not oauth_state or not secrets.compare_digest(state, oauth_state):
        raise HTTPException(status_code=400, detail="Invalid GitHub authorization callback")
    try:
        token = await github_app.exchange_code(code)
        user = await github_app.get_authenticated_user(token.access_token)
    except GitHubIntegrationError as exc:
        raise github_error(exc) from exc

    connection = await session.scalar(select(GitHubConnection).where(GitHubConnection.github_user_id == user.id))
    if connection is None:
        connection = GitHubConnection(github_user_id=user.id, github_login=user.login, access_token=token.access_token, token_expires_at=token.expires_at)
        session.add(connection)
    else:
        connection.github_login = user.login
        connection.access_token = token.access_token
        connection.token_expires_at = token.expires_at
    await session.commit()
    await session.refresh(connection)

    redirect_url = f"{settings.allowed_origins[0].rstrip('/')}/github/connect?github=connected"
    redirect = RedirectResponse(redirect_url, status_code=status.HTTP_303_SEE_OTHER)
    redirect.set_cookie(CONNECTION_COOKIE, str(connection.id), httponly=True, secure=settings.is_production, samesite="lax", max_age=60 * 60 * 24 * 30)
    redirect.delete_cookie(STATE_COOKIE)
    return redirect


@router.get("/repositories", response_model=list[GitHubRepositoryAccessResponse])
async def repositories(
    connection_id: str | None = Cookie(default=None, alias=CONNECTION_COOKIE),
    session: AsyncSession = Depends(get_db_session),
) -> list[GitHubRepositoryAccessResponse]:
    connection = await get_connection(connection_id, session)
    try:
        repositories = await github_app.list_repositories(connection.access_token)
    except GitHubIntegrationError as exc:
        raise github_error(exc) from exc
    return [GitHubRepositoryAccessResponse(**repository.__dict__) for repository in repositories]


@router.post("/repositories/connect", response_model=dict[str, str | UUID])
async def connect_repository(
    payload: GitHubRepositoryConnect,
    connection_id: str | None = Cookie(default=None, alias=CONNECTION_COOKIE),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str | UUID]:
    connection = await get_connection(connection_id, session)
    try:
        available = await github_app.list_repositories(connection.access_token)
    except GitHubIntegrationError as exc:
        raise github_error(exc) from exc
    selected = next((item for item in available if item.id == payload.repository_id), None)
    if selected is None:
        raise HTTPException(status_code=404, detail="Repository is not accessible to this GitHub account")
    existing_repository = await session.scalar(
        select(Repository).where(Repository.provider == "github", Repository.full_name == selected.full_name)
    )
    if existing_repository is not None:
        return {"project_id": existing_repository.project_id, "repository_id": existing_repository.id, "message": "Repository is already connected"}
    if payload.project_id is not None:
        project = await session.get(Project, payload.project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
    else:
        project = Project(name=selected.full_name, description=selected.description)
        session.add(project)
        await session.flush()
    try:
        metadata = await github_metadata_client.get_repository_metadata(selected.owner, selected.name, connection.access_token)
    except GitHubIntegrationError as exc:
        raise github_error(exc) from exc
    repository = Repository(project_id=project.id, owner=metadata.owner, name=metadata.name, full_name=metadata.full_name, url=metadata.html_url)
    session.add(repository)
    apply_github_metadata(repository, metadata)
    await session.commit()
    return {"project_id": project.id, "repository_id": repository.id, "message": "Project created and repository connected"}


async def _get_current_connection(
    connection_id: str | None = Cookie(default=None, alias=CONNECTION_COOKIE),
    session: AsyncSession = Depends(get_db_session),
) -> GitHubConnection:
    return await get_connection(connection_id, session)


@router.get("/me", response_model=GitHubConnectionResponse)
async def current_connection(connection: GitHubConnection = Depends(_get_current_connection)) -> GitHubConnectionResponse:
    return GitHubConnectionResponse(connected=True, username=connection.github_login)
