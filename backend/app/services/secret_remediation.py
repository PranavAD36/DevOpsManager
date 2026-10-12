"""Turn detected secrets into concrete, pushable fixes.

Two kinds of cleanup are planned for a repository:

* Sensitive files (``.env``, private keys, ...) are added to the repository's ``.gitignore``
  so the credential stops being tracked.
* A credential found inside a normal source file has the offending line removed from that file.

Applying a plan commits each change to the repository's default branch.
"""

import logging
from dataclasses import dataclass
from types import SimpleNamespace

from app.integrations.github_app import GitHubAppError, GitHubAppService, _is_sensitive_source_path
from app.services.secret_detection import detect_secrets, redact_secrets

logger = logging.getLogger(__name__)

MAX_ACTIONS = 25
GITIGNORE_PATH = ".gitignore"

_SENSITIVE_COMMIT = "chore(security): stop tracking files that contain credentials"
_REMOVE_COMMIT = "chore(security): remove exposed credential from {path}"


@dataclass
class RemediationAction:
    file_path: str
    action: str  # "gitignore" | "remove_lines"
    secret_type: str
    line_numbers: list[int]
    removed_snippet: str
    raw_snippet: str = ""
    gitignore_entry: str | None = None


@dataclass
class RemediationResult:
    file_path: str
    action: str
    ok: bool
    message: str
    commit_sha: str | None = None
    commit_url: str | None = None


def _strip_lines(content: str, line_numbers: set[int]) -> str:
    lines = content.splitlines()
    kept = [line for index, line in enumerate(lines, start=1) if index not in line_numbers]
    if len(kept) == len(lines):
        return content
    trailing_newline = "\n" if content.endswith("\n") else ""
    return "\n".join(kept) + trailing_newline


def _raw_snippet(content: str, line_numbers: list[int]) -> str:
    """Original (unredacted) source lines, used only for the local git-ignored secret note."""
    lines = content.splitlines()
    picked = [lines[number - 1].strip() for number in line_numbers if 0 < number <= len(lines)]
    return "\n".join(picked)


def _snippet(content: str, line_numbers: list[int]) -> str:
    lines = content.splitlines()
    picked = [lines[number - 1].strip() for number in line_numbers if 0 < number <= len(lines)]
    return redact_secrets("\n".join(picked))


async def plan_secret_remediation(repository: object, access_token: str, service: GitHubAppService | None = None) -> list[RemediationAction]:
    """Work out how every detected secret should be cleaned up, without changing anything."""
    service = service or GitHubAppService()
    files = await service.get_repository_source_files(
        access_token,
        str(getattr(repository, "owner", "")),
        str(getattr(repository, "name", "")),
        str(getattr(repository, "default_branch", "main")),
        include_sensitive_files=True,
    )
    findings = detect_secrets(files)
    if not findings:
        return []
    contents = {str(getattr(item, "path", "")): str(getattr(item, "content", "")) for item in files}

    grouped: dict[str, list] = {}
    for finding in findings:
        grouped.setdefault(finding.file_path, []).append(finding)

    actions: list[RemediationAction] = []
    for path, items in grouped.items():
        line_numbers = sorted({item.line_number for item in items})
        content = contents.get(path, "")
        if _is_sensitive_source_path(path):
            actions.append(
                RemediationAction(
                    file_path=path,
                    action="gitignore",
                    secret_type=items[0].secret_type,
                    line_numbers=line_numbers,
                    removed_snippet=_snippet(content, line_numbers),
                    raw_snippet=_raw_snippet(content, line_numbers),
                    gitignore_entry=path,
                )
            )
        else:
            actions.append(
                RemediationAction(
                    file_path=path,
                    action="remove_lines",
                    secret_type=items[0].secret_type,
                    line_numbers=line_numbers,
                    removed_snippet=_snippet(content, line_numbers),
                    raw_snippet=_raw_snippet(content, line_numbers),
                )
            )
        if len(actions) >= MAX_ACTIONS:
            break
    return actions


async def _apply_gitignore(service, access_token, repository, entries, results) -> None:
    entries = [entry for entry in entries if entry and entry != GITIGNORE_PATH]
    if not entries:
        return
    owner = str(getattr(repository, "owner", ""))
    name = str(getattr(repository, "name", ""))
    branch = str(getattr(repository, "default_branch", "main"))
    content = ""
    sha: str | None = None
    try:
        latest = await service.get_file(access_token, owner, name, GITIGNORE_PATH, branch)
        content, sha = latest.content, latest.sha
    except GitHubAppError as exc:
        if exc.status_code != 404:
            raise
    existing = {line.strip() for line in content.splitlines()}
    additions = [entry for entry in entries if entry not in existing]
    if not additions:
        results.append(
            RemediationResult(GITIGNORE_PATH, "gitignore", True, "Already ignored by .gitignore")
        )
        return
    body = content.rstrip("\n")
    new_content = (body + "\n" if body else "") + "\n".join(additions) + "\n"
    commit = await service.update_file(access_token, owner, name, GITIGNORE_PATH, branch, new_content, sha, _SENSITIVE_COMMIT)
    results.append(
        RemediationResult(
            GITIGNORE_PATH,
            "gitignore",
            True,
            "Added " + ", ".join(additions) + " to .gitignore",
            commit.sha,
            commit.html_url,
        )
    )


async def _apply_removal(service, access_token, repository, action: RemediationAction, results) -> None:
    owner = str(getattr(repository, "owner", ""))
    name = str(getattr(repository, "name", ""))
    branch = str(getattr(repository, "default_branch", "main"))
    latest = await service.get_file(access_token, owner, name, action.file_path, branch)
    fresh = detect_secrets([SimpleNamespace(path=action.file_path, content=latest.content)])
    line_numbers = {item.line_number for item in fresh} or set(action.line_numbers)
    new_content = _strip_lines(latest.content, line_numbers)
    if new_content == latest.content:
        results.append(
            RemediationResult(action.file_path, "remove_lines", True, "No matching line left to remove")
        )
        return
    message = _REMOVE_COMMIT.format(path=action.file_path)
    commit = await service.update_file(access_token, owner, name, action.file_path, branch, new_content, latest.sha, message)
    removed = ", ".join(str(number) for number in sorted(line_numbers))
    results.append(
        RemediationResult(action.file_path, "remove_lines", True, "Removed line(s) " + removed, commit.sha, commit.html_url)
    )


async def apply_secret_remediation(
    repository: object, access_token: str, service: GitHubAppService | None = None
) -> tuple[list[RemediationAction], list[RemediationResult]]:
    """Plan the cleanup and push every safe fix to the repository."""
    service = service or GitHubAppService()
    actions = await plan_secret_remediation(repository, access_token, service)
    results: list[RemediationResult] = []
    ignore_entries = [action.gitignore_entry for action in actions if action.action == "gitignore"]
    if ignore_entries:
        await _apply_gitignore(service, access_token, repository, ignore_entries, results)
    for action in actions:
        if action.action != "remove_lines":
            continue
        try:
            await _apply_removal(service, access_token, repository, action, results)
        except GitHubAppError as exc:
            results.append(RemediationResult(action.file_path, action.action, False, str(exc)))
    return actions, results
