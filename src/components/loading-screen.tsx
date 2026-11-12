export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8">
      <div className="card flex items-center gap-3 px-5 py-4 text-sm text-slate-600">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" aria-hidden />
        {label}
      </div>
    </div>
  );
}
