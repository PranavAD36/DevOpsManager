from collections import defaultdict
from collections.abc import Iterable


HEALTH_CATEGORIES = (
    "Code Quality",
    "Maintainability",
    "Testing",
    "Security",
    "Complexity",
    "Documentation",
)
_SEVERITY_PENALTIES = {"critical": 20, "high": 10, "medium": 5, "low": 2}
_CATEGORY_TERMS = {
    "Maintainability": ("maintain", "technical debt", "refactor"),
    "Testing": ("test", "coverage"),
    "Security": ("security", "secret", "auth", "vulnerability", "injection"),
    "Complexity": ("complex", "cyclomatic"),
    "Documentation": ("documentation", "docs", "comment"),
}


def _category_for(issue: object) -> str:
    category = str(getattr(issue, "category", "") or "").lower()
    title = str(getattr(issue, "title", "") or "").lower()
    description = str(getattr(issue, "description", "") or "").lower()
    text = f"{category} {title} {description}"
    for health_category, terms in _CATEGORY_TERMS.items():
        if any(term in text for term in terms):
            return health_category
    return "Code Quality"


def calculate_code_health(issues: Iterable[object]) -> tuple[int, dict[str, int]]:
    penalties: dict[str, int] = defaultdict(int)
    for issue in issues:
        if str(getattr(issue, "status", "open")).lower() in {"resolved", "rejected", "applied", "closed"}:
            continue
        severity = str(getattr(issue, "severity", "medium")).lower()
        penalties[_category_for(issue)] += _SEVERITY_PENALTIES.get(severity, _SEVERITY_PENALTIES["medium"])
    breakdown = {
        category: max(0, 100 - min(100, penalties[category]))
        for category in HEALTH_CATEGORIES
    }
    score = round(sum(breakdown.values()) / len(HEALTH_CATEGORIES))
    return score, breakdown
