export default function ReportQueueFilters({
  reportSearch,
  reportFilter,
  reportWorkflowFilter,
  reportSort,
  visibleReportsCount,
  openIncidents,
  assignedIncidents,
  onReportSearchChange,
  onReportFilterChange,
  onReportWorkflowFilterChange,
  onReportSortChange,
  onRefreshQueue
}) {
  return (
    <section className="detail-card p-4 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Incident directory</p>
            <p className="mt-2 text-sm text-slate-400">Search, filter, and sort the queue first. Then open one incident below for the full report history and actions.</p>
          </div>

          <input
            value={reportSearch}
            onChange={(event) => onReportSearchChange(event.target.value)}
            className="input-base"
            placeholder="Search by title, author, reason"
          />

          <div className="grid gap-3 md:grid-cols-3">
            <select value={reportFilter} onChange={(event) => onReportFilterChange(event.target.value)} className="input-base">
              <option value="all">All incidents</option>
              <option value="critical">Critical (100+ reports)</option>
              <option value="high">High volume (25+ reports)</option>
              <option value="fresh">Updated in 24h</option>
              <option value="story">Stories only</option>
              <option value="artwork">Artworks only</option>
            </select>

            <select value={reportWorkflowFilter} onChange={(event) => onReportWorkflowFilterChange(event.target.value)} className="input-base">
              <option value="all">All workflow states</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
            </select>

            <select value={reportSort} onChange={(event) => onReportSortChange(event.target.value)} className="input-base">
              <option value="priority">Sort by priority</option>
              <option value="latest">Sort by latest activity</option>
              <option value="volume">Sort by report volume</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3.5 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Visible now</p>
            <p className="mt-2 text-2xl font-semibold text-white">{visibleReportsCount}</p>
            <p className="mt-1 text-slate-400">Open {openIncidents} · Assigned {assignedIncidents}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3.5 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Assignment rule</p>
            <p className="mt-2 text-2xl font-semibold text-white">1 admin</p>
            <p className="mt-1 text-slate-400">Locked incidents stay with the current reviewer until they switch away.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3.5 text-sm text-slate-300 sm:col-span-2 xl:col-span-2">
            <p className="font-medium text-white">Review flow</p>
            <p className="mt-1 text-slate-400">One post stays one incident. Open means waiting for review. Assigned means a moderator is actively reviewing it.</p>
          </div>
          <button type="button" onClick={onRefreshQueue} className="detail-inline-button w-full px-4 py-3 text-sm sm:col-span-2 xl:col-span-2">
            Refresh Queue
          </button>
        </div>
      </div>
    </section>
  );
}