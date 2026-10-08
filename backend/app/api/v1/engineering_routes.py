from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from app.api.v1.github_routes import _get_access_token
from app.db.session import get_db_session
from app.integrations.github_app import GitHubAppError, GitHubAppService, GitHubWorkflowRun
from app.models.core import (
    AnalysisRun,
    EngineeringAlert,
    GitHubAccount,
    Issue,
    Project,
    Repository,
    WorkflowRun,
)
from app.services.auth_service import get_authenticated_account, verify_resource_ownership
from app.services.ai_service import (
    AIProviderError,
    IncidentAnalysisResult,
    SecurityReviewFinding,
    analyze_incident_failure,
    analyze_security_pull_request_diff,
    summarize_engineering_metrics,
)
from app.services.alerts import make_alert_fingerprint, record_alert
from app.services.security_review import persist_security_review_findings
from app.services.code_health import HEALTH_CATEGORIES, calculate_code_health
from app.services.secret_detection import SecretFinding, detect_secrets, redact_secrets

router = APIRouter(tags=["engineering intelligence"])
github_app_service = GitHubAppService()


class CodeHealthResponse(BaseModel):
    available: bool
    score: int | None
    breakdown: dict[str, int] | None
    findings_count: int
    source_analysis_run_id: UUID | None
    scoring_method: str


class SecretFindingResponse(BaseModel):
    secret_type: str
    file_path: str
    line_number: int
    severity: str
    masked_value: str


class SecretScanResponse(BaseModel):
    repository_id: UUID
    findings: list[SecretFindingResponse]


class WorkflowRunResponse(BaseModel):
    id: int
    name: str
    branch: str | None
    commit_sha: str | None
    actor: str | None
    status: str
    conclusion: str | None
    created_at: str | None
    updated_at: str | None
    started_at: str | None
    duration_seconds: int | None
    html_url: str


class WorkflowHealthResponse(BaseModel):
    repository_id: UUID
    total_runs: int
    success_rate: float | None
    failure_rate: float | None
    average_duration_seconds: int | None
    runs: list[WorkflowRunResponse]
    recent_failures: list[WorkflowRunResponse]


class IncidentAnalysisRequest(BaseModel):
    source: Literal["github-actions", "build", "deployment", "test", "application", "webhook"]
    summary: str | None = Field(default=None, max_length=4000)
    logs: str | None = Field(default=None, max_length=12000)
    repository_id: UUID | None = None


class EngineeringPoint(BaseModel):
    date: date
    issues_opened: int
    issues_resolved: int
    analyses: int
    analysis_failures: int
    ci_runs: int
    ci_failures: int


class EngineeringTrendResponse(BaseModel):
    start_date: date
    end_date: date
    repository_id: UUID | None
    available_metrics: list[str]
    unavailable_metrics: list[str]
    series: list[EngineeringPoint]
    executive_summary: str | None = None
    security_findings: int = 0
    code_health: int | None = None
    top_problems: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


class RepositoryComparisonRequest(BaseModel):
    repository_ids: list[UUID] = Field(min_length=2, max_length=10)


class RepositoryComparisonItem(BaseModel):
    repository_id: UUID
    full_name: str
    code_health: int | None
    open_issues: int
    security_findings: int
    ci_success_rate: float | None
    unavailable_metrics: list[str]


class RepositoryComparisonResponse(BaseModel):
    repositories: list[RepositoryComparisonItem]


class SecurityFindingResponse(BaseModel):
    id: UUID
    repository_id: UUID | None
    repository_name: str | None
    title: str
    description: str | None
    severity: str
    category: str | None
    file_path: str | None
    line_number: int | None
    status: str
    detected_at: datetime


class EngineeringAlertResponse(BaseModel):
    id: UUID
    repository_id: UUID | None
    source: str
    severity: str
    message: str
    is_read: bool
    status: str
    created_at: datetime
    updated_at: datetime


class EngineeringAlertUpdate(BaseModel):
    is_read: bool | None = None
    status: Literal["open", "resolved"] | None = None


class SecurityReviewResponse(BaseModel):
    repository_id: UUID
    pull_request_number: int
    findings: list[SecurityReviewFinding]

async def _get_owned_repository(
    repository_id: UUID,
    session: AsyncSession,
    account: GitHubAccount,
) -> Repository:
    repository = await session.get(Repository, repository_id)
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    verify_resource_ownership(repository.github_account_id, account.id)
    return repository


@router.get("/repositories/{repository_id}/code-health", response_model=CodeHealthResponse)
async def get_repository_code_health(
    repository_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> CodeHealthResponse:
    account = await get_authenticated_account(request, session)
    repository = await _get_owned_repository(repository_id, session, account)
    latest_run = await session.scalar(
        select(AnalysisRun)
        .where(
            AnalysisRun.repository_id == repository.id,
            AnalysisRun.github_account_id == account.id,
            AnalysisRun.status == "completed",
        )
        .order_by(AnalysisRun.completed_at.desc())
        .limit(1)
    )
    if latest_run is None:
        return CodeHealthResponse(
            available=False,
            score=None,
            breakdown=None,
            findings_count=0,
            source_analysis_run_id=None,
            scoring_method="Unavailable until a repository analysis completes.",
        )
    issues = list(
        (
            await session.scalars(
                select(Issue).where(
                    Issue.repository_id == repository.id,
                    Issue.github_account_id == account.id,
                )
            )
        ).all()
    )
    score, breakdown = calculate_code_health(issues)
    return CodeHealthResponse(
        available=True,
        score=score,
        breakdown=breakdown,
        findings_count=sum(
            issue.status.lower() not in {"resolved", "rejected", "applied", "closed"}
            for issue in issues
        ),
        source_analysis_run_id=latest_run.id,
        scoring_method=(
            "Start each dimension at 100; subtract 20 per critical, 10 per high, "
            "5 per medium, and 2 per low unresolved finding mapped to that dimension. "
            "Each dimension is floored at 0; overall score is the rounded mean of "
            f"{', '.join(HEALTH_CATEGORIES)}. Resolved, rejected, applied, and closed findings are excluded."
        ),
    )


@router.get("/repositories/{repository_id}/secrets", response_model=SecretScanResponse)
async def scan_repository_secrets(
    repository_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> SecretScanResponse:
    account = await get_authenticated_account(request, session)
    repository = await _get_owned_repository(repository_id, session, account)
    if repository.provider != "github":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported repository provider")
    try:
        files = await github_app_service.get_repository_source_files(
            _get_access_token(request),
            repository.owner,
            repository.name,
            repository.default_branch,
            include_sensitive_files=True,
        )
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    findings: list[SecretFinding] = detect_secrets(files)
    return SecretScanResponse(
        repository_id=repository.id,
        findings=[
            SecretFindingResponse(
                secret_type=finding.secret_type,
                file_path=finding.file_path,
                line_number=finding.line_number,
                severity=finding.severity,
                masked_value=finding.masked_value,
            )
            for finding in findings
        ],
    )


def _workflow_run_response(run: GitHubWorkflowRun) -> WorkflowRunResponse:
    duration = None
    if run.started_at is not None and run.updated_at is not None and run.conclusion is not None:
        duration = max(0, int((run.updated_at - run.started_at).total_seconds()))
    return WorkflowRunResponse(
        id=run.id,
        name=run.name,
        branch=run.branch,
        commit_sha=run.commit_sha,
        actor=run.actor,
        status=run.status,
        conclusion=run.conclusion,
        created_at=run.created_at.isoformat() if run.created_at else None,
        updated_at=run.updated_at.isoformat() if run.updated_at else None,
        started_at=run.started_at.isoformat() if run.started_at else None,
        duration_seconds=duration,
        html_url=run.html_url,
    )


@router.get("/repositories/{repository_id}/workflows", response_model=WorkflowHealthResponse)
async def get_repository_workflow_health(
    repository_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> WorkflowHealthResponse:
    account = await get_authenticated_account(request, session)
    repository = await _get_owned_repository(repository_id, session, account)
    if repository.provider != "github":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported repository provider")
    try:
        runs = await github_app_service.get_workflow_runs(
            _get_access_token(request),
            repository.owner,
            repository.name,
        )
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    completed = [run for run in runs if run.conclusion in {"success", "failure"}]
    successful = sum(run.conclusion == "success" for run in completed)
    failed = sum(run.conclusion == "failure" for run in completed)
    durations = [
        duration
        for run in completed
        if (duration := _workflow_run_response(run).duration_seconds) is not None
    ]
    responses = [_workflow_run_response(run) for run in runs]
    failed_responses = [item for item in responses if item.conclusion == "failure"][:5]
    existing_records = list(
        (
            await session.scalars(
                select(WorkflowRun).where(
                    WorkflowRun.repository_id == repository.id,
                    WorkflowRun.github_run_id.in_([run.id for run in runs]),
                )
            )
        ).all()
    ) if runs else []
    records_by_github_id = {record.github_run_id: record for record in existing_records}
    for run, response in zip(runs, responses):
        if run.created_at is None:
            continue
        record = records_by_github_id.get(run.id)
        if record is None:
            record = WorkflowRun(
                github_account_id=account.id,
                repository_id=repository.id,
                github_run_id=run.id,
                workflow_name=run.name,
                created_at=run.created_at,
                status=run.status,
            )
            session.add(record)
            records_by_github_id[run.id] = record
        record.workflow_name = run.name
        record.branch = run.branch
        record.commit_sha = run.commit_sha
        record.actor = run.actor
        record.status = run.status
        record.conclusion = run.conclusion
        record.created_at = run.created_at
        record.updated_at = run.updated_at
        record.started_at = run.started_at
        record.duration_seconds = response.duration_seconds
        record.html_url = run.html_url
    latest_runs: dict[tuple[str, str], GitHubWorkflowRun] = {}
    for run in sorted(
        runs,
        key=lambda item: (
            item.created_at or datetime.min.replace(tzinfo=timezone.utc),
            item.id,
        ),
        reverse=True,
    ):
        latest_runs.setdefault((run.name, run.branch or ""), run)
    for run in latest_runs.values():
        if run.conclusion == "failure":
            await record_alert(
                session,
                account_id=account.id,
                repository_id=repository.id,
                source="github-actions",
                fingerprint=make_alert_fingerprint(
                    "workflow-failure", str(repository.id), run.name, run.branch or ""
                ),
                severity="high",
                message=f"The latest {run.name} workflow run failed on {run.branch or 'unknown branch'}.",
            )
    await session.commit()
    return WorkflowHealthResponse(
        repository_id=repository.id,
        total_runs=len(responses),
        success_rate=round(successful / len(completed) * 100, 1) if completed else None,
        failure_rate=round(failed / len(completed) * 100, 1) if completed else None,
        average_duration_seconds=round(sum(durations) / len(durations)) if durations else None,
        runs=responses,
        recent_failures=failed_responses,
    )


@router.post("/incidents/analyze", response_model=IncidentAnalysisResult)
async def analyze_incident(
    payload: IncidentAnalysisRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> IncidentAnalysisResult:
    account = await get_authenticated_account(request, session)
    if payload.repository_id is not None:
        await _get_owned_repository(payload.repository_id, session, account)
    evidence_parts = []
    if payload.summary:
        evidence_parts.append(f"Summary:\n{payload.summary}")
    if payload.logs:
        evidence_parts.append(f"Failure output:\n{payload.logs}")
    try:
        return await analyze_incident_failure(payload.source, "\n\n".join(evidence_parts))
    except AIProviderError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.post(
    "/repositories/{repository_id}/pull-requests/{pull_request_number}/security-review",
    response_model=SecurityReviewResponse,
)
async def review_pull_request_security(
    repository_id: UUID,
    request: Request,
    pull_request_number: int = Path(ge=1),
    session: AsyncSession = Depends(get_db_session),
) -> SecurityReviewResponse:
    account = await get_authenticated_account(request, session)
    repository = await _get_owned_repository(repository_id, session, account)
    token = _get_access_token(request)
    if token.startswith("mock_"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A real GitHub OAuth token is required for a security review")
    try:
        diff = await github_app_service.get_pull_request_diff(
            token,
            repository.owner,
            repository.name,
            pull_request_number,
        )
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    if len(diff) > 200_000:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Pull request diff exceeds the supported size")
    try:
        review = await analyze_security_pull_request_diff(repository.full_name, diff)
    except AIProviderError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    await persist_security_review_findings(
        session,
        repository,
        account.id,
        review.findings,
    )
    await session.commit()
    return SecurityReviewResponse(
        repository_id=repository.id,
        pull_request_number=pull_request_number,
        findings=review.findings,
    )


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def _get_owned_project(project_id: UUID, session: AsyncSession, account: GitHubAccount) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    verify_resource_ownership(project.github_account_id, account.id)
    return project


async def _build_engineering_trends(
    project: Project,
    account: GitHubAccount,
    session: AsyncSession,
    start: datetime,
    end: datetime,
    repository_id: UUID | None,
) -> EngineeringTrendResponse:
    issue_query = select(Issue).where(
        Issue.project_id == project.id,
        Issue.github_account_id == account.id,
    )
    run_query = select(AnalysisRun).where(
        AnalysisRun.project_id == project.id,
        AnalysisRun.github_account_id == account.id,
    )
    if repository_id is not None:
        issue_query = issue_query.where(Issue.repository_id == repository_id)
        run_query = run_query.where(AnalysisRun.repository_id == repository_id)
    issues = list((await session.scalars(issue_query)).all())
    runs = list((await session.scalars(run_query)).all())
    workflow_query = select(WorkflowRun).where(
        WorkflowRun.github_account_id == account.id,
        WorkflowRun.repository_id.in_(
            select(Repository.id).where(
                Repository.project_id == project.id,
                Repository.github_account_id == account.id,
            )
        ),
    )
    if repository_id is not None:
        workflow_query = workflow_query.where(WorkflowRun.repository_id == repository_id)
    workflow_runs = list((await session.scalars(workflow_query)).all())

    start_day = start.date()
    end_day = (end - timedelta(microseconds=1)).date()
    totals: dict[date, dict[str, int]] = {}
    current = start_day
    while current <= end_day:
        totals[current] = {
            "issues_opened": 0,
            "issues_resolved": 0,
            "analyses": 0,
            "analysis_failures": 0,
            "ci_runs": 0,
            "ci_failures": 0,
        }
        current += timedelta(days=1)

    for issue in issues:
        created = _as_utc(issue.created_at)
        if start <= created < end:
            totals[created.date()]["issues_opened"] += 1
        updated = _as_utc(issue.updated_at)
        if (
            issue.status.lower() in {"resolved", "applied"}
            and start <= updated < end
        ):
            totals[updated.date()]["issues_resolved"] += 1
    for run in runs:
        created = _as_utc(run.created_at)
        if start <= created < end:
            totals[created.date()]["analyses"] += 1
            if run.status.lower() == "failed":
                totals[created.date()]["analysis_failures"] += 1
    for run in workflow_runs:
        created = _as_utc(run.created_at)
        if start <= created < end:
            totals[created.date()]["ci_runs"] += 1
            if run.conclusion == "failure":
                totals[created.date()]["ci_failures"] += 1
    available_metrics = ["issues_opened", "issues_resolved", "analyses", "analysis_failures"]
    unavailable_metrics = [
        "commits",
        "pull_requests",
        "review_time",
        "pull_request_cycle_time",
        "deployments",
    ]
    if workflow_runs:
        available_metrics.extend(["ci_runs", "ci_failures"])
    else:
        unavailable_metrics.extend(["ci_runs", "ci_failures"])
    period_issues = [
        issue for issue in issues
        if start <= _as_utc(issue.created_at) < end
    ]
    open_issues = [
        issue for issue in period_issues
        if issue.status.lower() not in {"resolved", "rejected", "applied", "closed"}
    ]
    current_open_issues = [
        issue for issue in issues
        if issue.status.lower() not in {"resolved", "rejected", "applied", "closed"}
    ]
    security_findings = sum(
        "security" in (issue.category or "").lower()
        or "secret" in (issue.title or "").lower()
        or "vulnerab" in (issue.category or "").lower()
        or "vulnerab" in (issue.title or "").lower()
        for issue in open_issues
    )
    latest_runs_by_repository: dict[UUID, AnalysisRun] = {}
    for run in runs:
        created = _as_utc(run.created_at)
        if run.status != "completed" or not start <= created < end:
            continue
        previous = latest_runs_by_repository.get(run.repository_id)
        if previous is None or _as_utc(run.created_at) > _as_utc(previous.created_at):
            latest_runs_by_repository[run.repository_id] = run
    repository_scores = [
        calculate_code_health(
            issue
            for issue in current_open_issues
            if issue.repository_id == repository_id
        )[0]
        for repository_id in latest_runs_by_repository
    ]
    code_health = round(sum(repository_scores) / len(repository_scores)) if repository_scores else None
    problem_counts: dict[str, int] = {}
    for issue in open_issues:
        safe_title = redact_secrets(issue.title)
        problem_counts[safe_title] = problem_counts.get(safe_title, 0) + 1
    top_problems = [
        title
        for title, _ in sorted(problem_counts.items(), key=lambda item: (-item[1], item[0]))[:5]
    ]
    total_ci_failures = sum(point["ci_failures"] for point in totals.values())
    total_analysis_failures = sum(point["analysis_failures"] for point in totals.values())
    improvements = []
    if security_findings:
        improvements.append("Review and remediate the outstanding security findings.")
    if total_ci_failures:
        improvements.append("Investigate the recorded failing GitHub Actions runs.")
    if total_analysis_failures:
        improvements.append("Review failed repository analyses and rerun them after fixing their cause.")
    if not improvements:
        improvements.append("No corrective actions are indicated by the available findings in this report.")
    return EngineeringTrendResponse(
        start_date=start_day,
        end_date=end_day,
        repository_id=repository_id,
        available_metrics=available_metrics,
        unavailable_metrics=unavailable_metrics,
        series=[
            EngineeringPoint(date=day, **counts)
            for day, counts in sorted(totals.items())
        ],
        security_findings=security_findings,
        code_health=code_health,
        top_problems=top_problems,
        improvements=improvements,
    )


@router.get("/projects/{project_id}/trends", response_model=EngineeringTrendResponse)
async def get_engineering_trends(
    project_id: UUID,
    request: Request,
    days: int = Query(default=30, ge=7, le=90),
    repository_id: UUID | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> EngineeringTrendResponse:
    if days not in {7, 30, 90}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="days must be 7, 30, or 90")
    account = await get_authenticated_account(request, session)
    project = await _get_owned_project(project_id, session, account)
    if repository_id is not None:
        repository = await _get_owned_repository(repository_id, session, account)
        if repository.project_id != project.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    end = datetime.now(timezone.utc) + timedelta(microseconds=1)
    start = end - timedelta(days=days)
    return await _build_engineering_trends(project, account, session, start, end, repository_id)


@router.get("/projects/{project_id}/reports", response_model=EngineeringTrendResponse)
async def get_historical_engineering_report(
    project_id: UUID,
    request: Request,
    period: Literal["weekly", "monthly", "custom"] = Query(default="monthly"),
    start_date: date | None = None,
    end_date: date | None = None,
    repository_id: UUID | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> EngineeringTrendResponse:
    account = await get_authenticated_account(request, session)
    project = await _get_owned_project(project_id, session, account)
    if repository_id is not None:
        repository = await _get_owned_repository(repository_id, session, account)
        if repository.project_id != project.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    today = datetime.now(timezone.utc).date()
    report_end = end_date or today
    if period == "custom":
        if start_date is None or end_date is None or start_date > end_date:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Custom reports require a valid start_date and end_date")
        report_start = start_date
    elif period == "weekly":
        report_start = report_end - timedelta(days=6)
    else:
        report_start = report_end - timedelta(days=29)
    report = await _build_engineering_trends(
        project,
        account,
        session,
        datetime.combine(report_start, datetime.min.time(), tzinfo=timezone.utc),
        datetime.combine(report_end + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc),
        repository_id,
    )
    metrics = {
        "period_start": report.start_date.isoformat(),
        "period_end": report.end_date.isoformat(),
        "issues_opened": sum(point.issues_opened for point in report.series),
        "issues_resolved": sum(point.issues_resolved for point in report.series),
        "analyses": sum(point.analyses for point in report.series),
        "analysis_failures": sum(point.analysis_failures for point in report.series),
        "ci_runs": sum(point.ci_runs for point in report.series),
        "ci_failures": sum(point.ci_failures for point in report.series),
        "security_findings": report.security_findings,
        "code_health": report.code_health,
        "top_problems": ", ".join(report.top_problems) or "none recorded",
        "improvements": " ".join(report.improvements),
        "unavailable_metrics": ", ".join(report.unavailable_metrics),
    }
    try:
        summary = await summarize_engineering_metrics(metrics)
    except AIProviderError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return report.model_copy(update={"executive_summary": summary})


@router.post("/repositories/compare", response_model=RepositoryComparisonResponse)
async def compare_repositories(
    payload: RepositoryComparisonRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> RepositoryComparisonResponse:
    account = await get_authenticated_account(request, session)
    if len(set(payload.repository_ids)) != len(payload.repository_ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Repository IDs must be unique")
    repositories = list(
        (
            await session.scalars(
                select(Repository).where(
                    Repository.id.in_(payload.repository_ids),
                    Repository.github_account_id == account.id,
                )
            )
        ).all()
    )
    if len(repositories) != len(payload.repository_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more repositories were not found")
    results = []
    for repository in repositories:
        latest_run = await session.scalar(
            select(AnalysisRun)
            .where(
                AnalysisRun.repository_id == repository.id,
                AnalysisRun.github_account_id == account.id,
                AnalysisRun.status == "completed",
            )
            .order_by(AnalysisRun.completed_at.desc())
            .limit(1)
        )
        issues = list(
            (
                await session.scalars(
                    select(Issue).where(
                        Issue.repository_id == repository.id,
                        Issue.github_account_id == account.id,
                    )
                )
            ).all()
        )
        open_issues = [
            issue for issue in issues
            if issue.status.lower() not in {"resolved", "rejected", "applied", "closed"}
        ]
        health = calculate_code_health(open_issues)[0] if latest_run is not None else None
        workflow_runs = list(
            (
                await session.scalars(
                    select(WorkflowRun).where(
                        WorkflowRun.repository_id == repository.id,
                        WorkflowRun.github_account_id == account.id,
                        WorkflowRun.conclusion.in_(["success", "failure"]),
                    )
                )
            ).all()
        )
        ci_success_rate = (
            round(sum(run.conclusion == "success" for run in workflow_runs) / len(workflow_runs) * 100, 1)
            if workflow_runs
            else None
        )
        unavailable_comparison_metrics = [
            "pr_cycle_time",
            "review_time",
            "deployment_frequency",
            "developer_activity",
            "technical_debt",
        ]
        if ci_success_rate is None:
            unavailable_comparison_metrics.append("ci_success_rate")
        results.append(
            RepositoryComparisonItem(
                repository_id=repository.id,
                full_name=repository.full_name,
                code_health=health,
                open_issues=len(open_issues),
                security_findings=sum(
                    "security" in (issue.category or "").lower()
                    or "secret" in issue.title.lower()
                    or "vulnerab" in (issue.category or "").lower()
                    or "vulnerab" in issue.title.lower()
                    for issue in open_issues
                ),
                ci_success_rate=ci_success_rate,
                unavailable_metrics=unavailable_comparison_metrics,
            )
        )
    return RepositoryComparisonResponse(repositories=results)


@router.get("/security/findings", response_model=list[SecurityFindingResponse])
async def list_security_findings(
    request: Request,
    severity: Literal["critical", "high", "medium", "low"] | None = None,
    repository_id: UUID | None = None,
    finding_status: str | None = Query(default=None, alias="status", max_length=50),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> list[SecurityFindingResponse]:
    account = await get_authenticated_account(request, session)
    query = select(Issue).where(
        Issue.github_account_id == account.id,
        or_(
            Issue.category.ilike("%security%"),
            Issue.category.ilike("%secret%"),
            Issue.title.ilike("%security%"),
            Issue.title.ilike("%secret%"),
            Issue.title.ilike("%vulnerab%"),
        ),
    )
    if repository_id is not None:
        await _get_owned_repository(repository_id, session, account)
        query = query.where(Issue.repository_id == repository_id)
    if severity is not None:
        query = query.where(Issue.severity == severity)
    if finding_status is not None:
        query = query.where(Issue.status == finding_status)
    if start_date is not None:
        query = query.where(Issue.created_at >= start_date)
    if end_date is not None:
        query = query.where(Issue.created_at <= end_date)
    findings = list(
        (
            await session.scalars(
                query.order_by(Issue.created_at.desc()).limit(500)
            )
        ).all()
    )
    repository_ids = {issue.repository_id for issue in findings if issue.repository_id is not None}
    repo_names = {}
    if repository_ids:
        owned_repositories = await session.scalars(
            select(Repository).where(
                Repository.id.in_(repository_ids),
                Repository.github_account_id == account.id,
            )
        )
        repo_names = {repository.id: repository.full_name for repository in owned_repositories}
    return [
        SecurityFindingResponse(
            id=issue.id,
            repository_id=issue.repository_id,
            repository_name=repo_names.get(issue.repository_id),
            title=redact_secrets(issue.title),
            description=redact_secrets(issue.description) if issue.description else None,
            severity=issue.severity,
            category=issue.category,
            file_path=issue.file_path,
            line_number=issue.line_number,
            status=issue.status,
            detected_at=issue.created_at,
        )
        for issue in findings
    ]


@router.get("/alerts", response_model=list[EngineeringAlertResponse])
async def list_engineering_alerts(
    request: Request,
    status_filter: Literal["open", "resolved"] | None = Query(default=None, alias="status"),
    unread_only: bool = False,
    repository_id: UUID | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> list[EngineeringAlert]:
    account = await get_authenticated_account(request, session)
    query = select(EngineeringAlert).where(EngineeringAlert.github_account_id == account.id)
    if status_filter is not None:
        query = query.where(EngineeringAlert.status == status_filter)
    if unread_only:
        query = query.where(EngineeringAlert.is_read.is_(False))
    if repository_id is not None:
        await _get_owned_repository(repository_id, session, account)
        query = query.where(EngineeringAlert.repository_id == repository_id)
    result = await session.scalars(query.order_by(EngineeringAlert.created_at.desc()).limit(200))
    return list(result.all())


@router.patch("/alerts/{alert_id}", response_model=EngineeringAlertResponse)
async def update_engineering_alert(
    alert_id: UUID,
    payload: EngineeringAlertUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> EngineeringAlert:
    account = await get_authenticated_account(request, session)
    alert = await session.scalar(
        select(EngineeringAlert).where(
            EngineeringAlert.id == alert_id,
            EngineeringAlert.github_account_id == account.id,
        )
    )
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(alert, key, value)
    await session.commit()
    await session.refresh(alert)
    return alert
