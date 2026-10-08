"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  type EngineeringTrends,
  type EngineeringAlert,
  type Project,
  type Repository,
  type RepositoryComparison,
  type SecurityFinding,
} from "../../lib/api";

export default function EngineeringPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoryFilter, setRepositoryFilter] = useState("");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [trends, setTrends] = useState<EngineeringTrends | null>(null);
  const [report, setReport] = useState<EngineeringTrends | null>(null);
  const [reportPeriod, setReportPeriod] = useState<"weekly" | "monthly" | "custom">("monthly");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [securityFindings, setSecurityFindings] = useState<SecurityFinding[]>([]);
  const [alerts, setAlerts] = useState<EngineeringAlert[]>([]);
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRepositories, setSelectedRepositories] = useState<string[]>([]);
  const [comparison, setComparison] = useState<RepositoryComparison[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects()
      .then((items) => {
        setProjects(items);
        if (items[0]) setProjectId(items[0].id);
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load projects."));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setComparison(null);
    Promise.all([
      api.listRepositories(projectId),
      api.getEngineeringTrends(projectId, days, repositoryFilter || undefined),
    ])
      .then(([repoItems, trendData]) => {
        setRepositories(repoItems);
        setTrends(trendData);
        setSelectedRepositories((current) => current.filter((id) => repoItems.some((repo) => repo.id === id)));
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load engineering trends."))
      .finally(() => setLoading(false));
  }, [projectId, days, repositoryFilter]);

  useEffect(() => {
    api.listSecurityFindings({
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
    })
      .then(setSecurityFindings)
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load security findings."));
  }, [severityFilter, statusFilter]);

  useEffect(() => {
    api.listAlerts()
      .then(setAlerts)
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load alerts."));
  }, []);

  async function generateReport() {
    if (!projectId) return;
    setReportLoading(true);
    setError(null);
    try {
      const data = await api.getEngineeringReport(
        projectId,
        reportPeriod,
        reportPeriod === "custom" ? customStart : undefined,
        reportPeriod === "custom" ? customEnd : undefined,
        repositoryFilter || undefined,
      );
      setReport(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to generate report.");
    } finally {
      setReportLoading(false);
    }
  }

  async function compareSelectedRepositories() {
    setCompareLoading(true);
    setError(null);
    try {
      const result = await api.compareRepositories(selectedRepositories);
      setComparison(result.repositories);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to compare repositories.");
    } finally {
      setCompareLoading(false);
    }
  }

  async function updateAlert(alert: EngineeringAlert, update: { is_read?: boolean; status?: "open" | "resolved" }) {
    setError(null);
    try {
      const saved = await api.updateAlert(alert.id, update);
      setAlerts((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update alert.");
    }
  }

  const maxActivity = useMemo(
    () => Math.max(1, ...(trends?.series.map((point) => point.issues_opened + point.issues_resolved + point.ci_runs) ?? [])),
    [trends],
  );

  return (
    <main className="relative dm-enter min-h-screen pb-16">
      <div className="orb orb--violet w-[400px] h-[400px] top-0 right-0" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 pt-8">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-500/70">Engineering Intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Engineering Overview</h1>
            <p className="mt-2 text-sm text-slate-400">Trends, reports, repository comparison, and security findings from available project data.</p>
          </div>
          <label className="text-xs text-slate-400">
            Project
            <select className="form-select mt-2 min-w-56" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Select project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
        </div>

        {error && <div className="mb-6 rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300" role="alert">{error}</div>}
        {!projects.length && !error && <div className="glass-panel p-8 text-center text-sm text-slate-400">No projects are available yet. <Link className="text-cyan-300 hover:text-cyan-200" href="/projects">Connect a repository</Link>.</div>}

        {projectId && (
          <div className="space-y-8">
            <section className="glass-panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Engineering Trends</h2>
                  <p className="mt-1 text-xs text-slate-500">Only metrics supported by persisted project data are plotted.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="text-xs text-slate-400">
                    Repository
                    <select className="form-select ml-2 !py-1.5" value={repositoryFilter} onChange={(event) => setRepositoryFilter(event.target.value)}>
                      <option value="">All repositories</option>
                      {repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.full_name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    Range
                    <select className="form-select ml-2 !py-1.5" value={days} onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)}>
                      <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
                    </select>
                  </label>
                </div>
              </div>
              {loading ? <p className="mt-8 text-sm text-slate-500">Loading trend data...</p> : trends && (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <SummaryMetric label="Issues opened" value={trends.series.reduce((sum, point) => sum + point.issues_opened, 0)} />
                    <SummaryMetric label="Issues resolved" value={trends.series.reduce((sum, point) => sum + point.issues_resolved, 0)} />
                    <SummaryMetric label="Analyses" value={trends.series.reduce((sum, point) => sum + point.analyses, 0)} />
                    <SummaryMetric label="Analysis failures" value={trends.series.reduce((sum, point) => sum + point.analysis_failures, 0)} />
                    <SummaryMetric label="CI runs" value={trends.series.reduce((sum, point) => sum + point.ci_runs, 0)} />
                    <SummaryMetric label="CI failures" value={trends.series.reduce((sum, point) => sum + point.ci_failures, 0)} />
                  </div>
                  <div className="mt-6 space-y-2">
                    {trends.series.filter((point) => point.issues_opened + point.issues_resolved + point.ci_runs > 0).slice(-14).map((point) => (
                      <div key={point.date} className="grid grid-cols-[5rem_1fr_5rem_7rem] items-center gap-3 text-xs">
                        <span className="font-mono text-slate-500">{point.date.slice(5)}</span>
                        <div className="h-2 rounded-full bg-[#1e2d4a]">
                          <div className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500" style={{ width: `${Math.max(2, ((point.issues_opened + point.issues_resolved + point.ci_runs) / maxActivity) * 100)}%` }} />
                        </div>
                        <span className="text-right font-mono text-slate-400">Issues {point.issues_opened + point.issues_resolved}</span>
                        <span className="text-right font-mono text-slate-500">CI {point.ci_runs} / {point.ci_failures} fail</span>
                      </div>
                    ))}
                    {!trends.series.some((point) => point.issues_opened + point.issues_resolved + point.ci_runs > 0) && <p className="text-sm text-slate-500">No issue or synchronized workflow activity was recorded in this period.</p>}
                  </div>
                  <p className="mt-5 text-xs text-slate-500">Unavailable from current data: {trends.unavailable_metrics.join(", ")}.</p>
                </>
              )}
            </section>

            <section className="grid gap-8 lg:grid-cols-2">
              <div className="glass-panel p-6">
                <h2 className="text-lg font-semibold text-white">Historical Report</h2>
                <p className="mt-1 text-xs text-slate-500">Weekly, monthly, or custom-range activity from recorded issues and analyses.</p>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="text-xs text-slate-400">Period
                    <select className="form-select mt-2" value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value as "weekly" | "monthly" | "custom")}>
                      <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option>
                    </select>
                  </label>
                  {reportPeriod === "custom" && <>
                    <label className="text-xs text-slate-400">From<input className="input mt-2 block" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
                    <label className="text-xs text-slate-400">To<input className="input mt-2 block" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
                  </>}
                  <button className="btn-primary !py-2 !text-xs" disabled={reportLoading || (reportPeriod === "custom" && (!customStart || !customEnd))} onClick={() => void generateReport()}>
                    {reportLoading ? "Generating..." : "Generate"}
                  </button>
                </div>
                {report && <div className="mt-5 rounded-xl border border-[#1e2d4a] bg-[#0b1120]/70 p-4">
                  <p className="text-xs font-mono text-slate-400">{report.start_date} to {report.end_date}</p>
                  <p className="mt-3 text-sm text-slate-300">Issues opened: {report.series.reduce((sum, point) => sum + point.issues_opened, 0)} · Resolved: {report.series.reduce((sum, point) => sum + point.issues_resolved, 0)} · Analyses: {report.series.reduce((sum, point) => sum + point.analyses, 0)} · CI runs: {report.series.reduce((sum, point) => sum + point.ci_runs, 0)} · CI failures: {report.series.reduce((sum, point) => sum + point.ci_failures, 0)} · Security findings: {report.security_findings} · Code health: {report.code_health ?? "n/a"}</p>
                  {report.executive_summary && <p className="mt-4 border-t border-[#1e2d4a] pt-4 text-sm leading-relaxed text-slate-300">{report.executive_summary}</p>}
                  {report.top_problems.length > 0 && <p className="mt-3 text-xs text-slate-400">Top problems: {report.top_problems.join(" · ")}</p>}
                  <p className="mt-2 text-xs text-slate-400">Improvements: {report.improvements.join(" · ")}</p>
                  <p className="mt-3 text-xs text-slate-500">Unavailable metrics omitted: {report.unavailable_metrics.join(", ")}.</p>
                </div>}
              </div>

              <div className="glass-panel p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-lg font-semibold text-white">Repository Comparison</h2><p className="mt-1 text-xs text-slate-500">Select two or more repositories from this project.</p></div>
                  <button className="btn-secondary !py-2 !text-xs" disabled={compareLoading || selectedRepositories.length < 2 || selectedRepositories.length > 10} onClick={() => void compareSelectedRepositories()}>
                    {compareLoading ? "Comparing..." : "Compare"}
                  </button>
                </div>
                <div className="mt-4 max-h-36 space-y-2 overflow-y-auto">
                  {repositories.map((repository) => (
                    <label key={repository.id} className="flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" checked={selectedRepositories.includes(repository.id)} onChange={(event) => setSelectedRepositories((current) => event.target.checked ? [...current, repository.id] : current.filter((id) => id !== repository.id))} />
                      {repository.full_name}
                    </label>
                  ))}
                </div>
                {comparison && <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500"><tr><th className="py-2">Repository</th><th>Health</th><th>Issues</th><th>Security</th><th>CI</th></tr></thead>
                    <tbody>{comparison.map((item) => <tr key={item.repository_id} className="border-t border-[#1e2d4a] text-slate-300">
                      <td className="py-2">{item.full_name}</td><td>{item.code_health ?? "n/a"}</td><td>{item.open_issues}</td><td>{item.security_findings}</td><td>{item.ci_success_rate === null ? "n/a" : `${item.ci_success_rate}%`}</td>
                    </tr>)}</tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-slate-500">Unavailable metrics are returned per repository and are not represented as zero.</p>
                </div>}
              </div>
            </section>

            <section className="glass-panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><h2 className="text-lg font-semibold text-white">Security Dashboard</h2><p className="mt-1 text-xs text-slate-500">Persisted owner-scoped security and secret findings; credential text is redacted from descriptions.</p></div>
                <div className="flex gap-2">
                  <select className="form-select !py-1.5 text-xs" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
                  <select className="form-select !py-1.5 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {securityFindings.length ? securityFindings.map((finding) => (
                  <div key={finding.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1e2d4a] bg-[#0b1120]/60 p-3">
                    <div><p className="text-sm font-medium text-white">{finding.title}</p><p className="mt-1 text-xs text-slate-500">{finding.repository_name || "Repository unavailable"}{finding.file_path ? ` · ${finding.file_path}${finding.line_number ? `:${finding.line_number}` : ""}` : ""}</p></div>
                    <div className="flex items-center gap-2"><span className="badge badge-rose">{finding.severity}</span><span className="text-xs text-slate-500">{finding.status}</span></div>
                  </div>
                )) : <p className="text-sm text-slate-500">No matching persisted security findings.</p>}
              </div>
            </section>

            <section className="glass-panel p-6">
              <div className="flex items-center justify-between gap-4">
                <div><h2 className="text-lg font-semibold text-white">Smart Alerts</h2><p className="mt-1 text-xs text-slate-500">Deduplicated security and workflow events. Credential values are never included.</p></div>
                <span className="badge badge-cyan">{alerts.filter((alert) => !alert.is_read && alert.status === "open").length} unread</span>
              </div>
              <div className="mt-5 space-y-2">
                {alerts.length ? alerts.map((alert) => (
                  <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1e2d4a] bg-[#0b1120]/60 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="badge badge-rose">{alert.severity}</span><span className="text-xs font-mono text-cyan-300">{alert.source}</span><span className="text-xs text-slate-500">{new Date(alert.created_at).toLocaleString()}</span></div>
                      <p className="mt-2 text-sm text-slate-300">{alert.message}</p>
                    </div>
                    <div className="flex gap-2">
                      {!alert.is_read && <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => void updateAlert(alert, { is_read: true })}>Mark read</button>}
                      {alert.status === "open" && <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => void updateAlert(alert, { status: "resolved", is_read: true })}>Resolve</button>}
                    </div>
                  </div>
                )) : <p className="text-sm text-slate-500">No active engineering alerts.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/70 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;
}
