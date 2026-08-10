from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.integrations.github import GitHubClient, GitHubIntegrationError, parse_github_repository_url
from app.models.core import AnalysisRun, Issue, Project, Repository
from app.services.repository_analysis import run_repository_analysis
from app.api.v1.github_routes import _get_access_token
from app.schemas.core import (
    AnalysisRunCreate,
    AnalysisRunResponse,
    AnalysisRunUpdate,
    IssueCreate,
    IssueResponse,
    IssueUpdate,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    RepositoryCreate,
    RepositoryConnect,
    RepositoryResponse,
    RepositoryUpdate,
)

router = APIRouter(tags=["core"])
github_client = GitHubClient()


async def get_project_or_404(project_id: UUID, session: AsyncSession) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def get_repository_or_404(repository_id: UUID, session: AsyncSession) -> Repository:
    repository = await session.get(Repository, repository_id)
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repository


async def get_analysis_run_or_404(analysis_run_id: UUID, session: AsyncSession) -> AnalysisRun:
    analysis_run = await session.get(AnalysisRun, analysis_run_id)
    if analysis_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis run not found")
    return analysis_run


async def get_issue_or_404(issue_id: UUID, session: AsyncSession) -> Issue:
    issue = await session.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return issue


def github_error(error: GitHubIntegrationError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=str(error))


def apply_github_metadata(repository: Repository, metadata) -> None:
    repository.provider = "github"
    repository.owner = metadata.owner
    repository.name = metadata.name
    repository.full_name = metadata.full_name
    repository.url = metadata.html_url
    repository.default_branch = metadata.default_branch
    repository.github_description = metadata.description
    repository.is_private = metadata.private
    repository.is_fork = metadata.fork
    repository.language = metadata.language
    repository.stargazers_count = metadata.stargazers_count
    repository.forks_count = metadata.forks_count
    repository.open_issues_count = metadata.open_issues_count
    repository.repository_size = metadata.size
    repository.github_created_at = metadata.created_at
    repository.github_updated_at = metadata.updated_at
    repository.pushed_at = metadata.pushed_at


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, session: AsyncSession = Depends(get_db_session)) -> Project:
    project = Project(**payload.model_dump())
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(session: AsyncSession = Depends(get_db_session)) -> list[Project]:
    result = await session.scalars(select(Project).order_by(Project.created_at.desc()))
    return list(result.all())


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: UUID, session: AsyncSession = Depends(get_db_session)) -> Project:
    return await get_project_or_404(project_id, session)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: UUID, payload: ProjectUpdate, session: AsyncSession = Depends(get_db_session)) -> Project:
    project = await get_project_or_404(project_id, session)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    await session.commit()
    await session.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: UUID, session: AsyncSession = Depends(get_db_session)) -> None:
    project = await get_project_or_404(project_id, session)
    await session.delete(project)
    await session.commit()


@router.post("/projects/{project_id}/repositories", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
async def create_repository(project_id: UUID, payload: RepositoryCreate, session: AsyncSession = Depends(get_db_session)) -> Repository:
    await get_project_or_404(project_id, session)
    repository = Repository(project_id=project_id, **payload.model_dump(mode="json"))
    session.add(repository)
    await session.commit()
    await session.refresh(repository)
    return repository


@router.post("/projects/{project_id}/repositories/connect", response_model=RepositoryResponse)
async def connect_github_repository(
    project_id: UUID,
    payload: RepositoryConnect,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
) -> Repository:
    await get_project_or_404(project_id, session)
    try:
        owner, repo_name = parse_github_repository_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        metadata = await github_client.get_repository_metadata(owner, repo_name)
    except GitHubIntegrationError as exc:
        raise github_error(exc) from exc

    repository = await session.scalar(
        select(Repository).where(
            Repository.project_id == project_id,
            Repository.provider == "github",
            Repository.full_name == metadata.full_name,
        )
    )
    if repository is None:
        repository = Repository(project_id=project_id, owner=metadata.owner, name=metadata.name, full_name=metadata.full_name, url=metadata.html_url)
        session.add(repository)
        response.status_code = status.HTTP_201_CREATED
    apply_github_metadata(repository, metadata)
    await session.commit()
    await session.refresh(repository)
    return repository


@router.get("/projects/{project_id}/repositories", response_model=list[RepositoryResponse])
async def list_repositories(project_id: UUID, session: AsyncSession = Depends(get_db_session)) -> list[Repository]:
    await get_project_or_404(project_id, session)
    result = await session.scalars(select(Repository).where(Repository.project_id == project_id).order_by(Repository.created_at.desc()))
    return list(result.all())


@router.get("/repositories/{repository_id}", response_model=RepositoryResponse)
async def get_repository(repository_id: UUID, session: AsyncSession = Depends(get_db_session)) -> Repository:
    return await get_repository_or_404(repository_id, session)


@router.patch("/repositories/{repository_id}", response_model=RepositoryResponse)
async def update_repository(repository_id: UUID, payload: RepositoryUpdate, session: AsyncSession = Depends(get_db_session)) -> Repository:
    repository = await get_repository_or_404(repository_id, session)
    for key, value in payload.model_dump(exclude_unset=True, mode="json").items():
        setattr(repository, key, value)
    await session.commit()
    await session.refresh(repository)
    return repository


@router.delete("/repositories/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(repository_id: UUID, session: AsyncSession = Depends(get_db_session)) -> None:
    repository = await get_repository_or_404(repository_id, session)
    await session.delete(repository)
    await session.commit()


@router.post("/repositories/{repository_id}/refresh", response_model=RepositoryResponse)
async def refresh_repository(repository_id: UUID, session: AsyncSession = Depends(get_db_session)) -> Repository:
    repository = await get_repository_or_404(repository_id, session)
    if repository.provider != "github":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported repository provider")
    try:
        metadata = await github_client.get_repository_metadata(repository.owner, repository.name)
    except GitHubIntegrationError as exc:
        raise github_error(exc) from exc
    apply_github_metadata(repository, metadata)
    await session.commit()
    await session.refresh(repository)
    return repository


@router.post("/repositories/{repository_id}/analysis-runs", response_model=AnalysisRunResponse, status_code=status.HTTP_201_CREATED)
async def create_repository_analysis_run(
    repository_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> AnalysisRun:
    repository = await get_repository_or_404(repository_id, session)
    analysis_run = AnalysisRun(project_id=repository.project_id, repository_id=repository.id, status="pending")
    session.add(analysis_run)
    await session.commit()
    access_token = _get_access_token(request)
    return await run_repository_analysis(session, analysis_run, repository, access_token)


@router.post("/projects/{project_id}/analysis-runs", response_model=AnalysisRunResponse, status_code=status.HTTP_201_CREATED)
async def create_analysis_run(project_id: UUID, payload: AnalysisRunCreate, session: AsyncSession = Depends(get_db_session)) -> AnalysisRun:
    await get_project_or_404(project_id, session)
    repository = await get_repository_or_404(payload.repository_id, session)
    if repository.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Repository does not belong to project")
    analysis_run = AnalysisRun(project_id=project_id, **payload.model_dump())
    session.add(analysis_run)
    await session.commit()
    await session.refresh(analysis_run)
    return analysis_run


@router.get("/projects/{project_id}/analysis-runs", response_model=list[AnalysisRunResponse])
async def list_analysis_runs(project_id: UUID, session: AsyncSession = Depends(get_db_session)) -> list[AnalysisRun]:
    await get_project_or_404(project_id, session)
    result = await session.scalars(select(AnalysisRun).where(AnalysisRun.project_id == project_id).order_by(AnalysisRun.created_at.desc()))
    return list(result.all())


@router.get("/analysis-runs/{analysis_run_id}", response_model=AnalysisRunResponse)
async def get_analysis_run(analysis_run_id: UUID, session: AsyncSession = Depends(get_db_session)) -> AnalysisRun:
    return await get_analysis_run_or_404(analysis_run_id, session)


@router.patch("/analysis-runs/{analysis_run_id}", response_model=AnalysisRunResponse)
async def update_analysis_run(analysis_run_id: UUID, payload: AnalysisRunUpdate, session: AsyncSession = Depends(get_db_session)) -> AnalysisRun:
    analysis_run = await get_analysis_run_or_404(analysis_run_id, session)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(analysis_run, key, value)
    await session.commit()
    await session.refresh(analysis_run)
    return analysis_run


@router.post("/projects/{project_id}/issues", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue(project_id: UUID, payload: IssueCreate, session: AsyncSession = Depends(get_db_session)) -> Issue:
    await get_project_or_404(project_id, session)
    data = payload.model_dump()
    if data["repository_id"] is not None:
        repository = await get_repository_or_404(data["repository_id"], session)
        if repository.project_id != project_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Repository does not belong to project")
    if data["analysis_run_id"] is not None:
        analysis_run = await get_analysis_run_or_404(data["analysis_run_id"], session)
        if analysis_run.project_id != project_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Analysis run does not belong to project")
    issue = Issue(project_id=project_id, **data)
    session.add(issue)
    await session.commit()
    await session.refresh(issue)
    return issue


@router.get("/projects/{project_id}/issues", response_model=list[IssueResponse])
async def list_issues(project_id: UUID, session: AsyncSession = Depends(get_db_session)) -> list[Issue]:
    await get_project_or_404(project_id, session)
    result = await session.scalars(select(Issue).where(Issue.project_id == project_id).order_by(Issue.created_at.desc()))
    return list(result.all())


@router.get("/issues/{issue_id}", response_model=IssueResponse)
async def get_issue(issue_id: UUID, session: AsyncSession = Depends(get_db_session)) -> Issue:
    return await get_issue_or_404(issue_id, session)


@router.patch("/issues/{issue_id}", response_model=IssueResponse)
async def update_issue(issue_id: UUID, payload: IssueUpdate, session: AsyncSession = Depends(get_db_session)) -> Issue:
    issue = await get_issue_or_404(issue_id, session)
    data = payload.model_dump(exclude_unset=True)
    if "repository_id" in data and data["repository_id"] is not None:
        repository = await get_repository_or_404(data["repository_id"], session)
        if repository.project_id != issue.project_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Repository does not belong to project")
    if "analysis_run_id" in data and data["analysis_run_id"] is not None:
        analysis_run = await get_analysis_run_or_404(data["analysis_run_id"], session)
        if analysis_run.project_id != issue.project_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Analysis run does not belong to project")
    for key, value in data.items():
        setattr(issue, key, value)
    await session.commit()
    await session.refresh(issue)
    return issue


@router.delete("/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_issue(issue_id: UUID, session: AsyncSession = Depends(get_db_session)) -> None:
    issue = await get_issue_or_404(issue_id, session)
    await session.delete(issue)
    await session.commit()
