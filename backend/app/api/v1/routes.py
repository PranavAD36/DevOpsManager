from fastapi import APIRouter

from app.api.v1.ai_routes import router as ai_router
from app.api.v1.core_routes import router as core_router
from app.api.v1.database_routes import router as database_router
from app.api.v1.github_routes import router as github_router

router = APIRouter(prefix="/v1", tags=["v1"])
router.include_router(database_router)
router.include_router(ai_router)
router.include_router(github_router)
router.include_router(core_router)


@router.get("/status")
def get_status() -> dict[str, str]:
    return {"status": "ready"}
