import asyncio

import httpx
import pytest

from app.integrations.github_app import GitHubAppError, GitHubAppService


def test_workflow_runs_parses_authenticated_github_response() -> None:
    async def execute() -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.headers["Authorization"] == "Bearer test-access-token"
            assert request.url.params["per_page"] == "100"
            return httpx.Response(
                200,
                json={
                    "workflow_runs": [
                        {
                            "id": 17,
                            "name": "Backend Tests",
                            "head_branch": "main",
                            "head_sha": "abc123",
                            "actor": {"login": "octocat"},
                            "status": "completed",
                            "conclusion": "success",
                            "created_at": "2026-10-08T10:00:00Z",
                            "updated_at": "2026-10-08T10:03:00Z",
                            "run_started_at": "2026-10-08T10:01:00Z",
                            "html_url": "https://github.com/octocat/repo/actions/runs/17",
                        }
                    ]
                },
            )

        service = GitHubAppService(transport=httpx.MockTransport(handler))
        runs = await service.get_workflow_runs("test-access-token", "octocat", "repo")
        assert len(runs) == 1
        assert runs[0].name == "Backend Tests"
        assert runs[0].actor == "octocat"
        assert runs[0].started_at is not None
        assert runs[0].started_at.isoformat() == "2026-10-08T10:01:00+00:00"

    asyncio.run(execute())


@pytest.mark.parametrize(
    ("status_code", "headers", "expected_status"),
    [
        (401, {}, 401),
        (403, {}, 403),
        (403, {"X-RateLimit-Remaining": "0"}, 429),
        (404, {}, 404),
        (429, {}, 429),
    ],
)
def test_workflow_runs_maps_github_errors(
    status_code: int,
    headers: dict[str, str],
    expected_status: int,
) -> None:
    async def execute() -> None:
        service = GitHubAppService(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(status_code, headers=headers)
            )
        )
        with pytest.raises(GitHubAppError) as error:
            await service.get_workflow_runs("token", "owner", "repo")
        assert error.value.status_code == expected_status

    asyncio.run(execute())
