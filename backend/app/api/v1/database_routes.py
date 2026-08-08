from fastapi import APIRouter

from app.db.session import check_database_health

router = APIRouter(prefix="/database", tags=["database"])


@router.get("/health")
async def database_health_check() -> dict[str, object]:
    healthy = await check_database_health()
    return {
        "status": "ok" if healthy else "unavailable",
        "database": "postgresql",
        "healthy": healthy,
    }
