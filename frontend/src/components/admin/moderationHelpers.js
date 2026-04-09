const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function getContentTypeQuery(contentType) {
  return contentType === 'Story' ? 'story' : 'artwork';
}

export function getContentLink(report) {
  if (!report?.contentId?._id) return null;

  return report.contentType === 'Story'
    ? `/story/${report.contentId._id}`
    : `/artwork/${report.contentId._id}`;
}

export function formatReasonLabel(reason) {
  return String(reason || '')
    .split(':')[0]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getAvatarUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

export function getReportSeverity(reportCount) {
  if (reportCount >= 100) return 'critical';
  if (reportCount >= 25) return 'high';
  return 'review';
}

export function getReportSeverityTone(severity) {
  if (severity === 'critical') return 'danger';
  if (severity === 'high') return 'warning';
  return 'neutral';
}

export function getReportSeverityLabel(severity) {
  if (severity === 'critical') return 'Critical';
  if (severity === 'high') return 'High volume';
  return 'Needs review';
}

export function getReportPriorityScore(report) {
  const hoursSinceLatest = (Date.now() - new Date(report.latestReportAt).getTime()) / (1000 * 60 * 60);
  let freshnessBoost = 0;

  if (hoursSinceLatest <= 6) freshnessBoost = 40;
  else if (hoursSinceLatest <= 24) freshnessBoost = 20;
  else if (hoursSinceLatest <= 72) freshnessBoost = 8;

  return report.reportCount * 4 + freshnessBoost;
}

export function getWorkflowTone(status) {
  if (status === 'assigned') return 'neutral';
  return 'warning';
}

export function formatWorkflowLabel(status) {
  if (status === 'assigned') return 'Assigned';
  return 'Open';
}

export function isIncidentLockedByAnotherAdmin(report, currentUserId) {
  if (!report?.workflow?.assignedTo || report.workflow?.status !== 'assigned') {
    return false;
  }

  return String(report.workflow.assignedTo._id) !== String(currentUserId);
}

export function filterAndSortReports(reports, search, filter, workflowFilter, sort) {
  const normalizedSearch = search.trim().toLowerCase();

  return [...reports]
    .filter((report) => {
      const severity = getReportSeverity(report.reportCount);
      const isFresh = Date.now() - new Date(report.latestReportAt).getTime() <= 24 * 60 * 60 * 1000;
      const workflowStatus = report.workflow?.status || 'open';

      if (filter === 'critical' && severity !== 'critical') return false;
      if (filter === 'high' && !['high', 'critical'].includes(severity)) return false;
      if (filter === 'fresh' && !isFresh) return false;
      if (filter === 'story' && report.contentType !== 'Story') return false;
      if (filter === 'artwork' && report.contentType !== 'Artwork') return false;
      if (workflowFilter !== 'all' && workflowStatus !== workflowFilter) return false;

      if (!normalizedSearch) return true;

      const haystack = [
        report.contentId?.title,
        report.contentId?.author?.username,
        report.contentId?.status,
        report.contentType,
        report.reasonSummary?.map((item) => item.reason).join(' ')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    })
    .sort((left, right) => {
      if (sort === 'latest') {
        return new Date(right.latestReportAt) - new Date(left.latestReportAt);
      }

      if (sort === 'volume') {
        return right.reportCount - left.reportCount || new Date(right.latestReportAt) - new Date(left.latestReportAt);
      }

      return getReportPriorityScore(right) - getReportPriorityScore(left) || new Date(right.latestReportAt) - new Date(left.latestReportAt);
    });
}

export function formatReportRange(pagination) {
  if (!pagination?.totalItems) return 'No report history loaded yet.';

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.totalItems);
  return `Showing ${start}-${end} of ${pagination.totalItems} reports`;
}