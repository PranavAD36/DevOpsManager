#!/usr/bin/env python
"""Debug script to test dependency overrides"""

import asyncio
from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import (
    TestAsyncSessionLocal,
    TEST_GITHUB_ACCOUNT_ID,
    TEST_GITHUB_ID,
    TEST_GITHUB_LOGIN,
    setup_test_db,
)
from app.db.base import Base
from app.db.session import get_db_session
from app.services.auth_service import get_authenticated_account
from app.models.core import GitHubAccount
from datetime import datetime, timezone
from uuid import uuid4
import pytest

# Run the setup
print("Setting up test database...")
# Note: This is a workaround for testing, normally pytest handles this

async def setup():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    
    TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
    test_engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        future=True,
    )
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    TestAsyncSessionLocal = async_sessionmaker(
        bind=test_engine,
        autoflush=False,
        expire_on_commit=False,
        class_=AsyncSession,
    )
    
    # Create test account
    async with TestAsyncSessionLocal() as session:
        test_account = GitHubAccount(
            id=TEST_GITHUB_ACCOUNT_ID,
            github_id=TEST_GITHUB_ID,
            github_login=TEST_GITHUB_LOGIN,
            avatar_url="https://github.com/ghost.png",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(test_account)
        await session.commit()
    
    return test_engine, TestAsyncSessionLocal

# Simple test
print("Testing with TestClient...")
try:
    with TestClient(app) as client:
        response = client.post(
            "/v1/projects",
            json={"name": "Test", "description": "Test"},
        )
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json() if response.status_code != 401 else response.json()}")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
