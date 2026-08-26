'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function GitHubCallbackPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDesc = searchParams.get('error_description');

    const backendUrl = new URL('http://localhost:8000/v1/github/callback');
    if (code) backendUrl.searchParams.set('code', code);
    if (state) backendUrl.searchParams.set('state', state);
    if (error) backendUrl.searchParams.set('error', error);
    if (errorDesc) backendUrl.searchParams.set('error_description', errorDesc);

    window.location.href = backendUrl.toString();
  }, [searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-6">
      <div className="text-center">
        <div className="mx-auto w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mb-4" />
        <p className="text-sm font-medium text-white">Completing authorization…</p>
        <p className="mt-1 text-xs text-slate-500 font-mono">Redirecting to backend</p>
      </div>
    </main>
  );
}
