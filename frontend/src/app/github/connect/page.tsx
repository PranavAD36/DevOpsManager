'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
  html_url: string;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
}

export default function GitHubConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRepo, setBusyRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const errorParam = searchParams.get('error');

  useEffect(() => {
    if (errorParam) setError(errorParam);

    async function load() {
      try {
        setLoading(true);
        const [meRes, reposRes] = await Promise.all([
          fetch('http://localhost:8000/v1/github/me', { credentials: 'include' }),
          fetch('http://localhost:8000/v1/github/repositories', { credentials: 'include' }),
        ]);
        if (meRes.ok) setUser(await meRes.json());
        if (reposRes.ok) setRepos(await reposRes.json());
      } catch (err) {
        console.error('GitHub load failed', err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [errorParam]);

  async function handleAuthorize() {
    try {
      setError(null);
      const res = await fetch('http://localhost:8000/v1/github/authorize', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to initiate GitHub authorization');
      const data = await res.json();
      window.location.href = data.authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to GitHub');
    }
  }

  async function handleSelectRepo(repo: GitHubRepo) {
    try {
      setBusyRepo(repo.full_name);
      setError(null);
      const res = await fetch('http://localhost:8000/v1/github/repositories/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: repo.full_name,
          name: repo.name,
          html_url: repo.html_url,
          default_branch: repo.default_branch || 'main',
          description: repo.description,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to connect repository');
      }
      const data = await res.json();
      router.push(`/projects/${data.project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error linking repository');
      setBusyRepo(null);
    }
  }

  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const isMockUser = user?.login === 'devopsmanager-user';

  return (
    <main className="relative min-h-[100dvh]">
      <div className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
        {/* Nav */}
        <div className="flex items-center justify-between mb-10">
          <Link
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            href="/projects"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to projects
          </Link>
          <span className="text-[11px] font-mono text-slate-600">GITHUB OAuth</span>
        </div>

        <h1 className="text-3xl font-semibold text-white tracking-tight">Connect GitHub</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-lg">
          Authorize DevOpsManager to access your repositories. Selected repos will be analyzed by the AI engine.
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 flex items-start gap-3" role="alert">
            <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-10 space-y-4">
            <div className="h-20 rounded-xl border border-slate-800/60 bg-slate-900/40 animate-pulse" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-36 rounded-xl border border-slate-800/60 bg-slate-900/40 animate-pulse" />
              ))}
            </div>
          </div>
        ) : !user ? (
          /* Unauthenticated */
          <div className="mt-12 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-10 text-center max-w-md mx-auto">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">Authorize GitHub</h2>
            <p className="mt-2 text-sm text-slate-500">
              Grant DevOpsManager secure read access to your repositories.
            </p>
            <button
              onClick={() => void handleAuthorize()}
              className="mt-6 btn-primary w-full !py-3"
            >
              Connect GitHub
            </button>
            {isMockUser && (
              <p className="mt-3 text-[11px] font-mono text-slate-600">Mock development mode active</p>
            )}
          </div>
        ) : (
          /* Authenticated */
          <div className="mt-10 space-y-8">
            {/* User status card */}
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-10 h-10 rounded-xl object-cover border border-emerald-500/30"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                    {user.login[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{user.name || user.login}</span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected
                    </span>
                  </div>
                  <a
                    href={user.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-500 hover:text-cyan-400 transition-colors font-mono"
                  >
                    @{user.login}
                  </a>
                </div>
              </div>
              <button
                onClick={() => void handleAuthorize()}
                className="btn-secondary !px-3 !py-1.5 text-xs shrink-0"
              >
                Re-authorize
              </button>
            </div>

            {/* Repository picker */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-sm font-semibold text-white">Select a repository</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Choose a repo to create a project and start analysis.</p>
                </div>
                {repos.length > 0 && (
                  <div className="relative">
                    <svg className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search repos…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full sm:w-56 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-1.5 pl-8 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none transition-colors"
                    />
                  </div>
                )}
              </div>

              {filteredRepos.length === 0 ? (
                <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-8 text-center">
                  <p className="text-sm text-slate-500">
                    {repos.length === 0 ? 'No repositories found in your account.' : 'No matching repositories.'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredRepos.map((repo) => (
                    <div
                      key={repo.full_name}
                      className="group rounded-xl border border-slate-800/60 bg-slate-900/50 p-4 hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium text-white text-sm truncate group-hover:text-cyan-400 transition-colors">
                            {repo.name}
                          </h3>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{repo.full_name}</p>
                        </div>
                        {repo.private ? (
                          <span className="tag bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] shrink-0">Private</span>
                        ) : (
                          <span className="tag bg-slate-800 text-slate-500 border border-slate-700 text-[10px] shrink-0">Public</span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-400 line-clamp-2">{repo.description || 'No description.'}</p>
                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/50">
                        <span className="text-[11px] text-slate-600 font-mono">{repo.language || '—'}</span>
                        <button
                          disabled={busyRepo === repo.full_name}
                          onClick={() => void handleSelectRepo(repo)}
                          className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50"
                        >
                          {busyRepo === repo.full_name ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-950/40 border-t-slate-950 animate-spin" />
                              Creating…
                            </span>
                          ) : 'Select'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
