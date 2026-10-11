"""Keep a local, human-readable record of detected secrets without ever committing it.

The note file lists where credential-like values were found (the values themselves stay
masked) and the project's .gitignore is updated automatically so the note can never be
pushed to a remote by accident.
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


def write_secret_note(repository_full_name: str, findings: list[object]) -> str | None:
    """Write (or refresh) the note file for a repository.

    Returns the absolute note path, or None when there was nothing to record.
    """
    findings = list(findings)
    if not findings:
        return None
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    ensure_notes_gitignored()
    note_path = _note_path(repository_full_name)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [
        "Secret scan note - " + repository_full_name,
        "Generated automatically by DevOpsManager on " + timestamp,
        "",
        "Credential-like values were detected at the locations below.",
        "Values are masked here. Open each file, revoke or rotate the real credential,",
        "then remove it from the repository and its history.",
        "",
    ]
    for index, finding in enumerate(findings, start=1):
        lines.append(
            "  {idx}. [{severity}] {secret_type} - {file_path}:{line_number} ({masked})".format(
                idx=index,
                severity=getattr(finding, "severity", "unknown"),
                secret_type=getattr(finding, "secret_type", "Credential"),
                file_path=getattr(finding, "file_path", "unknown"),
                line_number=getattr(finding, "line_number", 0),
                masked=getattr(finding, "masked_value", "***"),
            )
        )
    lines.extend(["", "Total findings: " + str(len(findings)), ""])
    note_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info("Wrote secret note for %s to %s", repository_full_name, note_path)
    return str(note_path)