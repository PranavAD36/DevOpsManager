export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060913]">
      <div className="text-center">
        <div
          className="w-8 h-8 rounded-full border-2 border-[#1e2d4a] border-t-cyan-400 mx-auto mb-4"
          style={{ animation: 'dm-spin 0.6s linear infinite' }}
        />
        <p className="text-xs font-mono text-slate-500">Loading...</p>
      </div>
    </main>
  );
}
