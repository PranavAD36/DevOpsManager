'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { api, type Repository } from '../../../lib/api';

export default function RepositoryDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [repository, setRepository] = useState<Repository | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (id) api.getRepository(id).then(setRepository).catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to load repository.')); }, [id]);

  async function refresh() {
    setError(null); setMessage(null);
    try { setRepository(await api.refreshRepository(id)); setMessage('Repository metadata refreshed.'); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to refresh repository.'); }
  }

  if (!repository && !error) return <main className="flex min-h-screen items-center justify-center text-slate-400">Loading repository...</main>;
  return <main className="min-h-screen px-6 py-12"><div className="mx-auto max-w-4xl"><Link className="text-sm text-cyan-400 hover:text-cyan-300" href={repository ? `/projects/${repository.project_id}` : '/projects'}>← Back to project</Link>{error && <p className="mt-6 text-sm text-rose-400" role="alert">{error}</p>}{message && <p className="mt-6 text-sm text-emerald-400" role="status">{message}</p>}{repository && <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">{repository.provider}</p><h1 className="mt-3 text-3xl font-semibold text-white">{repository.full_name}</h1><p className="mt-2 text-slate-400">{repository.github_description || 'No description provided.'}</p></div><button className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400" onClick={() => void refresh()}>Refresh metadata</button></div><dl className="mt-8 grid gap-5 sm:grid-cols-3"><div><dt className="text-xs uppercase tracking-wider text-slate-500">Language</dt><dd className="mt-1 text-slate-200">{repository.language || 'Unknown'}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Default branch</dt><dd className="mt-1 text-slate-200">{repository.default_branch}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Stars / forks</dt><dd className="mt-1 text-slate-200">{repository.stargazers_count ?? 0} / {repository.forks_count ?? 0}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Open issues</dt><dd className="mt-1 text-slate-200">{repository.open_issues_count ?? 0}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Owner</dt><dd className="mt-1 text-slate-200">{repository.owner}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Project</dt><dd className="mt-1 text-slate-200">{repository.project_id}</dd></div></dl><a className="mt-8 inline-block text-cyan-400 hover:text-cyan-300" href={repository.url} target="_blank" rel="noreferrer">Open repository on GitHub</a></section>}</div></main>;
}
