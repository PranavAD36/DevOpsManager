"""Authentication and GitHub account management service."""
from uuid import UUID

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.github_app import GitHubAppError, GitHubAppService
from app.models.core import GitHubAccount


async def get_or_create_github_account(
    token: str,
    session: AsyncSession,
) -> GitHubAccount:
    """Get or create a GitHubAccount from an access token.
    
    Args:
        token: GitHub OAuth access token
        session: Database session
        
    Returns:
        GitHubAccount instance
        
    Raises:
        HTTPException: If token is invalid or GitHub API call fails
    """
    service = GitHubAppService()
    try:
        user = await service.get_authenticated_user(token)
    except GitHubAppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    # Try to get existing account
    account = await session.scalar(
        select(GitHubAccount).where(GitHubAccount.github_id == user.id)
    )

    if account is None:
        # Create new account
        account = GitHubAccount(
            github_id=user.id,
            github_login=user.login,
            avatar_url=user.avatar_url or "https://github.com/ghost.png",
        )
        session.add(account)
        await session.flush()
    else:
        account.github_login = user.login
        if user.avatar_url:
            account.avatar_url = user.avatar_url
        await session.flush()

    return account


async def get_authenticated_account(
    request: Request,
    session: AsyncSession,
) -> GitHubAccount:
    """Extract authenticated GitHub account from request.
    
    Looks for GitHub access token in cookie or Authorization header,
    then verifies and gets or creates the associated GitHubAccount.
    
    Args:
        request: FastAPI request
        session: Database session
        
    Returns:
        Authenticated GitHubAccount
        
    Raises:
        HTTPException: If not authenticated or token is invalid
    """
    # Get access token from cookie or header
    token = request.cookies.get("github_access_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated with GitHub. Please authorize your GitHub account.",
        )

    return await get_or_create_github_account(token, session)


def verify_resource_ownership(resource_account_id: UUID, user_account_id: UUID) -> None:
    """Verify that a user owns a resource.
    
    Args:
        resource_account_id: The GitHub account ID associated with the resource
        user_account_id: The currently authenticated user's GitHub account ID
        
    Raises:
        HTTPException: If user doesn't own the resource
    """
    if resource_account_id != user_account_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource",
        )
