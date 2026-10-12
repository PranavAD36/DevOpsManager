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
import ProjectInsights from "../../../components/ProjectInsights";
import MarkdownMessage from "../../../components/MarkdownMessage";

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
  const [reviewIssue, setReviewIssue] = useState<Issue | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{
    running: boolean;
    step: string;
    percent: number;
    steps: { label: string; done: boolean; active: boolean }[];
  } | null>(null);
  const [activeSection, setActiveSection] = useState<"repositories" | "analysis" | "insights" | "settings" | "chat">("repositories");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchMode, setBatchMode] = useState<"approve" | "reject">("approve");
  const [batchTargets, setBatchTargets] = useState<Issue[]>([]);
  const [batchResults, setBatchResults] = useState<{ id: string; title: string; ok: boolean; message: string }[] | null>(null);
  const [changeInstruction, setChangeInstruction] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeProposals, setChangeProposals] = useState<Issue[]>([]);
  const [changeSummary, setChangeSummary] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changePushed, setChangePushed] = useState<string[]>([]);
  const [changeRejected, setChangeRejected] = useState<string[]>([]);
  const [changePushingId, setChangePushingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (selectedRepositoryId || !repositories.length) return;
    const oldest = [...repositories].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))[0];
    if (oldest) setSelectedRepositoryId(oldest.id);
  }, [repositories, selectedRepositoryId]);

  async function requestChange() {
    if (!selectedRepositoryId || changeInstruction.trim().length < 3) return;
    setChangeLoading(true);
    setChangeError(null);
    setChangeSummary(null);
    setChangeProposals([]);
    setChangePushed([]);
    setChangeRejected([]);
    try {
      const result = await api.requestRepositoryChange(selectedRepositoryId, changeInstruction.trim());
      setChangeProposals(result.suggestions);
      setChangeSummary(result.summary);
      if (result.suggestions.length) {
        setIssues((current) => {
          const existing = new Set(current.map((item) => item.id));
          return [...result.suggestions.filter((item) => !existing.has(item.id)), ...current];
        });
      }
    } catch (requestError) {
      setChangeError(requestError instanceof Error ? requestError.message : "Unable to generate the change.");
    } finally {
      setChangeLoading(false);
    }
  }

  async function pushChange(issue: Issue) {
    setChangePushingId(issue.id);
    setChangeError(null);
    try {
      const applied = await api.applySuggestion(issue.id);
      setChangePushed((current) => [...current, issue.id]);
      setIssues((current) => current.map((item) => (item.id === applied.id ? applied : item)));
    } catch (requestError) {
      setChangeError(requestError instanceof Error ? requestError.message : "Unable to push the change.");
    } finally {
      setChangePushingId(null);
    }
  }

  async function rejectChange(issue: Issue) {
    setChangeError(null);
    try {
      const rejected = await api.rejectIssueFix(issue.id);
      setChangeRejected((current) => [...current, issue.id]);
      setIssues((current) => current.map((item) => (item.id === rejected.id ? rejected : item)));
    } catch (requestError) {
      setChangeError(requestError instanceof Error ? requestError.message : "Unable to reject the change.");
    }
  }

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

  async function removeRepository(repositoryId: string) {
    if (typeof window !== "undefined" && !window.confirm("Remove this repository from the project? Its analysis history will be deleted.")) return;
    setBusyRepository(repositoryId);
    setError(null);
    setMessage(null);
    try {
      await api.deleteRepository(repositoryId);
      setRepositories((current) => current.filter((item) => item.id !== repositoryId));
      setSelectedRepositoryId((current) => (current === repositoryId ? "" : current));
      setMessage("Repository removed from the project.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to remove repository.");
    } finally {
      setBusyRepository(null);
    }
  }

  async function startAnalysis(repositoryId: string) {
    setBusyRepository(repositoryId);
    setError(null);
    setMessage(null);
    const initialSteps = [
      { label: "Repository indexed", done: false, active: true },
      { label: "Dependencies detected", done: false, active: false },
      { label: "Analyzing architecture", done: false, active: false },
      { label: "Detecting issues", done: false, active: false },
      { label: "Generating recommendations", done: false, active: false },
    ];
    setAnalysisProgress({
      running: true,
      step: "Initializing...",
      percent: 0,
      steps: initialSteps,
    });
    try {
      const run = await api.createAnalysisRun(repositoryId);
      // Simulate progressive analysis steps
      const stepDelay = 600;
      for (let i = 0; i < initialSteps.length; i++) {
        await new Promise((r) => setTimeout(r, stepDelay));
        setAnalysisProgress((prev) => {
          if (!prev) return null;
          const newSteps = prev.steps.map((s, idx) => ({
            ...s,
            done: idx < i,
            active: idx === i,
          }));
          return {
            ...prev,
            step: newSteps[i]?.label || "Completing...",
            percent: Math.round(((i + 1) / newSteps.length) * 100),
            steps: newSteps,
          };
        });
      }
      const isCompleted = run.status === "completed";
      setMessage(
        isCompleted
          ? "Repository analysis completed."
          : `Analysis ${run.status}: ${run.error_message || "see the latest run below."}`,
      );
      await load();
      if (isCompleted) setActiveSection("analysis");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start analysis.",
      );
    } finally {
      setBusyRepository(null);
      setAnalysisProgress(null);
    }
  }

  function openApproval(issue: Issue) {
    const uniqueSuffix = Date.now().toString(36);
    setCommitMessage(`fix: ${issue.title}${issue.file_path ? ` in ${issue.file_path}` : ""} [${uniqueSuffix}]`);
    setReviewIssue(issue);
    setPushSuccess(null);
    setPushError(null);
  }

  async function approveFix() {
    if (!reviewIssue) return;
    const issue = reviewIssue;
    setBusyIssue(issue.id);
    setPushing(true);
    setError(null);
    setMessage(null);
    setPushSuccess(null);
    setPushError(null);
    try {
      const applied = await api.applySuggestion(issue.id, commitMessage);
      setPushSuccess(applied.commit_sha || "success");
      setMessage(`Changes pushed successfully. Commit ${applied.commit_sha || "created"}.`);
      await load();
      // Only close modal on success after a delay
      setTimeout(() => setReviewIssue(null), 2000);
    } catch (requestError) {
      setPushError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to approve fix.",
      );
    } finally {
      setBusyIssue(null);
      setPushing(false);
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

  const eligibleIssues = issues.filter(
    (issue) => issue.status === "open" && issue.file_path && issue.corrected_code,
  );

  const openIssues = issues.filter((issue) => issue.status === "open");

  function openBatchApproval() {
    setBatchMode("approve");
    setBatchMessage("fix: apply AI suggested fixes");
    setBatchTargets(eligibleIssues);
    setBatchResults(null);
    setBatchOpen(true);
  }

  function openBatchReject() {
    setBatchMode("reject");
    setBatchTargets(openIssues);
    setBatchResults(null);
    setBatchOpen(true);
  }

  async function runBatch() {
    const targets = batchTargets;
    if (targets.length === 0) return;
    setBatchRunning(true);
    setBatchResults(null);
    setError(null);
    setMessage(null);
    const results: { id: string; title: string; ok: boolean; message: string }[] = [];
    for (const issue of targets) {
      try {
        if (batchMode === "reject") {
          await api.rejectIssueFix(issue.id);
          results.push({ id: issue.id, title: issue.title, ok: true, message: "rejected" });
        } else {
          const suffix = Date.now().toString(36);
          const base = batchMessage.trim() || "fix: apply AI suggested fixes";
          const issueCommitMessage = `${base} - ${issue.title}${issue.file_path ? ` (${issue.file_path})` : ""} [${suffix}]`;
          const applied = await api.applySuggestion(issue.id, issueCommitMessage.slice(0, 500));
          results.push({ id: issue.id, title: issue.title, ok: true, message: applied.commit_sha || "pushed" });
        }
      } catch (requestError) {
        results.push({
          id: issue.id,
          title: issue.title,
          ok: false,
          message: requestError instanceof Error ? requestError.message : "Failed",
        });
      }
    }
    setBatchResults(results);
    setBatchRunning(false);
    const succeeded = results.filter((result) => result.ok).length;
    const noun = `fix${results.length !== 1 ? "es" : ""}`;
    setMessage(
      batchMode === "reject"
        ? `Rejected ${succeeded} of ${results.length} ${noun}.`
        : `Approved and pushed ${succeeded} of ${results.length} ${noun}.`,
    );
    await load();
  }

  const filteredIssues = issues.filter(
    (issue) =>
      (severity === "all" || issue.severity === severity) &&
      (issueStatus === "all" || issue.status === issueStatus),
  );

  const severityColor: Record<string, string> = {
    critical: "badge-rose",
    high: "badge-amber",
    medium: "badge-cyan",
    low: "badge-slate",
  };

  const statusColor: Record<string, string> = {
    open: "badge-slate",
    approved: "badge-emerald",
    rejected: "badge-rose",
  };

  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  // Sort issues by severity
  const sortedIssues = [...filteredIssues].sort(
    (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
  );

  // Group issues by analysis run
  const groupedByRun = new Map<string, Issue[]>();
  sortedIssues.forEach((issue) => {
    const key = issue.analysis_run_id || "unknown";
    if (!groupedByRun.has(key)) groupedByRun.set(key, []);
    groupedByRun.get(key)!.push(issue);
  });

  if (!project && !error)
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div
            className="w-8 h-8 rounded-full border-2 border-[#1e2d4a] border-t-cyan-400 mx-auto mb-4"
            style={{ animation: "dm-spin 0.6s linear infinite" }}
          />
          <p className="text-xs font-mono text-slate-500">Loading project...</p>
        </div>
      </main>
    );

  return (
    <main className="relative dm-enter pb-16">
      <div className="orb orb--violet w-[400px] h-[400px] top-0 right-0" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">

        {/* Breadcrumb + header */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-6 pt-6">
          <Link href="/projects" className="hover:text-slate-300 transition-colors">
            Projects
          </Link>
          <span>/</span>
          <span className="text-slate-300">{project?.name ?? "..."}</span>
        </div>

        {error && !project && (
          <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 mb-5" role="alert">
            {error}
          </div>
        )}
        {message && !project && (
          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300 mb-5" role="status">
            {message}
          </div>
        )}

        {project && (
          <>
            {/* Project header */}
            <header className="flex flex-col gap-4 border-b border-[#1e2d4a]/40 pb-6 mb-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-mono text-cyan-500/70 uppercase tracking-wider mb-2">
                  Project
                </p>
                <h1 className="text-3xl font-semibold text-white tracking-tight">{project.name}</h1>
                <p className="mt-2 text-sm text-slate-400 max-w-2xl">
                  {project.description || "No description provided."}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link href="/projects" className="btn-secondary !py-2 !text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  All Projects
                </Link>
                <Link href="/github/connect" className="btn-primary !py-2 !px-4 !text-xs">
                  <GitHubIcon className="w-3.5 h-3.5" />
                  <span className="ml-1.5">Connect GitHub</span>
                </Link>
              </div>
            </header>

            {/* Section tabs */}
            <div className="flex gap-1 mb-8 p-1 bg-[#0c111e] rounded-xl border border-[#1e2d4a] w-fit">
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeSection === "repositories"
                    ? "bg-[#152035] text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
                onClick={() => setActiveSection("repositories")}
              >
                Repositories
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeSection === "analysis"
                    ? "bg-[#152035] text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
                onClick={() => setActiveSection("analysis")}
              >
                AI Analysis
                {issues.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold">
                    {issues.filter((i) => i.status === "open").length}
                  </span>
                )}
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeSection === "insights"
                    ? "bg-[#152035] text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
                onClick={() => setActiveSection("insights")}
              >
                Insights
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeSection === "settings"
                    ? "bg-[#152035] text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
                onClick={() => setActiveSection("settings")}
              >
                Settings
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeSection === "chat"
                    ? "bg-[#152035] text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
                onClick={() => setActiveSection("chat")}
              >
                Chat
              </button>
            </div>

            {/* ── Chat section ─────────────────────── */}
            {activeSection === "chat" && (
              <div className="glass-panel p-6">
                <PageAlert error={error} message={message} />
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Repository Chat</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Ask anything about a repository. Answers are generated live from its real source files.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      className="input w-64 !py-2 !text-sm bg-[#101827] border-[#1e2d4a]"
                      value={selectedRepositoryId}
                      onChange={(e) => {
                        setSelectedRepositoryId(e.target.value);
                        setChatMessages([]);
                        setChatInput("");
                        setChatError(null);
                        setChatNotice(null);
                      }}
                    >
                      <option value="">Select a repository...</option>
                      {repositories.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                    </select>
                    <button
                      className="btn-secondary !py-2 !text-sm disabled:opacity-50"
                      title="Optional: builds a semantic search index. Chat works without it."
                      disabled={!selectedRepositoryId || indexing}
                      onClick={async () => {
                        setIndexing(true);
                        setChatError(null);
                        setChatNotice(null);
                        try {
                          await api.indexRepository(selectedRepositoryId);
                          setChatNotice("Semantic index is building in the background. You can keep chatting meanwhile.");
                        } catch (e) {
                          setChatError(e instanceof Error ? e.message : "Could not start indexing.");
                        }
                        setIndexing(false);
                      }}
                    >
                      {indexing ? "Indexing..." : "Build semantic index"}
                    </button>
                  </div>
                </div>

                {chatNotice && (
                  <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                    {chatNotice}
                  </div>
                )}
                {chatError && (
                  <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {chatError}
                  </div>
                )}

                <div className="bg-[#0b1120] rounded-xl border border-[#1e2d4a] flex flex-col h-[500px]">
                  <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {chatMessages.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
                        <p className="text-sm">
                          {selectedRepositoryId
                            ? "Ask a question about this repository to get started."
                            : "Select a repository above, then ask a question about its code."}
                        </p>
                        <p className="mt-2 text-xs text-slate-600">
                          e.g. "Where is authentication handled?" or "How are errors logged?"
                        </p>
                      </div>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-xl p-3 text-sm ${msg.role === 'user' ? 'bg-cyan-500/20 text-cyan-100' : 'bg-[#1e2d4a] text-slate-200'}`}>
                            {msg.role === 'user' ? (
                              <p className="whitespace-pre-wrap">{msg.text}</p>
                            ) : (
                              <MarkdownMessage text={msg.text} />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="rounded-xl bg-[#1e2d4a] px-3 py-2 text-sm text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            Reading repository files
                            <span className="animate-pulse">...</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-[#1e2d4a]">
                    <form
                      className="flex gap-3"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!chatInput.trim() || !selectedRepositoryId || chatLoading) return;
                        const query = chatInput.trim();
                        setChatInput("");
                        setChatMessages(prev => [...prev, { role: 'user', text: query }]);
                        setChatLoading(true);
                        setChatError(null);
                        try {
                          const res = await api.chatWithRepo(selectedRepositoryId, query);
                          setChatMessages(prev => [...prev, { role: 'ai', text: res.answer }]);
                        } catch (e) {
                          setChatMessages(prev => [...prev, { role: 'ai', text: `Could not get an answer: ${e instanceof Error ? e.message : 'Unknown error'}` }]);
                        }
                        setChatLoading(false);
                      }}
                    >
                      <input
                        type="text"
                        className="input flex-1 bg-[#152035]"
                        placeholder={selectedRepositoryId ? "Ask a question about the codebase..." : "Select a repository to start chatting"}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={!selectedRepositoryId || chatLoading}
                      />
                      <button
                        type="submit"
                        className="btn-primary disabled:opacity-50"
                        disabled={!chatInput.trim() || !selectedRepositoryId || chatLoading}
                      >
                        {chatLoading ? "Sending..." : "Send"}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* ── Request a code change ─────────────── */}
            {activeSection === "chat" && (
              <div className="glass-panel p-6 mt-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Request a Code Change</h3>
                    <p className="mt-1 text-xs text-slate-500">Describe a change in plain English. The AI proposes an edit you can review, then approve and push.</p>
                  </div>
                  <select
                    className="input w-64 !py-2 !text-sm bg-[#101827] border-[#1e2d4a]"
                    value={selectedRepositoryId}
                    onChange={(e) => setSelectedRepositoryId(e.target.value)}
                  >
                    <option value="">Select a repository...</option>
                    {repositories.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                  </select>
                </div>

                <div className="flex gap-3">
                  <input
                    className="input flex-1 bg-[#152035]"
                    placeholder="e.g. Add a /health endpoint and validate the request body"
                    value={changeInstruction}
                    onChange={(e) => setChangeInstruction(e.target.value)}
                    disabled={!selectedRepositoryId || changeLoading}
                  />
                  <button
                    className="btn-primary"
                    disabled={!selectedRepositoryId || changeInstruction.trim().length < 3 || changeLoading}
                    onClick={() => void requestChange()}
                  >
                    {changeLoading ? "Generating..." : "Generate Change"}
                  </button>
                </div>

                {changeError && <div className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/25 px-4 py-3 text-sm text-rose-300" role="alert">{changeError}</div>}
                {changeSummary && (
                  <div className="mt-4 rounded-xl border border-cyan-900/40 bg-cyan-950/20 px-4 py-3 leading-relaxed text-cyan-100">
                    <MarkdownMessage text={changeSummary} className="text-xs text-cyan-100" />
                  </div>
                )}

                {changeProposals.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {changeProposals.map((issue) => {
                      const pushed = changePushed.includes(issue.id);
                      const rejected = changeRejected.includes(issue.id);
                      return (
                        <div key={issue.id} className="rounded-xl border border-[#1e2d4a] bg-[#0b1120]/70 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white">{issue.title}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{issue.file_path}{issue.line_number ? `:${issue.line_number}` : ""}</p>
                            </div>
                            <span className={`badge ${issue.severity === "critical" || issue.severity === "high" ? "badge-rose" : "badge-cyan"}`}>{issue.severity}</span>
                          </div>
                          {issue.suggested_fix && <p className="mt-2 text-xs text-slate-400">{issue.suggested_fix}</p>}
                          {issue.corrected_code && (
                            <DiffViewer
                              filePath={issue.file_path}
                              lineNumber={issue.line_number}
                              description={issue.description}
                              correctedCode={issue.corrected_code}
                              onSaveFix={async (updatedCode) => {
                                const updated = await api.updateIssueFix(issue.id, { corrected_code: updatedCode });
                                setChangeProposals((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                              }}
                            />
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {pushed ? (
                              <span className="badge badge-emerald">Pushed to GitHub</span>
                            ) : rejected ? (
                              <span className="badge badge-slate">Rejected</span>
                            ) : (
                              <>
                                <button className="btn-accent !px-3 !py-1.5 !text-xs" disabled={changePushingId === issue.id} onClick={() => void pushChange(issue)}>
                                  {changePushingId === issue.id ? "Pushing..." : "Approve & Push"}
                                </button>
                                <button className="btn-danger !px-3 !py-1.5 !text-xs" onClick={() => void rejectChange(issue)}>
                                  Reject
                                </button>
                              </>
                            )}
                            {issue.commit_url && <a className="text-[11px] text-cyan-300 hover:text-cyan-200" href={issue.commit_url} target="_blank" rel="noreferrer">View commit</a>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!changeProposals.length && !changeLoading && (
                  <p className="mt-4 text-xs text-slate-500">No proposed change yet. Select a repository and describe what you want changed.</p>
                )}
              </div>
            )}

            {/* ── Repositories section ─────────────────────── */}
            {activeSection === "repositories" && (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-6">
                  <PageAlert error={error} message={message} />
                  {/* Repository list */}
                  {repositories.length === 0 ? (
                    <div className="glass-panel p-10 text-center">
                      <div className="mx-auto w-12 h-12 rounded-2xl bg-[#101827] border border-[#1e2d4a] flex items-center justify-center mb-4">
                        <RepoIcon className="w-6 h-6 text-slate-500" />
                      </div>
                      <p className="text-slate-400 text-sm">No repositories connected</p>
                      <Link href="/github/connect" className="btn-primary mt-5 !py-2 !text-xs">
                        Connect a Repository
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {repositories.map((repository) => (
                        <div
                          key={repository.id}
                          className="card p-5 group"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/15 to-violet-500/15 border border-cyan-500/20 flex items-center justify-center shrink-0 group-hover:border-cyan-400/40 transition-colors">
                                <RepoIcon className="w-5 h-5 text-cyan-400" />
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/repositories/${repository.id}`}
                                  className="text-sm font-semibold text-white hover:text-cyan-300 transition-colors"
                                >
                                  {repository.full_name}
                                </Link>
                                <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                                  {repository.github_description || "No description."}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 font-mono">
                                  {repository.language && (
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                                      {repository.language}
                                    </span>
                                  )}
                                  <span>{repository.stargazers_count ?? 0}★</span>
                                  <span>{repository.forks_count ?? 0} forks</span>
                                  <span>{repository.open_issues_count ?? 0} issues</span>
                                  {repository.is_private && (
                                    <span className="badge badge-amber text-[10px]">Private</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={repository.url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-icon !w-8 !h-8 !rounded-lg"
                                title="Open on GitHub"
                              >
                                <GitHubIcon className="w-3.5 h-3.5" />
                              </a>
                              <button
                                className="btn-secondary !px-3 !py-1.5 !text-xs !rounded-lg"
                                disabled={busyRepository === repository.id}
                                onClick={() => void refreshRepository(repository.id)}
                              >
                                {busyRepository === repository.id ? (
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className="w-3 h-3 rounded-full border-2 border-slate-600 border-t-cyan-400"
                                      style={{ animation: "dm-spin 0.6s linear infinite" }}
                                    />
                                    Refreshing...
                                  </span>
                                ) : "Refresh"}
                              </button>
                              <button
                                className="btn-accent !px-3 !py-1.5 !text-xs !rounded-lg"
                                disabled={busyRepository === repository.id}
                                onClick={() => void startAnalysis(repository.id)}
                              >
                                {busyRepository === repository.id ? (
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className="w-3 h-3 rounded-full border-2 border-slate-950/40 border-t-white"
                                      style={{ animation: "dm-spin 0.6s linear infinite" }}
                                    />
                                    Running...
                                  </span>
                                ) : "Run Analysis"}
                              </button>
                              <button
                                className="btn-danger !px-3 !py-1.5 !text-xs !rounded-lg"
                                disabled={busyRepository === repository.id}
                                onClick={() => void removeRepository(repository.id)}
                                title="Remove this repository from the project"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sidebar */}
                <aside className="space-y-4">
                  <div className="glass-panel p-5">
                    <h3 className="text-sm font-semibold text-white">Connect Repository</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Add by GitHub URL
                    </p>
                    <form className="mt-4 space-y-3" onSubmit={connectRepository}>
                      <input
                        className="input !py-2 text-xs"
                        type="url"
                        required
                        placeholder="https://github.com/owner/repo"
                        value={repositoryUrl}
                        onChange={(e) => setRepositoryUrl(e.target.value)}
                      />
                      <button
                        className="btn-secondary w-full !py-2 !text-xs"
                        disabled={connecting}
                        type="submit"
                      >
                        {connecting ? (
                          <span className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border-2 border-slate-600 border-t-cyan-400"
                              style={{ animation: "dm-spin 0.6s linear infinite" }}
                            />
                            Connecting...
                          </span>
                        ) : "Connect by URL"}
                      </button>
                    </form>
                  </div>
                </aside>
              </div>
            )}

            {/* ── AI Analysis section ──────────────────────── */}
            {activeSection === "analysis" && (
              <div className="space-y-8">
                <PageAlert error={error} message={message} />
                {/* Analysis progress */}
                {analysisProgress && (
                  <div className="glass-panel p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-6 h-6 rounded-full border-2 border-[#1e2d4a] border-t-cyan-400 shrink-0"
                        style={{ animation: "dm-spin 0.6s linear infinite" }}
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">AI Engine Running</p>
                        <p className="text-xs text-slate-500 font-mono">{analysisProgress.step}</p>
                      </div>
                      <span className="ml-auto text-xs font-mono text-cyan-400">
                        {analysisProgress.percent}%
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full bg-[#1e2d4a] mb-4 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500"
                        style={{ width: `${analysisProgress.percent}%` }}
                      />
                    </div>
                    {/* Steps */}
                    <div className="space-y-2">
                      {analysisProgress?.steps?.map((step, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                            step.done
                              ? "bg-emerald-500/20 text-emerald-400"
                              : step.active
                              ? "bg-cyan-500/20 text-cyan-400 animate-pulse"
                              : "bg-[#1e2d4a] text-slate-600"
                          }`}>
                            {step.done ? "✓" : step.active ? "◉" : "○"}
                          </span>
                          <span className={step.done ? "text-emerald-400" : step.active ? "text-cyan-300" : "text-slate-500"}>
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    className="form-select !py-1.5 !text-xs !rounded-lg"
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
                    className="form-select !py-1.5 !text-xs !rounded-lg"
                    value={issueStatus}
                    onChange={(e) => setIssueStatus(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <span className="ml-auto text-xs text-slate-500 font-mono">
                    {filteredIssues.length} issue{filteredIssues.length !== 1 ? "s" : ""}
                  </span>
                  {eligibleIssues.length > 1 && (
                    <button
                      className="btn-accent !py-2 !px-4 !text-xs"
                      onClick={openBatchApproval}
                    >
                      Approve All &amp; Push ({eligibleIssues.length})
                    </button>
                  )}
                  {openIssues.length > 1 && (
                    <button
                      className="btn-danger !py-2 !px-4 !text-xs"
                      onClick={openBatchReject}
                    >
                      Reject All ({openIssues.length})
                    </button>
                  )}
                </div>

                {/* Analysis runs with issues */}
                {analysisRuns.length === 0 ? (
                  <div className="glass-panel p-10 text-center">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-[#101827] border border-[#1e2d4a] flex items-center justify-center mb-4">
                      <AnalysisIcon className="w-6 h-6 text-slate-500" />
                    </div>
                    <p className="text-slate-400 text-sm">No analysis runs yet</p>
                    <p className="mt-1 text-xs text-slate-600">Run analysis on a repository to see AI-generated issues.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {analysisRuns.map((run) => {
                      const runIssues = sortedIssues.filter((issue) => issue.analysis_run_id === run.id);
                      if (runIssues.length === 0 && filteredIssues.length > 0) return null;
                      return (
                        <div key={run.id} className="glass-panel p-5">
                          <div className="flex items-center gap-3 border-b border-[#1e2d4a]/40 pb-3 mb-4">
                            <span className={`status-dot ${run.status === "completed" ? "status-dot--online" : run.status === "running" ? "status-dot--running" : "status-dot--offline"}`} />
                            <span className="text-sm font-semibold text-white capitalize">{run.status}</span>
                            <span className="text-xs text-slate-500 font-mono">
                              {runIssues.length} issue{runIssues.length !== 1 ? "s" : ""}
                            </span>
                            <span className="ml-auto text-xs text-slate-600 font-mono">
                              {new Date(run.created_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {run.summary && (
                            <p className="text-xs text-slate-400 mb-4">{run.summary}</p>
                          )}
                          {runIssues.length === 0 && (
                            <p className="text-xs text-slate-600">No issues match the current filters.</p>
                          )}
                          <div className="space-y-3">
                            {runIssues.map((issue, idx) => (
                              <IssueCard
                                key={issue.id}
                                issue={issue}
                                severityColor={severityColor}
                                statusColor={statusColor}
                                busyIssue={busyIssue}
                                onApprove={() => openApproval(issue)}
                                onReject={() => void rejectFix(issue.id)}
                                onUpdateFix={(code) => void updateFixCode(issue.id, code)}
                                delay={idx * 60}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Settings section ──────────────────────── */}
            {/* Insights section */}
            {activeSection === "insights" && (
              <ProjectInsights
                repositories={repositories}
                repositoryId={selectedRepositoryId}
                onRepositoryChange={setSelectedRepositoryId}
              />
            )}

            {activeSection === "settings" && (
              <ProjectSettings 
                project={project} 
                onUpdate={(updated) => setProject(updated)} 
              />
            )}
          </>
        )}
      </div>

      {/* ── Approval Modal ─────────────────────────────── */}
      {reviewIssue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-title"
          onClick={(e) => { if (e.target === e.currentTarget) { setReviewIssue(null); setPushError(null); } }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: "dm-modal-backdrop 0.2s ease" }} />

          {/* Modal */}
          <div
            className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto glass-panel dm-enter"
            style={{ animation: "dm-modal-content 0.3s var(--ease-out)" }}
          >
            {/* Top gradient accent */}
            <div className="h-1 rounded-t-xl bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-500" />

            {pushSuccess ? (
              /* Success state */
              <div className="p-6 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white">Changes Pushed!</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Your fix has been committed and pushed to GitHub.
                </p>
                <div className="mt-5 rounded-xl bg-[#0c111e] border border-[#1e2d4a] p-4 text-left space-y-2">
                  <MetaRow label="Repository" value={
                    repositories.find((r) => r.id === reviewIssue.repository_id)?.full_name || "Connected repo"
                  } />
                  <MetaRow label="Branch" value={
                    repositories.find((r) => r.id === reviewIssue.repository_id)?.default_branch || "main"
                  } />
                  <MetaRow label="File" value={reviewIssue.file_path || "—"} mono />
                  <MetaRow label="Commit" value={commitMessage} mono />
                  <MetaRow label="SHA" value={pushSuccess} mono />
                </div>
                <div className="mt-5 flex gap-3 justify-center">
                  <button
                    className="btn-secondary !py-2 !px-5 !text-sm"
                    onClick={() => setReviewIssue(null)}
                  >
                    Close
                  </button>
                  <a
                    href={`https://github.com/${repositories.find((r) => r.id === reviewIssue.repository_id)?.full_name?.split("/")[0]}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary !py-2 !px-5 !text-sm"
                  >
                    View on GitHub
                    <svg className="w-3.5 h-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            ) : (
              /* Review state */
              <>
                <div className="flex items-start justify-between p-5 pb-4 border-b border-[#1e2d4a]/40">
                  <div>
                    <p className="dm-kicker">GitHub Write Approval</p>
                    <h2 id="review-title" className="mt-1.5 text-lg font-semibold text-white">
                      Review Proposed Change
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      This action will create a commit in the connected repository.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-icon !w-8 !h-8 !rounded-lg"
                    onClick={() => { setReviewIssue(null); setPushError(null); }}
                    aria-label="Close"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {pushError && (
                  <div className="mx-5 mt-4 rounded-xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4v2m0-11a9 9 0 110 18 9 9 0 010-18z" />
                      </svg>
                      <div>
                        <p className="font-semibold">Error</p>
                        <p className="mt-1 text-xs">{pushError}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Meta grid */}
                <div className="grid grid-cols-3 gap-px bg-[#1e2d4a]/40">
                  <MetaCell label="Repository" value={
                    repositories.find((r) => r.id === reviewIssue.repository_id)?.full_name || "Connected repo"
                  } />
                  <MetaCell label="Branch" value={
                    repositories.find((r) => r.id === reviewIssue.repository_id)?.default_branch || "main"
                  } />
                  <MetaCell label="File" value={reviewIssue.file_path || "—"} mono />
                </div>

                <div className="p-5 space-y-4">
                  {/* Issue preview */}
                  <div className="rounded-xl border border-rose-900/30 bg-rose-950/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`badge ${severityColor[reviewIssue.severity] || "badge-slate"}`}>
                        {reviewIssue.severity}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {reviewIssue.file_path}{reviewIssue.line_number ? `:${reviewIssue.line_number}` : ""}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white">{reviewIssue.title}</p>
                    <p className="mt-1.5 text-sm text-slate-400">{reviewIssue.suggested_fix}</p>
                  </div>

                  {/* Commit message */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Commit Message
                    </label>
                    <input
                      className="input !py-2 text-sm font-mono"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      maxLength={500}
                      placeholder="fix: describe the change..."
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-[#1e2d4a]/40 p-5 sm:flex-row sm:justify-end">
                  <button
                    className="btn-secondary !py-2.5"
                    onClick={() => { setReviewIssue(null); setPushError(null); }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-accent !py-2.5 !px-6"
                    disabled={pushing || !commitMessage.trim()}
                    onClick={() => void approveFix()}
                  >
                    {pushing ? (
                      <span className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full border-2 border-slate-950/40 border-t-white"
                          style={{ animation: "dm-spin 0.6s linear infinite" }}
                        />
                        Pushing...
                      </span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Approve & Push
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Batch approval modal */}
      {batchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-title"
          onClick={(e) => { if (e.target === e.currentTarget && !batchRunning) setBatchOpen(false); }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: "dm-modal-backdrop 0.2s ease" }} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-panel dm-enter">
            <div className="h-1 rounded-t-xl bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-500" />
            <div className="flex items-start justify-between p-5 pb-4 border-b border-[#1e2d4a]/40">
              <div>
                <p className="dm-kicker">{batchMode === "reject" ? "Bulk Review" : "Bulk GitHub Write"}</p>
                <h2 id="batch-title" className="mt-1.5 text-lg font-semibold text-white">
                  {batchMode === "reject" ? "Reject All " : "Approve All & Push "}
                  {batchTargets.length} Fix{batchTargets.length !== 1 ? "es" : ""}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {batchMode === "reject"
                    ? "Each selected finding is marked as rejected."
                    : "Each fix is committed to the connected repository in sequence."}
                </p>
              </div>
              <button
                type="button"
                className="btn-icon !w-8 !h-8 !rounded-lg"
                disabled={batchRunning}
                onClick={() => setBatchOpen(false)}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                {batchTargets.map((issue) => {
                  const result = batchResults?.find((item) => item.id === issue.id);
                  return (
                    <div key={issue.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#1e2d4a] bg-[#0b1120]/60 p-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200">{issue.title}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{issue.file_path}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={"badge " + (severityColor[issue.severity] || "badge-slate")}>{issue.severity}</span>
                        {result && (
                          <span className={"badge " + (result.ok ? "badge-emerald" : "badge-rose")}>
                            {result.ok ? (batchMode === "reject" ? "Rejected" : "Pushed") : "Failed"}
                          </span>
                        )}
                      </div>
                      {result && !result.ok && <p className="w-full text-xs text-rose-400">{result.message}</p>}
                    </div>
                  );
                })}
              </div>

              {batchMode === "approve" && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Commit message prefix</label>
                  <input
                    className="input !py-2 text-sm font-mono"
                    value={batchMessage}
                    onChange={(e) => setBatchMessage(e.target.value)}
                    maxLength={200}
                    disabled={batchRunning}
                    placeholder="fix: apply AI suggested fixes"
                  />
                </div>
              )}

              {batchResults && (
                <div className="rounded-xl border border-[#1e2d4a] bg-[#0c111e] p-4 text-sm text-slate-300">
                  {batchResults.filter((item) => item.ok).length} of {batchResults.length}{" "}
                  {batchMode === "reject" ? "rejected successfully." : "pushed successfully."}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#1e2d4a]/40 p-5 sm:flex-row sm:justify-end">
              <button className="btn-secondary !py-2.5" disabled={batchRunning} onClick={() => setBatchOpen(false)}>
                {batchResults ? "Close" : "Cancel"}
              </button>
              {!batchResults && (
                <button
                  className={(batchMode === "reject" ? "btn-danger" : "btn-accent") + " !py-2.5 !px-6"}
                  disabled={batchRunning}
                  onClick={() => void runBatch()}
                >
                  {batchRunning ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-950/40 border-t-white" style={{ animation: "dm-spin 0.6s linear infinite" }} />
                      {batchMode === "reject" ? "Rejecting..." : "Pushing..."}
                    </span>
                  ) : (
                    <>{batchMode === "reject" ? "Reject All" : "Approve All & Push"}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Settings Component ──────────────────────────────────── */

function PageAlert({ error, message }: { error: string | null; message: string | null }) {
  if (!error && !message) return null;
  return (
    <div
      className={
        error
          ? "rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300"
          : "rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300"
      }
      role={error ? "alert" : "status"}
    >
      {error || message}
    </div>
  );
}

function ProjectSettings({ project, onUpdate }: { project: Project, onUpdate: (p: Project) => void }) {
  const [rules, setRules] = useState(project.custom_rules || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateProject(project.id, { custom_rules: rules || null });
      onUpdate(updated);
      setMessage("Settings saved successfully.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div className="glass-panel p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-white mb-2">Project Settings</h2>
      <p className="text-sm text-slate-400 mb-6">Configure AI behavior and team guidelines for this project.</p>
      
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Custom AI Rules
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Instruct the AI on specific coding standards, libraries to avoid, or architectural rules it should enforce during PR analysis.
          </p>
          <textarea
            className="input !py-3 font-mono text-sm min-h-[160px]"
            placeholder="e.g. Always use console.warn instead of console.log. Do not use lodash, use native array methods instead."
            value={rules}
            onChange={(e) => setRules(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            className="btn-primary !py-2 !px-6"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Rules"}
          </button>
          {message && (
            <span className={`text-sm ${message.includes("success") ? "text-emerald-400" : "text-rose-400"}`}>
              {message}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

/* ── Issue card component ────────────────────────────────── */

function IssueCard({
  issue,
  severityColor,
  statusColor,
  busyIssue,
  onApprove,
  onReject,
  onUpdateFix,
  delay,
}: {
  issue: Issue;
  severityColor: Record<string, string>;
  statusColor: Record<string, string>;
  busyIssue: string | null;
  onApprove: () => void;
  onReject: () => void;
  onUpdateFix: (code: string) => void;
  delay: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = issue.status === "open";

  return (
    <div
      className={`rounded-xl border transition-all ${
        issue.status === "approved"
          ? "border-emerald-900/30 bg-emerald-950/10"
          : issue.status === "rejected"
          ? "border-rose-900/30 bg-rose-950/10"
          : "border-[#1e2d4a] bg-[#0c111e]/80 hover:border-[#2a3f5f]"
      }`}
      style={{ animation: `dm-enter 0.3s ${delay}ms var(--ease-out) both` }}
    >
      <button
        type="button"
        className="w-full text-left p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <span className={`status-dot mt-1.5 shrink-0 ${
            issue.status === "approved" ? "status-dot--online" :
            issue.status === "rejected" ? "status-dot--error" :
            "status-dot--running"
          }`} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-medium text-white text-sm">{issue.title}</span>
              <span className={`badge ${severityColor[issue.severity] || "badge-slate"}`}>
                {issue.severity}
              </span>
              {issue.status === "approved" && (
                <span className="badge badge-emerald text-[10px]">✓ Approved</span>
              )}
              {issue.status === "rejected" && (
                <span className="badge badge-rose text-[10px]">✗ Rejected</span>
              )}
            </div>
            {issue.file_path && (
              <p className="text-[11px] text-slate-600 font-mono">
                {issue.file_path}{issue.line_number ? `:${issue.line_number}` : ""}
              </p>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#1e2d4a]/30 pt-3">
          {issue.description && (
            <p className="text-sm text-slate-400">{issue.description}</p>
          )}
          {issue.suggested_fix && (
            <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/80">
                Suggested Fix
              </p>
              <p className="mt-1 text-xs text-emerald-300/80">{issue.suggested_fix}</p>
            </div>
          )}
          {(issue.corrected_code || (issue.cross_file_fixes && issue.cross_file_fixes.length > 0)) && (
            <>
              {issue.cross_file_fixes && issue.cross_file_fixes.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-cyan-400 mt-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                    </svg>
                    Cross-File Atomic Fix
                  </div>
                  {issue.cross_file_fixes.map((fix, idx) => (
                    <DiffViewer
                      key={idx}
                      filePath={fix.file_path}
                      lineNumber={null}
                      description={idx === 0 ? issue.description : undefined}
                      correctedCode={fix.corrected_code}
                    />
                  ))}
                </div>
              ) : (
                <DiffViewer
                  filePath={issue.file_path}
                  lineNumber={issue.line_number}
                  description={issue.description}
                  correctedCode={issue.corrected_code!}
                  onSaveFix={async (code) => onUpdateFix(code)}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1e2d4a]/30">
                <span className="text-[11px] text-slate-600 font-mono">
                  Phase 7 Safe Approval: Review diff before approving.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-accent !py-1.5 !px-4 !text-xs"
                    disabled={busyIssue === issue.id || issue.status === "approved"}
                    onClick={(e) => { e.stopPropagation(); onApprove(); }}
                  >
                    {busyIssue === issue.id && issue.status !== "rejected"
                      ? "Approving..."
                      : issue.status === "approved" ? "✓ Approved" : "Approve Fix"}
                  </button>
                  <button
                    type="button"
                    className="btn-danger !py-1.5 !px-3 !text-xs"
                    disabled={busyIssue === issue.id || issue.status === "rejected"}
                    onClick={(e) => { e.stopPropagation(); onReject(); }}
                  >
                    {busyIssue === issue.id && issue.status !== "approved"
                      ? "Rejecting..."
                      : issue.status === "rejected" ? "Rejected" : "Reject"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function MetaCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-[#0c111e] p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1.5 text-sm truncate ${mono ? "font-mono text-cyan-300" : "text-white font-medium"}`}>
        {value}
      </p>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={`text-xs text-slate-300 text-right truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────── */

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function RepoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function AnalysisIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21V3.104z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
