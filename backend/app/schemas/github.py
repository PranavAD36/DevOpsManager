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
    permissions: dict[str, bool] | None = None


class GitHubRepositoryConnect(BaseModel):
    project_id: UUID
    repository_id: int = Field(gt=0)


class GitHubCallbackError(BaseModel):
    error: str
    error_description: str | None = None
