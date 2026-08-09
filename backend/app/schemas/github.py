from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class GitHubAuthorizationResponse(BaseModel):
    authorization_url: str


class GitHubConnectionResponse(BaseModel):
    connected: bool
    username: str


class GitHubRepositoryAccessResponse(BaseModel):
    id: int
    name: str
    full_name: str
    owner: str
    private: bool
    default_branch: str
    html_url: str
    description: str | None
    language: str | None = None
    stargazers_count: int = 0
    forks_count: int = 0
    permissions: dict[str, bool] | None = None


class GitHubRepositoryConnect(BaseModel):
    repository_id: int = Field(gt=0)
    project_id: UUID | None = None


class GitHubCallbackError(BaseModel):
    error: str
    error_description: str | None = None
