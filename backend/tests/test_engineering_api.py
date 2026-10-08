from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.v1.engineering_routes import github_app_service
from app.api.v1 import engineering_routes
from app.integrations.github_app import GitHubWorkflowRun
from app.models.core import GitHubAccount
from app.services.ai_service import SecurityReviewFinding, SecurityReviewResult
from app.main import app


TEST_HEADERS = {"Authorization": "Bearer test-token"}


def _create_project_and_repository(client: TestClient) -> tuple[str, str]:
    project_response = client.post(
        "/v1/projects",
        json={"name": f"Engineering test {uuid4()}"},
        headers=TEST_HEADERS,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["id"]
    repository_response = client.post(
        f"/v1/projects/{project_id}/repositories",
        json={
            "owner": "octocat",
            "name": "hello-world",
            "full_name": "octocat/hello-world",
            "url": "https://github.com/octocat/hello-world",
        },
        headers=TEST_HEADERS,
    )
    assert repository_response.status_code == 201
    return project_id, repository_response.json()["id"]


def test_code_health_uses_latest_successful_run_findings() -> None:
    with TestClient(app) as client:
        project_id, repository_id = _create_project_and_repository(client)
        run_response = client.post(
            f"/v1/projects/{project_id}/analysis-runs",
            json={"repository_id": repository_id},
            headers=TEST_HEADERS,
        )
        assert run_response.status_code == 201
        run_id = run_response.json()["id"]
        completed = client.patch(
            f"/v1/analysis-runs/{run_id}",
            json={"status": "completed", "completed_at": "2026-10-07T00:00:00Z"},
            headers=TEST_HEADERS,
        )
        assert completed.status_code == 200
        issue_response = client.post(
            f"/v1/projects/{project_id}/issues",
            json={
                "repository_id": repository_id,
                "analysis_run_id": run_id,
                "title": "SQL injection",
                "category": "security",
                "severity": "critical",
            },
            headers=TEST_HEADERS,
        )
        assert issue_response.status_code == 201
        later_run = client.post(
            f"/v1/projects/{project_id}/analysis-runs",
            json={"repository_id": repository_id},
            headers=TEST_HEADERS,
        ).json()
        client.patch(
            f"/v1/analysis-runs/{later_run['id']}",
            json={"status": "completed", "completed_at": "2026-10-08T00:00:00Z"},
            headers=TEST_HEADERS,
        )

        health_response = client.get(
            f"/v1/repositories/{repository_id}/code-health",
            headers=TEST_HEADERS,
        )

        assert health_response.status_code == 200
        body = health_response.json()
        assert body["available"] is True
        assert body["score"] == 97
        assert body["breakdown"]["Security"] == 80
        assert body["findings_count"] == 1
        assert body["source_analysis_run_id"] == later_run["id"]


def test_code_health_is_unavailable_before_first_completed_analysis() -> None:
    with TestClient(app) as client:
        _, repository_id = _create_project_and_repository(client)
        response = client.get(
            f"/v1/repositories/{repository_id}/code-health",
            headers=TEST_HEADERS,
        )
    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["score"] is None


def test_secret_scan_returns_only_masked_findings() -> None:
    raw_token = "ghp_" + "C" * 30
    with patch.object(
        github_app_service,
        "get_repository_source_files",
        new=AsyncMock(return_value=[SimpleNamespace(path="settings.py", content=f'TOKEN = "{raw_token}"')]),
    ), TestClient(app) as client:
        _, repository_id = _create_project_and_repository(client)
        scan_response = client.get(
            f"/v1/repositories/{repository_id}/secrets",
            headers=TEST_HEADERS,
        )

    assert scan_response.status_code == 200
    body = scan_response.json()
    assert len(body["findings"]) == 1
    assert body["findings"][0]["masked_value"] == "ghp_" + "*" * 12
    assert raw_token not in scan_response.text


def test_workflow_endpoint_summarizes_real_runs() -> None:
    now = datetime.now(timezone.utc)
    runs = [
        GitHubWorkflowRun(
            id=1,
            name="Backend Tests",
            branch="main",
            commit_sha="abc123",
            actor="octocat",
            status="completed",
            conclusion="success",
            created_at=now,
            updated_at=now,
            started_at=now.replace(second=0),
            html_url="https://github.com/octocat/hello-world/actions/runs/1",
        ),
        GitHubWorkflowRun(
            id=2,
            name="Backend Tests",
            branch="main",
            commit_sha="def456",
            actor="octocat",
            status="completed",
            conclusion="failure",
            created_at=now,
            updated_at=now,
            started_at=now.replace(second=0),
            html_url="https://github.com/octocat/hello-world/actions/runs/2",
        ),
    ]
    with patch.object(github_app_service, "get_workflow_runs", new=AsyncMock(return_value=runs)), TestClient(app) as client:
        project_id, repository_id = _create_project_and_repository(client)
        response = client.get(
            f"/v1/repositories/{repository_id}/workflows",
            headers=TEST_HEADERS,
        )
        trends = client.get(
            f"/v1/projects/{project_id}/trends?days=30",
            headers=TEST_HEADERS,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["total_runs"] == 2
    assert body["success_rate"] == 50.0
    assert body["failure_rate"] == 50.0
    assert len(body["recent_failures"]) == 1
    assert trends.status_code == 200
    assert "ci_runs" in trends.json()["available_metrics"]
    assert sum(point["ci_runs"] for point in trends.json()["series"]) == 2
    alerts = client.get("/v1/alerts?status=open&unread_only=true", headers=TEST_HEADERS)
    assert alerts.status_code == 200
    assert len(alerts.json()) == 1
    alert_id = alerts.json()[0]["id"]
    updated_alert = client.patch(
        f"/v1/alerts/{alert_id}",
        json={"is_read": True, "status": "resolved"},
        headers=TEST_HEADERS,
    )
    assert updated_alert.status_code == 200
    assert updated_alert.json()["is_read"] is True
    assert updated_alert.json()["status"] == "resolved"


def test_trends_comparison_and_security_dashboard_use_owned_real_records() -> None:
    raw_token = "ghp_" + "E" * 30
    with TestClient(app) as client:
        project_id, repository_id = _create_project_and_repository(client)
        issue_response = client.post(
            f"/v1/projects/{project_id}/issues",
            json={
                "repository_id": repository_id,
                "title": "Potential GitHub Token detected",
                "description": f"Credential observed: {raw_token}",
                "category": "security",
                "severity": "critical",
            },
            headers=TEST_HEADERS,
        )
        assert issue_response.status_code == 201

        trends = client.get(
            f"/v1/projects/{project_id}/trends?days=30",
            headers=TEST_HEADERS,
        )
        assert trends.status_code == 200
        assert sum(point["issues_opened"] for point in trends.json()["series"]) == 1
        assert "pull_requests" in trends.json()["unavailable_metrics"]

        findings = client.get("/v1/security/findings?severity=critical", headers=TEST_HEADERS)
        assert findings.status_code == 200
        assert len(findings.json()) == 1
        assert raw_token not in findings.text
        assert "[REDACTED CREDENTIAL]" in findings.json()[0]["description"]
        issue_list = client.get(f"/v1/projects/{project_id}/issues", headers=TEST_HEADERS)
        assert issue_list.status_code == 200
        assert raw_token not in issue_list.text

        comparison = client.post(
            "/v1/repositories/compare",
            json={"repository_ids": [repository_id, repository_id]},
            headers=TEST_HEADERS,
        )
        assert comparison.status_code == 422
        inaccessible = client.post(
            "/v1/repositories/compare",
            json={"repository_ids": [repository_id, str(uuid4())]},
            headers=TEST_HEADERS,
        )
        assert inaccessible.status_code == 404


def test_custom_report_includes_ai_summary_from_real_metrics() -> None:
    with patch.object(
        engineering_routes,
        "summarize_engineering_metrics",
        new=AsyncMock(return_value="Recorded engineering activity for this date range."),
    ), TestClient(app) as client:
        project_id, repository_id = _create_project_and_repository(client)
        response = client.get(
            f"/v1/projects/{project_id}/reports?period=custom&start_date=2026-10-01&end_date=2026-10-08&repository_id={repository_id}",
            headers=TEST_HEADERS,
        )

    assert response.status_code == 200
    assert response.json()["executive_summary"] == "Recorded engineering activity for this date range."
    assert response.json()["start_date"] == "2026-10-01"
    assert response.json()["end_date"] == "2026-10-08"


def test_pull_request_security_review_persists_safe_findings() -> None:
    diff = "diff --git a/app.py b/app.py\n+++ b/app.py\n+execute(query)\n"
    review = SecurityReviewResult(
        findings=[
            SecurityReviewFinding(
                title="Potential SQL injection",
                severity="high",
                category="SQL injection",
                file_path="app.py",
                line_number=1,
                explanation="A query is assembled from untrusted input.",
                evidence="execute(query)",
                suggested_fix="Use a parameterized query.",
                confidence_status="potential",
            )
        ]
    )
    with patch.object(github_app_service, "get_pull_request_diff", new=AsyncMock(return_value=diff)), patch.object(
        engineering_routes,
        "analyze_security_pull_request_diff",
        new=AsyncMock(return_value=review),
    ), TestClient(app) as client:
        _, repository_id = _create_project_and_repository(client)
        response = client.post(
            f"/v1/repositories/{repository_id}/pull-requests/42/security-review",
            headers=TEST_HEADERS,
        )
        security_findings = client.get("/v1/security/findings", headers=TEST_HEADERS)

    assert response.status_code == 200
    assert response.json()["findings"][0]["evidence"] == "execute(query)"
    assert security_findings.status_code == 200
    assert any(item["title"] == "Potential SQL injection" for item in security_findings.json())


def test_engineering_analytics_and_alerts_are_isolated_between_accounts() -> None:
    async def get_account(token: str, session):
        github_id = 31001 if token == "token-a" else 31002
        account = await session.scalar(select(GitHubAccount).where(GitHubAccount.github_id == github_id))
        if account is None:
            account = GitHubAccount(github_id=github_id, github_login=f"user-{github_id}")
            session.add(account)
            await session.flush()
        return account

    failed_run = GitHubWorkflowRun(
        id=913,
        name="Tests",
        branch="main",
        commit_sha="sha913",
        actor="octocat",
        status="completed",
        conclusion="failure",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        started_at=datetime.now(timezone.utc),
        html_url="https://github.com/octocat/hello-world/actions/runs/913",
    )
    with patch("app.services.auth_service.get_or_create_github_account", new=get_account), patch.object(
        github_app_service,
        "get_workflow_runs",
        new=AsyncMock(return_value=[failed_run]),
    ), TestClient(app) as client:
        headers_a = {"Authorization": "Bearer token-a"}
        headers_b = {"Authorization": "Bearer token-b"}
        project_a = client.post("/v1/projects", json={"name": "User A"}, headers=headers_a).json()
        repository_a = client.post(
            f"/v1/projects/{project_a['id']}/repositories",
            json={
                "owner": "octocat",
                "name": "hello-world",
                "full_name": "octocat/hello-world",
                "url": "https://github.com/octocat/hello-world",
            },
            headers=headers_a,
        ).json()
        client.get(f"/v1/repositories/{repository_a['id']}/workflows", headers=headers_a)
        issue_response = client.post(
            f"/v1/projects/{project_a['id']}/issues",
            json={"title": "Security issue", "severity": "high", "category": "security"},
            headers=headers_a,
        )
        assert issue_response.status_code == 201
        project_b = client.post("/v1/projects", json={"name": "User B"}, headers=headers_b).json()
        repository_b = client.post(
            f"/v1/projects/{project_b['id']}/repositories",
            json={
                "owner": "octocat",
                "name": "other-repo",
                "full_name": "octocat/other-repo",
                "url": "https://github.com/octocat/other-repo",
            },
            headers=headers_b,
        ).json()

        alerts_b = client.get("/v1/alerts", headers=headers_b)
        security_b = client.get("/v1/security/findings", headers=headers_b)
        cross_owner_compare = client.post(
            "/v1/repositories/compare",
            json={"repository_ids": [repository_a["id"], repository_b["id"]]},
            headers=headers_b,
        )
        cross_owner_health = client.get(
            f"/v1/repositories/{repository_a['id']}/code-health",
            headers=headers_b,
        )
        alert_id = client.get("/v1/alerts", headers=headers_a).json()[0]["id"]
        cross_owner_alert_update = client.patch(
            f"/v1/alerts/{alert_id}",
            json={"is_read": True},
            headers=headers_b,
        )

    assert alerts_b.status_code == 200 and alerts_b.json() == []
    assert security_b.status_code == 200 and security_b.json() == []
    assert cross_owner_compare.status_code == 404
    assert cross_owner_health.status_code == 403
    assert cross_owner_alert_update.status_code == 404
