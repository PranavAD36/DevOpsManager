"""Keep a local, human-readable record of detected secrets without ever committing it.

The note file lists every place a credential-like value was found - the file it lives in, the
key name, and the exact line - and the project's .gitignore is updated automatically so the
note can never be pushed to a remote by accident.
"""

import logging
import re
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
NOTES_DIR = PROJECT_ROOT / "backend" / "data" / "secret_notes"
GITIGNORE_PATH = PROJECT_ROOT / ".gitignore"
_GITIGNORE_RULE = "backend/data/secret_notes/"

_KEY_PATTERN = re.compile(r"([A-Za-z_][A-Za-z0-9_.\-]*)\s*[:=]")


def ensure_notes_gitignored() -> bool:
    """Make sure the notes directory is ignored by git. Returns True when a rule was added."""
    try:
        existing = GITIGNORE_PATH.read_text(encoding="utf-8") if GITIGNORE_PATH.exists() else ""
    except OSError:
        logger.warning("Could not read %s; secret notes may not be git-ignored.", GITIGNORE_PATH)
        return False
    if _GITIGNORE_RULE in existing:
        return False
    addition = "\n# Detected-secret notes (local only, never commit)\n" + _GITIGNORE_RULE + "\n"
    try:
        GITIGNORE_PATH.write_text(existing.rstrip("\n") + "\n" + addition, encoding="utf-8")
    except OSError:
        logger.warning("Could not update %s to ignore secret notes.", GITIGNORE_PATH)
        return False
    return True


def _note_path(repository_full_name: str) -> Path:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", repository_full_name.strip()) or "repository"
    return NOTES_DIR / (safe_name + ".txt")


def _key_name(raw_line: str, secret_type: str) -> str:
    """Best-effort name of the setting that holds the credential (e.g. ``PassWord``)."""
    if raw_line:
        match = _KEY_PATTERN.search(raw_line)
        if match:
            return match.group(1)
    return secret_type


def collect_raw_lines(files: list[object], findings: list[object]) -> dict[tuple[str, int], str]:
    """Map ``(file_path, line_number)`` to the original source line behind each finding."""
    content_by_path: dict[str, str] = {}
    for source_file in files:
        path = str(getattr(source_file, "path", "") or "")
        if path and path not in content_by_path:
            content_by_path[path] = str(getattr(source_file, "content", "") or "")
    raw_lines: dict[tuple[str, int], str] = {}
    for finding in findings:
        path = str(getattr(finding, "file_path", "") or "")
        line_number = int(getattr(finding, "line_number", 0) or 0)
        if not path or line_number <= 0:
            continue
        source_lines = content_by_path.get(path, "").splitlines()
        if 0 < line_number <= len(source_lines):
            raw_lines[(path, line_number)] = source_lines[line_number - 1]
    return raw_lines

def write_secret_note(
    repository_full_name: str,
    findings: list[object],
    raw_lines: dict[tuple[str, int], str] | None = None,
) -> str | None:
    """Write (or refresh) the note file for a repository.

    ``raw_lines`` maps ``(file_path, line_number)`` to the original source line so the note can
    show exactly what was found. Raw values only ever land in this local, git-ignored file.

    Returns the absolute note path, or None when there was nothing to record.
    """
    findings = list(findings)
    if not findings:
        return None
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    ensure_notes_gitignored()
    note_path = _note_path(repository_full_name)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    repository_short_name = repository_full_name.split("/")[-1] or repository_full_name
    lines = [
        "Secret scan note - " + repository_full_name,
        "Generated automatically by DevOpsManager on " + timestamp,
        "",
        "Credential-like values were detected in the files listed below. Revoke or rotate each",
        "credential, then remove it from the repository and from its history.",
        "",
        "Do not commit this file - it is listed in .gitignore.",
        "",
        "-" * 60,
        "",
    ]
    for finding in findings:
        path = str(getattr(finding, "file_path", "unknown"))
        line_number = int(getattr(finding, "line_number", 0) or 0)
        raw_line = (raw_lines or {}).get((path, line_number), "").strip()
        if not raw_line:
            raw_line = "-> " + str(getattr(finding, "masked_value", "***"))
        else:
            raw_line = "-> " + raw_line
        lines.append(repository_short_name + "/" + path)
        lines.append("")
        lines.append("*" + _key_name(raw_line, str(getattr(finding, "secret_type", "Credential"))))
        lines.append(raw_line)
        lines.append("")
    lines.extend(["-" * 60, "", "Total findings: " + str(len(findings)), ""])
    note_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info("Wrote secret note for %s to %s", repository_full_name, note_path)
    return str(note_path)