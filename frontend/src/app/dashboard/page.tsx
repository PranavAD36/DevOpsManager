'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '../../lib/auth-context';
import { API_BASE_URL } from '../../lib/constants';

export default function DashboardPage() {
  const router = useRouter();
  const { user, session, loading, signOut } = useAuth();
  const [backendUser, setBackendUser] = useState<{ id: string; email: string | null; display_name: string | null } | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);

  useEffect(() => {
    if (!session) return;
    let active = true;

    fetch(`${API_BASE_URL}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to verify the backend session.');
        return response.json();
      })
      .then((data) => {
        if (active) setBackendUser(data);
      })
      .catch((requestError: Error) => {
        if (active) setBackendError(requestError.message);
      });

    return () => {
      active = false;
    };
  }, [session]);

  if (loading || !user) return <main className="flex min-h-screen items-center justify-center text-slate-400">Loading session...</main>;

  const displayName = backendUser?.display_name || user.user_metadata?.display_name || 'Not provided';

  return (
    <main className="min-h-screen px-6 py-12">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8">
        <div className="flex items-start justify-between gap-6">
          <div><p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">Authenticated</p><h1 className="mt-3 text-3xl font-semibold text-white">Your workspace</h1></div>
          <button className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400 hover:text-cyan-300" onClick={async () => { await signOut(); router.replace('/login'); }}>Log out</button>
        </div>
        <dl className="mt-8 grid gap-5 sm:grid-cols-3"><div><dt className="text-xs uppercase tracking-wider text-slate-500">Email</dt><dd className="mt-1 break-all text-slate-200">{backendUser?.email || user.email}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Display name</dt><dd className="mt-1 text-slate-200">{displayName}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">User ID</dt><dd className="mt-1 break-all text-slate-200">{backendUser?.id || user.id}</dd></div></dl>
        {backendError && <p className="mt-6 text-sm text-amber-400" role="alert">{backendError}</p>}
      </section>
    </main>
  );
}
