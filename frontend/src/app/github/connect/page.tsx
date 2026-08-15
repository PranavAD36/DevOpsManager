'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  const [loading, setLoading] = useState<boolean>(true);
  const [busyRepo, setBusyRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const statusParam = searchParams.get('status');
  const errorParam = searchParams.get('error');

  useEffect(() => {
    if (errorParam) {
      setError(errorParam);
    }

    async function loadGitHubData() {
      try {
        setLoading(true);
        // Parallel fetch for maximum speed
        const [meRes, reposRes] = await Promise.all([
          fetch('http://localhost:8000/v1/github/me', { credentials: 'include' }),
          fetch('http://localhost:8000/v1/github/repositories', { credentials: 'include' }),
        ]);

        if (meRes.ok) {
          const userData: GitHubUser = await meRes.json();
          setUser(userData);
        } else {
          setUser(null);
        }

        if (reposRes.ok) {
          const repoData: GitHubRepo[] = await reposRes.json();
          setRepos(repoData);
        }
      } catch (err: unknown) {
        console.error('Failed to load GitHub session:', err);
      } finally {
        setLoading(false);
      }
    }

    void loadGitHubData();
  }, [statusParam, errorParam]);

  async function handleAuthorize() {
    try {
      setError(null);
      const res = await fetch('http://localhost:8000/v1/github/authorize', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to initiate GitHub authorization');
      }
      const data: { authorization_url: string } = await res.json();
      window.location.href = data.authorization_url;
    } catch (err: unknown) {
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
        const errorData: { detail?: string } = await res.json();
        throw new Error(errorData.detail || 'Failed to connect repository to project');
      }

      const data: { project_id: string } = await res.json();
      router.push(`/projects/${data.project_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error linking repository');
      setBusyRepo(null);
    }
  }

  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const isMockUser = user?.login === 'devopsmanager-user';

  return (
    <main className="min-h-screen px-6 py-12 bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 font-medium" href="/projects">
            ← Back to Projects
          </Link>
          <span className="text-xs uppercase tracking-widest text-slate-500 font-mono">
            DevOpsManager GitHub Integration
          </span>
        </div>

        <header className="mt-8">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Connect GitHub
          </h1>
          <p className="mt-3 text-lg text-slate-400 max-w-2xl">
            Authorize DevOpsManager to access your repositories. Select a repository to automatically create a workspace project and trigger AI analysis.
          </p>
        </header>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 flex items-start gap-3" role="alert">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold text-rose-200">Authorization / Connection Notice</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          /* High Performance Skeleton Loader */
          <div className="mt-10 space-y-6">
            <div className="h-24 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-44 rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
              <div className="h-44 rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
            </div>
          </div>
        ) : !user ? (
          /* Unauthenticated State */
          <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center max-w-xl mx-auto backdrop-blur-sm shadow-2xl">
            <div className="mx-auto w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center text-cyan-400 mb-6 border border-slate-700">
              <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">Authorize GitHub Account</h2>
            <p className="mt-2 text-sm text-slate-400">
              Grant DevOpsManager secure access to read accessible repositories and metadata.
            </p>
            <button
              onClick={() => void handleAuthorize()}
              className="mt-6 w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 px-6 py-3.5 font-semibold text-slate-950 transition-all shadow-lg shadow-cyan-500/20 active:scale-[0.98]"
            >
              Connect GitHub
            </button>
          </div>
        ) : (
          /* Authenticated State */
          <div className="mt-10 space-y-8">
            {/* Clear Authorization Status Indicator Card */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6 backdrop-blur-sm shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.login} className="w-14 h-14 rounded-full border-2 border-emerald-500/50 shadow-md" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-300 font-bold text-xl border border-emerald-500/30">
                      {user.login[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-white">{user.name || user.login}</h3>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Authorized & Active
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                        {isMockUser ? 'Mock Development Mode' : 'GitHub OAuth Live'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      Connected Account: <a href={user.html_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">@{user.login}</a>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => void handleAuthorize()}
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-2 text-xs font-semibold transition-all shrink-0"
                >
                  Re-authorize Account
                </button>
              </div>
            </div>

            {/* Repository Selection Section */}
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Select Repository</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select any repository below to create a project and begin automated analysis.
                  </p>
                </div>

                {/* Instant Search / Filter Input */}
                {repos.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Search repositories..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl bg-slate-900/90 border border-slate-800 px-3.5 py-2 pl-9 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition-colors"
                    />
                    <svg className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                )}
              </div>

              {filteredRepos.length === 0 ? (
                <div className="text-center py-12 rounded-xl border border-slate-800/80 bg-slate-900/30 text-slate-400">
                  {repos.length === 0 ? 'No repositories found in your GitHub account.' : 'No matching repositories found.'}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredRepos.map((repo) => (
                    <div
                      key={repo.full_name}
                      className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-cyan-500/40 hover:bg-slate-900/90 transition-all shadow-md group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-white group-hover:text-cyan-400 transition-colors truncate">
                            {repo.name}
                          </h3>
                          {repo.private ? (
                            <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
                              Private
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                              Public
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400 font-mono">{repo.full_name}</p>
                        <p className="mt-3 text-sm text-slate-300 line-clamp-2">
                          {repo.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800/80">
                        <span className="text-xs font-mono text-slate-400">{repo.language || 'Code'}</span>
                        <button
                          disabled={busyRepo === repo.full_name}
                          onClick={() => void handleSelectRepo(repo)}
                          className="rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-3.5 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {busyRepo === repo.full_name ? (
                            <>
                              <span className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                              Creating project...
                            </>
                          ) : (
                            'Select Repo'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
