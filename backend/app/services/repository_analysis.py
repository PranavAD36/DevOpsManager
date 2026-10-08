import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.github_app import GitHubAppError, GitHubAppService
from app.models.core import AnalysisRun, Issue, Repository, Project
from app.services.ai_service import AIProviderError, analyze_repository_content
from app.services.secret_detection import scan_and_exclude_secret_files
from app.services.alerts import make_alert_fingerprint, record_alert
from app.integrations.github_app import is_relevant_source_path


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
        project = await session.get(Project, analysis_run.project_id)
        if not project:
            raise ValueError("Project not found")
        
        service = github_service or GitHubAppService()
        files = await service.get_repository_source_files(
            access_token,
            repository.owner,
            repository.name,
            repository.default_branch,
            include_sensitive_files=True,
        )
        files_without_secrets, secret_findings = scan_and_exclude_secret_files(files)
        secret_paths = {finding.file_path for finding in secret_findings}
        safe_files = [item for item in files_without_secrets if is_relevant_source_path(item.path)]
        result = await analyze_repository_content(
            repository.full_name, 
            repository.language, 
            safe_files,
            custom_rules=project.custom_rules
        )
        source_by_path = {item.path: item.content for item in safe_files}

        for finding in secret_findings:
            fp_content = f"{finding.file_path}:secret:{finding.secret_type}:{finding.line_number}"
            fingerprint = hashlib.sha256(fp_content.encode("utf-8")).hexdigest()
            existing = await session.scalar(
                select(Issue).where(Issue.project_id == project.id, Issue.fingerprint == fingerprint)
            )
            if existing:
                continue
            session.add(
                Issue(
                    project_id=analysis_run.project_id,
                    repository_id=repository.id,
                    analysis_run_id=analysis_run.id,
                    github_account_id=analysis_run.github_account_id,
                    title=f"Potential {finding.secret_type} detected",
                    description=(
                        "A credential-like value was found. The value was not stored or sent to the AI provider. "
                        "Revoke or rotate it, then remove it from the repository history."
                    ),
                    severity="critical",
                    status="open",
                    category="security",
                    file_path=finding.file_path,
                    line_number=finding.line_number,
                    suggested_fix="Revoke or rotate the credential and remove it from the repository history.",
                    fingerprint=fingerprint,
                    original_content=None,
                    corrected_code=None,
                )
            )
            await record_alert(
                session,
                account_id=analysis_run.github_account_id,
                repository_id=repository.id,
                source="secret-detection",
                fingerprint=make_alert_fingerprint("secret", str(repository.id), finding.file_path, finding.secret_type),
                severity="critical",
                message=(
                    f"A secret-like {finding.secret_type} was detected in "
                    f"{finding.file_path}:{finding.line_number}. Rotate the credential immediately."
                ),
            )
        for detected_issue in result.issues:
            if detected_issue.file_path in secret_paths:
                continue
            # Generate fingerprint
            fp_content = f"{detected_issue.file_path}:{detected_issue.title}:{detected_issue.category}"
            fingerprint = hashlib.sha256(fp_content.encode("utf-8")).hexdigest()
            
            # Check for duplicate in this project
            existing = await session.scalar(
                select(Issue).where(Issue.project_id == project.id, Issue.fingerprint == fingerprint)
            )
            if existing:
                continue

            session.add(
                Issue(
                    project_id=analysis_run.project_id,
                    repository_id=repository.id,
                    analysis_run_id=analysis_run.id,
                    github_account_id=analysis_run.github_account_id,
                    title=detected_issue.title,
                    description=detected_issue.description,
                    severity=detected_issue.severity,
                    status="open",
                    category=detected_issue.category,
                    file_path=detected_issue.file_path,
                    line_number=detected_issue.line_number,
                    suggested_fix=detected_issue.suggested_fix,
                    corrected_code=detected_issue.corrected_code,
                    original_content=source_by_path.get(detected_issue.file_path or ""),
                    fingerprint=fingerprint,
                    cross_file_fixes=[fix.model_dump() for fix in detected_issue.cross_file_fixes] if detected_issue.cross_file_fixes else None,
                )
            )
            if detected_issue.severity in {"critical", "high"}:
                await record_alert(
                    session,
                    account_id=analysis_run.github_account_id,
                    repository_id=repository.id,
                    source="ai-analysis",
                    fingerprint=make_alert_fingerprint(
                        "ai-finding", str(repository.id), fingerprint
                    ),
                    severity=detected_issue.severity,
                    message=f"{detected_issue.severity.title()} finding: {detected_issue.title}",
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
