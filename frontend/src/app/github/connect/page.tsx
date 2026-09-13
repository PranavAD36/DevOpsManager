'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setAuthToken, clearAuthToken } from '@/lib/api';

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
  html_url: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  owner: string | { login: string };
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
}

// Language colors for dots
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Java: '#b07219',
  Go: '#00add8',
  Rust: '#dea584',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Dockerfile: '#384d54',
  Shell: '#89e051',
};

export default function GitHubConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRepo, setBusyRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Public search state
  const [publicUsername, setPublicUsername] = useState('');
  const [searchingPublic, setSearchingPublic] = useState(false);
  const [publicRepos, setPublicRepos] = useState<GitHubRepo[]>([]);

  const errorParam = searchParams.get('error');
  const tokenParam = searchParams.get('token');

  useEffect(() => {
    if (tokenParam) {
      setAuthToken(tokenParam);
      if (typeof window !== 'undefined') {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('token');
        newUrl.searchParams.delete('status');
        window.history.replaceState({}, '', newUrl.pathname + (newUrl.search ? newUrl.search : ''));
      }
    }

    if (errorParam) setError(errorParam);

    async function load() {
      try {
        setLoading(true);
        const [meData, reposData] = await Promise.all([
          api.getGithubConnection().catch(() => null),
          api.listGithubRepositories().catch(() => []),
        ]);
        if (meData?.login) {
          setUser(meData as unknown as GitHubUser);
        } else {
          setUser(null);
        }
        setRepos(reposData as GitHubRepo[]);
      } catch (err) {
        console.error('GitHub load failed', err);
        setError(err instanceof Error ? err.message : 'Failed to load GitHub data');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [tokenParam, errorParam]);

  function handleDisconnect() {
    clearAuthToken();
    setUser(null);
    setRepos([]);
  }

  async function handleAuthorize() {
    setConnecting(true);
    try {
      setError(null);
      const data = await api.getGithubAuthorizationUrl();
      window.location.href = data.authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to GitHub');
    } finally {
      setConnecting(false);
    }
  }

  async function handleSearchPublic(e: React.FormEvent) {
    e.preventDefault();
    if (!publicUsername.trim()) return;
    setSearchingPublic(true);
    setError(null);
    try {
      const publicData = await api.getPublicUserRepositories(publicUsername.trim());
      setPublicRepos(publicData as GitHubRepo[]);
      if (publicData.length === 0) {
        setError(`No public repositories found for user '${publicUsername}'`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to fetch repositories for '${publicUsername}'`);
    } finally {
      setSearchingPublic(false);
    }
  }

  async function handleSelectRepo(repo: GitHubRepo) {
    try {
      setBusyRepo(repo.full_name);
      setError(null);
      const owner = typeof repo.owner === 'string' ? repo.owner : repo.owner?.login || repo.full_name.split('/')[0];
      const requestBody = {
        full_name: repo.full_name,
        owner,
        name: repo.name,
        html_url: repo.html_url,
        default_branch: repo.default_branch || 'main',
        description: repo.description,
      };

      const data = await api.connectGithubRepository(requestBody);
      router.push(`/projects/${data.project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect repository');
    } finally {
      setBusyRepo(null);
    }
  }

  const activeRepos = user ? repos : publicRepos;
  const filteredRepos = activeRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <main className="relative dm-enter pb-16">
      <div className="orb orb--violet w-[500px] h-[500px] -top-32 -left-32" />
      <div className="orb orb--blue w-[300px] h-[300px] bottom-20 right-10" />
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-10 lg:px-8">

        {/* Nav */}
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to projects
          </Link>
          <span className="text-[11px] font-mono text-slate-600">GITHUB INTEGRATION</span>
        </div>

        <h1 className="text-3xl font-semibold text-white tracking-tight">Connect GitHub</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-lg">
          Connect your GitHub account or explore public repositories. Selected repos will be analyzed by the AI engine.
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
            <div className="h-20 rounded-xl dm-skeleton" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-36 rounded-xl dm-skeleton" />
              ))}
            </div>
          </div>
        ) : !user ? (
          /* ── Disconnected state ────────────────────────── */
          <div className="mt-10 space-y-8">
            <div className="glass-panel p-10 text-center max-w-lg mx-auto relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none" />

              <div className="relative">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-[#101827] border border-[#1e2d4a] flex items-center justify-center mb-6 relative">
                  <GitHubIcon className="w-8 h-8 text-white" />
                  <div className="absolute inset-0 rounded-2xl bg-cyan-400/10 animate-pulse" />
                </div>

                <h2 className="text-xl font-semibold text-white">Connect Your GitHub Account</h2>
                <p className="mt-3 text-sm text-slate-400 max-w-sm mx-auto">
                  Click below to log in with any GitHub account and immediately view your repositories.
                </p>

                <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    One-click login
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Public & Private
                  </span>
                </div>

                <button
                  onClick={() => void handleAuthorize()}
                  className="btn-primary mt-8 w-full !py-3.5 text-base shadow-lg shadow-cyan-500/10"
                  disabled={connecting}
                >
                  {connecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border-2 border-slate-950/40 border-t-slate-950"
                        style={{ animation: 'dm-spin 0.6s linear infinite' }}
                      />
                      Opening GitHub Login...
                    </span>
                  ) : (
                    <>
                      <GitHubIcon className="w-5 h-5 mr-2" />
                      <span>Connect with GitHub</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Public Repo Explorer */}
            <div className="glass-panel p-6 max-w-lg mx-auto">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-white">Explore Any Public Repositories</h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Want to analyze a public user without logging in? Enter any GitHub username below:
              </p>
              <form onSubmit={(e) => void handleSearchPublic(e)} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. facebook, vercel, octocat..."
                  value={publicUsername}
                  onChange={(e) => setPublicUsername(e.target.value)}
                  className="input flex-1 !py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={searchingPublic || !publicUsername.trim()}
                  className="btn-secondary !py-2 !px-4 !text-xs shrink-0"
                >
                  {searchingPublic ? 'Fetching...' : 'Fetch Repos'}
                </button>
              </form>
            </div>

            {/* Public search results */}
            {publicRepos.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Public Repositories for @{publicUsername} ({publicRepos.length})
                  </h3>
                  <input
                    type="text"
                    placeholder="Filter repos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input !py-1 !px-3 text-xs w-48"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredRepos.map((repo, idx) => (
                    <RepoCard
                      key={repo.full_name}
                      repo={repo}
                      busy={busyRepo === repo.full_name}
                      onSelect={() => void handleSelectRepo(repo)}
                      delay={idx * 50}
                      langColor={LANG_COLORS[repo.language || ''] || '#5a6a8a'}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Connected state (Shows the logged-in user) ─────────────────── */
          <div className="mt-10 space-y-8">
            {/* User status card */}
            <div className="glass-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-cyan-500/20">
              <div className="flex items-center gap-4">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-500/40 shadow-sm shrink-0"
                    style={{ width: '48px', height: '48px', minWidth: '48px', minHeight: '48px' }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg shrink-0" style={{ width: '48px', height: '48px' }}>
                    {user.login[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-white">{user.name || user.login}</span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected
                    </span>
                  </div>
                  <a
                    href={user.html_url || `https://github.com/${user.login}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-400 hover:text-cyan-400 transition-colors font-mono"
                  >
                    @{user.login}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-mono">{repos.length} repositories</span>
                <button
                  onClick={() => void handleAuthorize()}
                  className="btn-secondary !py-2 !px-4 !text-xs"
                >
                  Switch Account
                </button>
                <button
                  onClick={handleDisconnect}
                  className="btn-danger !py-2 !px-3 !text-xs"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {/* Repository explorer */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-sm font-semibold text-white">Select a Repository</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Choose a repo from @{user.login} to create a project and start AI analysis.</p>
                </div>
                {repos.length > 0 && (
                  <div className="relative">
                    <svg className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search repos..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input pl-9 pr-4 !py-1.5 text-xs w-full sm:w-56"
                    />
                  </div>
                )}
              </div>

              {filteredRepos.length === 0 ? (
                <div className="glass-panel p-8 text-center">
                  <p className="text-sm text-slate-500">
                    {repos.length === 0 ? 'No repositories found in this account.' : 'No matching repositories.'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredRepos.map((repo, idx) => (
                    <RepoCard
                      key={repo.full_name}
                      repo={repo}
                      busy={busyRepo === repo.full_name}
                      onSelect={() => void handleSelectRepo(repo)}
                      delay={idx * 50}
                      langColor={LANG_COLORS[repo.language || ''] || '#5a6a8a'}
                    />
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

function RepoCard({
  repo,
  busy,
  onSelect,
  delay,
  langColor,
}: {
  repo: GitHubRepo;
  busy: boolean;
  onSelect: () => void;
  delay: number;
  langColor: string;
}) {
  return (
    <div
      className="card p-4 group relative overflow-hidden"
      style={{ animation: `dm-enter 0.3s ${delay}ms var(--ease-out) both` }}
    >
      {/* Gradient glow on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-3">
          {/* Language dot */}
          <div
            className="w-3 h-3 rounded-full shrink-0 mt-1.5"
            style={{ backgroundColor: langColor || '#5a6a8a' }}
            title={repo.language || 'Unknown'}
          />
          <div className="min-w-0">
            <h3 className="font-medium text-white text-sm truncate group-hover:text-cyan-300 transition-colors">
              {repo.name}
            </h3>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">{repo.full_name}</p>
          </div>
        </div>
        {repo.private ? (
          <span className="badge badge-amber text-[10px] shrink-0">Private</span>
        ) : (
          <span className="badge badge-slate text-[10px] shrink-0">Public</span>
        )}
      </div>

      <p className="relative mt-2 text-xs text-slate-400 line-clamp-2">{repo.description || 'No description.'}</p>

      <div className="relative mt-4 flex items-center justify-between pt-3 border-t border-[#1e2d4a]/40">
        <div className="flex items-center gap-3 text-[11px] text-slate-600 font-mono">
          <span>{repo.stargazers_count ?? 0}★</span>
          <span>{repo.forks_count ?? 0} forks</span>
        </div>
        <button
          disabled={busy}
          onClick={onSelect}
          className="btn-accent !py-1.5 !px-4 !text-xs !rounded-lg disabled:opacity-50"
        >
          {busy ? (
            <span className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full border-2 border-slate-950/40 border-t-white"
                style={{ animation: 'dm-spin 0.6s linear infinite' }}
              />
              Creating...
            </span>
          ) : 'Select'}
        </button>
      </div>
    </div>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
