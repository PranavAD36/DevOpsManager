from types import SimpleNamespace
import asyncio
import json

import pytest

from app.services import ai_service
from app.services.ai_service import AIProviderError, IncidentAnalysisResult
from app.services.code_health import calculate_code_health
from app.services.patch_safety import is_probable_fragment
from app.services.secret_detection import (
    detect_secrets,
    redact_secrets,
    scan_and_exclude_secret_files,
)
from app.services import secret_notes
from app.integrations.github_app import GitHubAppError
from app.services import secret_remediation


class _FakeGitHub:
    def __init__(self, files: dict[str, str], gitignore: str | None = None) -> None:
        self.files = dict(files)
        self.gitignore = gitignore
        self.updated: list[tuple[str, str, str | None]] = []

    async def get_repository_source_files(self, *args, **kwargs):
        return [SimpleNamespace(path=path, content=content) for path, content in self.files.items()]

    async def get_file(self, token, owner, repository, path, branch):
        if path == ".gitignore":
            if self.gitignore is None:
                raise GitHubAppError("Repository file not found", 404)
            return SimpleNamespace(path=path, content=self.gitignore, sha="sha-ignore")
        return SimpleNamespace(path=path, content=self.files[path], sha="sha-" + path)

    async def update_file(self, token, owner, repository, path, branch, content, sha, message):
        self.updated.append((path, content, sha))
        if path == ".gitignore":
            self.gitignore = content
        else:
            self.files[path] = content
        return SimpleNamespace(sha="commit-" + path, html_url="https://example.test/" + path)


def test_secret_remediation_plans_then_pushes_safe_fixes() -> None:
    repository = SimpleNamespace(owner="PranavAD36", name="Testing-Repo", default_branch="main")
    service = _FakeGitHub(
        {
            ".env": "GIT_HUB-SECRATE=SK-1223654VSDZV354CS534DC\n",
            "test.cpp": (
                "#include <iostream>\n\nint main() {\n"
                '    std::cout << "Hello, world!" << std::endl;\n'
                "    //PassWord=Hello!123\n    return 0;\n}\n"
            ),
        }
    )

    async def execute():
        actions = await secret_remediation.plan_secret_remediation(repository, "token", service)
        assert {(action.file_path, action.action) for action in actions} == {
            (".env", "gitignore"),
            ("test.cpp", "remove_lines"),
        }
        _, results = await secret_remediation.apply_secret_remediation(repository, "token", service)
        assert results and all(result.ok for result in results)

    asyncio.run(execute())

    assert ".env" in (service.gitignore or "")
    assert "PassWord" not in service.files["test.cpp"]
    assert "Hello, world!" in service.files["test.cpp"]
    assert {path for path, _, _ in service.updated} == {".gitignore", "test.cpp"}


def test_secret_remediation_reports_nothing_to_fix() -> None:
    repository = SimpleNamespace(owner="PranavAD36", name="Clean-Repo", default_branch="main")
    service = _FakeGitHub({"app.py": "print('safe')\n"})

    actions = asyncio.run(secret_remediation.plan_secret_remediation(repository, "token", service))

    assert actions == []


def test_secret_detection_flags_env_files_and_inline_password_comments() -> None:
    files = [
        SimpleNamespace(path=".env", content="GIT_HUB-SECRATE=SK-1223654VSDZV354CS534DC\n"),
        SimpleNamespace(
            path="test.cpp",
            content='#include <iostream>\n\nint main() {\n    //PassWord=Hello!123\n    return 0;\n}\n',
        ),
    ]

    findings = detect_secrets(files)

    assert {(finding.file_path, finding.line_number) for finding in findings} == {(".env", 1), ("test.cpp", 4)}
    assert all("Hello!123" not in finding.masked_value for finding in findings)
    assert all("SK-1223654" not in finding.masked_value for finding in findings)


def test_secret_note_records_source_line_and_is_git_ignored(tmp_path, monkeypatch) -> None:
    gitignore = tmp_path / ".gitignore"
    gitignore.write_text("# existing\nnode_modules/\n", encoding="utf-8")
    monkeypatch.setattr(secret_notes, "NOTES_DIR", tmp_path / "backend" / "data" / "secret_notes")
    monkeypatch.setattr(secret_notes, "GITIGNORE_PATH", gitignore)
    files = [SimpleNamespace(path="test.cpp", content="int main() {" + chr(10) + "//PassWord=Hello@123" + chr(10) + "}" + chr(10))]
    findings = detect_secrets(files)

    note_path = secret_notes.write_secret_note(
        "PranavAD36/Testing-Repo", findings, secret_notes.collect_raw_lines(files, findings)
    )

    assert note_path is not None
    note_text = (tmp_path / "backend" / "data" / "secret_notes" / "PranavAD36_Testing-Repo.txt").read_text(encoding="utf-8")
    assert "PranavAD36/Testing-Repo" in note_text
    assert "Testing-Repo/test.cpp" in note_text
    assert "*PassWord" in note_text
    assert "-> //PassWord=Hello@123" in note_text
    assert "backend/data/secret_notes/" in gitignore.read_text(encoding="utf-8")


def test_secret_note_falls_back_to_masked_value(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(secret_notes, "NOTES_DIR", tmp_path / "notes")
    monkeypatch.setattr(secret_notes, "GITIGNORE_PATH", tmp_path / ".gitignore")
    findings = detect_secrets(
        [SimpleNamespace(path=".env", content="API_KEY=sk-abcdefghijklmnopqrstuvwx\n")]
    )

    note_path = secret_notes.write_secret_note("PranavAD36/Testing-Repo", findings)

    assert note_path is not None
    note_text = (tmp_path / "notes" / "PranavAD36_Testing-Repo.txt").read_text(encoding="utf-8")
    assert "Testing-Repo/.env" in note_text
    assert "sk-abcdefghijklmnopqrstuvwx" not in note_text


def test_secret_note_is_skipped_when_nothing_found(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(secret_notes, "NOTES_DIR", tmp_path / "notes")
    monkeypatch.setattr(secret_notes, "GITIGNORE_PATH", tmp_path / ".gitignore")

    assert secret_notes.write_secret_note("owner/repo", []) is None
    assert not (tmp_path / "notes").exists()


def test_code_health_is_deterministic_and_uses_unresolved_issue_severity() -> None:
    issues = [
        SimpleNamespace(category="security", title="SQL injection", description="", severity="critical", status="open"),
        SimpleNamespace(category="testing", title="Missing test", description="", severity="high", status="open"),
        SimpleNamespace(category="security", title="Fixed issue", description="", severity="critical", status="resolved"),
    ]

    score, breakdown = calculate_code_health(issues)

    assert score == 95
    assert breakdown["Security"] == 80
    assert breakdown["Testing"] == 90
    assert calculate_code_health(issues) == (score, breakdown)


def test_secret_detection_masks_values_and_ignores_placeholders_and_git_directory() -> None:
    token = "ghp_" + "A" * 30
    files = [
        SimpleNamespace(
            path="config/settings.py",
            content=(
                f'GITHUB_TOKEN = "{token}"\n'
                'password = "change_me"\n'
                'AWS_ACCESS_KEY_ID = "AKIA1234567890ABCDEF"\n'
                "-----BEGIN RSA PRIVATE KEY-----\n"
            ),
        ),
        SimpleNamespace(path=".git/config.py", content=f"token={token}"),
    ]

    findings = detect_secrets(files)

    assert [(finding.secret_type, finding.line_number) for finding in findings] == [
        ("GitHub Token", 1),
        ("AWS Access Key", 3),
        ("Private Key", 4),
    ]
    assert all(token not in finding.masked_value for finding in findings)
    assert findings[0].masked_value == "ghp_" + "*" * 12


def test_secret_detection_does_not_return_raw_generic_credentials() -> None:
    secret = "super-secret-password-123"
    findings = detect_secrets(
        [SimpleNamespace(path="settings.py", content=f'DATABASE_PASSWORD = "{secret}"')]
    )

    assert len(findings) == 1
    assert findings[0].secret_type == "Credential"
    assert secret not in repr(findings[0])
    assert findings[0].masked_value == "*" * 12


def test_secret_detection_covers_database_urls_and_excludes_entire_unsafe_files() -> None:
    database_url = "postgresql://service:password-value@db.example/internal"
    files = [
        SimpleNamespace(path=".env.production", content=f"DATABASE_URL={database_url}"),
        SimpleNamespace(path="app.py", content="print('no credentials')"),
    ]
    safe_files, findings = scan_and_exclude_secret_files(files)

    assert [item.path for item in safe_files] == ["app.py"]
    assert len(findings) == 1
    assert findings[0].secret_type == "Database Credential"
    assert database_url not in findings[0].masked_value
    assert database_url not in redact_secrets(database_url)


def test_incident_analyzer_requires_evidence_and_redacts_credentials(monkeypatch) -> None:
    async def execute() -> None:
        empty_result = await ai_service.analyze_incident_failure("build", "")
        assert empty_result.evidence_sufficient is False
        assert empty_result.likely_root_cause == "Insufficient evidence to determine the root cause."

        raw_token = "ghp_" + "D" * 30
        prompt_seen = ""

        async def fake_openrouter(prompt: str) -> str:
            nonlocal prompt_seen
            prompt_seen = prompt
            return json.dumps(
                {
                    "incident_summary": "Build failed.",
                    "likely_root_cause": "A compiler error stopped the build.",
                    "observed_evidence": ["error: missing module"],
                    "ai_inference": "The dependency may not be installed.",
                    "affected_component": "backend",
                    "severity": "high",
                    "suggested_fix": "Install the missing dependency.",
                    "prevention_recommendation": "Validate dependencies in CI.",
                    "evidence_sufficient": True,
                }
            )

        monkeypatch.setattr(
            ai_service,
            "settings",
            SimpleNamespace(ai_provider="openrouter", openrouter_api_key="test-key"),
        )
        monkeypatch.setattr(ai_service, "_call_openrouter", fake_openrouter)
        result = await ai_service.analyze_incident_failure(
            "build",
            f"error: missing module\nGITHUB_TOKEN={raw_token}",
        )
        assert result.evidence_sufficient is True
        assert raw_token not in prompt_seen
        assert "error: missing module" in prompt_seen

    asyncio.run(execute())


def test_incident_analysis_rejects_evidence_not_present_in_input() -> None:
    output = json.dumps(
        {
            "incident_summary": "Failure.",
            "likely_root_cause": "Missing dependency.",
            "observed_evidence": ["made-up compiler output"],
            "ai_inference": "Inference.",
            "affected_component": None,
            "severity": "medium",
            "suggested_fix": "Install dependency.",
            "prevention_recommendation": "Pin dependencies.",
            "evidence_sufficient": True,
        }
    )
    with pytest.raises(AIProviderError, match="cited evidence"):
        ai_service._parse_incident_response(output, "Only actual output.")


def test_security_review_redacts_secrets_and_requires_diff_evidence(monkeypatch) -> None:
    async def execute() -> None:
        token = "ghp_" + "F" * 30
        prompt = ""

        async def fake_openrouter(prompt_text: str) -> str:
            nonlocal prompt
            prompt = prompt_text
            return json.dumps(
                {
                    "findings": [
                        {
                            "title": "Unsafe command construction",
                            "severity": "high",
                            "category": "Command injection",
                            "file_path": "app.py",
                            "line_number": 1,
                            "explanation": "User input is passed directly to a shell command.",
                            "evidence": "run(command)",
                            "suggested_fix": "Use a safe process API with an argument list.",
                            "confidence_status": "confirmed",
                        }
                    ]
                }
            )

        monkeypatch.setattr(
            ai_service,
            "settings",
            SimpleNamespace(ai_provider="openrouter", openrouter_api_key="test-key"),
        )
        monkeypatch.setattr(ai_service, "_call_openrouter", fake_openrouter)
        result = await ai_service.analyze_security_pull_request_diff(
            "octocat/repo",
            f"diff --git a/app.py b/app.py\n--- a/app.py\n+++ b/app.py\n@@ -0,0 +1,2 @@\n+run(command)\n+TOKEN={token}\n",
        )
        assert result.findings[0].evidence == "run(command)"
        assert token not in prompt

    asyncio.run(execute())


def test_security_review_rejects_evidence_not_in_diff() -> None:
    output = json.dumps(
        {
            "findings": [
                {
                    "title": "Finding",
                    "severity": "high",
                    "category": "Authorization",
                    "file_path": "app.py",
                    "line_number": 2,
                    "explanation": "Missing ownership check.",
                    "evidence": "invented code",
                    "suggested_fix": "Check ownership.",
                    "confidence_status": "potential",
                }
            ]
        }
    )
    with pytest.raises(AIProviderError, match="not present"):
        ai_service._parse_security_review_response(output, "+++ b/app.py\n+actual()\n")


def test_patch_safety_flags_truncated_ai_replacements() -> None:
    original = (
        "#include <iostream>\n"
        "using namespace std;\n"
        "\n"
        "int main() {\n"
        '    cout << "Hello, world!" << endl;\n'
        "    return 0;\n"
        "}\n"
    )

    # The model returned only the edited line instead of the whole file.
    assert is_probable_fragment(original, 'cout << "Hello, world!" << endl') is True
    # A genuine whole-file replacement keeps the structural anchors.
    assert is_probable_fragment(original, original.replace("Hello, world!", "Hi")) is False


def test_patch_safety_ignores_small_files_and_missing_original() -> None:
    assert is_probable_fragment(None, "print('hello')") is False
    assert is_probable_fragment("print('hello')", "print('hi')") is False
    assert is_probable_fragment("", "print('hi')") is False


def test_code_health_ignores_requested_change_and_health_improvement_records() -> None:
    defects = [
        SimpleNamespace(category="security", title="SQL injection", description="", severity="critical", status="open"),
    ]
    workflow_tasks = [
        SimpleNamespace(category="requested-change:Maintainability", title="Add endpoint", description="", severity="critical", status="open"),
        SimpleNamespace(category="health-improvement:Testing", title="Add tests", description="", severity="critical", status="open"),
    ]

    defects_only_score, defects_only_breakdown = calculate_code_health(defects)
    combined_score, combined_breakdown = calculate_code_health(defects + workflow_tasks)

    assert combined_score == defects_only_score
    assert combined_breakdown == defects_only_breakdown
