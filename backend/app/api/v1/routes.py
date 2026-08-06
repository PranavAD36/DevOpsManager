from fastapi import APIRouter

router = APIRouter(prefix="/v1", tags=["v1"])


@router.get("/status")
def get_status() -> dict[str, str]:
    return {"status": "ready"}
