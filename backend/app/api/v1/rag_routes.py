import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.github_routes import _get_access_token
from app.db.session import get_db_session
from app.models.core import Repository
from app.services.ai_service import AIProviderError
from app.services.auth_service import get_authenticated_account
from app.services.rag_service import answer_repository_question, index_repository

router = APIRouter(prefix="/rag", tags=["rag"])
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    answer: str


async def _get_owned_repository(repository_id: UUID, request: Request, session: AsyncSession) -> Repository:
    github_account = await get_authenticated_account(request, session)
    repository = await session.get(Repository, repository_id)
    if repository is None or repository.github_account_id != github_account.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repository


@router.post("/{repository_id}/index")
async def index_repo_endpoint(
    repository_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
):
    repository = await _get_owned_repository(repository_id, request, session)
    access_token = _get_access_token(request)
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated with GitHub")

    background_tasks.add_task(
        index_repository,
        repository_id=str(repository.id),
        owner=repository.owner,
        repo_name=repository.name,
        default_branch=repository.default_branch,
        access_token=access_token,
    )

    return {"message": "Indexing started in background"}


@router.post("/{repository_id}/chat", response_model=ChatResponse)
async def chat_repo_endpoint(
    repository_id: UUID,
    payload: ChatRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    repository = await _get_owned_repository(repository_id, request, session)
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=422, detail="Please enter a question.")

    access_token = _get_access_token(request)
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated with GitHub")

    try:
        answer = await answer_repository_question(repository, access_token, query)
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=f"The AI provider is not available: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 - return a clean error instead of dropping the connection
        logger.exception("Repository chat failed for %s", repository_id)
        raise HTTPException(status_code=502, detail="The chat request failed. Please try again.") from exc

    return ChatResponse(answer=answer)