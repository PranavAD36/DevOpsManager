import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.integrations.github_app import GitHubAppService
from app.services.ai_service import analyze_pull_request_diff
from app.models.core import Project, Repository

logger = logging.getLogger(__name__)
github_app_service = GitHubAppService()

async def review_pull_request(
    installation_id: int,
    owner: str,
    repo_name: str,
    pr_number: int,
    commit_id: str,
    session: AsyncSession
) -> None:
    full_name = f"{owner}/{repo_name}"
    
    # 1. Fetch Repository and Project to get custom rules
    repo = await session.scalar(select(Repository).where(Repository.full_name == full_name))
    custom_rules = None
    if repo and repo.project_id:
        project = await session.get(Project, repo.project_id)
        if project and project.custom_rules:
            custom_rules = project.custom_rules
            
    # 2. Get Installation Access Token
    try:
        access_token = await github_app_service.get_installation_access_token(installation_id)
    except Exception as e:
        logger.error(f"Failed to get installation token for {installation_id}: {e}")
        return
        
    # 3. Fetch PR Diff
    try:
        diff_content = await github_app_service.get_pull_request_diff(access_token, owner, repo_name, pr_number)
    except Exception as e:
        logger.error(f"Failed to fetch PR diff for {full_name}#{pr_number}: {e}")
        return
        
    if not diff_content.strip():
        logger.info(f"No diff content found for {full_name}#{pr_number}, skipping review.")
        return
        
    # 4. Analyze Diff
    try:
        review_result = await analyze_pull_request_diff(full_name, diff_content, custom_rules)
    except Exception as e:
        logger.error(f"AI analysis failed for {full_name}#{pr_number}: {e}")
        return
        
    if not review_result.comments:
        logger.info(f"No issues found by AI for {full_name}#{pr_number}.")
        return
        
    # 5. Format Comments and Post Review
    formatted_comments = []
    for comment in review_result.comments:
        formatted_comments.append({
            "path": comment.path,
            "line": comment.line,
            "body": comment.body
        })
        
    try:
        await github_app_service.create_pull_request_review(
            access_token=access_token,
            owner=owner,
            repository=repo_name,
            pr_number=pr_number,
            commit_id=commit_id,
            comments=formatted_comments
        )
        logger.info(f"Successfully posted PR review for {full_name}#{pr_number}.")
    except Exception as e:
        logger.error(f"Failed to post PR review for {full_name}#{pr_number}: {e}")
