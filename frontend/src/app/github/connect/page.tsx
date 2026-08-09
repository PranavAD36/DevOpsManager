'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api, type GitHubRepository } from '../../../lib/api';

export default function GitHubConnectPage() {
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [selectedRepository, setSelectedRepository] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const connection = await api.getGithubConnection();
        const repositoryData = await api.listGithubRepositories();
        setUsername(connection.username);
        setRepositories(repositoryData);
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

  async function connect(repositoryId: number) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.connectGithubRepository(repositoryId);
      window.location.assign(`/projects/${result.project_id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to connect repository.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen px-6 py-12"><div className="mx-auto max-w-5xl"><Link className="text-sm text-cyan-400 hover:text-cyan-300" href="/">← Home</Link><header className="mt-8"><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">GitHub App</p><h1 className="mt-3 text-4xl font-semibold text-white">Connect GitHub</h1><p className="mt-3 max-w-2xl text-slate-400">Authorize DevOpsManager to browse repositories you can access, then select one to create its project.</p></header>{error && <p className="mt-6 rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-sm text-rose-300" role="alert">{error}</p>}{message && <p className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 text-sm text-emerald-300" role="status">{message}</p>}{loading ? <p className="mt-10 text-slate-400">Loading GitHub connection...</p> : !username ? <section className="mt-10 max-w-xl rounded-xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-xl font-semibold text-white">Authorize your GitHub account</h2><p className="mt-2 text-sm text-slate-400">Your access token is kept on the server and is never sent to the browser.</p><button className="mt-6 rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60" disabled={busy} onClick={() => void authorize()}>{busy ? 'Opening GitHub...' : 'Connect GitHub'}</button></section> : <section className="mt-10"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-400">Connected as</p><p className="text-xl font-semibold text-white">{username}</p></div><button className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-60" disabled={busy} onClick={() => window.location.reload()}>Refresh repositories</button></div>{repositories.length === 0 ? <p className="mt-8 rounded-xl border border-dashed border-slate-700 p-8 text-slate-400">No accessible repositories were returned by GitHub.</p> : <div className="mt-6 grid gap-4 md:grid-cols-2">{repositories.map((repository) => <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5" key={repository.id}><div className="flex items-start justify-between gap-3"><h2 className="font-medium text-white">{repository.name}</h2><span className="text-xs text-slate-500">{repository.private ? 'Private' : 'Public'}</span></div><p className="mt-1 text-sm text-cyan-300">{repository.owner}/{repository.name}</p><p className="mt-3 min-h-10 text-sm text-slate-400">{repository.description || 'No description provided.'}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500"><span>{repository.language || 'Unknown language'}</span><span>{repository.stargazers_count} stars</span><span>{repository.forks_count} forks</span><span>{repository.default_branch}</span></div><button className="mt-5 w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50" disabled={busy} onClick={() => { setSelectedRepository(repository.id); void connect(repository.id); }}>{busy && selectedRepository === repository.id ? 'Connecting...' : 'Select repository'}</button></article>)}</div>}</section>}</div></main>;
}
