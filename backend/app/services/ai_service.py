import json
import re
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.schemas.ai import AnalyzeRepoRequest, AnalyzeRepoResponse


class CrossFileFix(BaseModel):
    model_config = ConfigDict(extra="ignore")
    file_path: str
    original_content: str | None = None
    corrected_code: str

class AnalyzedIssue(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1)
    severity: Literal["low", "medium", "high", "critical"]
    category: str = Field(min_length=1, max_length=100)
    file_path: str | None = None
    line_number: int | None = Field(default=None, ge=1)
    suggested_fix: str | None = None
    corrected_code: str | None = None
    cross_file_fixes: list[CrossFileFix] | None = None


class RepositoryAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    summary: str = Field(min_length=1)
    issues: list[AnalyzedIssue] = Field(default_factory=list, max_length=100)


class PRReviewComment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    path: str
    line: int
    body: str


class PRReviewResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    comments: list[PRReviewComment] = Field(default_factory=list)


class IncidentAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    incident_summary: str = Field(min_length=1, max_length=2000)
    likely_root_cause: str = Field(min_length=1, max_length=2000)
    observed_evidence: list[str] = Field(default_factory=list, max_length=20)
    ai_inference: str = Field(min_length=1, max_length=2000)
    affected_component: str | None = Field(default=None, max_length=500)
    severity: Literal["low", "medium", "high", "critical"]
    suggested_fix: str = Field(min_length=1, max_length=2000)
    prevention_recommendation: str = Field(min_length=1, max_length=2000)
    evidence_sufficient: bool


class EngineeringExecutiveSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=1500)


class SecurityReviewFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=500)
    severity: Literal["low", "medium", "high", "critical"]
    category: str = Field(min_length=1, max_length=100)
    file_path: str = Field(min_length=1, max_length=2048)
    line_number: int = Field(ge=1)
    explanation: str = Field(min_length=1, max_length=4000)
    evidence: str = Field(min_length=1, max_length=2000)
    suggested_fix: str = Field(min_length=1, max_length=2000)
    confidence_status: Literal["confirmed", "potential"]


class SecurityReviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    findings: list[SecurityReviewFinding] = Field(default_factory=list, max_length=100)


class AIProviderError(Exception):
    pass


async def analyze_repository(request: AnalyzeRepoRequest) -> AnalyzeRepoResponse:
    result = await analyze_repository_content(request.repo_name, None, [], request.provider)
    return AnalyzeRepoResponse(
        repo_name=request.repo_name,
        branch=request.branch,
        provider_used=request.provider,
        summary=result.summary,
        recommendations=[issue.title for issue in result.issues],
    )


async def analyze_repository_content(
    repository_name: str,
    language: str | None,
    files: list[object],
    provider: str | None = None,
    custom_rules: str | None = None,
) -> RepositoryAnalysisResult:
    selected_provider = (provider or settings.ai_provider).lower()
    prompt = _build_prompt(repository_name, language, files, custom_rules)
    if selected_provider == "openrouter":
        if not settings.openrouter_api_key:
            raise AIProviderError("OPENROUTER_API_KEY is not configured")
        content = await _call_openrouter(prompt)
    elif selected_provider == "gemini":
        if not settings.gemini_api_key:
            raise AIProviderError("Gemini API key is not configured")
        content = await _call_gemini(prompt)
    else:
        raise AIProviderError(f"Unsupported AI provider: {selected_provider}")
    return _parse_analysis_response(content)


async def analyze_pull_request_diff(
    repository_name: str,
    diff_content: str,
    custom_rules: str | None = None,
    provider: str | None = None,
) -> PRReviewResult:
    selected_provider = (provider or settings.ai_provider).lower()
    from app.services.secret_detection import redact_secrets

    prompt = _build_pr_prompt(repository_name, redact_secrets(diff_content), custom_rules)
    if selected_provider == "openrouter":
        if not settings.openrouter_api_key:
            raise AIProviderError("OPENROUTER_API_KEY is not configured")
        content = await _call_openrouter(prompt)
    elif selected_provider == "gemini":
        if not settings.gemini_api_key:
            raise AIProviderError("Gemini API key is not configured")
        content = await _call_gemini(prompt)
    else:
        raise AIProviderError(f"Unsupported AI provider: {selected_provider}")
    return _parse_pr_review_response(content)


async def analyze_incident_failure(
    source: str,
    evidence: str,
    provider: str | None = None,
) -> IncidentAnalysisResult:
    from app.services.secret_detection import redact_secrets

    safe_evidence = redact_secrets(evidence).strip()
    insufficient_message = "Insufficient evidence to determine the root cause."
    if not safe_evidence:
        return IncidentAnalysisResult(
            incident_summary=f"{source} failure reported without diagnostic evidence.",
            likely_root_cause=insufficient_message,
            observed_evidence=[],
            ai_inference=insufficient_message,
            affected_component=None,
            severity="low",
            suggested_fix="Provide the relevant failure output or logs for analysis.",
            prevention_recommendation="Capture and retain diagnostic output for future failures.",
            evidence_sufficient=False,
        )

    prompt = (
        "Analyze the following engineering incident using only the supplied evidence. "
        "Return only valid JSON with fields incident_summary, likely_root_cause, observed_evidence, "
        "ai_inference, affected_component, severity, suggested_fix, prevention_recommendation, "
        "evidence_sufficient. observed_evidence must be a list of short verbatim excerpts copied "
        "exactly from the supplied evidence; do not invent or paraphrase evidence. Put reasoning "
        "that is not directly observed only in ai_inference. If the evidence is insufficient, set "
        "evidence_sufficient to false and likely_root_cause to exactly "
        f"{json.dumps(insufficient_message)}. Severity must be low, medium, high, or critical.\n\n"
        f"Source: {source}\nEvidence:\n{safe_evidence}"
    )
    selected_provider = (provider or settings.ai_provider).lower()
    if selected_provider == "openrouter":
        if not settings.openrouter_api_key:
            raise AIProviderError("OPENROUTER_API_KEY is not configured")
        content = await _call_openrouter(prompt)
    elif selected_provider == "gemini":
        if not settings.gemini_api_key:
            raise AIProviderError("Gemini API key is not configured")
        content = await _call_gemini(prompt)
    else:
        raise AIProviderError(f"Unsupported AI provider: {selected_provider}")

    result = _parse_incident_response(content, safe_evidence)
    if not result.evidence_sufficient or not result.observed_evidence:
        result.likely_root_cause = insufficient_message
        result.evidence_sufficient = False
    return result


async def summarize_engineering_metrics(metrics: dict[str, int | str | None]) -> str:
    prompt = (
        "Write a concise engineering executive summary using only the metrics in this JSON. "
        "Do not invent data, trends, causes, percentages, comparisons, or facts not present here. "
        "Mention numeric values only when they exactly match a numeric value in the JSON, and keep "
        "each value attached to its correct metric. Explicitly note that unavailable metrics are omitted. "
        "Return only JSON with one field: summary.\n\n"
        f"Metrics: {json.dumps(metrics, sort_keys=True)}"
    )
    selected_provider = settings.ai_provider.lower()
    if selected_provider == "openrouter":
        if not settings.openrouter_api_key:
            raise AIProviderError("OPENROUTER_API_KEY is not configured")
        content = await _call_openrouter(prompt)
    elif selected_provider == "gemini":
        if not settings.gemini_api_key:
            raise AIProviderError("Gemini API key is not configured")
        content = await _call_gemini(prompt)
    else:
        raise AIProviderError(f"Unsupported AI provider: {selected_provider}")
    start_idx = content.find("{")
    end_idx = content.rfind("}")
    cleaned = content[start_idx : end_idx + 1] if start_idx != -1 and end_idx > start_idx else content.strip()
    try:
        summary = EngineeringExecutiveSummary.model_validate(json.loads(cleaned)).summary
    except (json.JSONDecodeError, ValueError) as exc:
        raise AIProviderError("AI provider returned an invalid engineering summary") from exc
    supplied_numbers = {
        str(value)
        for value in metrics.values()
        if isinstance(value, int)
    }
    mentioned_numbers = re.findall(r"(?<![A-Za-z])\d+(?:\.\d+)?%?", summary)
    if any(number.rstrip("%") not in supplied_numbers for number in mentioned_numbers):
        raise AIProviderError("AI provider included an unsupported numeric value in the engineering summary")
    return summary


async def analyze_security_pull_request_diff(
    repository_name: str,
    diff_content: str,
    provider: str | None = None,
) -> SecurityReviewResult:
    from app.services.secret_detection import redact_secrets

    safe_diff = redact_secrets(diff_content)
    if not safe_diff.strip():
        return SecurityReviewResult(findings=[])
    prompt = (
        "Review this pull-request diff specifically for security issues: SQL/command injection, XSS, path traversal, "
        "authorization bypass, insecure authentication, hardcoded secrets, unsafe file handling or deserialization, "
        "SSRF, insecure cryptography, privilege escalation, and sensitive-data exposure. "
        "Return JSON matching {findings: [{title, severity, category, file_path, line_number, explanation, evidence, "
        "suggested_fix, confidence_status}]}. Severity is low, medium, high, or critical. confidence_status must be "
        "confirmed or potential. evidence must be a short exact excerpt from the supplied diff; do not invent evidence. "
        "Only report actionable risks supported by the changed code. Do not include credential values in any field.\n\n"
        f"Repository: {repository_name}\nDiff:\n{safe_diff}"
    )
    selected_provider = (provider or settings.ai_provider).lower()
    if selected_provider == "openrouter":
        if not settings.openrouter_api_key:
            raise AIProviderError("OPENROUTER_API_KEY is not configured")
        content = await _call_openrouter(prompt)
    elif selected_provider == "gemini":
        if not settings.gemini_api_key:
            raise AIProviderError("Gemini API key is not configured")
        content = await _call_gemini(prompt)
    else:
        raise AIProviderError(f"Unsupported AI provider: {selected_provider}")
    result = _parse_security_review_response(content, safe_diff)
    return result


def _build_prompt(repository_name: str, language: str | None, files: list[object], custom_rules: str | None = None) -> str:
    source = "\n\n".join(f"FILE: {item.path}\n{item.content}" for item in files)
    rules_text = (
        f"\nThe team has provided the following custom guidelines to enforce:\n<custom_rules>\n{custom_rules}\n</custom_rules>\n"
        if custom_rules else ""
    )
    return (
        "Analyze this repository for actionable software, security, reliability, and maintainability problems. "
        "For each issue, explain clearly what is wrong and why it is a problem. "
        "Include a human-readable suggested_fix describing how to correct it. "
        "If the issue is isolated to a single file, provide the corrected_code with the fixed snippet. "
        "If the issue spans MULTIPLE files (e.g. changing an API signature and updating all its callers), "
        "provide a cross_file_fixes array containing the file_path, original_content, and corrected_code for each affected file. "
        "Return only valid JSON matching {summary: string, issues: [{title, description, severity, category, "
        "file_path, line_number, suggested_fix, corrected_code, cross_file_fixes: [{file_path, original_content, corrected_code}]}]}. "
        "Severity must be low, medium, high, or critical. "
        "Use null for unknown file_path, line_number, suggested_fix, corrected_code, or cross_file_fixes. "
        "Do not invent issues unrelated to the supplied files.\n\n"
        f"Repository: {repository_name}\nLanguage: {language or 'unknown'}\n{rules_text}\n{source}"
    )


def _build_pr_prompt(repository_name: str, diff_content: str, custom_rules: str | None = None) -> str:
    rules_text = (
        f"\nThe team has provided the following custom guidelines to enforce:\n<custom_rules>\n{custom_rules}\n</custom_rules>\n"
        if custom_rules else ""
    )
    return (
        "Analyze this Git diff for a Pull Request. Provide actionable code review comments for bugs, reliability problems, "
        "and security issues such as injection, XSS, path traversal, SSRF, authorization bypass, insecure authentication, "
        "unsafe deserialization, and sensitive data exposure. "
        "Return only valid JSON matching {comments: [{path, line, body}]}. "
        "The 'path' must be the file path from the diff. "
        "The 'line' must be the line number in the new file where the issue exists. "
        "The 'body' is your markdown-formatted review comment. For security findings, state severity and category, "
        "cite the changed code evidence, and describe a suggested fix. Distinguish confirmed defects from potential risks; "
        "do not claim a vulnerability without evidence in the diff. "
        "Do not comment if the code is fine. Only flag actionable issues.\n\n"
        f"Repository: {repository_name}\n{rules_text}\nDiff:\n{diff_content}"
    )


async def _call_openrouter(prompt: str) -> str:
    payload = {
        "model": settings.openrouter_model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "You are a careful repository security and code-quality reviewer."},
            {"role": "user", "content": prompt},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": "http://localhost:8000",
                    "X-Title": "DevOpsManager"
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise AIProviderError("OpenRouter request failed") from exc
    if response.is_error:
        if response.status_code == 401:
            raise AIProviderError(f"OpenRouter authentication failed: {response.text}")
        if response.status_code == 429:
            raise AIProviderError(f"OpenRouter rate limit exceeded: {response.text}")
        if response.status_code in (404, 422):
            raise AIProviderError(f"OpenRouter model unavailable: {response.text}")
        raise AIProviderError(f"OpenRouter returned HTTP {response.status_code}: {response.text}")
    try:
        return str(response.json()["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIProviderError("OpenRouter returned an invalid response") from exc


async def _call_gemini(prompt: str) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                url,
                params={"key": settings.gemini_api_key},
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
    except httpx.HTTPError as exc:
        raise AIProviderError("Gemini request failed") from exc
    if response.is_error:
        raise AIProviderError(f"Gemini returned HTTP {response.status_code}")
    try:
        return str(response.json()["candidates"][0]["content"]["parts"][0]["text"])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIProviderError("Gemini returned an invalid response") from exc


def _parse_analysis_response(content: str) -> RepositoryAnalysisResult:
    start_idx = content.find('{')
    end_idx = content.rfind('}')
    
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        cleaned = content[start_idx:end_idx+1]
    else:
        cleaned = content.strip()

    try:
        return RepositoryAnalysisResult.model_validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValueError) as exc:
        raise AIProviderError(f"AI provider returned invalid structured analysis: {exc}. Raw output snippet: {content[:200]}") from exc


def _parse_pr_review_response(content: str) -> PRReviewResult:
    start_idx = content.find('{')
    end_idx = content.rfind('}')
    
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        cleaned = content[start_idx:end_idx+1]
    else:
        cleaned = content.strip()

    try:
        return PRReviewResult.model_validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValueError) as exc:
        raise AIProviderError(f"AI provider returned invalid PR review format: {exc}. Raw output snippet: {content[:200]}") from exc


def _parse_incident_response(content: str, evidence: str) -> IncidentAnalysisResult:
    start_idx = content.find("{")
    end_idx = content.rfind("}")
    cleaned = content[start_idx : end_idx + 1] if start_idx != -1 and end_idx > start_idx else content.strip()
    try:
        result = IncidentAnalysisResult.model_validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValueError) as exc:
        raise AIProviderError("AI provider returned invalid incident analysis") from exc
    if any(quote not in evidence for quote in result.observed_evidence):
        raise AIProviderError("AI provider cited evidence that was not present in the supplied failure data")
    return result


def _parse_security_review_response(content: str, diff_content: str) -> SecurityReviewResult:
    start_idx = content.find("{")
    end_idx = content.rfind("}")
    cleaned = content[start_idx : end_idx + 1] if start_idx != -1 and end_idx > start_idx else content.strip()
    try:
        result = SecurityReviewResult.model_validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValueError) as exc:
        raise AIProviderError("AI provider returned an invalid security review") from exc
    added_lines = _added_diff_lines(diff_content)
    for finding in result.findings:
        if finding.evidence not in diff_content:
            raise AIProviderError("AI provider cited security evidence that was not present in the pull-request diff")
        if finding.line_number not in added_lines.get(finding.file_path, set()):
            raise AIProviderError("AI provider cited a line that was not added in the pull-request diff")
    return result


def _added_diff_lines(diff_content: str) -> dict[str, set[int]]:
    lines_by_path: dict[str, set[int]] = {}
    current_path: str | None = None
    new_line_number: int | None = None
    for line in diff_content.splitlines():
        if line.startswith("+++ b/"):
            current_path = line[6:]
            lines_by_path.setdefault(current_path, set())
            new_line_number = None
            continue
        if line.startswith("@@"):
            match = re.search(r"\+(\d+)(?:,\d+)?", line)
            new_line_number = int(match.group(1)) if match else None
            continue
        if new_line_number is None or current_path is None:
            continue
        if line.startswith("+") and not line.startswith("+++"):
            lines_by_path[current_path].add(new_line_number)
            new_line_number += 1
        elif line.startswith(" "):
            new_line_number += 1
    return lines_by_path
