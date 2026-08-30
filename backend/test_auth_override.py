"""Test to verify authentication is working"""
import asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select
from datetime import datetime, timezone
from uuid import uuid4

from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.core import GitHubAccount
from app.services.auth_service import get_authenticated_account

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

TEST_GITHUB_ID = 99999
TEST_GITHUB_LOGIN = "test-override-user"
TEST_GITHUB_ACCOUNT_ID = uuid4()


async def init_db():
    """Initialize test database and create test account"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    async with TestAsyncSessionLocal() as session:
        account = GitHubAccount(
            id=TEST_GITHUB_ACCOUNT_ID,
            github_id=TEST_GITHUB_ID,
            github_login=TEST_GITHUB_LOGIN,
            avatar_url="https://github.com/ghost.png",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(account)
        await session.commit()
        print(f"Created test account: {account.id} / {account.github_login}")


async def override_db_session():
    """Override database session for testing"""
    async with TestAsyncSessionLocal() as session:
        try:
            yield session
        except:
            await session.rollback()
            raise


async def override_auth(request, session):
    """Override authentication - always return test account"""
    stmt = select(GitHubAccount).where(GitHubAccount.github_id == TEST_GITHUB_ID)
    result = await session.execute(stmt)
    account = result.scalars().first()
    print(f"Returning test account from override: {account}")
    return account


# Initialize database
print("Initializing test database...")
asyncio.run(init_db())

# Set up overrides
print("Setting up dependency overrides...")
app.dependency_overrides[get_db_session] = override_db_session
app.dependency_overrides[get_authenticated_account] = override_auth

print(f"Overrides set: {list(app.dependency_overrides.keys())}")

# Test
print("\nTesting with TestClient...")
with TestClient(app) as client:
    response = client.post(
        "/v1/projects",
        json={"name": "Test Project", "description": "Test"},
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 201:
        print("SUCCESS! Project created.")
        print(f"Response: {response.json()}")
    else:
        print(f"FAILED! Response: {response.json()}")
