import hashlib
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Issue, Repository
from app.services.ai_service import SecurityReviewFinding
from app.services.alerts import make_alert_fingerprint, record_alert
from app.services.secret_detection import redact_secrets


async def persist_security_review_findings(
    session: AsyncSession,
    repository: Repository,
    account_id: UUID,
    findings: list[SecurityReviewFinding],
) -> None:
    recorded_fingerprints: set[str] = set()
    for finding in findings:
        fingerprint = hashlib.sha256(
            f"{repository.id}:{finding.file_path}:{finding.category}:{finding.title}".encode("utf-8")
        ).hexdigest()
        existing = await session.scalar(
            select(Issue).where(
                Issue.project_id == repository.project_id,
                Issue.fingerprint == fingerprint,
            )
        )
        if existing is None and fingerprint not in recorded_fingerprints:
            session.add(
                Issue(
                    project_id=repository.project_id,
                    repository_id=repository.id,
                    github_account_id=account_id,
                    title=redact_secrets(finding.title),
                    description=redact_secrets(
                        f"{finding.explanation}\n\nEvidence: {finding.evidence}\n"
                        f"Confidence: {finding.confidence_status}"
                    ),
                    severity=finding.severity,
                    status="open",
                    category=f"security:{finding.category}",
                    file_path=finding.file_path,
                    line_number=finding.line_number,
                    suggested_fix=redact_secrets(finding.suggested_fix),
                    fingerprint=fingerprint,
                    original_content=None,
                    corrected_code=None,
                )
            )
            recorded_fingerprints.add(fingerprint)
        if finding.severity in {"critical", "high"}:
            await record_alert(
                session,
                account_id=account_id,
                repository_id=repository.id,
                source="ai-security-review",
                fingerprint=make_alert_fingerprint("security-review", str(repository.id), fingerprint),
                severity=finding.severity,
                message=f"{finding.severity.title()} security finding: {finding.title}",
            )
