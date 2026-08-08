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
  const [owner, setOwner] = useState('');
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [url, setUrl] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [severity, setSeverity] = useState('all');
  const [issueStatus, setIssueStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [projectData, repositoryData, runData, issueData] = await Promise.all([api.getProject(id), api.listRepositories(id), api.listAnalysisRuns(id), api.listIssues(id)]);
      setProject(projectData); setRepositories(repositoryData); setAnalysisRuns(runData); setIssues(issueData);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to load project.'); }
  }

  useEffect(() => { if (id) void load(); }, [id]);

  async function handleRepositorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    try { await api.createRepository(id, { owner, name, full_name: fullName, url, default_branch: defaultBranch }); setOwner(''); setName(''); setFullName(''); setUrl(''); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to create repository.'); }
  }

  const filteredIssues = issues.filter((issue) => (severity === 'all' || issue.severity === severity) && (issueStatus === 'all' || issue.status === issueStatus));

  if (!project && !error) return <main className="flex min-h-screen items-center justify-center text-slate-400">Loading project...</main>;
  return <main className="min-h-screen px-6 py-12"><div className="mx-auto max-w-6xl"><Link className="text-sm text-cyan-400 hover:text-cyan-300" href="/projects">← Projects</Link>{error && <p className="mt-6 text-sm text-rose-400" role="alert">{error}</p>}{project && <><header className="mt-6"><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">Project</p><h1 className="mt-2 text-4xl font-semibold text-white">{project.name}</h1><p className="mt-2 text-slate-400">{project.description || 'No description provided.'}</p></header><div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"><div className="space-y-8"><section><h2 className="text-lg font-semibold text-white">Repositories <span className="text-sm text-slate-500">{repositories.length}</span></h2>{repositories.length === 0 ? <p className="mt-3 text-slate-400">No repositories linked.</p> : <div className="mt-3 space-y-3">{repositories.map((repository) => <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4" key={repository.id}><a className="font-medium text-cyan-300 hover:text-cyan-200" href={repository.url} target="_blank" rel="noreferrer">{repository.full_name}</a><p className="mt-1 text-sm text-slate-400">{repository.default_branch} · {repository.provider}</p></div>)}</div>}</section><section><h2 className="text-lg font-semibold text-white">Analysis runs <span className="text-sm text-slate-500">{analysisRuns.length}</span></h2>{analysisRuns.length === 0 ? <p className="mt-3 text-slate-400">No analysis runs yet.</p> : <div className="mt-3 space-y-3">{analysisRuns.map((run) => <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4" key={run.id}><span className="font-medium text-white">{run.status}</span><p className="mt-1 text-sm text-slate-400">Repository {run.repository_id}</p></div>)}</div>}</section><section><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white">Issues <span className="text-sm text-slate-500">{filteredIssues.length}</span></h2><div className="flex gap-2"><select className="form-select" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><select className="form-select" value={issueStatus} onChange={(event) => setIssueStatus(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option></select></div></div>{filteredIssues.length === 0 ? <p className="mt-3 text-slate-400">No matching issues.</p> : <div className="mt-3 space-y-3">{filteredIssues.map((issue) => <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4" key={issue.id}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium text-white">{issue.title}</h3><span className="text-sm text-amber-300">{issue.severity} · {issue.status}</span></div><p className="mt-1 text-sm text-slate-400">{issue.category || 'Uncategorized'}{issue.file_path ? ` · ${issue.file_path}${issue.line_number ? `:${issue.line_number}` : ''}` : ''}</p></div>)}</div>}</section></div><section className="h-fit rounded-xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-lg font-semibold text-white">Link repository</h2><form className="mt-5 space-y-4" onSubmit={handleRepositorySubmit}><label className="block text-sm text-slate-300">Owner<input className="form-input" required value={owner} onChange={(event) => setOwner(event.target.value)} /></label><label className="block text-sm text-slate-300">Name<input className="form-input" required value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block text-sm text-slate-300">Full name<input className="form-input" required placeholder="owner/repository" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label className="block text-sm text-slate-300">URL<input className="form-input" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} /></label><label className="block text-sm text-slate-300">Default branch<input className="form-input" required value={defaultBranch} onChange={(event) => setDefaultBranch(event.target.value)} /></label><button className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950" type="submit">Add repository</button></form></section></div></>}</div></main>;
}
