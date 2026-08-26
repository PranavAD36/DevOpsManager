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
    <main className="relative min-h-[100dvh]">
      <div className="mx-auto max-w-6xl px-6 py-12 lg:px-8">
        {/* Nav */}
        <header className="flex items-center justify-between border-b border-slate-800/60 pb-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 group-hover:bg-cyan-500/20 transition-colors">
                <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-white">DevOpsManager</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1 text-sm" aria-label="Breadcrumb">
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 font-medium">Projects</span>
            </nav>
          </div>
          <Link className="text-sm text-slate-400 hover:text-white transition-colors" href="/">
            ← Back
          </Link>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
          {/* Projects list */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-white">Projects</h1>
                <p className="mt-1 text-sm text-slate-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 mb-4" role="alert">
                {error}
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-xl border border-slate-800/60 bg-slate-900/40 animate-pulse" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700/60 bg-slate-900/30 p-10 text-center">
                <p className="text-slate-400 text-sm">No projects yet</p>
                <p className="mt-1 text-xs text-slate-600">Create one from the panel on the right</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <Link
                    className="flex items-center gap-4 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 transition-all hover:border-slate-700 hover:bg-slate-800/50 block"
                    href={`/projects/${project.id}`}
                    key={project.id}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white text-sm truncate">{project.name}</h3>
                        <span className={
                          project.status === 'active'
                            ? 'h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0'
                            : 'h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0'
                        } />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">{project.description || 'No description'}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Create form */}
          <aside className="h-fit">
            <div className="sticky top-6 rounded-xl border border-slate-800/60 bg-slate-900/60 backdrop-blur-sm p-5">
              <h2 className="text-sm font-semibold text-white">Create project</h2>
              <p className="mt-1 text-xs text-slate-500">Add a new project to organize your repositories.</p>
              <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Name</label>
                  <input
                    className="form-input"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-project"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
                  <textarea
                    className="form-input min-h-20 resize-none"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description…"
                  />
                </div>
                <button
                  className="btn-primary w-full"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border-2 border-slate-950/40 border-t-slate-950 animate-spin" />
                      Creating…
                    </span>
                  ) : 'Create project'}
                </button>
              </form>
              {error && <p className="mt-3 text-xs text-rose-400" role="alert">{error}</p>}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
