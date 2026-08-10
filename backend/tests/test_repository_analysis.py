import asyncio
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.core import AnalysisRun, Project, Repository
from app.models.core import Issue
from app.services import repository_analysis
from app.services.ai_service import AIProviderError, AnalyzedIssue, RepositoryAnalysisResult


analysis_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
AnalysisSessionLocal = async_sessionmaker(bind=analysis_engine, class_=AsyncSession, expire_on_commit=False)


def _make_records() -> tuple[Project, Repository, AnalysisRun]:
    project = Project(name=f"Analysis project {uuid4()}")
    repository = Repository(
        project=project,
        provider="github",
        owner="octocat",
        name="hello-world",
        full_name="octocat/hello-world",
        url="https://github.com/octocat/hello-world",
        default_branch="main",
        language="Python",
    )
    run = AnalysisRun(project=project, repository=repository, status="pending")
    return project, repository, run


def test_repository_analysis_completes_and_creates_issues(monkeypatch) -> None:
    async def execute() -> None:
        async with analysis_engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with AnalysisSessionLocal() as session:
            project, repository, run = _make_records()
            session.add_all([project, repository, run])
            await session.commit()
            await session.refresh(run)

            class FakeGitHub:
                async def get_repository_source_files(self, *args, **kwargs):
                    return [SimpleNamespace(path="app.py", content="print('hello')")]

            async def fake_analyzer(repository_name, language, files, provider=None):
                assert repository_name == "octocat/hello-world"
                assert files[0].path == "app.py"
                return RepositoryAnalysisResult(
                    summary="Found one issue",
                    issues=[AnalyzedIssue(
                        title="Avoid debug output",
                        description="Use structured logging instead.",
                        severity="medium",
                        category="quality",
                        file_path="app.py",
                        line_number=1,
                        suggested_fix="Replace print() with logging.info().",
                        corrected_code="import logging\nlogging.info('hello')",
                    )],
                )

            monkeypatch.setattr(repository_analysis, "analyze_repository_content", fake_analyzer)
            result = await repository_analysis.run_repository_analysis(session, run, repository, "server-token", FakeGitHub())
            assert result.status == "completed"
            assert result.started_at is not None
            assert result.completed_at is not None
            assert result.summary == "Found one issue"
            stored_issues = list((await session.scalars(select(Issue).where(Issue.analysis_run_id == result.id))).all())
            assert len(stored_issues) == 1
            assert stored_issues[0].analysis_run_id == result.id
            assert stored_issues[0].repository_id == repository.id
            assert stored_issues[0].suggested_fix == "Replace print() with logging.info()."
            assert stored_issues[0].corrected_code == "import logging\nlogging.info('hello')"
        async with analysis_engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)

    asyncio.run(execute())


def test_provider_failure_marks_run_failed_without_issues(monkeypatch) -> None:
    async def execute() -> None:
        async with analysis_engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with AnalysisSessionLocal() as session:
            project, repository, run = _make_records()
            session.add_all([project, repository, run])
            await session.commit()
            await session.refresh(run)

            class FakeGitHub:
                async def get_repository_source_files(self, *args, **kwargs):
                    return [SimpleNamespace(path="app.py", content="print('hello')")]

            async def failed_analyzer(*args, **kwargs):
                raise AIProviderError("Provider unavailable")

            monkeypatch.setattr(repository_analysis, "analyze_repository_content", failed_analyzer)
            result = await repository_analysis.run_repository_analysis(session, run, repository, "server-token", FakeGitHub())
            assert result.status == "failed"
            assert result.error_message == "Provider unavailable"
            assert result.completed_at is not None
            assert list((await session.scalars(select(Issue).where(Issue.analysis_run_id == result.id))).all()) == []
        async with analysis_engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)

    asyncio.run(execute())