'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-6">
      <div className="text-center max-w-sm">
        <p className="text-xs font-mono text-rose-400/70 uppercase tracking-widest">Error</p>
        <h1 className="mt-3 text-xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500 break-words">{error.message || 'Unknown error'}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
