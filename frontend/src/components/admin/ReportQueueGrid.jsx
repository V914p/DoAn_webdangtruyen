import { formatRelative } from '../../utils/helpers';
import {
  formatReasonLabel,
  formatWorkflowLabel,
  getReportSeverity,
  getReportSeverityLabel,
  getReportSeverityTone,
  getWorkflowTone,
  isIncidentLockedByAnotherAdmin
} from './moderationHelpers';

function StatusPill({ children, tone = 'neutral' }) {
  const toneClass = {
    neutral: 'border-slate-700 text-slate-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }[tone];

  return <span className={`rounded-full border px-3 py-1 text-xs ${toneClass}`}>{children}</span>;
}

export default function ReportQueueGrid({
  reports,
  selectedReportId,
  currentUserId,
  activeReportPage,
  totalReportPages,
  totalItems,
  pageSize,
  onSelectReport,
  onPreviousPage,
  onNextPage
}) {
  return (
    <section className="detail-card p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Queue page</p>
          <p className="mt-2 text-sm text-slate-400">Select an incident card to inspect the post and take action.</p>
        </div>
        <div className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1.5 text-xs text-slate-400">
          Page {activeReportPage} of {totalReportPages}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {reports.length ? (
          reports.map((report) => {
            const content = report.contentId;
            const severity = getReportSeverity(report.reportCount);
            const isSelected = selectedReportId === report._id;
            const lockedByAnotherAdmin = isIncidentLockedByAnotherAdmin(report, currentUserId);
            const assignedToCurrentAdmin = report.workflow?.assignedTo && String(report.workflow.assignedTo._id) === String(currentUserId);

            return (
              <button
                key={report._id}
                type="button"
                onClick={() => onSelectReport(report)}
                className={`w-full rounded-3xl border p-3.5 text-left transition ${
                  isSelected
                    ? 'border-brand/40 bg-brand/10 shadow-[0_18px_50px_rgba(124,58,237,0.12)]'
                    : lockedByAnotherAdmin
                      ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-400/40'
                      : 'border-slate-800 bg-slate-900/75 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{report.contentType}</p>
                    <h3 className="mt-2 truncate text-base font-semibold text-white">{content?.title || 'Missing content'}</h3>
                    <p className="mt-2 text-sm text-slate-400">
                      @{content?.author?.username || 'unknown'} · Latest {formatRelative(report.latestReportAt)}
                    </p>
                  </div>
                  <StatusPill tone={getReportSeverityTone(severity)}>{getReportSeverityLabel(severity)}</StatusPill>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200">
                    {report.reportCount} reports
                  </span>
                  <StatusPill tone={getWorkflowTone(report.workflow?.status || 'open')}>
                    {formatWorkflowLabel(report.workflow?.status || 'open')}
                  </StatusPill>
                  {lockedByAnotherAdmin ? <StatusPill tone="danger">Locked</StatusPill> : null}
                  {report.reasonSummary?.slice(0, 2).map((item) => (
                    <span key={item.reason} className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-xs text-slate-300">
                      {formatReasonLabel(item.reason)} · {item.count}
                    </span>
                  ))}
                </div>

                {lockedByAnotherAdmin ? (
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-rose-300">
                    Being reviewed by @{report.workflow.assignedTo.username}
                  </p>
                ) : assignedToCurrentAdmin ? (
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-brand-light">
                    Assigned to you
                  </p>
                ) : report.workflow?.assignedTo ? (
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                    Assigned to @{report.workflow.assignedTo.username}
                  </p>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="detail-subcard md:col-span-2 2xl:col-span-3">
            <p className="font-medium text-white">No incidents match these filters</p>
            <p className="mt-2 text-sm text-slate-400">Try clearing the search or switching back to all incidents.</p>
          </div>
        )}
      </div>

      {totalItems > pageSize ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
          <span>
            Page {activeReportPage} of {totalReportPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={activeReportPage === 1}
              onClick={onPreviousPage}
              className="detail-inline-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={activeReportPage === totalReportPages}
              onClick={onNextPage}
              className="detail-inline-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}