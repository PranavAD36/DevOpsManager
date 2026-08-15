from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID

from app.db.base import Base


def utc_now() -> datetime:
    from datetime import timezone

    return datetime.now(timezone.utc)


class GitHubConnection(Base):
    __tablename__ = "github_connections"
    __table_args__ = (
        UniqueConstraint("github_user_id", name="uq_github_connections_user_id"),
        Index("ix_github_connections_github_user_id", "github_user_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid4)
    github_user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    github_login: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)



