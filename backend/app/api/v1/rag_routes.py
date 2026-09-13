from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db_session
from app.models.core import Repository
from app.services.auth_service import get_authenticated_account
from app.services.rag_service import index_repository, chat_with_repo
from app.integrations.github_app import GitHubAppService

router = APIRouter(prefix="/rag", tags=["rag"])
github_service = GitHubAppService()

class ChatRequest(BaseModel):
    query: str

class ChatResponse(BaseModel):
    answer: str

@router.post("/{repository_id}/index")
async def index_repo_endpoint(
    repository_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session)
):
    github_account = await get_authenticated_account(request, session)
    repo = await session.get(Repository, repository_id)
    if not repo or repo.github_account_id != github_account.id:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    access_token = request.cookies.get("github_access_token") or request.headers.get("Authorization", "").replace("Bearer ", "")
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated with GitHub")
    
    background_tasks.add_task(
        index_repository,
        repository_id=str(repo.id),
        owner=repo.owner,
        repo_name=repo.name,
        default_branch=repo.default_branch,
        access_token=access_token
    )
    
    return {"message": "Indexing started in background"}

@router.post("/{repository_id}/chat", response_model=ChatResponse)
async def chat_repo_endpoint(
    repository_id: str,
    payload: ChatRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session)
):
    github_account = await get_authenticated_account(request, session)
    repo = await session.get(Repository, repository_id)
    if not repo or repo.github_account_id != github_account.id:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    answer = await chat_with_repo(str(repo.id), payload.query)
    return ChatResponse(answer=answer)
