'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '../lib/api';

export default function Nav() {
  const pathname = usePathname();
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [githubUser, setGithubUser] = useState<string | null>(null);

  useEffect(() => {
    api.getGithubConnection()
      .then((data) => {
        setGithubConnected(data.connected);
        setGithubUser(data.username);
      })
      .catch(() => {
        setGithubConnected(false);
      });
  }, []);

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 dm-enter">
      {/* Top accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

      <nav className="border-b border-[#1e2d4a]/60 bg-[#060913]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-0">
          <div className="flex h-14 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/20 group-hover:border-cyan-400/40 transition-colors">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <div className="absolute inset-0 rounded-lg bg-cyan-400/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white tracking-wide leading-none">DevOpsManager</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">AI Intelligence Layer</p>
              </div>
            </Link>

            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-1">
              <NavLink href="/" active={isActive('/')} label="Dashboard" />
              <NavLink href="/projects" active={isActive('/projects')} label="Projects" />
              <NavLink href="/github/connect" active={isActive('/github')} label="GitHub" />
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* GitHub status */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1e2d4a] bg-[#0c111e]/60">
                <span className={`status-dot ${githubConnected ? 'status-dot--online' : 'status-dot--offline'}`} />
                <span className="text-xs text-slate-400 hidden md:inline">
                  {githubConnected ? githubUser || 'GitHub' : 'Not connected'}
                </span>
              </div>

              {/* Mobile menu button */}
              <MobileNav />

              {/* CTA button */}
              <Link href="/github/connect" className="hidden sm:inline-flex btn-primary !px-3 !py-1.5 !text-xs !font-medium">
                <GitHubIcon className="w-3.5 h-3.5" />
                <span className="ml-1.5">Connect</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href as any}
      className={`relative px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
        active ? 'text-white' : 'text-slate-400 hover:text-white'
      }`}
    >
      {active && (
        <div className="absolute inset-0 rounded-lg bg-white/5 border border-white/10" />
      )}
      <span className="relative">{label}</span>
    </Link>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="sm:hidden">
      <button
        type="button"
        className="btn-icon"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
      {open && (
        <div className="absolute right-6 top-14 glass-panel p-2 min-w-[160px] dm-enter">
          <MobileNavLink href="/" label="Dashboard" onClick={() => setOpen(false)} />
          <MobileNavLink href="/projects" label="Projects" onClick={() => setOpen(false)} />
          <MobileNavLink href="/github/connect" label="GitHub" onClick={() => setOpen(false)} />
          <div className="mt-2 pt-2 border-t border-[#1e2d4a]">
            <Link href="/github/connect" className="btn-primary w-full !py-2 !text-xs" onClick={() => setOpen(false)}>
              Connect GitHub
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileNavLink({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href as any}
      className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? 'text-white bg-white/5' : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
      onClick={onClick}
    >
      {label}
    </Link>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
