import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/devopsmanager"

async def add_columns():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        try:
            # Add github_account_id to projects if not exists
            await conn.execute(text("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_account_id UUID;
            """))
            print("✓ Added github_account_id to projects")
        except Exception as e:
            print(f"projects: {e}")
        
        try:
            # Add github_account_id to repositories if not exists
            await conn.execute(text("""
                ALTER TABLE repositories ADD COLUMN IF NOT EXISTS github_account_id UUID;
            """))
            print("✓ Added github_account_id to repositories")
        except Exception as e:
            print(f"repositories: {e}")
        
        try:
            # Add github_account_id to analysis_runs if not exists
            await conn.execute(text("""
                ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS github_account_id UUID;
            """))
            print("✓ Added github_account_id to analysis_runs")
        except Exception as e:
            print(f"analysis_runs: {e}")
        
        try:
            # Add github_account_id and applied_at to issues if not exists
            await conn.execute(text("""
                ALTER TABLE issues ADD COLUMN IF NOT EXISTS github_account_id UUID;
            """))
            print("✓ Added github_account_id to issues")
        except Exception as e:
            print(f"issues github_account_id: {e}")
        
        try:
            await conn.execute(text("""
                ALTER TABLE issues ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP WITH TIME ZONE;
            """))
            print("✓ Added applied_at to issues")
        except Exception as e:
            print(f"issues applied_at: {e}")
    
    await engine.dispose()

asyncio.run(add_columns())
print("\nAll columns added successfully!")
