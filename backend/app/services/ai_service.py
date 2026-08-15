import json
import re
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.schemas.ai import AnalyzeRepoRequest, AnalyzeRepoResponse


class AnalyzedIssue(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1)
    severity: Literal["low", "medium", "high", "critical"]
    category: str = Field(min_length=1, max_length=100)
    file_path: str | None = None
    line_number: int | None = Field(default=None, ge=1)
    suggested_fix: str | None = None
    corrected_code: str | None = None


class RepositoryAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    summary: str = Field(min_length=1)
    issues: list[AnalyzedIssue] = Field(default_factory=list, max_length=100)


class AIProviderError(Exception):
    pass


async def analyze_repository(request: AnalyzeRepoRequest) -> AnalyzeRepoResponse:
    result = await analyze_repository_content(request.repo_name, None, [], request.provider)
    return AnalyzeRepoResponse(
        repo_name=request.repo_name,
        branch=request.branch,
        provider_used=request.provider,
        summary=result.summary,
        recommendations=[issue.title for issue in result.issues],
    )


async def analyze_repository_content(
    repository_name: str,
    language: str | None,
    files: list[object],
    provider: str | None = None,
) -> RepositoryAnalysisResult:
    selected_provider = (provider or settings.ai_provider).lower()
    prompt = _build_prompt(repository_name, language, files)
    if selected_provider == "openrouter":
        if not settings.openrouter_api_key:
            raise AIProviderError("OPENROUTER_API_KEY is not configured")
        content = await _call_openrouter(prompt)
    elif selected_provider == "gemini":
        if not settings.gemini_api_key:
            raise AIProviderError("Gemini API key is not configured")
        content = await _call_gemini(prompt)
    else:
        raise AIProviderError(f"Unsupported AI provider: {selected_provider}")
    return _parse_analysis_response(content)


def _build_prompt(repository_name: str, language: str | None, files: list[object]) -> str:
    source = "\n\n".join(f"FILE: {item.path}\n{item.content}" for item in files)
    return (
        "Analyze this repository for actionable software, security, reliability, and maintainability problems. "
        "For each issue, explain clearly what is wrong and why it is a problem. "
        "Include a human-readable suggested_fix describing how to correct it, "
        "and provide corrected_code with the fixed code snippet when applicable. "
        "Return only valid JSON matching {summary: string, issues: [{title, description, severity, category, "
        "file_path, line_number, suggested_fix, corrected_code}]}. "
        "Severity must be low, medium, high, or critical. "
        "Use null for unknown file_path, line_number, suggested_fix, or corrected_code. "
        "Do not invent issues unrelated to the supplied files.\n\n"
        f"Repository: {repository_name}\nLanguage: {language or 'unknown'}\n\n{source}"
    )


async def _call_openrouter(prompt: str) -> str:
    payload = {
        "model": settings.openrouter_model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "You are a careful repository security and code-quality reviewer."},
            {"role": "user", "content": prompt},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise AIProviderError("OpenRouter request failed") from exc
    if response.is_error:
        if response.status_code == 401:
            raise AIProviderError("OpenRouter authentication failed")
        if response.status_code == 429:
            raise AIProviderError("OpenRouter rate limit exceeded")
        if response.status_code in (404, 422):
            raise AIProviderError("OpenRouter model unavailable")
        raise AIProviderError(f"OpenRouter returned HTTP {response.status_code}")
    try:
        return str(response.json()["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIProviderError("OpenRouter returned an invalid response") from exc


async def _call_gemini(prompt: str) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                url,
                params={"key": settings.gemini_api_key},
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
    except httpx.HTTPError as exc:
        raise AIProviderError("Gemini request failed") from exc
    if response.is_error:
        raise AIProviderError(f"Gemini returned HTTP {response.status_code}")
    try:
        return str(response.json()["candidates"][0]["content"]["parts"][0]["text"])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIProviderError("Gemini returned an invalid response") from exc


def _parse_analysis_response(content: str) -> RepositoryAnalysisResult:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
    try:
        return RepositoryAnalysisResult.model_validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValueError) as exc:
        raise AIProviderError("AI provider returned invalid structured analysis") from exc
