from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field


class AnalyzeRepoRequest(BaseModel):
    repo_name: str = Field(..., json_schema_extra={"example": "DevOpsManager"})
    branch: str = Field(default="main", json_schema_extra={"example": "main"})
    prompt: str | None = Field(
        default=None,
        json_schema_extra={"example": "Analyze security, architecture, and code quality."}
    )
    provider: Literal["openai", "gemini"] = Field(default="openai")


class AnalyzeRepoResponse(BaseModel):
    status: str = "success"
    repo_name: str
    branch: str
    provider_used: str
    summary: str
    recommendations: list[str]
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
