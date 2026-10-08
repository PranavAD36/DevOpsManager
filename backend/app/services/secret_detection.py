import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SecretFinding:
    secret_type: str
    file_path: str
    line_number: int
    severity: str
    masked_value: str


_SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("GitHub Token", re.compile(r"\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"), "gh"),
    ("AWS Access Key", re.compile(r"\b(AKIA[0-9A-Z]{16})\b"), "aws"),
    (
        "Access Token",
        re.compile(r"\b(glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|npm_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})\b"),
        "token",
    ),
    (
        "Database Credential",
        re.compile(r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s\"'<>]+", re.IGNORECASE),
        "database-url",
    ),
    (
        "Private Key",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
        "private-key",
    ),
    (
        "Credential",
        re.compile(
            r"""(?i)\b[A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|aws_secret_access_key|account[_-]?key|connection[_-]?string|signing[_-]?key)[A-Za-z0-9_-]*\b\s*[:=]\s*['"]?([A-Za-z0-9/+=_.-]{8,})"""
        ),
        "generic",
    ),
)

_PLACEHOLDERS = {
    "changeme",
    "change_me",
    "example",
    "fake",
    "dummy",
    "placeholder",
    "replace_me",
    "sample",
    "test",
    "your_api_key",
    "your_token",
}
_PRIVATE_KEY_BLOCK = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
    re.DOTALL,
)


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().lower().strip("\"'")
    return (
        normalized in _PLACEHOLDERS
        or normalized.startswith(("your-", "your_", "${", "<"))
        or set(normalized) <= {"x", "*", "-", "_"}
    )


def _safe_mask(kind: str, match: re.Match[str]) -> str:
    if kind == "gh":
        matched = match.group(0)
        prefix = "github_pat_" if matched.startswith("github_pat_") else matched.split("_", 1)[0] + "_"
        return prefix + "*" * 12
    if kind == "aws":
        return "AKIA" + "*" * 12
    if kind == "private-key":
        return "-----BEGIN PRIVATE KEY-----"
    return "*" * 12


def detect_secrets(files: list[object]) -> list[SecretFinding]:
    findings: list[SecretFinding] = []
    seen: set[tuple[str, int, str]] = set()
    for source_file in files:
        path = str(getattr(source_file, "path", ""))
        if not path or any(part.lower() == ".git" for part in path.replace("\\", "/").split("/")):
            continue
        content = str(getattr(source_file, "content", ""))
        for line_number, line in enumerate(content.splitlines(), start=1):
            for secret_type, pattern, kind in _SECRET_PATTERNS:
                for match in pattern.finditer(line):
                    if kind == "generic":
                        value = match.group(1)
                        if _is_placeholder(value):
                            continue
                    key = (path, line_number, secret_type)
                    if key in seen:
                        continue
                    seen.add(key)
                    findings.append(
                        SecretFinding(
                            secret_type=secret_type,
                            file_path=path,
                            line_number=line_number,
                            severity="critical",
                            masked_value=_safe_mask(kind, match),
                        )
                    )
    return findings


def scan_and_exclude_secret_files(files: list[object]) -> tuple[list[object], list[SecretFinding]]:
    findings = detect_secrets(files)
    unsafe_paths = {finding.file_path for finding in findings}
    return (
        [source_file for source_file in files if str(getattr(source_file, "path", "")) not in unsafe_paths],
        findings,
    )


def redact_secrets(text: str) -> str:
    redacted = _PRIVATE_KEY_BLOCK.sub("[REDACTED PRIVATE KEY]", text)
    for _, pattern, kind in _SECRET_PATTERNS:
        if kind == "generic":
            redacted = pattern.sub(lambda match: match.group(0).replace(match.group(1), "[REDACTED]"), redacted)
        else:
            redacted = pattern.sub("[REDACTED CREDENTIAL]", redacted)
    return redacted
