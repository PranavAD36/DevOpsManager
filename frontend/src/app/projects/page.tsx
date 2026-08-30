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
  const [search, setSearch] = useState('');

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

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <main className="relative dm-enter pb-16">
      <div className="orb orb--blue w-[500px] h-[500px] -top-32 -right-32" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">

        {/* Header */}
        <header className="flex items-center justify-between pt-8 pb-8 border-b border-[#1e2d4a]/40 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
              <Link href="/" className="hover:text-slate-300 transition-colors">Dashboard</Link>
              <span>/</span>
              <span className="text-slate-300">Projects</span>
            </div>
            <h1 className="text-2xl font-semibold text-white">Projects</h1>
            <p className="mt-1 text-sm text-slate-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/" className="btn-text">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 mb-5" role="alert">
            {error}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">

          {/* Projects list */}
          <section>
            {/* Search bar */}
            <div className="relative mb-5">
              <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 pr-4 !py-2 text-sm"
              />
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-xl dm-skeleton" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="glass-panel p-10 text-center">
                <p className="text-slate-400 text-sm">No projects found</p>
                <p className="mt-1 text-xs text-slate-600">
                  {search ? 'Try a different search term' : 'Create one from the panel on the right'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((project) => (
                  <Link
                    href={`/projects/${project.id}`}
                    key={project.id}
                    className="card p-4 flex items-center gap-4 group block"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/15 to-violet-500/15 border border-cyan-500/20 flex items-center justify-center shrink-0 group-hover:border-cyan-400/40 transition-colors">
                      <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white text-sm truncate group-hover:text-cyan-300 transition-colors">
                          {project.name}
                        </h3>
                        <span className={`status-dot ${project.status === 'active' ? 'status-dot--online' : 'status-dot--offline'}`} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">{project.description || 'No description'}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Create form */}
          <aside>
            <div className="glass-panel p-5 sticky top-20">
              <h2 className="text-sm font-semibold text-white">Create Project</h2>
              <p className="mt-1 text-xs text-slate-500">Add a new project to organize your repositories.</p>
              <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Name</label>
                  <input
                    className="input !py-2 text-sm"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-project"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
                  <textarea
                    className="input min-h-20 resize-none text-sm"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description..."
                  />
                </div>
                <button
                  className="btn-primary w-full !py-2.5"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-950/40 border-t-slate-950" style={{ animation: 'dm-spin 0.6s linear infinite' }} />
                      Creating...
                    </span>
                  ) : 'Create Project'}
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
