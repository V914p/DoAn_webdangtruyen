import { Link } from 'react-router-dom';
import { formatRelative } from '../../utils/helpers';
import {
  formatReasonLabel,
  formatReportRange,
  formatWorkflowLabel,
  getAvatarUrl,
  getContentLink,
  getReportSeverity,
  getReportSeverityTone,
  getWorkflowTone
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

export default function IncidentDetailPanel({
  report,
  details,
  processingId,
  onClose,
  onRefreshLog,
  onRequestLogPage,
  onDismiss,
  onBan
}) {
  const contentLink = getContentLink(report);
  const severity = getReportSeverity(report.reportCount);

  return (
    <article className="detail-card p-5 sm:p-6">
      <div className="flex flex-col gap-5 2xl:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="border-b border-slate-800 pb-4">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase">
              <StatusPill>{report.contentType}</StatusPill>
              <StatusPill tone={getReportSeverityTone(severity)}>{report.reportCount} reports</StatusPill>
              <span className="text-slate-500">Latest report {formatRelative(report.latestReportAt)}</span>
            </div>

            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {report.contentId?.title || 'Missing content'}
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                  {report.contentId?.description || (report.contentId?.content ? String(report.contentId.content).slice(0, 320) : 'No preview available')}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={processingId === `report-release-${report._id}`}
                  onClick={onClose}
                  className="detail-inline-button px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingId === `report-release-${report._id}` ? 'Closing...' : 'Close Panel'}
                </button>
                {contentLink ? (
                  <Link to={contentLink} className="detail-inline-button px-4 py-3 text-sm">
                    Open Content
                  </Link>
                ) : null}
                <button type="button" onClick={onRefreshLog} className="detail-inline-button px-4 py-3 text-sm">
                  Refresh Log
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="detail-subcard">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Incident snapshot</p>
              <p className="mt-3 text-sm font-medium text-white">Author: @{report.contentId?.author?.username || 'Unknown user'}</p>
              <p className="mt-2 text-sm text-slate-300">Current status: {report.contentId?.status || 'Unavailable'}</p>
              <p className="mt-2 text-sm text-slate-400">
                Priority score is driven by report volume and how recently the latest report arrived.
              </p>
            </div>

            <div className="detail-subcard">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reason distribution</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(details?.reasonSummary || report.reasonSummary || []).map((item) => (
                  <span key={item.reason} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    {formatReasonLabel(item.reason)} · {item.count}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-400">
                Use this mix to distinguish coordinated spam waves from a smaller set of legitimate abuse complaints.
              </p>
            </div>
          </div>

          <div className="detail-subcard">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Incident workflow</p>
                <p className="mt-2 text-sm text-slate-400">Workflow is automatic: opening this incident assigns it to you, and opening another incident returns this one to open.</p>
              </div>
              <StatusPill tone={getWorkflowTone(report.workflow?.status || 'open')}>
                {formatWorkflowLabel(report.workflow?.status || 'open')}
              </StatusPill>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 px-3 py-3 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current owner</p>
                  <p className="mt-2 font-medium text-white">
                    {report.workflow?.assignedTo ? `@${report.workflow.assignedTo.username}` : 'Unassigned'}
                  </p>
                  <p className="mt-1 text-slate-400">
                    {report.workflow?.updatedAt ? `Updated ${formatRelative(report.workflow.updatedAt)}` : 'No workflow updates yet.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 px-3 py-3 text-sm text-slate-400">
                  {report.workflow?.assignedTo ? <p>Assigned to @{report.workflow.assignedTo.username}</p> : <p>Waiting for an admin to open this incident</p>}
                  {report.workflow?.updatedAt ? <p className="mt-1">Last updated {formatRelative(report.workflow.updatedAt)}</p> : null}
                </div>
                <p className="text-sm leading-6 text-slate-400">
                  The workflow status is no longer saved manually. Moderator actions below still decide whether the content stays visible or gets removed.
                </p>
              </div>
            </div>
          </div>

          <div className="detail-subcard">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reporter log</p>
                <p className="mt-1 text-sm text-slate-400">{formatReportRange(details?.pagination)}</p>
              </div>

              {details?.pagination?.totalPages > 1 ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!details.pagination.hasPreviousPage || details.loading}
                    onClick={() => onRequestLogPage(details.pagination.page - 1)}
                    className="detail-inline-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!details.pagination.hasNextPage || details.loading}
                    onClick={() => onRequestLogPage(details.pagination.page + 1)}
                    className="detail-inline-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {details?.loading && !details.items?.length ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-6 text-center text-sm text-slate-400">
                  Loading report history...
                </div>
              ) : details?.error ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {details.error}
                </div>
              ) : details?.items?.length ? (
                details.items.map((item) => (
                  <div key={item._id} className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {item.reporter?.avatar ? (
                          <img src={getAvatarUrl(item.reporter.avatar)} alt={item.reporter.username} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">
                            {item.reporter?.username?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-white">{item.reporter?.username || 'Unknown user'}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatReasonLabel(item.primaryReason)}</p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500">{formatRelative(item.createdAt)}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{item.reason}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-6 text-center text-sm text-slate-400">
                  No report history available.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 2xl:w-72">
          <div className="space-y-3 2xl:sticky 2xl:top-24">
            <div className="detail-subcard">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Moderator actions</p>
              <p className="mt-2 text-sm text-slate-400">
                Dismiss keeps the post visible. Ban removes the post and suspends the creator with a required reason.
              </p>

              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  disabled={processingId === `report-dismiss-${report._id}`}
                  onClick={onDismiss}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingId === `report-dismiss-${report._id}` ? 'Processing...' : 'Dismiss Reports'}
                </button>
                <button
                  type="button"
                  disabled={processingId === `report-ban-${report._id}`}
                  onClick={onBan}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-rose-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingId === `report-ban-${report._id}` ? 'Processing...' : 'Ban Post + Suspend Creator'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}