from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.routes import router as v1_router
from app.core.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Foundation API for DevOpsManager",
    lifespan=lifespan,
)

app.include_router(v1_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}
