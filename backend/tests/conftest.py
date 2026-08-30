import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.core import GitHubAccount

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    future=True,
)

TestAsyncSessionLocal = async_sessionmaker(
    bind=test_engine,
    autoflush=False,
    expire_on_commit=False,
    class_=AsyncSession,
)

# Test GitHub account
TEST_GITHUB_ID = 12345
TEST_GITHUB_LOGIN = "test-user"
TEST_GITHUB_ACCOUNT_ID = uuid4()


class MockGitHubUser:
    """Mock GitHub user for testing"""
    def __init__(self):
        self.id = TEST_GITHUB_ID
        self.login = TEST_GITHUB_LOGIN


@pytest.fixture(autouse=True, scope="function")
def setup_test_db():
    async def init_tables():
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    async def drop_tables():
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def override_get_db_session():
        async with TestAsyncSessionLocal() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    # Initialize database
    asyncio.run(init_tables())
    
    # Set up dependency override for database session
    app.dependency_overrides[get_db_session] = override_get_db_session
    
    # Mock the account lookup used by API endpoints without affecting direct GitHub service tests.
    async def mock_get_or_create_github_account(token, session):
        account = await session.scalar(
            select(GitHubAccount).where(GitHubAccount.github_id == TEST_GITHUB_ID)
        )
        if account is None:
            account = GitHubAccount(
                id=TEST_GITHUB_ACCOUNT_ID,
                github_id=TEST_GITHUB_ID,
                github_login=TEST_GITHUB_LOGIN,
                avatar_url="https://github.com/ghost.png",
            )
            session.add(account)
            await session.flush()
        return account

    with patch('app.services.auth_service.get_or_create_github_account', new=mock_get_or_create_github_account):
        yield

        # Clean up
        app.dependency_overrides.clear()
    
    asyncio.run(drop_tables())




