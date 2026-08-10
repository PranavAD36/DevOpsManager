from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: str = Field(default="active", max_length=50)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = Field(default=None, max_length=50)


class ProjectResponse(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime
    updated_at: datetime


class RepositoryConnect(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class RepositoryCreate(BaseModel):
    owner: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    full_name: str = Field(min_length=1, max_length=511)
    url: str = Field(min_length=1, max_length=2048)
    default_branch: str = Field(default="main", max_length=255)
    provider: str = Field(default="github", max_length=50)
    is_active: bool = True


class RepositoryUpdate(BaseModel):
    owner: str | None = Field(default=None, min_length=1, max_length=255)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    full_name: str | None = Field(default=None, min_length=1, max_length=511)
    url: str | None = Field(default=None, max_length=2048)
    default_branch: str | None = Field(default=None, max_length=255)
    provider: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None



class RepositoryResponse(RepositoryCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    github_description: str | None = None
    is_private: bool | None = None
    is_fork: bool | None = None
    language: str | None = None
    stargazers_count: int | None = None
    forks_count: int | None = None
    open_issues_count: int | None = None
    repository_size: int | None = None
    github_created_at: datetime | None = None
    github_updated_at: datetime | None = None
    pushed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AnalysisRunCreate(BaseModel):
    repository_id: UUID
    status: str = Field(default="pending", max_length=50)
    started_at: datetime | None = None
    summary: str | None = None


class AnalysisRunUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=50)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    summary: str | None = None
    error_message: str | None = None


class AnalysisRunResponse(AnalysisRunCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime


class IssueCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    severity: str = Field(default="medium", max_length=50)
    status: str = Field(default="open", max_length=50)
    category: str | None = Field(default=None, max_length=100)
    file_path: str | None = Field(default=None, max_length=2048)
    line_number: int | None = Field(default=None, ge=1)
    repository_id: UUID | None = None
    analysis_run_id: UUID | None = None
    suggested_fix: str | None = None
    corrected_code: str | None = None


class IssueUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    severity: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=50)
    category: str | None = Field(default=None, max_length=100)
    file_path: str | None = Field(default=None, max_length=2048)
    line_number: int | None = Field(default=None, ge=1)
    repository_id: UUID | None = None
    analysis_run_id: UUID | None = None
    suggested_fix: str | None = None
    corrected_code: str | None = None


class IssueResponse(IssueCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    approved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

