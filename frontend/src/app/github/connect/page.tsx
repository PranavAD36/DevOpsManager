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

  const statusParam = searchParams.get('status');

  useEffect(() => {
    async function loadGitHubData() {
      try {
        setLoading(true);
        const meRes = await fetch('http://localhost:8000/v1/github/me', {
          credentials: 'include',
        });
        if (!meRes.ok) {
          setLoading(false);
          return;
        }
        const userData: GitHubUser = await meRes.json();
        setUser(userData);

        const reposRes = await fetch('http://localhost:8000/v1/github/repositories', {
          credentials: 'include',
        });
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
  }, [statusParam]);

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

  return (
    <main className="min-h-screen px-6 py-12 bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors" href="/projects">
            ← Back to Projects
          </Link>
          <span className="text-xs uppercase tracking-widest text-slate-500 font-mono">
            DevOpsManager Phase 4
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
          <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300" role="alert">
            {error}
          </div>
        )}

        {!user ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center max-w-xl mx-auto backdrop-blur-sm">
            <div className="mx-auto w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-cyan-400 mb-6">
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
              className="mt-6 w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 px-6 py-3.5 font-semibold text-slate-950 transition-all shadow-lg shadow-cyan-500/20"
            >
              Connect GitHub
            </button>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center gap-3">
                {user.avatar_url && (
                  <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full" />
                )}
                <div>
                  <h3 className="font-semibold text-white">{user.name || user.login}</h3>
                  <p className="text-xs text-slate-400">@{user.login}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Connected
              </span>
            </div>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Select Repository</h2>
              {loading ? (
                <div className="text-center py-12 text-slate-400">Loading accessible repositories...</div>
              ) : repos.length === 0 ? (
                <div className="text-center py-12 text-slate-400">No repositories found in your GitHub account.</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {repos.map((repo) => (
                    <div
                      key={repo.full_name}
                      className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-slate-700 transition-all"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-white truncate">{repo.name}</h3>
                          {repo.private && (
                            <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                              Private
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400 font-mono">{repo.full_name}</p>
                        <p className="mt-3 text-sm text-slate-300 line-clamp-2">
                          {repo.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800/80">
                        <span className="text-xs text-slate-400">{repo.language || 'Code'}</span>
                        <button
                          disabled={busyRepo === repo.full_name}
                          onClick={() => void handleSelectRepo(repo)}
                          className="rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-3.5 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                        >
                          {busyRepo === repo.full_name ? 'Creating project...' : 'Select Repo'}
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
