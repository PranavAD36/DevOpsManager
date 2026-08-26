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
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to load projects.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="relative min-h-[100dvh]">
      {/* Subtle top gradient */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="h-96 bg-gradient-to-b from-cyan-950/20 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12 sm:py-16 lg:px-8">
        {/* Nav */}
        <header className="flex items-center justify-between border-b border-slate-800/60 pb-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 group-hover:bg-cyan-500/20 transition-colors">
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white tracking-wide">DevOpsManager</p>
              <p className="text-[11px] text-slate-500 font-mono">AI Intelligence Layer</p>
            </div>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Main navigation">
            <Link
              className="rounded-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:text-white hover:bg-slate-800/60"
              href="/projects"
            >
              Projects
            </Link>
            <Link
              className="btn-primary !px-4 !py-2"
              href="/github/connect"
            >
              Connect GitHub
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mt-16 grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-xs font-mono text-cyan-400 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-40 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              Live Analysis Engine
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
              Connect code.
              <br />
              <span className="text-cyan-400">Understand change.</span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-slate-400 max-w-lg">
              Manage projects, connect GitHub repositories, synchronize metadata, and run AI-powered analysis from one workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn-primary !px-5 !py-3" href="/github/connect">
                Connect GitHub
              </Link>
              <Link className="btn-secondary !px-5 !py-3" href="/projects">
                View projects
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-5 backdrop-blur-sm">
              <p className="text-3xl font-semibold text-white tabular-nums">{loading ? '—' : projects.length}</p>
              <p className="mt-1.5 text-xs text-slate-500 font-mono uppercase tracking-wider">Projects</p>
            </div>
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-5 backdrop-blur-sm">
              <p className="text-3xl font-semibold text-white tabular-nums">
                {loading ? '—' : projects.reduce((sum, p) => sum + (p.status === 'active' ? 1 : 0), 0)}
              </p>
              <p className="mt-1.5 text-xs text-slate-500 font-mono uppercase tracking-wider">Active</p>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-800/60 bg-slate-900/60 p-5 backdrop-blur-sm">
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">System</p>
              <p className="mt-1.5 text-sm font-medium text-slate-300">Repository metadata &amp; analysis ready</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400/70 font-mono">All systems operational</span>
              </div>
            </div>
          </div>
        </section>

        {/* Recent projects */}
        <section className="mt-16 border-t border-slate-800/60 pt-10" aria-labelledby="projects-heading">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-xl font-semibold text-white" id="projects-heading">Recent projects</h2>
              <p className="mt-1 text-sm text-slate-500">Your connected repositories and analysis</p>
            </div>
            <Link className="text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors" href="/projects">
              All projects →
            </Link>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300" role="alert">
              {error}
            </div>
          )}

          {loading && (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 rounded-xl border border-slate-800/60 bg-slate-900/40 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700/60 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <p className="font-medium text-slate-300">No projects yet</p>
              <p className="mt-1.5 text-sm text-slate-500 max-w-sm mx-auto">
                Connect a GitHub repository to create your first project and start AI-powered analysis.
              </p>
              <Link className="mt-5 inline-flex btn-primary" href="/github/connect">
                Connect GitHub →
              </Link>
            </div>
          )}

          {!loading && projects.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {projects.slice(0, 4).map((project) => (
                <Link
                  className="card card-hover rounded-xl p-5 block"
                  href={`/projects/${project.id}`}
                  key={project.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-white text-sm">{project.name}</h3>
                    <span className={
                      project.status === 'active'
                        ? 'tag bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'tag bg-slate-800 text-slate-400 border border-slate-700'
                    }>
                      {project.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500 line-clamp-2">{project.description || 'No description.'}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[11px] text-slate-600 font-mono">
                      {new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-xs text-cyan-400/70 group-hover:text-cyan-400 transition-colors">Open →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
