"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  api,
  type EngineeringPoint,
  type EngineeringRepositoryActivity,
  type EngineeringTrends,
  type EngineeringAlert,
  type GitHubRepository,
  type Issue,
  type Project,
  type Repository,
  type CodeHealth,
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
  const [healthRepositoryId, setHealthRepositoryId] = useState("");
  const [repoHealth, setRepoHealth] = useState<RepositoryComparison | null>(null);
  const [healthBreakdown, setHealthBreakdown] = useState<CodeHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [healthSuggestions, setHealthSuggestions] = useState<Issue[]>([]);
  const [healthSummary, setHealthSummary] = useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionBatchBusy, setSuggestionBatchBusy] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushedIds, setPushedIds] = useState<string[]>([]);
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const [addRepoBusy, setAddRepoBusy] = useState(false);
  const [addRepoError, setAddRepoError] = useState<string | null>(null);
  const [addRepoMessage, setAddRepoMessage] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([]);
  const [githubReposLoading, setGithubReposLoading] = useState(false);
  const [githubReposError, setGithubReposError] = useState<string | null>(null);
  const [githubRepoFilter, setGithubRepoFilter] = useState("");

  useEffect(() => {
    api.listProjects()
      .then((items) => {
        setProjects(items);
      })
      .catch((requestError) => setPageError(requestError instanceof Error ? requestError.message : "Unable to load projects."));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setTrendsError(null);
    setRepoHealth(null);
    setHealthBreakdown(null);
    Promise.all([
      api.listRepositories(projectId),
      api.getEngineeringTrends(projectId, days, repositoryFilter || undefined),
    ])
      .then(([repoItems, trendData]) => {
        setRepositories(repoItems);
        setTrends(trendData);
        setHealthRepositoryId((current) => (repoItems.some((repo) => repo.id === current) ? current : ""));
      })
      .catch((requestError) => setTrendsError(requestError instanceof Error ? requestError.message : "Unable to load engineering trends."))
      .finally(() => setLoading(false));
  }, [projectId, days, repositoryFilter]);

  useEffect(() => {
    api.listSecurityFindings({
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
    })
      .then(setSecurityFindings)
      .catch((requestError) => setSecurityError(requestError instanceof Error ? requestError.message : "Unable to load security findings."));
  }, [severityFilter, statusFilter]);

  useEffect(() => {
    api.listAlerts()
      .then(setAlerts)
      .catch((requestError) => setAlertsError(requestError instanceof Error ? requestError.message : "Unable to load alerts."));
  }, []);

  useEffect(() => {
    if (!addRepoOpen) return;
    setGithubReposLoading(true);
    setGithubReposError(null);
    api.listGithubRepositories()
      .then(setGithubRepos)
      .catch((requestError) =>
        setGithubReposError(
          requestError instanceof Error
            ? requestError.message
            : "Connect your GitHub account to list your repositories.",
        ),
      )
      .finally(() => setGithubReposLoading(false));
  }, [addRepoOpen]);

  async function generateReport() {
    if (!projectId) return;
    setReportLoading(true);
    setReportError(null);
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
      setReportError(requestError instanceof Error ? requestError.message : "Unable to generate report.");
    } finally {
      setReportLoading(false);
    }
  }

  async function checkRepositoryHealth() {
    if (!healthRepositoryId) return;
    setHealthLoading(true);
    setHealthError(null);
    try {
      const [comparisonResult, codeHealth] = await Promise.all([
        api.compareRepositories([healthRepositoryId]),
        api.getCodeHealth(healthRepositoryId),
      ]);
      setRepoHealth(comparisonResult.repositories[0] ?? null);
      setHealthBreakdown(codeHealth);
    } catch (requestError) {
      setHealthError(requestError instanceof Error ? requestError.message : "Unable to check repository health.");
    } finally {
      setHealthLoading(false);
    }
  }

  async function updateAlert(alert: EngineeringAlert, update: { is_read?: boolean; status?: "open" | "resolved" }) {
    setAlertsError(null);
    try {
      const saved = await api.updateAlert(alert.id, update);
      setAlerts((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch (requestError) {
      setAlertsError(requestError instanceof Error ? requestError.message : "Unable to update alert.");
    }
  }

  async function generateHealthSuggestions() {
    if (!healthRepositoryId) return;
    setSuggestionLoading(true);
    setSuggestionError(null);
    setHealthSummary(null);
    setHealthSuggestions([]);
    setPushedIds([]);
    setRejectedIds([]);
    try {
      const result = await api.getHealthSuggestions(healthRepositoryId, 5);
      setHealthSuggestions(result.suggestions);
      setHealthSummary(result.summary);
    } catch (requestError) {
      setSuggestionError(requestError instanceof Error ? requestError.message : "Unable to generate AI suggestions.");
    } finally {
      setSuggestionLoading(false);
    }
  }

  async function pushSuggestion(issue: Issue) {
    setPushingId(issue.id);
    setSuggestionError(null);
    try {
      await api.applySuggestion(issue.id);
      setPushedIds((current) => [...current, issue.id]);
      void checkRepositoryHealth();
    } catch (requestError) {
      setSuggestionError(requestError instanceof Error ? requestError.message : "Unable to push the change.");
    } finally {
      setPushingId(null);
    }
  }

  async function rejectSuggestion(issue: Issue) {
    setSuggestionError(null);
    try {
      await api.rejectIssueFix(issue.id);
      setRejectedIds((current) => [...current, issue.id]);
    } catch (requestError) {
      setSuggestionError(requestError instanceof Error ? requestError.message : "Unable to reject the change.");
    }
  }

  async function pushAllHealthSuggestions() {
    const pending = healthSuggestions.filter((issue) => !pushedIds.includes(issue.id) && !rejectedIds.includes(issue.id));
    if (!pending.length) return;
    setSuggestionBatchBusy(true);
    setSuggestionError(null);
    const failures: string[] = [];
    for (const issue of pending) {
      try {
        await api.applySuggestion(issue.id);
        setPushedIds((current) => [...current, issue.id]);
      } catch (requestError) {
        failures.push(`${issue.title}: ${requestError instanceof Error ? requestError.message : "failed"}`);
      }
    }
    setSuggestionBatchBusy(false);
    if (failures.length) setSuggestionError(failures.join(" | "));
    void checkRepositoryHealth();
  }

  async function rejectAllHealthSuggestions() {
    const pending = healthSuggestions.filter((issue) => !pushedIds.includes(issue.id) && !rejectedIds.includes(issue.id));
    if (!pending.length) return;
    setSuggestionError(null);
    for (const issue of pending) {
      try {
        await api.rejectIssueFix(issue.id);
        setRejectedIds((current) => [...current, issue.id]);
      } catch (requestError) {
        setSuggestionError(requestError instanceof Error ? requestError.message : "Unable to reject a change.");
      }
    }
  }

  async function addRepository(overrideUrl?: string) {
    const targetUrl = (overrideUrl ?? newRepoUrl).trim();
    if (!projectId || !targetUrl) return;
    setAddRepoBusy(true);
    setAddRepoError(null);
    setAddRepoMessage(null);
    try {
      const repository = await api.connectRepository(projectId, targetUrl);
      setRepositories((current) => (current.some((item) => item.id === repository.id) ? current : [...current, repository]));
      setHealthRepositoryId((current) => current || repository.id);
      setRepositoryFilter(repository.id);
      setNewRepoUrl("");
      setAddRepoMessage(`${repository.full_name} added. Trend data is refreshing.`);
    } catch (requestError) {
      setAddRepoError(requestError instanceof Error ? requestError.message : "Unable to add the repository.");
    } finally {
      setAddRepoBusy(false);
    }
  }

  return (
    <main className="relative dm-enter min-h-screen pb-16">
      <div className="orb orb--violet w-[400px] h-[400px] top-0 right-0" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 pt-8">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-500/70">Engineering Intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Engineering Overview</h1>
            <p className="mt-2 text-sm text-slate-400">Trends, reports, repository health, and security findings from available project data.</p>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <label className="text-xs text-slate-400">
              Project
              <select className="form-select mt-2 min-w-56" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">Select project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="btn-secondary !py-2 !text-xs"
              disabled={!projectId}
              onClick={() => {
                setAddRepoOpen((open) => !open);
                setAddRepoError(null);
                setAddRepoMessage(null);
              }}
            >
              {addRepoOpen ? "Close" : "+ Add Repository"}
            </button>
          </div>
        </div>

        {addRepoOpen && projectId && (
          <div className="mb-6 glass-panel p-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 text-xs text-slate-400">
                GitHub repository URL
                <input
                  className="input mt-2 w-full"
                  placeholder="https://github.com/owner/repository"
                  value={newRepoUrl}
                  onChange={(event) => setNewRepoUrl(event.target.value)}
                  disabled={addRepoBusy}
                />
              </label>
              <button
                className="btn-primary !py-2 !text-xs"
                disabled={addRepoBusy || !newRepoUrl.trim()}
                onClick={() => void addRepository()}
              >
                {addRepoBusy ? "Adding..." : "Add Repository"}
              </button>
            </div>
            {addRepoError && <SectionError message={addRepoError} />}
            {addRepoMessage && <p className="mt-3 text-xs text-emerald-300">{addRepoMessage}</p>}

            <div className="mt-5 border-t border-[#1e2d4a] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-mono uppercase tracking-wider text-slate-500">
                  Your GitHub repositories{githubRepos.length ? " (" + githubRepos.length + ")" : ""}
                </p>
                <input
                  className="input !py-1.5 text-xs w-full sm:w-56"
                  placeholder="Search your repositories..."
                  value={githubRepoFilter}
                  onChange={(event) => setGithubRepoFilter(event.target.value)}
                  disabled={githubReposLoading}
                />
              </div>
              {githubReposLoading ? (
                <p className="mt-3 text-xs text-slate-500">Loading your repositories...</p>
              ) : githubReposError ? (
                <p className="mt-3 text-xs text-amber-300">{githubReposError}</p>
              ) : githubRepos.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">
                  No repositories were returned for your GitHub account. Use the URL field above instead.
                </p>
              ) : (
                <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {githubRepos
                    .filter((repo) => repo.full_name.toLowerCase().includes(githubRepoFilter.toLowerCase()))
                    .map((repo) => {
                      const alreadyAdded = repositories.some((item) => item.full_name === repo.full_name);
                      return (
                        <button
                          key={repo.id}
                          type="button"
                          disabled={alreadyAdded || addRepoBusy}
                          onClick={() => void addRepository(repo.html_url)}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 px-3 py-2 text-left transition-colors hover:border-cyan-500/40 disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs text-white">{repo.full_name}</span>
                            <span className="block text-[11px] text-slate-500">
                              {(repo.private ? "Private" : "Public") + (repo.language ? " - " + repo.language : "")}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-cyan-300">
                            {alreadyAdded ? "Added" : "Add"}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {pageError && <div className="mb-6 rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300" role="alert">{pageError}</div>}
        {!projects.length && !pageError && <div className="glass-panel p-8 text-center text-sm text-slate-400">No projects are available yet. <Link className="text-cyan-300 hover:text-cyan-200" href="/projects">Connect a repository</Link>.</div>}
        {!projectId && projects.length > 0 && (
          <div className="glass-panel p-10 text-center">
            <p className="text-sm text-slate-400">
              Select a project above to view trends, reports, repository health, and security findings.
            </p>
          </div>
        )}

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
              {trendsError && <SectionError message={trendsError} />}
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
                  <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="rounded-2xl border border-[#1e2d4a] bg-[#0b1120]/60 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-white">Activity timeline</p>
                          <p className="text-[11px] text-slate-500">{trends.start_date} to {trends.end_date}</p>
                        </div>
                        <TrendLegend availableMetrics={trends.available_metrics} />
                      </div>
                      <TrendChart series={trends.series} availableMetrics={trends.available_metrics} />
                    </div>
                    <div>
                      <p className="mb-3 text-sm font-medium text-white">Work by repository</p>
                      <RepositoryActivityPanel activity={trends.repository_activity} />
                    </div>
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
                {reportError && <SectionError message={reportError} />}
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
                <div>
                  <h2 className="text-lg font-semibold text-white">Repository Health</h2>
                  <p className="mt-1 text-xs text-slate-500">Check engineering health for a single repository.</p>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="text-xs text-slate-400">
                    Repository
                    <select className="form-select mt-2 min-w-56" value={healthRepositoryId} onChange={(event) => { setHealthRepositoryId(event.target.value); setHealthSuggestions([]); setHealthSummary(null); setSuggestionError(null); }}>
                      <option value="">Select repository</option>
                      {repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.full_name}</option>)}
                    </select>
                  </label>
                  <button className="btn-primary !py-2 !text-xs" disabled={healthLoading || !healthRepositoryId} onClick={() => void checkRepositoryHealth()}>
                    {healthLoading ? "Checking..." : "Check Health"}
                  </button>
                  <button className="btn-accent !py-2 !text-xs" disabled={suggestionLoading || !healthRepositoryId} onClick={() => void generateHealthSuggestions()}>
                    {suggestionLoading ? "Analyzing..." : "AI Improve Suggestions"}
                  </button>
                </div>

                {healthError && <SectionError message={healthError} />}

                {repoHealth && (
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center gap-4 rounded-xl border border-[#1e2d4a] bg-[#0b1120]/70 p-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#38bdf8 ${(repoHealth.code_health ?? 0) * 3.6}deg, #1e2d4a 0deg)` }}>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0b1120] text-sm font-semibold text-white">
                          {repoHealth.code_health ?? "n/a"}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{repoHealth.full_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {repoHealth.code_health === null ? "Run a repository analysis to calculate a health score." : "Overall code health out of 100."}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <HealthMetric label="Open issues" value={String(repoHealth.open_issues)} />
                      <HealthMetric label="Security" value={String(repoHealth.security_findings)} />
                      <HealthMetric label="CI success" value={repoHealth.ci_success_rate === null ? "n/a" : `${repoHealth.ci_success_rate}%`} />
                    </div>

                    {healthBreakdown && healthBreakdown.available && healthBreakdown.breakdown && (
                      <div className="space-y-2">
                        {Object.entries(healthBreakdown.breakdown).map(([dimension, value]) => (
                          <div key={dimension}>
                            <div className="flex items-center justify-between text-xs capitalize text-slate-400">
                              <span>{dimension.replace(/_/g, " ")}</span>
                              <span className="font-mono text-slate-300">{value}</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#1e2d4a]">
                              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500" style={{ width: Math.max(0, Math.min(100, value)) + "%" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {healthBreakdown && !healthBreakdown.available && (
                      <p className="text-xs text-slate-500">{healthBreakdown.scoring_method}</p>
                    )}
                    {healthBreakdown && healthBreakdown.available && (
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Derived only from {repoHealth.open_issues} open finding(s) in this repository. Each dimension starts at 100 and drops by real findings (critical -20, high -10, medium -5, low -2); nothing is estimated or random.
                      </p>
                    )}
                    {repoHealth.unavailable_metrics.length > 0 && (
                      <p className="text-[11px] text-slate-500">Unavailable: {repoHealth.unavailable_metrics.join(", ")}.</p>
                    )}
                  </div>
                )}

                {suggestionError && <SectionError message={suggestionError} />}

                {healthSummary && (
                  <p className="mt-5 rounded-xl border border-cyan-900/40 bg-cyan-950/20 px-4 py-3 text-xs leading-relaxed text-cyan-100">{healthSummary}</p>
                )}

                {healthSuggestions.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">Suggested changes to raise the health score</p>
                        <p className="mt-1 text-[11px] text-slate-500">Secret, credential, and .env files are never sent to the AI or pushed.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge badge-cyan">{healthSuggestions.length} proposed</span>
                        <button
                          className="btn-accent !px-3 !py-1.5 !text-xs"
                          disabled={suggestionBatchBusy || healthSuggestions.every((issue) => pushedIds.includes(issue.id) || rejectedIds.includes(issue.id))}
                          onClick={() => void pushAllHealthSuggestions()}
                        >
                          {suggestionBatchBusy ? "Pushing..." : `Approve All & Push (${healthSuggestions.filter((issue) => !pushedIds.includes(issue.id) && !rejectedIds.includes(issue.id)).length})`}
                        </button>
                        <button
                          className="btn-danger !px-3 !py-1.5 !text-xs"
                          disabled={suggestionBatchBusy || healthSuggestions.every((issue) => pushedIds.includes(issue.id) || rejectedIds.includes(issue.id))}
                          onClick={() => void rejectAllHealthSuggestions()}
                        >
                          {`Reject All (${healthSuggestions.filter((issue) => !pushedIds.includes(issue.id) && !rejectedIds.includes(issue.id)).length})`}
                        </button>
                      </div>
                    </div>
                    {healthSuggestions.map((issue) => {
                      const pushed = pushedIds.includes(issue.id);
                      const rejected = rejectedIds.includes(issue.id);
                      return (
                        <div key={issue.id} className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/70 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white">{issue.title}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{issue.file_path}{issue.line_number ? `:${issue.line_number}` : ""}</p>
                            </div>
                            <span className={`badge ${issue.severity === "critical" || issue.severity === "high" ? "badge-rose" : "badge-amber"}`}>{issue.severity}</span>
                          </div>
                          {issue.suggested_fix && <p className="mt-2 text-xs text-slate-400">{issue.suggested_fix}</p>}
                          {issue.corrected_code && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[11px] text-cyan-300">View proposed code</summary>
                              <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-[#1e2d4a] bg-[#050b18] p-3 text-[11px] leading-relaxed text-slate-300">{issue.corrected_code}</pre>
                            </details>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {pushed ? (
                              <span className="badge badge-emerald">Pushed to {repositories.find((repo) => repo.id === issue.repository_id)?.default_branch ?? "default branch"}</span>
                            ) : rejected ? (
                              <span className="badge badge-slate">Rejected</span>
                            ) : (
                              <>
                                <button className="btn-accent !px-3 !py-1.5 !text-xs" disabled={pushingId === issue.id} onClick={() => void pushSuggestion(issue)}>
                                  {pushingId === issue.id ? "Pushing..." : "Approve & Push"}
                                </button>
                                <button className="btn-danger !px-3 !py-1.5 !text-xs" onClick={() => void rejectSuggestion(issue)}>
                                  Reject
                                </button>
                              </>
                            )}
                            {issue.commit_url && (
                              <a className="text-[11px] text-cyan-300 hover:text-cyan-200" href={issue.commit_url} target="_blank" rel="noreferrer">View commit</a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
              {securityError && <SectionError message={securityError} />}
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
              {alertsError && <SectionError message={alertsError} />}
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

function SectionError({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/25 px-4 py-3 text-sm text-rose-300" role="alert">
      {message}
    </div>
  );
}

function HealthMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/70 p-3 text-center">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/70 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;
}

const TREND_METRICS = [
  { key: "issues_opened", label: "Opened", color: "#38bdf8" },
  { key: "issues_resolved", label: "Resolved", color: "#34d399" },
  { key: "analyses", label: "Analyses", color: "#a78bfa" },
  { key: "ci_runs", label: "CI runs", color: "#fbbf24" },
] as const;

type TrendMetricKey = (typeof TREND_METRICS)[number]["key"];

function TrendLegend({ availableMetrics }: { availableMetrics: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {TREND_METRICS.filter((metric) => availableMetrics.includes(metric.key)).map((metric) => (
        <span key={metric.key} className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: metric.color }} />
          {metric.label}
        </span>
      ))}
    </div>
  );
}

function TrendChart({ series, availableMetrics }: { series: EngineeringPoint[]; availableMetrics: string[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const metrics = TREND_METRICS.filter((metric) => availableMetrics.includes(metric.key));
  if (!series.length || !metrics.length) {
    return <p className="py-12 text-center text-sm text-slate-500">No activity was recorded in this period.</p>;
  }
  const width = 760;
  const height = 260;
  const pad = { top: 22, right: 20, bottom: 32, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = Math.max(1, ...series.flatMap((point) => metrics.map((metric) => point[metric.key as TrendMetricKey])));
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;
  const xAt = (index: number) => pad.left + index * stepX;
  const yAt = (value: number) => pad.top + innerH - (value / maxValue) * innerH;
  const clampY = (value: number) => Math.max(pad.top, Math.min(pad.top + innerH, value));
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const labelIndexes = Array.from(new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]));
  const bandWidth = series.length > 1 ? stepX : innerW;

  function smooth(points: { x: number; y: number }[]): string {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[index - 1] ?? points[index];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[index + 2] ?? p2;
      path += ` C ${p1.x + (p2.x - p0.x) / 6} ${clampY(p1.y + (p2.y - p0.y) / 6)}, ${p2.x - (p3.x - p1.x) / 6} ${clampY(p2.y - (p3.y - p1.y) / 6)}, ${p2.x} ${p2.y}`;
    }
    return path;
  }

  const hovered = hoverIndex === null ? null : series[hoverIndex];
  const hoverX = hoverIndex === null ? 0 : xAt(hoverIndex);
  const hoverTop = hovered ? Math.min(...metrics.map((metric) => yAt(hovered[metric.key as TrendMetricKey]))) : 0;

  return (
    <div className="relative mt-2 rounded-2xl border border-[#1e2d4a] bg-gradient-to-b from-[#0b1120]/80 to-[#0b1120]/30 p-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full"
        role="img"
        aria-label="Engineering activity timeline"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          {metrics.map((metric) => (
            <linearGradient key={metric.key} id={`trend-fill-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metric.color} stopOpacity="0.34" />
              <stop offset="100%" stopColor={metric.color} stopOpacity="0" />
            </linearGradient>
          ))}
          <filter id="trend-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {gridLines.map((ratio) => (
          <g key={ratio}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yAt(maxValue * ratio)}
              y2={yAt(maxValue * ratio)}
              stroke="#1e2d4a"
              strokeWidth="1"
              strokeDasharray={ratio === 0 ? "0" : "3 6"}
            />
            <text x={pad.left - 10} y={yAt(maxValue * ratio) + 3} textAnchor="end" className="fill-slate-500" fontSize="10">
              {Math.round(maxValue * ratio)}
            </text>
          </g>
        ))}

        {metrics.map((metric) => {
          const points = series.map((point, index) => ({ x: xAt(index), y: yAt(point[metric.key as TrendMetricKey]) }));
          const line = smooth(points);
          const area = `${line} L ${xAt(series.length - 1)} ${pad.top + innerH} L ${pad.left} ${pad.top + innerH} Z`;
          return (
            <g key={metric.key} filter="url(#trend-glow)">
              <path d={area} fill={`url(#trend-fill-${metric.key})`} stroke="none" />
              <path d={line} fill="none" stroke={metric.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {hoverIndex !== null && (
          <line x1={hoverX} x2={hoverX} y1={pad.top} y2={pad.top + innerH} stroke="#64748b" strokeWidth="1" strokeDasharray="3 4" />
        )}

        {metrics.map((metric) =>
          hoverIndex === null ? (
            series.map((_point, index) => (
              <circle
                key={`${metric.key}-${index}`}
                cx={xAt(index)}
                cy={yAt(series[index][metric.key as TrendMetricKey])}
                r="2.2"
                fill={metric.color}
                opacity="0.7"
              />
            ))
          ) : (
            <circle
              key={metric.key}
              cx={hoverX}
              cy={yAt(hovered ? hovered[metric.key as TrendMetricKey] : 0)}
              r="4.5"
              fill="#0b1120"
              stroke={metric.color}
              strokeWidth="2.5"
            />
          ),
        )}

        {series.map((_point, index) => (
          <rect
            key={`band-${index}`}
            x={xAt(index) - bandWidth / 2}
            y={pad.top}
            width={bandWidth}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(index)}
          />
        ))}

        {labelIndexes.map((index) => (
          <text key={index} x={xAt(index)} y={height - 10} textAnchor="middle" className="fill-slate-500" fontSize="10">
            {series[index].date.slice(5)}
          </text>
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-[#1e2d4a] bg-[#0b1120]/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur"
          style={{ left: `${(hoverX / width) * 100}%`, top: `${(hoverTop / height) * 100}%` }}
        >
          <p className="mb-1 text-[11px] font-medium text-white">{hovered.date}</p>
          {metrics.map((metric) => (
            <p key={metric.key} className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: metric.color }} />
              <span className="flex-1 pr-3">{metric.label}</span>
              <span className="font-mono text-slate-200">{hovered[metric.key as TrendMetricKey]}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function RepositoryActivityPanel({ activity }: { activity: EngineeringRepositoryActivity[] }) {
  if (!activity.length) {
    return <p className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-4 text-sm text-slate-500">No repository activity recorded in this period.</p>;
  }
  const maxTotal = Math.max(1, ...activity.map((item) => item.total_activity));
  return (
    <div className="space-y-3">
      {activity.map((item) => (
        <div key={item.repository_id} className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm text-white">{item.full_name}</span>
            <span className="font-mono text-xs text-cyan-300">{item.total_activity} events</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1e2d4a]">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500" style={{ width: `${Math.max(4, (item.total_activity / maxTotal) * 100)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span>Opened {item.issues_opened}</span>
            <span>Resolved {item.issues_resolved}</span>
            <span>Analyses {item.analyses}</span>
            <span>CI {item.ci_runs}</span>
          </div>
          <ActivitySparkline points={item.daily} />
        </div>
      ))}
    </div>
  );
}

function ActivitySparkline({ points }: { points: EngineeringRepositoryActivity["daily"] }) {
  if (points.length < 2) return null;
  const width = 300;
  const height = 34;
  const maxValue = Math.max(1, ...points.map((point) => point.issues_opened + point.issues_resolved + point.analyses + point.ci_runs));
  const step = width / points.length;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="mt-2 h-8 w-full" aria-hidden="true">
      {points.map((point, index) => {
        const total = point.issues_opened + point.issues_resolved + point.analyses + point.ci_runs;
        const barHeight = Math.max(1, (total / maxValue) * (height - 4));
        return (
          <rect key={point.date} x={index * step + 1} y={height - barHeight} width={Math.max(1, step - 2)} height={barHeight} rx="1.5" fill="#38bdf8" opacity="0.55">
            <title>{`${point.date}: ${total} events`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
