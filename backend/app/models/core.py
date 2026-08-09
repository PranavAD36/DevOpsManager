from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now().astimezone()


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    repositories: Mapped[list["Repository"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    analysis_runs: Mapped[list["AnalysisRun"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    issues: Mapped[list["Issue"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Repository(Base):
    __tablename__ = "repositories"
    __table_args__ = (Index("ix_repositories_project_id", "project_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="github")
    owner: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(511), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(255), nullable=False, default="main")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    github_description: Mapped[str | None] = mapped_column(Text)
    is_private: Mapped[bool | None] = mapped_column(Boolean)
    is_fork: Mapped[bool | None] = mapped_column(Boolean)
    language: Mapped[str | None] = mapped_column(String(100))
    stargazers_count: Mapped[int | None] = mapped_column(Integer)
    forks_count: Mapped[int | None] = mapped_column(Integer)
    open_issues_count: Mapped[int | None] = mapped_column(Integer)
    repository_size: Mapped[int | None] = mapped_column(Integer)
    github_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    github_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pushed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    project: Mapped[Project] = relationship(back_populates="repositories")
    analysis_runs: Mapped[list["AnalysisRun"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    issues: Mapped[list["Issue"]] = relationship(back_populates="repository")


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (
        Index("ix_analysis_runs_project_id", "project_id"),
        Index("ix_analysis_runs_repository_id", "repository_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    repository_id: Mapped[UUID] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    project: Mapped[Project] = relationship(back_populates="analysis_runs")
    repository: Mapped[Repository] = relationship(back_populates="analysis_runs")
    issues: Mapped[list["Issue"]] = relationship(back_populates="analysis_run")


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (
        Index("ix_issues_project_id", "project_id"),
        Index("ix_issues_repository_id", "repository_id"),
        Index("ix_issues_analysis_run_id", "analysis_run_id"),
        Index("ix_issues_status", "status"),
        Index("ix_issues_severity", "severity"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    repository_id: Mapped[UUID | None] = mapped_column(ForeignKey("repositories.id", ondelete="SET NULL"))
    analysis_run_id: Mapped[UUID | None] = mapped_column(ForeignKey("analysis_runs.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(50), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="open")
    category: Mapped[str | None] = mapped_column(String(100))
    file_path: Mapped[str | None] = mapped_column(String(2048))
    line_number: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    project: Mapped[Project] = relationship(back_populates="issues")
    repository: Mapped[Repository | None] = relationship(back_populates="issues")
    analysis_run: Mapped[AnalysisRun | None] = relationship(back_populates="issues")
