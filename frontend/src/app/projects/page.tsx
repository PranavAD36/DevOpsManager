'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

import { api, type Project } from '../../lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProjects() {
    try {
      setProjects(await api.listProjects());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProjects(); }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createProject({ name, description: description || undefined });
      setName('');
      setDescription('');
      await loadProjects();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">DevOpsManager</p><h1 className="mt-3 text-4xl font-semibold text-white">Projects</h1><p className="mt-2 text-slate-400">Organize repositories, analysis runs, and engineering issues.</p></div>
          <Link className="text-sm text-cyan-400 hover:text-cyan-300" href="/">Back to home</Link>
        </header>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-4"><h2 className="text-lg font-semibold text-white">Your projects</h2>{loading && <p className="text-slate-400">Loading projects...</p>}{!loading && projects.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-8 text-slate-400">No projects yet. Create the first one.</p>}{projects.map((project) => <Link className="block rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-cyan-400/60" href={`/projects/${project.id}`} key={project.id}><div className="flex items-start justify-between gap-4"><h3 className="font-semibold text-white">{project.name}</h3><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300">{project.status}</span></div><p className="mt-2 text-sm text-slate-400">{project.description || 'No description provided.'}</p></Link>)}</section>
          <section className="h-fit rounded-xl border border-slate-800 bg-slate-900/70 p-6"><h2 className="text-lg font-semibold text-white">Create project</h2><form className="mt-5 space-y-4" onSubmit={handleSubmit}><label className="block text-sm text-slate-300">Name<input className="form-input" required value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block text-sm text-slate-300">Description<textarea className="form-input min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} /></label><button className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60" disabled={saving} type="submit">{saving ? 'Creating...' : 'Create project'}</button></form>{error && <p className="mt-4 text-sm text-rose-400" role="alert">{error}</p>}</section>
        </div>
      </div>
    </main>
  );
}
