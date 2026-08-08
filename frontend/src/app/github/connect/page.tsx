'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api, type GitHubRepository, type Project } from '../../../lib/api';

export default function GitHubConnectPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [selectedRepository, setSelectedRepository] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const connection = await api.getGithubConnection();
        const [projectData, repositoryData] = await Promise.all([api.listProjects(), api.listGithubRepositories()]);
        setUsername(connection.username);
        setProjects(projectData);
        setRepositories(repositoryData);
        setProjectId(projectData[0]?.id ?? '');
      } catch (requestError) {
        setError(requestError instanceof Error && requestError.message.includes('Connect a GitHub') ? null : requestError instanceof Error ? requestError.message : 'Unable to load GitHub repositories.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function authorize() {
    setBusy(true);
    setError(null);
    try {
      const { authorization_url } = await api.getGithubAuthorizationUrl();
      window.location.assign(authorization_url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to start GitHub authorization.');
      setBusy(false);
    }
  }

  async function connect() {
    if (!projectId || selectedRepository === null) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.connectGithubRepository(projectId, selectedRepository);
      setMessage(result.message);
      setSelectedRepository(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to connect repository.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen px-6 py-12"><div className="mx-auto max-w-5xl"><Link className="text-sm text-cyan-400 hover:text-cyan-300" href="/projects">← Projects</Link><header className="mt-8"><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">GitHub App</p><h1 className="mt-3 text-4xl font-semibold text-white">Connect GitHub</h1><p className="mt-3 max-w-2xl text-slate-400">Authorize DevOpsManager to browse repositories you can access, then connect one to a project.</p></header>{error && <p className="mt-6 rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-sm text-rose-300" role="alert">{error}</p>}{message && <p className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 text-sm text-emerald-300" role="status">{message}</p>}{loading ? <p className="mt-10 text-slate-400">Loading GitHub connection...</p> : !username ? <section className="mt-10 max-w-xl rounded-xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-xl font-semibold text-white">Authorize your GitHub account</h2><p className="mt-2 text-sm text-slate-400">Your access token is kept on the server and is never sent to the browser.</p><button className="mt-6 rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60" disabled={busy} onClick={() => void authorize()}>{busy ? 'Opening GitHub...' : 'Connect GitHub'}</button></section> : <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]"><section><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-400">Connected as</p><p className="text-xl font-semibold text-white">{username}</p></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">Authorized</span></div>{repositories.length === 0 ? <p className="mt-8 rounded-xl border border-dashed border-slate-700 p-8 text-slate-400">No accessible repositories were returned by GitHub.</p> : <div className="mt-6 space-y-3">{repositories.map((repository) => <button className={`block w-full rounded-xl border p-4 text-left transition ${selectedRepository === repository.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'}`} key={repository.id} onClick={() => setSelectedRepository(repository.id)}><div className="flex items-start justify-between gap-3"><span className="font-medium text-white">{repository.full_name}</span><span className="text-xs text-slate-500">{repository.private ? 'Private' : 'Public'}</span></div><p className="mt-2 text-sm text-slate-400">{repository.description || 'No description provided.'}</p><p className="mt-3 text-xs text-slate-500">Default branch: {repository.default_branch}</p></button>)}</div>}</section><section className="h-fit rounded-xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-lg font-semibold text-white">Connect selection</h2><label className="mt-5 block text-sm text-slate-300">DevOpsManager project<select className="form-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button className="mt-4 w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50" disabled={busy || !projectId || selectedRepository === null} onClick={() => void connect()}>{busy ? 'Connecting...' : 'Connect repository'}</button></section></div>}</div></main>;
}
