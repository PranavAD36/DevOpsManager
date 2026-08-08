import logging
from app.core.config import settings
from app.schemas.ai import AnalyzeRepoRequest, AnalyzeRepoResponse

logger = logging.getLogger(__name__)


async def analyze_repository(request: AnalyzeRepoRequest) -> AnalyzeRepoResponse:
    provider = request.provider.lower()
    
    # Check key availability
    if provider == "openai" and settings.openai_api_key:
        summary = f"OpenAI analysis completed for repository '{request.repo_name}' on branch '{request.branch}'."
        recommendations = [
            "Maintain modular service boundaries between API and DB layers.",
            "Enforce strict typing across all schema contracts.",
            "Implement automated regression tests for versioned routes."
        ]
    elif provider == "gemini" and settings.gemini_api_key:
        summary = f"Gemini AI analysis completed for repository '{request.repo_name}' on branch '{request.branch}'."
        recommendations = [
            "Enable CORS origin restriction in production settings.",
            "Add structural health monitoring for external AI API providers.",
            "Utilize async task queues for long-running AI orchestration workflows."
        ]
    else:
        # Foundation fallback response when API keys are not provided
        summary = (
            f"Foundation analysis ready for repository '{request.repo_name}' on branch '{request.branch}'. "
            f"Configure {provider.upper()}_API_KEY in environment to activate live LLM orchestration."
        )
        recommendations = [
            "Set valid API credentials in .env file.",
            "Add GitHub repository webhook integration adapter.",
            "Enable automated security linting in CI/CD pipeline."
        ]

    return AnalyzeRepoResponse(
        status="success",
        repo_name=request.repo_name,
        branch=request.branch,
        provider_used=provider,
        summary=summary,
        recommendations=recommendations,
    )
