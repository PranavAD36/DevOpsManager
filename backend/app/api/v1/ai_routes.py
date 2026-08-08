from fastapi import APIRouter, HTTPException, status
from app.schemas.ai import AnalyzeRepoRequest, AnalyzeRepoResponse
from app.services.ai_service import analyze_repository

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/analyze-repo", response_model=AnalyzeRepoResponse)
async def analyze_repo_endpoint(request: AnalyzeRepoRequest) -> AnalyzeRepoResponse:
    try:
        return await analyze_repository(request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI analysis failed: {str(exc)}"
        ) from exc
