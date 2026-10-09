"use client";

import { useEffect, useState } from "react";
import {
  api,
  type CodeHealth,
  type IncidentAnalysis,
  type Repository,
  type SecurityReviewFinding,
  type SecretFinding,
  type WorkflowHealth,
  type WorkflowRun,
} from "../lib/api";

const severityBadge: Record<string, string> = {
  critical: "badge-rose",
  high: "badge-amber",
  medium: "badge-cyan",
  low: "badge-slate",
};

const INCIDENT_SOURCES = [
  { value: "github-actions", label: "GitHub Actions failure" },
  { value: "build", label: "Build failure" },
  { value: "deployment", label: "Deployment failure" },
  { value: "test", label: "Test failure" },
  { value: "application", label: "Application error" },
  { value: "webhook", label: "Webhook failure" },
];

function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "n/a";
  if (seconds < 60) return seconds + "s";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m " + (seconds % 60) + "s";
  const hours = Math.floor(minutes / 60);
  return hours + "h " + (minutes % 60) + "m";
}

function formatDate(value: string | null): string {
  if (!value) return "n/a";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "n/a" : parsed.toLocaleString();
}

function runsTable(runs: WorkflowRun[]) {
  if (runs.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="py-2 pr-4 font-medium">Workflow</th>
            <th className="py-2 pr-4 font-medium">Branch</th>
            <th className="py-2 pr-4 font-medium">Conclusion</th>
            <th className="py-2 pr-4 font-medium">Duration</th>
            <th className="py-2 font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-t border-[#1e2d4a]/60 text-slate-300">
              <td className="py-2 pr-4">
                <a href={run.html_url} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200">
                  {run.name}
                </a>
              </td>
              <td className="py-2 pr-4 font-mono">{run.branch || "n/a"}</td>
              <td className="py-2 pr-4">
                <span className={"badge " + (run.conclusion === "success" ? "badge-emerald" : run.conclusion === "failure" ? "badge-rose" : "badge-slate")}>
                  {run.conclusion || run.status}
                </span>
              </td>
              <td className="py-2 pr-4 font-mono">{formatDuration(run.duration_seconds)}</td>
              <td className="py-2 text-slate-500">{formatDate(run.started_at || run.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectInsights({ repositories }: { repositories: Repository[] }) {
  const [repositoryId, setRepositoryId] = useState("");
  const [codeHealth, setCodeHealth] = useState<CodeHealth | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowHealth | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<SecretFinding[] | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [scanningSecrets, setScanningSecrets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [incidentSource, setIncidentSource] = useState("github-actions");
  const [incidentSummary, setIncidentSummary] = useState("");
  const [incidentLogs, setIncidentLogs] = useState("");
  const [incident, setIncident] = useState<IncidentAnalysis | null>(null);
  const [analyzingIncident, setAnalyzingIncident] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);

  const [prNumber, setPrNumber] = useState("");
  const [securityFindings, setSecurityFindings] = useState<SecurityReviewFinding[] | null>(null);
  const [reviewingSecurity, setReviewingSecurity] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  useEffect(() => {
    if (!repositoryId && repositories[0]) setRepositoryId(repositories[0].id);
  }, [repositories, repositoryId]);

  useEffect(() => {
    if (!repositoryId) return;
    setError(null);
    setWorkflowError(null);
    setCodeHealth(null);
    setWorkflows(null);
    setSecrets(null);
    setSecurityFindings(null);

    setLoadingHealth(true);
    api
      .getCodeHealth(repositoryId)
      .then(setCodeHealth)
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Unable to load code health."),
      )
      .finally(() => setLoadingHealth(false));

    setLoadingWorkflows(true);
    api
      .getWorkflowHealth(repositoryId)
      .then(setWorkflows)
      .catch((requestError) =>
        setWorkflowError(requestError instanceof Error ? requestError.message : "Unable to load CI health."),
      )
      .finally(() => setLoadingWorkflows(false));
  }, [repositoryId]);

  async function scanSecrets() {
    if (!repositoryId) return;
    setScanningSecrets(true);
    setError(null);
    try {
      const result = await api.scanRepositorySecrets(repositoryId);
      setSecrets(result.findings);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to scan for secrets.");
    } finally {
      setScanningSecrets(false);
    }
  }

  async function analyzeIncident() {
    setAnalyzingIncident(true);
    setIncidentError(null);
    setIncident(null);
    try {
      const result = await api.analyzeIncident({
        source: incidentSource,
        summary: incidentSummary || undefined,
        logs: incidentLogs || undefined,
        repository_id: repositoryId || undefined,
      });
      setIncident(result);
    } catch (requestError) {
      setIncidentError(requestError instanceof Error ? requestError.message : "Unable to analyze incident.");
    } finally {
      setAnalyzingIncident(false);
    }
  }

  async function reviewSecurity() {
    if (!repositoryId) return;
    const number = Number(prNumber);
    if (!Number.isInteger(number) || number < 1) {
      setSecurityError("Enter a valid pull request number.");
      return;
    }
    setReviewingSecurity(true);
    setSecurityError(null);
    setSecurityFindings(null);
    try {
      const result = await api.reviewPullRequestSecurity(repositoryId, number);
      setSecurityFindings(result.findings);
    } catch (requestError) {
      setSecurityError(requestError instanceof Error ? requestError.message : "Unable to review pull request.");
    } finally {
      setReviewingSecurity(false);
    }
  }

  if (repositories.length === 0) {
    return (
      <div className="glass-panel p-10 text-center">
        <p className="text-sm text-slate-400">Connect a repository to view code health, CI, and security insights.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-mono uppercase tracking-wider text-slate-500">Repository</label>
        <select
          className="form-select !py-1.5 !text-xs !rounded-lg"
          value={repositoryId}
          onChange={(event) => setRepositoryId(event.target.value)}
        >
          {repositories.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.full_name}
            </option>
          ))}
        </select>
      </div>

      <section className="glass-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Code Health</h2>
            <p className="mt-1 text-xs text-slate-500">Deterministic score derived from unresolved analysis findings.</p>
          </div>
          {codeHealth?.available && codeHealth.score !== null && (
            <span className="text-3xl font-semibold text-white">
              {codeHealth.score}
              <span className="text-sm text-slate-500">/100</span>
            </span>
          )}
        </div>
        {loadingHealth ? (
          <p className="mt-5 text-sm text-slate-500">Loading code health...</p>
        ) : !codeHealth || !codeHealth.available ? (
          <p className="mt-5 text-sm text-slate-500">
            {codeHealth?.scoring_method || "Run a repository analysis to calculate code health."}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(codeHealth.breakdown || {}).map(([dimension, value]) => (
              <div key={dimension} className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-4">
                <div className="flex items-center justify-between text-xs capitalize text-slate-400">
                  <span>{dimension.replace(/_/g, " ")}</span>
                  <span className="font-mono text-slate-300">{value}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1e2d4a]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                    style={{ width: Math.max(0, Math.min(100, value)) + "%" }}
                  />
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-4">
              <p className="text-xs text-slate-400">Unresolved findings</p>
              <p className="mt-2 text-2xl font-semibold text-white">{codeHealth.findings_count}</p>
            </div>
          </div>
        )}
        {codeHealth?.available && codeHealth.scoring_method && (
          <p className="mt-4 text-[11px] leading-relaxed text-slate-600">{codeHealth.scoring_method}</p>
        )}
      </section>

      <section className="glass-panel p-6">
        <div>
          <h2 className="text-lg font-semibold text-white">CI Health</h2>
          <p className="mt-1 text-xs text-slate-500">Authenticated GitHub Actions workflow runs for this repository.</p>
        </div>
        {loadingWorkflows ? (
          <p className="mt-5 text-sm text-slate-500">Loading workflow runs...</p>
        ) : workflowError ? (
          <p className="mt-5 text-sm text-slate-500">{workflowError}</p>
        ) : !workflows || workflows.total_runs === 0 ? (
          <p className="mt-5 text-sm text-slate-500">No workflow runs were found for this repository.</p>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-4">
                <p className="text-xs text-slate-500">Success rate</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">
                  {workflows.success_rate === null ? "n/a" : workflows.success_rate + "%"}
                </p>
              </div>
              <div className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-4">
                <p className="text-xs text-slate-500">Failure rate</p>
                <p className="mt-2 text-2xl font-semibold text-rose-400">
                  {workflows.failure_rate === null ? "n/a" : workflows.failure_rate + "%"}
                </p>
              </div>
              <div className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-4">
                <p className="text-xs text-slate-500">Average duration</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatDuration(workflows.average_duration_seconds)}</p>
              </div>
            </div>
            {workflows.recent_failures.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-mono uppercase tracking-wider text-rose-400">Recent failures</p>
                {runsTable(workflows.recent_failures)}
              </div>
            )}
            <div className="mt-5">
              <p className="text-xs font-mono uppercase tracking-wider text-slate-500">Recent runs</p>
              {runsTable(workflows.runs.slice(0, 15))}
            </div>
          </>
        )}
      </section>

      <section className="glass-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Secret Detection</h2>
            <p className="mt-1 text-xs text-slate-500">Scans repository source for credential patterns. Values are masked and never stored.</p>
          </div>
          <button className="btn-primary !py-2 !px-4 !text-xs" disabled={scanningSecrets || !repositoryId} onClick={() => void scanSecrets()}>
            {scanningSecrets ? "Scanning..." : "Scan for Secrets"}
          </button>
        </div>
        {secrets === null ? (
          <p className="mt-5 text-sm text-slate-500">Run a scan to check this repository for exposed credentials.</p>
        ) : secrets.length === 0 ? (
          <p className="mt-5 text-sm text-emerald-400">No secret-like credentials were detected.</p>
        ) : (
          <div className="mt-5 space-y-2">
            {secrets.map((finding, index) => (
              <div
                key={finding.file_path + ":" + finding.line_number + ":" + index}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1e2d4a] bg-[#0b1120]/60 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{finding.secret_type}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {finding.file_path}:{finding.line_number} &middot; {finding.masked_value}
                  </p>
                </div>
                <span className={"badge " + (severityBadge[finding.severity] || "badge-slate")}>{finding.severity}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-panel p-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Incident Analyzer</h2>
          <p className="mt-1 text-xs text-slate-500">
            Separates supplied evidence from AI inference. Credential-like values are redacted before analysis.
          </p>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Failure source</label>
            <select className="form-select !py-2 text-sm" value={incidentSource} onChange={(event) => setIncidentSource(event.target.value)}>
              {INCIDENT_SOURCES.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Short summary (optional)</label>
            <input
              className="input !py-2 text-sm"
              value={incidentSummary}
              onChange={(event) => setIncidentSummary(event.target.value)}
              placeholder="e.g. Deployment failed in production"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Failure output / logs (optional)</label>
            <textarea
              className="input min-h-[140px] !py-3 font-mono text-xs"
              value={incidentLogs}
              onChange={(event) => setIncidentLogs(event.target.value)}
              placeholder="Paste the failing command output or stack trace..."
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <button
            className="btn-primary !py-2 !px-5 !text-sm"
            disabled={analyzingIncident || (!incidentSummary && !incidentLogs)}
            onClick={() => void analyzeIncident()}
          >
            {analyzingIncident ? "Analyzing..." : "Analyze Incident"}
          </button>
          {!incidentSummary && !incidentLogs && <span className="text-xs text-slate-500">Provide a summary or logs to analyze.</span>}
        </div>
        {incidentError && (
          <div className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{incidentError}</div>
        )}
        {incident && (
          <div className="mt-5 space-y-4 rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className={"badge " + (severityBadge[incident.severity] || "badge-slate")}>{incident.severity}</span>
              {incident.affected_component && <span className="text-xs text-slate-400">Component: {incident.affected_component}</span>}
              {!incident.evidence_sufficient && <span className="badge badge-amber">Insufficient evidence</span>}
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-cyan-400">Incident summary</p>
              <p className="mt-1 text-sm text-slate-300">{incident.incident_summary}</p>
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-cyan-400">Likely root cause</p>
              <p className="mt-1 text-sm text-slate-300">{incident.likely_root_cause}</p>
            </div>
            {incident.observed_evidence.length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-slate-500">Observed evidence</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-400">
                  {incident.observed_evidence.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {incident.ai_inference && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-violet-400">AI inference</p>
                <p className="mt-1 text-sm text-slate-400">{incident.ai_inference}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-emerald-400">Suggested fix</p>
              <p className="mt-1 text-sm text-slate-300">{incident.suggested_fix}</p>
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-emerald-400">Prevention</p>
              <p className="mt-1 text-sm text-slate-300">{incident.prevention_recommendation}</p>
            </div>
          </div>
        )}
      </section>

      <section className="glass-panel p-6">
        <div>
          <h2 className="text-lg font-semibold text-white">AI Security Review</h2>
          <p className="mt-1 text-xs text-slate-500">
            Reviews a pull request diff for security risks. Findings cite exact diff evidence and distinguish confirmed from potential risks.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Pull request number</label>
            <input
              className="input w-40 !py-2 text-sm"
              type="number"
              min={1}
              value={prNumber}
              onChange={(event) => setPrNumber(event.target.value)}
              placeholder="e.g. 42"
            />
          </div>
          <button className="btn-primary !py-2 !px-5 !text-sm" disabled={reviewingSecurity || !prNumber} onClick={() => void reviewSecurity()}>
            {reviewingSecurity ? "Reviewing..." : "Review PR Security"}
          </button>
        </div>
        {securityError && (
          <div className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{securityError}</div>
        )}
        {securityFindings !== null && (
          <div className="mt-5 space-y-3">
            {securityFindings.length === 0 ? (
              <p className="text-sm text-emerald-400">No security findings were identified in this pull request.</p>
            ) : (
              securityFindings.map((finding, index) => (
                <div key={index} className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"badge " + (severityBadge[finding.severity] || "badge-slate")}>{finding.severity}</span>
                    <span className="badge badge-violet">{finding.category}</span>
                    <span className="badge badge-slate">{finding.confidence_status === "confirmed" ? "Confirmed" : "Potential"}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">{finding.title}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {finding.file_path}
                    {finding.line_number ? ":" + finding.line_number : ""}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">{finding.explanation}</p>
                  {finding.evidence && (
                    <div className="mt-2">
                      <p className="text-xs font-mono uppercase tracking-wider text-slate-500">Evidence</p>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#0c111e] p-3 text-xs text-slate-400">{finding.evidence}</pre>
                    </div>
                  )}
                  <div className="mt-2">
                    <p className="text-xs font-mono uppercase tracking-wider text-emerald-400">Suggested fix</p>
                    <p className="mt-1 text-sm text-slate-300">{finding.suggested_fix}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}