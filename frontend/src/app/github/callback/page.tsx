'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '../../../lib/constants';

export default function GitHubCallbackPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDesc = searchParams.get('error_description');

    const backendUrl = new URL('/v1/github/callback', API_BASE_URL);
    if (code) backendUrl.searchParams.set('code', code);
    if (state) backendUrl.searchParams.set('state', state);
    if (error) backendUrl.searchParams.set('error', error);
    if (errorDesc) backendUrl.searchParams.set('error_description', errorDesc);

    window.location.href = backendUrl.toString();
  }, [searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060913] px-6">
      <div className="text-center">
        <div className="relative mx-auto w-14 h-14 mb-5">
          <div
            className="absolute inset-0 rounded-full border-2 border-[#1e2d4a] border-t-cyan-400"
            style={{ animation: 'dm-spin 0.8s linear infinite' }}
          />
          <div
            className="absolute inset-2 rounded-full border-2 border-[#1e2d4a] border-t-violet-400"
            style={{ animation: 'dm-spin 1.2s linear infinite reverse' }}
          />
        </div>
        <p className="text-sm font-medium text-white">Completing GitHub authorization...</p>
        <p className="mt-1 text-xs text-slate-500 font-mono">Redirecting to backend</p>
      </div>
    </main>
  );
}
