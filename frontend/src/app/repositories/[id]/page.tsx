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

  useEffect(() => {
    if (id) api.getRepository(id).then(setRepository).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load repository.'));
  }, [id]);

  async function refresh() {
    setError(null);
    setMessage(null);
    try {
      setRepository(await api.refreshRepository(id));
      setMessage('Repository metadata refreshed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to refresh repository.');
    }
  }

  if (!repository && !error)
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
      <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-8"
          href={repository ? `/projects/${repository.project_id}` : '/projects'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

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

        {repository && (
          <div className="space-y-6">
            {/* Header card */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-mono text-cyan-500/70 uppercase tracking-wider mb-1.5">
                  {repository.provider}
                </p>
                <h1 className="text-xl font-semibold text-white">{repository.full_name}</h1>
                <p className="mt-1.5 text-sm text-slate-500">{repository.github_description || 'No description.'}</p>
              </div>
              <button
                className="btn-secondary !px-3 !py-2 text-xs shrink-0"
                onClick={() => void refresh()}
              >
                Refresh
              </button>
            </div>

            {/* Meta grid */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
                {[
                  ['Language', repository.language || 'Unknown'],
                  ['Default branch', repository.default_branch],
                  ['Stars / forks', `${repository.stargazers_count ?? 0} / ${repository.forks_count ?? 0}`],
                  ['Open issues', String(repository.open_issues_count ?? 0)],
                  ['Owner', repository.owner],
                  ['Project ID', repository.project_id],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-[11px] font-mono uppercase tracking-wider text-slate-600">{label}</dt>
                    <dd className="mt-1 text-sm text-slate-200 font-mono">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <a
              className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
              href={repository.url}
              target="_blank"
              rel="noreferrer"
            >
              Open on GitHub
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
