from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.github_app import GitHubAppError, GitHubAppService
from app.models.core import AnalysisRun, Issue, Repository
from app.services.ai_service import AIProviderError, analyze_repository_content


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def run_repository_analysis(
    session: AsyncSession,
    analysis_run: AnalysisRun,
    repository: Repository,
    access_token: str,
    github_service: GitHubAppService | None = None,
) -> AnalysisRun:
    analysis_run.status = "running"
    analysis_run.started_at = utc_now()
    await session.commit()
    try:
        service = github_service or GitHubAppService()
        files = await service.get_repository_source_files(
            access_token,
            repository.owner,
            repository.name,
            repository.default_branch,
        )
        result = await analyze_repository_content(repository.full_name, repository.language, files)
        for detected_issue in result.issues:
            session.add(
                Issue(
                    project_id=analysis_run.project_id,
                    repository_id=repository.id,
                    analysis_run_id=analysis_run.id,
                    title=detected_issue.title,
                    description=detected_issue.description,
                    severity=detected_issue.severity,
                    status="open",
                    category=detected_issue.category,
                    file_path=detected_issue.file_path,
                    line_number=detected_issue.line_number,
                )
            )
        analysis_run.status = "completed"
        analysis_run.summary = result.summary
        analysis_run.completed_at = utc_now()
        analysis_run.error_message = None
    except Exception as exc:
        await session.rollback()
        analysis_run = await session.get(AnalysisRun, analysis_run.id)
        if analysis_run is None:
            raise
        analysis_run.status = "failed"
        analysis_run.error_message = str(exc)
        analysis_run.completed_at = utc_now()
        analysis_run.summary = None
    await session.commit()
    await session.refresh(analysis_run)
    return analysis_run