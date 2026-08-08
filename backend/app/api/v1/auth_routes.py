from typing import Any

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def get_me(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    user_metadata = user.get("user_metadata") or {}
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "display_name": user_metadata.get("display_name"),
    }
