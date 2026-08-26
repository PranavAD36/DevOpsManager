export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-6">
      <div className="text-center">
        <div className="mx-auto w-8 h-8 rounded-full border-2 border-slate-700 border-t-cyan-500 animate-spin mb-4" />
        <p className="text-xs font-mono text-slate-500">Loading…</p>
      </div>
    </main>
  );
}
