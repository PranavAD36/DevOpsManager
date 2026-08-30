'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060913] px-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-950/30 border border-rose-900/30 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-xs font-mono text-rose-400/70 uppercase tracking-widest">Error</p>
        <h1 className="mt-3 text-xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500 break-words">{error.message || 'Unknown error'}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 btn-secondary !py-2.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          Try again
        </button>
      </div>
    </main>
  );
}
