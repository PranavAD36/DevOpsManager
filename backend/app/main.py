from fastapi import FastAPI
from app.api.v1.routes import router as v1_router
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Foundation API for DevOpsManager"
)

app.include_router(v1_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}
