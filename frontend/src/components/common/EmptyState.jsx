export function EmptyState({ title, description }) {
  return (
    <div className="panel flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-lg font-semibold text-white">{title}</div>
      <p className="max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}
