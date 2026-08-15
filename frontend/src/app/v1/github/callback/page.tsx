'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function GitHubV1CallbackPage() {
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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin mb-4" />
        <h1 className="text-xl font-semibold text-white">Completing GitHub Authorization...</h1>
        <p className="mt-2 text-sm text-slate-400">Please wait while DevOpsManager verifies your credentials.</p>
      </div>
    </main>
  );
}
