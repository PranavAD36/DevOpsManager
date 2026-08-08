from fastapi import APIRouter

from app.api.v1.auth_routes import router as auth_router
from app.api.v1.database_routes import router as database_router

router = APIRouter(prefix="/v1", tags=["v1"])
router.include_router(database_router)
router.include_router(auth_router)


@router.get("/status")
def get_status() -> dict[str, str]:
    return {"status": "ready"}
