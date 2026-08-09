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
    <main className="min-h-screen px-6 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-800 pb-8">
          <Link className="group" href="/">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-400">DevOpsManager</p>
            <p className="mt-1 text-sm text-slate-500">Repository intelligence workspace</p>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-2 text-sm">
            <Link className="rounded-lg px-4 py-2 text-slate-300 transition hover:bg-slate-800 hover:text-white" href="/projects">Projects</Link>
            <Link className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-300" href="/github/connect">Connect GitHub</Link>
          </nav>
        </header>

        <section className="grid gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">Engineering control plane</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">Connect code, understand change, move with confidence.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">Manage projects, connect GitHub repositories, synchronize metadata, and prepare analysis runs from one focused workspace.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link className="rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300" href="/github/connect">Connect GitHub</Link><Link className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300" href="/projects">View projects</Link></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5"><p className="text-3xl font-semibold text-white">{loading ? '—' : projects.length}</p><p className="mt-2 text-sm text-slate-400">Active projects</p></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-3xl font-semibold text-white">API</p><p className="mt-2 text-sm text-slate-400">Async foundation</p></div>
            <div className="col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Current focus</p><p className="mt-2 text-xl font-medium text-slate-200">Repository metadata and analysis readiness</p></div>
          </div>
        </section>

        <section className="border-t border-slate-800 pt-8" aria-labelledby="projects-heading">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.22em] text-slate-500">Workspace</p><h2 className="mt-2 text-2xl font-semibold text-white" id="projects-heading">Recent projects</h2></div><Link className="text-sm text-cyan-400 hover:text-cyan-300" href="/projects">See all projects →</Link></div>
          {error && <p className="mt-6 rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-sm text-rose-300" role="alert">{error}</p>}
          {loading && <p className="mt-6 text-slate-400">Loading projects...</p>}
          {!loading && !error && projects.length === 0 && <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-8"><p className="font-medium text-slate-200">Connect a GitHub repository to create your first project.</p><p className="mt-2 text-sm text-slate-400">Each selected repository becomes the source of truth for one DevOpsManager project.</p><Link className="mt-5 inline-block text-sm text-cyan-400 hover:text-cyan-300" href="/github/connect">Connect GitHub →</Link></div>}
          {!loading && projects.length > 0 && <div className="mt-6 grid gap-4 md:grid-cols-2">{projects.slice(0, 4).map((project) => <Link className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition hover:-translate-y-0.5 hover:border-cyan-400/60" href={`/projects/${project.id}`} key={project.id}><div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-white">{project.name}</h3><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300">{project.status}</span></div><p className="mt-3 line-clamp-2 text-sm text-slate-400">{project.description || 'No description provided.'}</p><p className="mt-5 text-sm text-cyan-400">Open project →</p></Link>)}</div>}
        </section>
      </div>
    </main>
  );
}
