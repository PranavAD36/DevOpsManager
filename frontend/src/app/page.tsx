'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Project } from '../lib/api';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects()
      .then(setProjects)
      .catch((requestError) => {
        const message = requestError instanceof Error ? requestError.message : 'Unable to load projects.';
        if (message.includes('401') || message.includes('Not authenticated')) {
          setError(null);
        } else {
          setError(message);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const activeProjects = projects.filter((p) => p.status === 'active');
  const recentProjects = [...projects].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  ).slice(0, 4);

  return (
    <main className="relative dm-enter pb-16">
      {/* Ambient orbs */}
      <div className="orb orb--blue w-[600px] h-[600px] -top-48 -left-48" />
      <div className="orb orb--violet w-[400px] h-[400px] top-32 right-0" />
      <div className="orb orb--emerald w-[300px] h-[300px] bottom-0 left-1/3" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">

        {/* ── Hero / Status bar ─────────────────────────────── */}
        <section className="mt-8 mb-12">
          <div className="glass-panel p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40 animate-ping" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                  <span className="dm-kicker">System Online</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  Welcome back.
                </h1>
                <p className="mt-1.5 text-sm text-slate-400 max-w-lg">
                  Connect your GitHub workspace and let the AI engine analyze your repositories for issues, improvements, and recommendations.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link href="/github/connect" className="btn-primary !py-2.5 !px-5">
                  <GitHubIcon className="w-4 h-4" />
                  <span className="ml-2">Connect GitHub</span>
                </Link>
                <Link href="/projects" className="btn-secondary !py-2.5 !px-4 !text-sm">
                  View Projects
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats Row ─────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10" aria-label="System stats">
          <StatCard
            label="Projects"
            value={loading ? null : String(projects.length)}
            icon={<FolderIcon className="w-5 h-5 text-cyan-400" />}
          />
          <StatCard
            label="Active"
            value={loading ? null : String(activeProjects.length)}
            icon={<ActivityIcon className="w-5 h-5 text-emerald-400" />}
          />
          <StatCard
            label="Repositories"
            value={loading ? null : '—'}
            icon={<RepoIcon className="w-5 h-5 text-violet-400" />}
          />
          <StatCard
            label="Issues Found"
            value={loading ? null : '—'}
            icon={<BugIcon className="w-5 h-5 text-rose-400" />}
          />
        </section>

        {/* ── Recent Projects ───────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Recent Projects</h2>
              <p className="text-sm text-slate-500 mt-0.5">Your connected repositories and analysis</p>
            </div>
            <Link href="/projects" className="btn-text">
              All projects
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 mb-5" role="alert">
              {error}
            </div>
          )}

          {loading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-36 rounded-xl dm-skeleton" />
              ))}
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div className="glass-panel p-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-[#101827] border border-[#1e2d4a] flex items-center justify-center mb-5">
                <FolderIcon className="w-7 h-7 text-slate-500" />
              </div>
              <p className="font-medium text-white">No projects yet</p>
              <p className="mt-1.5 text-sm text-slate-500 max-w-sm mx-auto">
                Connect a GitHub repository to create your first project and start AI-powered analysis.
              </p>
              <Link href="/github/connect" className="btn-primary mt-6 !py-2.5 !px-6">
                <GitHubIcon className="w-4 h-4" />
                <span className="ml-2">Connect GitHub</span>
              </Link>
            </div>
          )}

          {!loading && recentProjects.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>

        {/* ── Quick Actions ─────────────────────────────────── */}
        {!loading && projects.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-white mb-5">Quick Actions</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <QuickActionCard
                href="/github/connect"
                icon={<GitHubIcon className="w-5 h-5" />}
                title="Connect Repository"
                desc="Link a new GitHub repo"
              />
              <QuickActionCard
                href="/projects"
                icon={<FolderIcon className="w-5 h-5" />}
                title="New Project"
                desc="Create a project workspace"
              />
              <QuickActionCard
                href="/projects"
                icon={<AnalysisIcon className="w-5 h-5" />}
                title="Run Analysis"
                desc="AI-powered code review"
              />
              <QuickActionCard
                href="https://github.com"
                icon={<ExternalIcon className="w-5 h-5" />}
                title="GitHub Dashboard"
                desc="Open GitHub.com"
                external
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function StatCard({ label, value, icon }: { label: string; value: string | null; icon: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{value ?? '—'}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-[#101827] border border-[#1e2d4a] flex items-center justify-center">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="card p-5 block group">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/15 to-violet-500/15 border border-cyan-500/20 flex items-center justify-center group-hover:border-cyan-400/40 transition-colors">
          <FolderIcon className="w-4 h-4 text-cyan-400" />
        </div>
        <span className={`badge ${project.status === 'active' ? 'badge-emerald' : 'badge-slate'}`}>
          {project.status}
        </span>
      </div>
      <h3 className="font-semibold text-white text-sm truncate group-hover:text-cyan-300 transition-colors">
        {project.name}
      </h3>
      {project.description && (
        <p className="mt-1 text-xs text-slate-500 line-clamp-2">{project.description}</p>
      )}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11px] text-slate-600 font-mono">
          {new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

function QuickActionCard({
  href, icon, title, desc, external
}: {
  href: string; icon: React.ReactNode; title: string; desc: string; external?: boolean;
}) {
  const el = external ? 'a' : 'div';
  const props = external
    ? { href, target: '_blank', rel: 'noreferrer' }
    : { as: Link, href };
  return (
    <Link
      href={href as any}
      className="card p-5 block group cursor-pointer"
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      <div className="w-10 h-10 rounded-xl bg-[#101827] border border-[#1e2d4a] flex items-center justify-center mb-3 group-hover:border-cyan-500/30 transition-colors text-cyan-400">
        {icon}
      </div>
      <p className="font-medium text-white text-sm">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
    </Link>
  );
}

/* ── Icons ───────────────────────────────────────────────── */

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function RepoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function BugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AnalysisIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21V3.104z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
