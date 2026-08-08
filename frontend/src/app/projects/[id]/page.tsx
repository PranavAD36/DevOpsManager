'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { api, type AnalysisRun, type Issue, type Project, type Repository } from '../../../lib/api';

export default function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [severity, setSeverity] = useState('all');
  const [issueStatus, setIssueStatus] = useState('all');
  const [busyRepository, setBusyRepository] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [projectData, repositoryData, runData, issueData] = await Promise.all([
        api.getProject(id), api.listRepositories(id), api.listAnalysisRuns(id), api.listIssues(id),
      ]);
      setProject(projectData); setRepositories(repositoryData); setAnalysisRuns(runData); setIssues(issueData);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to load project.'); }
  }

  useEffect(() => { if (id) void load(); }, [id]);

  async function connectRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setConnecting(true); setError(null); setMessage(null);
    try { await api.connectRepository(id, repositoryUrl); setRepositoryUrl(''); setMessage('Repository connected and metadata synchronized.'); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to connect repository.'); }
    finally { setConnecting(false); }
  }

  async function refreshRepository(repositoryId: string) {
    setBusyRepository(repositoryId); setError(null); setMessage(null);
    try { await api.refreshRepository(repositoryId); setMessage('Repository metadata refreshed.'); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to refresh repository.'); }
    finally { setBusyRepository(null); }
  }

  async function startAnalysis(repositoryId: string) {
    setBusyRepository(repositoryId); setError(null); setMessage(null);
    try { await api.createAnalysisRun(repositoryId); setMessage('Analysis run created with pending status.'); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to start analysis.'); }
    finally { setBusyRepository(null); }
  }

  const filteredIssues = issues.filter((issue) => (severity === 'all' || issue.severity === severity) && (issueStatus === 'all' || issue.status === issueStatus));
  if (!project && !error) return <main className="flex min-h-screen items-center justify-center text-slate-400">Loading project...</main>;

  return <main className="min-h-screen px-6 py-12"><div className="mx-auto max-w-6xl"><Link className="text-sm text-cyan-400 hover:text-cyan-300" href="/projects">← Projects</Link>{error && <p className="mt-6 text-sm text-rose-400" role="alert">{error}</p>}{message && <p className="mt-6 text-sm text-emerald-400" role="status">{message}</p>}{project && <><header className="mt-6"><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">Project</p><h1 className="mt-2 text-4xl font-semibold text-white">{project.name}</h1><p className="mt-2 text-slate-400">{project.description || 'No description provided.'}</p></header><div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"><div className="space-y-8"><section><h2 className="text-lg font-semibold text-white">Connected repositories <span className="text-sm text-slate-500">{repositories.length}</span></h2>{repositories.length === 0 ? <p className="mt-3 text-slate-400">No repositories connected.</p> : <div className="mt-3 space-y-3">{repositories.map((repository) => <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5" key={repository.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="font-medium text-cyan-300 hover:text-cyan-200" href={`/repositories/${repository.id}`}>{repository.full_name}</Link><p className="mt-1 text-sm text-slate-400">{repository.github_description || 'No description provided.'}</p></div><button className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-400 disabled:opacity-60" disabled={busyRepository === repository.id} onClick={() => void refreshRepository(repository.id)}>{busyRepository === repository.id ? 'Working...' : 'Refresh'}</button></div><div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-4"><span>{repository.language || 'Unknown language'}</span><span>{repository.stargazers_count ?? 0} stars</span><span>{repository.forks_count ?? 0} forks</span><span>{repository.open_issues_count ?? 0} issues</span></div><div className="mt-4 flex flex-wrap gap-3"><a className="text-sm text-cyan-400 hover:text-cyan-300" href={repository.url} target="_blank" rel="noreferrer">Open on GitHub</a><button className="text-sm text-cyan-400 hover:text-cyan-300 disabled:opacity-60" disabled={busyRepository === repository.id} onClick={() => void startAnalysis(repository.id)}>Start analysis</button></div></div>)}</div>}</section><section><h2 className="text-lg font-semibold text-white">Analysis runs <span className="text-sm text-slate-500">{analysisRuns.length}</span></h2>{analysisRuns.length === 0 ? <p className="mt-3 text-slate-400">No analysis runs yet.</p> : <div className="mt-3 space-y-3">{analysisRuns.map((run) => <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4" key={run.id}><span className="font-medium text-white">{run.status}</span><p className="mt-1 text-sm text-slate-400">Repository {run.repository_id}</p></div>)}</div>}</section><section><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white">Issues <span className="text-sm text-slate-500">{filteredIssues.length}</span></h2><div className="flex gap-2"><select className="form-select" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><select className="form-select" value={issueStatus} onChange={(event) => setIssueStatus(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option></select></div></div>{filteredIssues.length === 0 ? <p className="mt-3 text-slate-400">No matching issues.</p> : <div className="mt-3 space-y-3">{filteredIssues.map((issue) => <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4" key={issue.id}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium text-white">{issue.title}</h3><span className="text-sm text-amber-300">{issue.severity} · {issue.status}</span></div><p className="mt-1 text-sm text-slate-400">{issue.category || 'Uncategorized'}{issue.file_path ? ` · ${issue.file_path}${issue.line_number ? `:${issue.line_number}` : ''}` : ''}</p></div>)}</div>}</section></div><section className="h-fit rounded-xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-lg font-semibold text-white">Connect GitHub</h2><p className="mt-2 text-sm text-slate-400">Authorize GitHub and choose a repository for this project.</p><Link className="mt-5 block w-full rounded-lg bg-cyan-400 px-4 py-3 text-center font-semibold text-slate-950" href="/github/connect">Connect GitHub</Link><div className="mt-8 border-t border-slate-800 pt-6"><h3 className="font-medium text-white">Legacy URL connection</h3><form className="mt-4 space-y-4" onSubmit={connectRepository}><label className="block text-sm text-slate-300">Repository URL<input className="form-input" type="url" required placeholder="https://github.com/owner/repository" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} /></label><button className="w-full rounded-lg border border-slate-700 px-4 py-3 font-semibold text-slate-200 disabled:opacity-60" disabled={connecting} type="submit">{connecting ? 'Connecting...' : 'Connect by URL'}</button></form></div></section></div></>}</div></main>;
}
