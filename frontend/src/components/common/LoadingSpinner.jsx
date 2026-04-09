export function LoadingSpinner({ label = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center gap-3 text-slate-300">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-brand" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
