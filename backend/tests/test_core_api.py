from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_core_project_repository_analysis_issue_flow() -> None:
    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={"name": f"Test project {uuid4()}", "description": "API integration test"},
        )
        assert project_response.status_code == 201
        project = project_response.json()
        project_id = project["id"]

        try:
            listed = client.get("/v1/projects")
            assert listed.status_code == 200
            assert any(item["id"] == project_id for item in listed.json())

            fetched = client.get(f"/v1/projects/{project_id}")
            assert fetched.status_code == 200

            updated = client.patch(f"/v1/projects/{project_id}", json={"status": "paused"})
            assert updated.status_code == 200
            assert updated.json()["status"] == "paused"

            repository_response = client.post(
                f"/v1/projects/{project_id}/repositories",
                json={
                    "owner": "devopsmanager",
                    "name": "api-test",
                    "full_name": "devopsmanager/api-test",
                    "url": "https://github.com/devopsmanager/api-test",
                },
            )
            assert repository_response.status_code == 201
            repository_id = repository_response.json()["id"]

            invalid_repository = client.post(
                f"/v1/projects/{uuid4()}/repositories",
                json={
                    "owner": "devopsmanager",
                    "name": "invalid",
                    "full_name": "devopsmanager/invalid",
                    "url": "https://github.com/devopsmanager/invalid",
                },
            )
            assert invalid_repository.status_code == 404

            run_response = client.post(
                f"/v1/projects/{project_id}/analysis-runs",
                json={"repository_id": repository_id},
            )
            assert run_response.status_code == 201
            run_id = run_response.json()["id"]

            issue_response = client.post(
                f"/v1/projects/{project_id}/issues",
                json={
                    "repository_id": repository_id,
                    "analysis_run_id": run_id,
                    "title": "Test issue",
                    "severity": "high",
                    "file_path": "src/main.py",
                    "line_number": 12,
                },
            )
            assert issue_response.status_code == 201
            issue_id = issue_response.json()["id"]

            invalid_issue = client.post(
                f"/v1/projects/{project_id}/issues",
                json={"repository_id": str(uuid4()), "title": "Invalid issue"},
            )
            assert invalid_issue.status_code == 404

            assert client.get(f"/v1/issues/{issue_id}").status_code == 200
            assert client.get(f"/v1/analysis-runs/{run_id}").status_code == 200
            assert client.patch(f"/v1/issues/{issue_id}", json={"status": "resolved"}).status_code == 200
            assert client.delete(f"/v1/issues/{issue_id}").status_code == 204
            assert client.delete(f"/v1/repositories/{repository_id}").status_code == 204
        finally:
            assert client.delete(f"/v1/projects/{project_id}").status_code == 204


def test_core_not_found_behavior() -> None:
    with TestClient(app) as client:
        missing_id = uuid4()
        assert client.get(f"/v1/projects/{missing_id}").status_code == 404
        assert client.get(f"/v1/repositories/{missing_id}").status_code == 404
        assert client.get(f"/v1/analysis-runs/{missing_id}").status_code == 404
        assert client.get(f"/v1/issues/{missing_id}").status_code == 404


def test_issue_fix_approval_and_rejection_flow() -> None:
    with TestClient(app) as client:
        project_resp = client.post("/v1/projects", json={"name": f"Fix Test Project {uuid4()}"})
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        try:
            issue_resp = client.post(
                f"/v1/projects/{project_id}/issues",
                json={
                    "title": "SQL Injection Risk",
                    "description": "Unsanitized raw query",
                    "suggested_fix": "Use parameterized query",
                    "corrected_code": "cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))",
                },
            )
            assert issue_resp.status_code == 201
            issue_id = issue_resp.json()["id"]

            # Update fix text
            update_fix_resp = client.post(
                f"/v1/issues/{issue_id}/update-fix",
                json={"corrected_code": "cursor.execute('SELECT * FROM users WHERE id = %s', [user_id])"},
            )
            assert update_fix_resp.status_code == 200
            assert update_fix_resp.json()["corrected_code"] == "cursor.execute('SELECT * FROM users WHERE id = %s', [user_id])"

            # Approve fix
            approve_resp = client.post(f"/v1/issues/{issue_id}/approve")
            assert approve_resp.status_code == 200
            assert approve_resp.json()["status"] == "approved"
            assert approve_resp.json()["approved_at"] is not None

            # Reject fix
            reject_resp = client.post(f"/v1/issues/{issue_id}/reject")
            assert reject_resp.status_code == 200
            assert reject_resp.json()["status"] == "rejected"
        finally:
            client.delete(f"/v1/projects/{project_id}")

