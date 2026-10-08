import hashlib
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import EngineeringAlert
from app.services.secret_detection import redact_secrets


def make_alert_fingerprint(*parts: str) -> str:
    return hashlib.sha256(":".join(parts).encode("utf-8")).hexdigest()


async def record_alert(
    session: AsyncSession,
    *,
    account_id: UUID,
    repository_id: UUID | None,
    source: str,
    fingerprint: str,
    severity: str,
    message: str,
) -> EngineeringAlert:
    alert = await session.scalar(
        select(EngineeringAlert).where(
            EngineeringAlert.github_account_id == account_id,
            EngineeringAlert.fingerprint == fingerprint,
        )
    )
    safe_message = redact_secrets(message)
    if alert is None:
        alert = EngineeringAlert(
            github_account_id=account_id,
            repository_id=repository_id,
            source=source,
            fingerprint=fingerprint,
            severity=severity,
            message=safe_message,
            status="open",
            is_read=False,
        )
        session.add(alert)
        await session.flush()
    else:
        alert.repository_id = repository_id
        alert.severity = severity
        alert.message = safe_message
        alert.updated_at = datetime.now(timezone.utc)
        if alert.status == "resolved":
            alert.status = "open"
            alert.is_read = False
    return alert
