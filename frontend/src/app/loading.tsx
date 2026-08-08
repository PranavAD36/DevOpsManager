export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <div className="flex flex-col items-center space-y-4 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-indigo-500" />
        <p className="text-sm font-medium tracking-wide text-slate-400">
          Loading DevOpsManager...
        </p>
      </div>
    </div>
  );
}
