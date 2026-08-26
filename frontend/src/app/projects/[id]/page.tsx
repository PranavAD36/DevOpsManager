"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  api,
  type AnalysisRun,
  type Issue,
  type Project,
  type Repository,
} from "../../../lib/api";
import DiffViewer from "../../../components/DiffViewer";

export default function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [severity, setSeverity] = useState("all");
  const [issueStatus, setIssueStatus] = useState("all");
  const [busyRepository, setBusyRepository] = useState<string | null>(null);
  const [busyIssue, setBusyIssue] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [projectData, repositoryData, runData, issueData] =
        await Promise.all([
          api.getProject(id),
          api.listRepositories(id),
          api.listAnalysisRuns(id),
          api.listIssues(id),
        ]);
      setProject(projectData);
      setRepositories(repositoryData);
      setAnalysisRuns(runData);
      setIssues(issueData);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load project.",
      );
    }
  }

  useEffect(() => {
    if (id) void load();
  }, [id]);

  async function connectRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnecting(true);
    setError(null);
    setMessage(null);
    try {
      await api.connectRepository(id, repositoryUrl);
      setRepositoryUrl("");
      setMessage("Repository connected and metadata synchronized.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to connect repository.",
      );
    } finally {
      setConnecting(false);
    }
  }

  async function refreshRepository(repositoryId: string) {
    setBusyRepository(repositoryId);
    setError(null);
    setMessage(null);
    try {
      await api.refreshRepository(repositoryId);
      setMessage("Repository metadata refreshed.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to refresh repository.",
      );
    } finally {
      setBusyRepository(null);
    }
  }

  async function startAnalysis(repositoryId: string) {
    setBusyRepository(repositoryId);
    setError(null);
    setMessage(null);
    try {
      const run = await api.createAnalysisRun(repositoryId);
      setMessage(
        run.status === "completed"
          ? "Repository analysis completed."
          : `Analysis ${run.status}: ${run.error_message || "see the latest run below."}`,
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start analysis.",
      );
    } finally {
      setBusyRepository(null);
    }
  }

  async function approveFix(issueId: string) {
    setBusyIssue(issueId);
    setError(null);
    setMessage(null);
    try {
      await api.approveIssueFix(issueId);
      setMessage("Fix approved successfully.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to approve fix.",
      );
    } finally {
      setBusyIssue(null);
    }
  }

  async function rejectFix(issueId: string) {
    setBusyIssue(issueId);
    setError(null);
    setMessage(null);
    try {
      await api.rejectIssueFix(issueId);
      setMessage("Fix rejected.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to reject fix.",
      );
    } finally {
      setBusyIssue(null);
    }
  }

  async function updateFixCode(issueId: string, newCode: string) {
    setBusyIssue(issueId);
    setError(null);
    setMessage(null);
    try {
      await api.updateIssueFix(issueId, { corrected_code: newCode });
      setMessage("Custom fix saved.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save custom fix.",
      );
    } finally {
      setBusyIssue(null);
    }
  }

  const filteredIssues = issues.filter(
    (issue) =>
      (severity === "all" || issue.severity === severity) &&
      (issueStatus === "all" || issue.status === issueStatus),
  );

  const severityColor: Record<string, string> = {
    critical: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-slate-700/50 text-slate-400 border-slate-600/50",
  };

  const statusColor: Record<string, string> = {
    open: "bg-slate-700/50 text-slate-300 border-slate-600/50",
    approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    rejected: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };

  if (!project && !error)
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-500">
        <span className="flex items-center gap-2 text-sm">
          <span className="w-4 h-4 rounded-full border-2 border-slate-700 border-t-cyan-500 animate-spin" />
          Loading…
        </span>
      </main>
    );

  return (
    <main className="relative min-h-[100dvh]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
        {/* Breadcrumb nav */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-8">
          <Link href="/projects" className="hover:text-slate-300 transition-colors">
            Projects
          </Link>
          <span>/</span>
          <span className="text-slate-300">{project?.name ?? "…"}</span>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 mb-4" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300 mb-4" role="status">
            {message}
          </div>
        )}

        {project && (
          <>
            {/* Header */}
            <header className="flex items-start justify-between gap-4 pb-8 border-b border-slate-800/60">
              <div>
                <p className="text-xs font-mono text-cyan-500/70 uppercase tracking-wider mb-2">
                  Project
                </p>
                <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
                <p className="mt-1.5 text-sm text-slate-500 max-w-lg">
                  {project.description || "No description provided."}
                </p>
              </div>
              <Link
                className="btn-secondary !px-3 !py-2 text-xs"
                href="/projects"
              >
                ← All projects
              </Link>
            </header>

            <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="space-y-10">
                {/* Repositories */}
                <section>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-semibold text-white">
                      Repositories
                      <span className="ml-2 text-xs font-mono text-slate-500">
                        {repositories.length}
                      </span>
                    </h2>
                    <Link
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                      href="/github/connect"
                    >
                      Connect more →
                    </Link>
                  </div>

                  {repositories.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800/60 bg-slate-900/30 p-6 text-center">
                      <p className="text-sm text-slate-500">No repositories connected</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {repositories.map((repository) => (
                        <div
                          className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-4"
                          key={repository.id}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <Link
                              className="font-medium text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
                              href={`/repositories/${repository.id}`}
                            >
                              {repository.full_name}
                            </Link>
                            <button
                              className="btn-secondary !px-2.5 !py-1.5 text-xs"
                              disabled={busyRepository === repository.id}
                              onClick={() => void refreshRepository(repository.id)}
                            >
                              {busyRepository === repository.id ? "Refreshing…" : "Refresh"}
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                            {repository.github_description || "No description."}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 font-mono">
                            {repository.language && (
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-cyan-500/60" />
                                {repository.language}
                              </span>
                            )}
                            <span>{repository.stargazers_count ?? 0} ★</span>
                            <span>{repository.forks_count ?? 0} forks</span>
                            <span>{repository.open_issues_count ?? 0} issues</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <a
                              className="text-xs text-slate-400 hover:text-white transition-colors"
                              href={repository.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              GitHub →
                            </a>
                            <button
                              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-40"
                              disabled={busyRepository === repository.id}
                              onClick={() => void startAnalysis(repository.id)}
                            >
                              {busyRepository === repository.id ? "Running…" : "Run analysis"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Analysis runs */}
                <section>
                  <h2 className="text-sm font-semibold text-white mb-4">
                    Analysis runs
                    <span className="ml-2 text-xs font-mono text-slate-500">
                      {analysisRuns.length}
                    </span>
                  </h2>
                  {analysisRuns.length === 0 ? (
                    <p className="text-sm text-slate-500">No analysis runs yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {analysisRuns.map((run) => (
                        <div
                          className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3 flex items-center justify-between gap-3"
                          key={run.id}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={
                              run.status === "completed"
                                ? "h-2 w-2 rounded-full bg-emerald-400 shrink-0"
                                : run.status === "running"
                                ? "h-2 w-2 rounded-full bg-cyan-400 animate-pulse shrink-0"
                                : "h-2 w-2 rounded-full bg-slate-600 shrink-0"
                            } />
                            <span className="text-sm font-medium text-white capitalize">
                              {run.status}
                            </span>
                            <span className="text-xs text-slate-500 font-mono truncate">
                              repo-{run.repository_id}
                            </span>
                          </div>
                          <span className="text-xs text-slate-600 font-mono shrink-0">
                            {new Date(run.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Issues */}
                <section>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <h2 className="text-sm font-semibold text-white">
                      Issues
                      <span className="ml-2 text-xs font-mono text-slate-500">
                        {filteredIssues.length}
                      </span>
                    </h2>
                    <div className="flex gap-2">
                      <select
                        className="form-select !py-1.5 !text-xs"
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value)}
                      >
                        <option value="all">All severities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <select
                        className="form-select !py-1.5 !text-xs"
                        value={issueStatus}
                        onChange={(e) => setIssueStatus(e.target.value)}
                      >
                        <option value="all">All statuses</option>
                        <option value="open">Open</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  </div>

                  {filteredIssues.length === 0 ? (
                    <p className="text-sm text-slate-500">No matching issues.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredIssues.map((issue) => (
                        <div
                          className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-4"
                          key={issue.id}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-medium text-white text-sm">
                              {issue.title}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className={`tag border ${severityColor[issue.severity] ?? "bg-slate-800 text-slate-400 border-slate-700"} capitalize`}>
                                {issue.severity}
                              </span>
                              {issue.status === "approved" && (
                                <span className="tag border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">✓ Approved</span>
                              )}
                              {issue.status === "rejected" && (
                                <span className="tag border bg-rose-500/10 text-rose-400 border-rose-500/20 text-xs">✗ Rejected</span>
                              )}
                              {issue.status === "open" && (
                                <span className={`tag border ${statusColor[issue.status]}`}>Open</span>
                              )}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-slate-400">
                            {issue.description || "No description."}
                          </p>
                          {issue.file_path && (
                            <p className="mt-1 text-xs text-slate-600 font-mono">
                              {issue.file_path}{issue.line_number ? `:${issue.line_number}` : ""}
                            </p>
                          )}

                          {issue.suggested_fix && (
                            <div className="mt-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2.5">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/80">
                                Suggested Fix
                              </p>
                              <p className="mt-1 text-xs text-emerald-300/80">
                                {issue.suggested_fix}
                              </p>
                            </div>
                          )}

                          {issue.corrected_code && (
                            <>
                              <DiffViewer
                                filePath={issue.file_path}
                                lineNumber={issue.line_number}
                                description={issue.description}
                                correctedCode={issue.corrected_code}
                                onSaveFix={(newCode) => updateFixCode(issue.id, newCode)}
                              />
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-3">
                                <span className="text-[11px] text-slate-600">
                                  Phase 7 Safe Approval: Review diff before approving.
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="btn-secondary !px-2.5 !py-1.5 text-xs border-rose-900/50 text-rose-400 hover:border-rose-600 hover:bg-rose-950/40 disabled:opacity-40"
                                    disabled={busyIssue === issue.id || issue.status === "rejected"}
                                    onClick={() => void rejectFix(issue.id)}
                                  >
                                    {busyIssue === issue.id && issue.status !== "approved"
                                      ? "Rejecting…"
                                      : issue.status === "rejected"
                                        ? "Rejected"
                                        : "Reject"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-primary !px-2.5 !py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white border-0 disabled:opacity-40"
                                    disabled={busyIssue === issue.id || issue.status === "approved"}
                                    onClick={() => void approveFix(issue.id)}
                                  >
                                    {busyIssue === issue.id && issue.status !== "rejected"
                                      ? "Approving…"
                                      : issue.status === "approved"
                                        ? "✓ Approved"
                                        : "Approve Fix"}
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Sidebar */}
              <aside className="space-y-6">
                <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 backdrop-blur-sm p-5 sticky top-6">
                  <h2 className="text-sm font-semibold text-white">Connect GitHub</h2>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Authorize GitHub and choose a repository.
                  </p>
                  <Link
                    className="btn-primary w-full mt-4 !py-2.5"
                    href="/github/connect"
                  >
                    Connect GitHub
                  </Link>
                </div>

                <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 backdrop-blur-sm p-5">
                  <h3 className="text-sm font-semibold text-white">Legacy connection</h3>
                  <form className="mt-4 space-y-3" onSubmit={connectRepository}>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Repository URL</label>
                      <input
                        className="form-input !py-2 text-xs"
                        type="url"
                        required
                        placeholder="https://github.com/owner/repo"
                        value={repositoryUrl}
                        onChange={(e) => setRepositoryUrl(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn-secondary w-full !py-2 text-xs"
                      disabled={connecting}
                      type="submit"
                    >
                      {connecting ? "Connecting…" : "Connect by URL"}
                    </button>
                  </form>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
