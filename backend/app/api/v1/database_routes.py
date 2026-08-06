from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import check_database_health, get_db_session

router = APIRouter(prefix="/database", tags=["database"])


@router.get("/health")
async def database_health_check(session: AsyncSession = Depends(get_db_session)) -> dict[str, object]:
    healthy = await check_database_health()
    return {
        "status": "ok" if healthy else "unavailable",
        "database": "postgresql",
        "healthy": healthy,
    }
