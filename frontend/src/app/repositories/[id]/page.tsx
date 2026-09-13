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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      setLoading(true);
      api.getRepository(id)
        .then(setRepository)
        .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load repository.'))
        .finally(() => setLoading(false));
    }
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

  if (loading && !repository && !error)
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div
            className="w-8 h-8 rounded-full border-2 border-[#1e2d4a] border-t-cyan-400 mx-auto mb-4"
            style={{ animation: 'dm-spin 0.6s linear infinite' }}
          />
          <p className="text-xs font-mono text-slate-500">Loading repository...</p>
        </div>
      </main>
    );

  return (
    <main className="relative dm-enter pb-16">
      <div className="orb orb--blue w-[400px] h-[400px] top-0 right-0" />
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-10 lg:px-8">

        <Link
          href={repository ? `/projects/${repository.project_id}` : '/projects'}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to project
        </Link>

        {error && (
          <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 mb-5" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300 mb-5" role="status">
            {message}
          </div>
        )}

        {repository && (
          <div className="space-y-6">
            {/* Header card */}
            <div className="glass-panel p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-cyan-500/70 uppercase tracking-wider mb-1">
                    {repository.provider}
                  </p>
                  <h1 className="text-xl font-semibold text-white">{repository.full_name}</h1>
                  <p className="mt-1.5 text-sm text-slate-500">{repository.github_description || 'No description.'}</p>
                </div>
              </div>
              <button
                className="btn-secondary !py-2 !px-4 !text-xs shrink-0"
                onClick={() => void refresh()}
              >
                Refresh
              </button>
            </div>

            {/* Meta grid */}
            <div className="glass-panel p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Repository Details</h2>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                {[
                  ['Language', repository.language || 'Unknown'],
                  ['Default branch', repository.default_branch],
                  ['Stars / forks', `${repository.stargazers_count ?? 0} / ${repository.forks_count ?? 0}`],
                  ['Open issues', String(repository.open_issues_count ?? 0)],
                  ['Owner', typeof repository.owner === 'string' ? repository.owner : repository.owner?.login || '—'],
                  ['Size', repository.repository_size ? `${(repository.repository_size / 1024).toFixed(1)} MB` : '—'],
                  ['Private', repository.is_private ? 'Yes' : 'No'],
                  ['Fork', repository.is_fork ? 'Yes' : 'No'],
                  ['Last pushed', repository.pushed_at ? new Date(repository.pushed_at).toLocaleDateString() : '—'],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-[11px] font-mono uppercase tracking-wider text-slate-600">{label}</dt>
                    <dd className="mt-1 text-sm text-slate-200 font-mono">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <a
                className="btn-primary !py-2 !px-5 !text-sm"
                href={repository.url}
                target="_blank"
                rel="noreferrer"
              >
                Open on GitHub
                <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <Link
                href={`/projects/${repository.project_id}`}
                className="btn-secondary !py-2 !px-5 !text-sm"
              >
                Back to Project
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
