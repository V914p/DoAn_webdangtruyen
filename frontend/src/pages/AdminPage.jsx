import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import IncidentDetailPanel from '../components/admin/IncidentDetailPanel';
import ReportQueueFilters from '../components/admin/ReportQueueFilters';
import ReportQueueGrid from '../components/admin/ReportQueueGrid';
import {
  filterAndSortReports,
  getAvatarUrl,
  getContentTypeQuery,
  getReportSeverity,
  isIncidentLockedByAnotherAdmin
} from '../components/admin/moderationHelpers';
import { getToken } from '../services/authService';
import { formatRelative } from '../utils/helpers';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const REPORT_DETAILS_LIMIT = 20;
const REPORT_QUEUE_PAGE_SIZE = 8;
const EMPTY_MODAL = {
  action: '',
  target: null,
  reason: '',
  submitting: false,
  error: ''
};

function formatDateTime(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
}

function formatRemainingTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return 'Ready for deletion cleanup';
  }

  const totalMinutes = Math.ceil(milliseconds / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && parts.length < 2) parts.push(`${minutes}m`);

  return parts.join(' ') || 'Less than 1 minute';
}

function getAuditActionLabel(actionType) {
  switch (actionType) {
    case 'permanent-ban':
      return 'Permanent ban scheduled';
    case 'appeal-approved':
      return 'Appeal approved';
    case 'appeal-rejected':
      return 'Appeal rejected';
    case 'account-restored':
      return 'Account restored';
    case 'account-purged':
      return 'Account purged';
    default:
      return actionType;
  }
}

function isUserRestricted(user) {
  return Boolean(user?.postingRestrictedUntil) && new Date(user.postingRestrictedUntil) > new Date();
}

function isUserPermanentlyBanned(user) {
  return user?.accountStatus === 'permanently-banned';
}

function getTabButtonClass(activeTab, tab) {
  return `detail-inline-button px-4 py-2 text-sm ${activeTab === tab ? 'border-brand/40 bg-brand/10 text-white' : ''}`;
}

function getActionCopy(action, target) {
  switch (action) {
    case 'post-ban':
      return {
        title: 'Ban post and suspend creator',
        description: `Explain why "${target?.contentId?.title || 'this post'}" is being removed.`
      };
    case 'user-suspend':
      return {
        title: 'Suspend account for 3 days',
        description: `Explain why @${target?.username || 'this user'} is being suspended for 3 days.`
      };
    case 'user-permanent-ban':
      return {
        title: 'Permanently ban account',
        description: `Explain why @${target?.username || 'this user'} is being permanently banned.`
      };
    case 'appeal-reject':
      return {
        title: 'Reject appeal',
        description: `Explain why the appeal from @${target?.user?.username || 'this user'} is being rejected.`
      };
    default:
      return {
        title: 'Moderation reason',
        description: 'Provide a reason for this moderation action.'
      };
  }
}

function StatusPill({ children, tone = 'neutral' }) {
  const toneClass = {
    neutral: 'border-slate-700 text-slate-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }[tone];

  return <span className={`rounded-full border px-3 py-1 text-xs ${toneClass}`}>{children}</span>;
}

function AdminStatCard({ label, value, hint, active = false, onClick }) {
  const content = (
    <>
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`detail-subcard w-full text-left transition ${active ? 'border-brand/35 bg-brand/10' : 'hover:border-slate-700 hover:bg-slate-900/70'}`}
      >
        {content}
      </button>
    );
  }

  return <div className="detail-subcard">{content}</div>;
}

function SectionLoader({ message }) {
  return (
    <div className="panel flex min-h-72 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-300">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-brand" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const currentUserId = currentUser?.id || currentUser?._id;

  const [activeTab, setActiveTab] = useState('reports');
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingAppeals, setLoadingAppeals] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState('');
  const [expandedAppealId, setExpandedAppealId] = useState('');
  const [actionModal, setActionModal] = useState(EMPTY_MODAL);
  const [reportSearch, setReportSearch] = useState('');
  const [reportFilter, setReportFilter] = useState('all');
  const [reportWorkflowFilter, setReportWorkflowFilter] = useState('all');
  const [reportSort, setReportSort] = useState('priority');
  const [reportPage, setReportPage] = useState(1);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [reportDetails, setReportDetails] = useState({});
  useEffect(() => {
    fetchReports();
    fetchUsers();
    fetchAppeals();
    fetchHistory();
  }, []);

  const fetchReports = async () => {
    try {
      setLoadingReports(true);
      const response = await fetch(`${API_URL}/api/admin/reports`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to load reports');
        return;
      }

      setReports(data.data || []);
      setError('');
    } catch {
      setError('Failed to load reports');
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await fetch(`${API_URL}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to load users');
        return;
      }

      setUsers(data.data || []);
      setError('');
    } catch {
      setError('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchAppeals = async () => {
    try {
      setLoadingAppeals(true);
      const response = await fetch(`${API_URL}/api/admin/appeals`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to load appeals');
        return;
      }

      setAppeals(data.data || []);
      setError('');
    } catch {
      setError('Failed to load appeals');
    } finally {
      setLoadingAppeals(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch(`${API_URL}/api/admin/history`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to load moderation history');
        return;
      }

      setHistory(data.data || []);
      setError('');
    } catch {
      setError('Failed to load moderation history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchReportDetails = async (report, page = 1) => {
    if (!report?.contentId?._id) return;

    try {
      setReportDetails((prev) => ({
        ...prev,
        [report._id]: {
          ...(prev[report._id] || {}),
          loading: true,
          error: ''
        }
      }));

      const type = getContentTypeQuery(report.contentType);
      const response = await fetch(
        `${API_URL}/api/admin/reports/${type}/${report.contentId._id}?page=${page}&limit=${REPORT_DETAILS_LIMIT}`,
        {
          headers: {
            Authorization: `Bearer ${getToken()}`
          }
        }
      );
      const data = await response.json();

      if (!data.success) {
        setReportDetails((prev) => ({
          ...prev,
          [report._id]: {
            ...(prev[report._id] || {}),
            loading: false,
            error: data.error?.message || 'Failed to load report history'
          }
        }));
        return;
      }

      setReportDetails((prev) => ({
        ...prev,
        [report._id]: {
          items: data.data?.reports || [],
          reasonSummary: data.data?.reasonSummary || [],
          pagination: data.data?.pagination || null,
          loading: false,
          error: ''
        }
      }));
      setError('');
    } catch {
      setReportDetails((prev) => ({
        ...prev,
        [report._id]: {
          ...(prev[report._id] || {}),
          loading: false,
          error: 'Failed to load report history'
        }
      }));
    }
  };

  const clearReportState = (reportId) => {
    setReportDetails((prev) => {
      if (!prev[reportId]) return prev;

      const next = { ...prev };
      delete next[reportId];
      return next;
    });
  };

  const applyWorkflowUpdate = (contentType, contentId, workflow) => {
    if (!contentType || !contentId) return;

    setReports((prev) => prev.map((item) => (
      item.contentType === contentType && item.contentId?._id === contentId
        ? {
            ...item,
            workflow
          }
        : item
    )));
  };

  const releaseIncident = async (report, options = {}) => {
    if (!report?.contentId?._id) return;

    const { clearSelection = false, silent = false } = options;
    const requestId = `report-release-${report._id}`;

    try {
      setProcessingId(requestId);
      const type = getContentTypeQuery(report.contentType);
      const response = await fetch(`${API_URL}/api/admin/reports/${type}/${report.contentId._id}/release`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (!data.success) {
        if (!silent) {
          setError(data.error?.message || 'Failed to release incident');
        }
        return;
      }

      applyWorkflowUpdate(data.data?.contentType, data.data?.contentId, data.data?.workflow);
      if (clearSelection) {
        setSelectedReportId('');
      }
      if (!silent) {
        setError('');
      }
    } catch {
      if (!silent) {
        setError('Failed to release incident');
      }
    } finally {
      setProcessingId('');
    }
  };

  const openIncident = async (report) => {
    if (!report?.contentId?._id) return;

    if (isIncidentLockedByAnotherAdmin(report, currentUserId)) {
      setError(`Incident này đang được @${report.workflow.assignedTo.username} xử lý.`);
      return;
    }

    if (selectedReportId === report._id) {
      const detailState = reportDetails[report._id];
      if (!detailState || (!detailState.loading && !detailState.items?.length && !detailState.error)) {
        fetchReportDetails(report, 1);
      }
      return;
    }

    const requestId = `report-open-${report._id}`;
    const previousReport = selectedReport;

    try {
      setProcessingId(requestId);
      const type = getContentTypeQuery(report.contentType);
      const response = await fetch(`${API_URL}/api/admin/reports/${type}/${report.contentId._id}/open`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          previousContentId: previousReport?.contentId?._id || null,
          previousContentType: previousReport?.contentType || null
        })
      });
      const data = await response.json();

      if (!data.success) {
        if (response.status === 409 && data.data?.workflow) {
          applyWorkflowUpdate(data.data.contentType, data.data.contentId, data.data.workflow);
        }
        setError(data.error?.message || 'Failed to open incident');
        return;
      }

      if (data.data?.previous) {
        applyWorkflowUpdate(data.data.previous.contentType, data.data.previous.contentId, data.data.previous.workflow);
      }

      if (data.data?.current) {
        applyWorkflowUpdate(data.data.current.contentType, data.data.current.contentId, data.data.current.workflow);
      }

      setSelectedReportId(report._id);
      setError('');
    } catch {
      setError('Failed to open incident');
    } finally {
      setProcessingId('');
    }
  };

  const dismissReport = async (report) => {
    const requestId = `report-dismiss-${report._id}`;

    try {
      setProcessingId(requestId);
      const type = getContentTypeQuery(report.contentType);
      const response = await fetch(`${API_URL}/api/admin/content/${report.contentId._id}/dismiss-reports?type=${type}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to dismiss reports');
        return;
      }

      setReports((prev) => prev.filter((item) => item._id !== report._id));
      clearReportState(report._id);
      if (selectedReportId === report._id) {
        setSelectedReportId('');
      }
      setError('');
    } catch {
      setError('Failed to dismiss reports');
    } finally {
      setProcessingId('');
    }
  };

  const clearUserRestriction = async (user) => {
    const requestId = `user-unban-${user._id}`;

    try {
      setProcessingId(requestId);
      const response = await fetch(`${API_URL}/api/admin/users/${user._id}/unban`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to clear the user restriction');
        return;
      }

      await Promise.all([fetchUsers(), fetchAppeals(), fetchHistory()]);
      setError('');
    } catch {
      setError('Failed to clear the user restriction');
    } finally {
      setProcessingId('');
    }
  };

  const approveAppeal = async (appeal) => {
    const requestId = `appeal-approve-${appeal._id}`;

    try {
      setProcessingId(requestId);
      const response = await fetch(`${API_URL}/api/admin/appeals/${appeal._id}/approve`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Appeal approved. Account access restored.' })
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to approve appeal');
        return;
      }

      await Promise.all([fetchUsers(), fetchAppeals(), fetchHistory()]);
      setError('');
    } catch {
      setError('Failed to approve appeal');
    } finally {
      setProcessingId('');
    }
  };

  const openActionModal = (action, target) => {
    setActionModal({
      action,
      target,
      reason: '',
      submitting: false,
      error: ''
    });
  };

  const closeActionModal = () => {
    if (actionModal.submitting) return;
    setActionModal(EMPTY_MODAL);
  };

  const submitAction = async () => {
    const { action, target } = actionModal;
    const reason = actionModal.reason.trim();

    if (!reason) {
      setActionModal((prev) => ({
        ...prev,
        error: 'A reason is required.'
      }));
      return;
    }

    try {
      setActionModal((prev) => ({
        ...prev,
        submitting: true,
        error: ''
      }));

      if (action === 'post-ban') {
        setProcessingId(`report-ban-${target._id}`);
        const type = getContentTypeQuery(target.contentType);
        const response = await fetch(`${API_URL}/api/admin/content/${target.contentId._id}/ban?type=${type}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        });
        const data = await response.json();

        if (!data.success) {
          setActionModal((prev) => ({
            ...prev,
            submitting: false,
            error: data.error?.message || 'Failed to ban the post'
          }));
          return;
        }

        clearReportState(target._id);
        if (selectedReportId === target._id) {
          setSelectedReportId('');
        }
        await Promise.all([fetchReports(), fetchUsers()]);
      }

      if (action === 'user-suspend') {
        setProcessingId(`user-suspend-${target._id}`);
        const response = await fetch(`${API_URL}/api/admin/users/${target._id}/ban`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        });
        const data = await response.json();

        if (!data.success) {
          setActionModal((prev) => ({
            ...prev,
            submitting: false,
            error: data.error?.message || 'Failed to suspend this account'
          }));
          return;
        }

        await fetchUsers();
      }

      if (action === 'user-permanent-ban') {
        setProcessingId(`user-permanent-${target._id}`);
        const response = await fetch(`${API_URL}/api/admin/users/${target._id}/permanent-ban`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        });
        const data = await response.json();

        if (!data.success) {
          setActionModal((prev) => ({
            ...prev,
            submitting: false,
            error: data.error?.message || 'Failed to permanently ban this account'
          }));
          return;
        }

        await Promise.all([fetchUsers(), fetchAppeals(), fetchHistory()]);
      }

      if (action === 'appeal-reject') {
        setProcessingId(`appeal-reject-${target._id}`);
        const response = await fetch(`${API_URL}/api/admin/appeals/${target._id}/reject`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        });
        const data = await response.json();

        if (!data.success) {
          setActionModal((prev) => ({
            ...prev,
            submitting: false,
            error: data.error?.message || 'Failed to reject this appeal'
          }));
          return;
        }

        await Promise.all([fetchAppeals(), fetchHistory()]);
      }

      setError('');
      setActionModal(EMPTY_MODAL);
    } catch {
      setActionModal((prev) => ({
        ...prev,
        submitting: false,
        error: 'This moderation action failed. Please try again.'
      }));
    } finally {
      setProcessingId('');
    }
  };

  const pendingAppeals = appeals.filter((item) => item.status === 'pending').length;
  const restrictedUsers = users.filter((user) => isUserRestricted(user) || isUserPermanentlyBanned(user)).length;
  const scheduledForDeletionUsers = users.filter((user) => user.isPendingPermanentDeletion).length;
  const totalReportSignals = reports.reduce((total, item) => total + item.reportCount, 0);
  const criticalIncidents = reports.filter((item) => getReportSeverity(item.reportCount) === 'critical').length;
  const highVolumeIncidents = reports.filter((item) => ['high', 'critical'].includes(getReportSeverity(item.reportCount))).length;
  const freshIncidents = reports.filter((item) => Date.now() - new Date(item.latestReportAt).getTime() <= 24 * 60 * 60 * 1000).length;
  const visibleReports = filterAndSortReports(reports, reportSearch, reportFilter, reportWorkflowFilter, reportSort);
  const openIncidents = visibleReports.filter((item) => (item.workflow?.status || 'open') === 'open').length;
  const assignedIncidents = visibleReports.filter((item) => item.workflow?.status === 'assigned').length;
  const totalReportPages = Math.max(1, Math.ceil(visibleReports.length / REPORT_QUEUE_PAGE_SIZE));
  const activeReportPage = Math.min(reportPage, totalReportPages);
  const paginatedReports = visibleReports.slice((activeReportPage - 1) * REPORT_QUEUE_PAGE_SIZE, activeReportPage * REPORT_QUEUE_PAGE_SIZE);
  const selectedReport = reports.find((item) => item._id === selectedReportId) || null;
  const selectedReportDetails = selectedReport ? reportDetails[selectedReport._id] : null;
  const adminUsers = users.filter((user) => user.role === 'admin');
  const memberUsers = users.filter((user) => user.role !== 'admin');
  const activeMembers = memberUsers.filter((user) => !isUserRestricted(user) && !isUserPermanentlyBanned(user)).length;
  const actionCopy = getActionCopy(actionModal.action, actionModal.target);

  const renderUserCard = (user) => {
    const restricted = isUserRestricted(user);
    const permanentlyBanned = isUserPermanentlyBanned(user);
    const isSelf = user._id === currentUserId;
    const isAdmin = user.role === 'admin';

    return (
      <article key={user._id} className="detail-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {user.avatar ? (
                <img src={getAvatarUrl(user.avatar)} alt={user.username} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-base font-semibold text-white">
                  {user.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-white sm:text-xl">@{user.username}</h3>
                  <StatusPill>{user.role}</StatusPill>
                  {permanentlyBanned ? (
                    <StatusPill tone="danger">Permanently banned</StatusPill>
                  ) : restricted ? (
                    <StatusPill tone="warning">3-day suspension</StatusPill>
                  ) : (
                    <StatusPill tone="success">Active</StatusPill>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-400">{user.email}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">Joined {formatDateTime(user.createdAt)}</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="detail-subcard">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Account snapshot</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="rounded-full border border-slate-700 px-3 py-1">{user.storyCount} stories</span>
                  <span className="rounded-full border border-slate-700 px-3 py-1">{user.artworkCount} artworks</span>
                </div>
                {user.bio ? <p className="mt-3 text-sm text-slate-400">{user.bio}</p> : <p className="mt-3 text-sm text-slate-500">No bio available.</p>}
              </div>

              <div className="detail-subcard">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Restriction status</p>
                {permanentlyBanned ? (
                  <>
                    <p className="mt-2 text-sm font-medium text-white">Permanent ban since {formatDateTime(user.permanentlyBannedAt)}</p>
                    <p className="mt-2 text-sm text-slate-300">Reason: {user.permanentBanReason}</p>
                    <p className="mt-2 text-sm text-amber-300">Scheduled purge: {formatDateTime(user.permanentDeletionScheduledFor)}</p>
                    <p className="mt-2 text-sm text-slate-400">Time remaining: {formatRemainingTime(user.permanentDeletionMillisecondsRemaining)}</p>
                  </>
                ) : restricted ? (
                  <>
                    <p className="mt-2 text-sm font-medium text-white">Locked until {formatDateTime(user.postingRestrictedUntil)}</p>
                    <p className="mt-2 text-sm text-slate-300">Reason: {user.postingRestrictionReason}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">This account can publish stories and artworks normally.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3 xl:w-56 xl:flex-col">
            <Link to={`/profile/${user._id}`} className="detail-inline-button px-4 py-2.5 text-center text-sm">
              Open Profile
            </Link>

            {permanentlyBanned ? (
              <button
                type="button"
                disabled={processingId === `user-unban-${user._id}`}
                onClick={() => clearUserRestriction(user)}
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingId === `user-unban-${user._id}` ? 'Processing...' : 'Restore Account'}
              </button>
            ) : restricted ? (
              <button
                type="button"
                disabled={processingId === `user-unban-${user._id}`}
                onClick={() => clearUserRestriction(user)}
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingId === `user-unban-${user._id}` ? 'Processing...' : 'Lift 3-Day Suspension'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isAdmin || isSelf || processingId === `user-suspend-${user._id}`}
                  onClick={() => openActionModal('user-suspend', user)}
                  className="inline-flex items-center justify-center rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingId === `user-suspend-${user._id}` ? 'Processing...' : 'Suspend 3 Days'}
                </button>
                <button
                  type="button"
                  disabled={isAdmin || isSelf || processingId === `user-permanent-${user._id}`}
                  onClick={() => openActionModal('user-permanent-ban', user)}
                  className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingId === `user-permanent-${user._id}` ? 'Processing...' : 'Permanent Ban'}
                </button>
              </>
            )}

            {isAdmin ? <p className="text-xs text-slate-500">Admin accounts cannot be moderated here.</p> : null}
            {isSelf ? <p className="text-xs text-slate-500">You cannot moderate your own account.</p> : null}
          </div>
        </div>
      </article>
    );
  };

  useEffect(() => {
    if (activeTab !== 'reports' || !selectedReport) {
      return;
    }

    const detailState = reportDetails[selectedReport._id];
    if (!detailState || (!detailState.loading && !detailState.items?.length && !detailState.error)) {
      fetchReportDetails(selectedReport, 1);
    }
  }, [activeTab, reportDetails, selectedReport]);

  useEffect(() => {
    setReportPage(1);
  }, [reportSearch, reportFilter, reportWorkflowFilter, reportSort]);

  useEffect(() => {
    if (reportPage > totalReportPages) {
      setReportPage(totalReportPages);
    }
  }, [reportPage, totalReportPages]);

  useEffect(() => {
    if (activeTab === 'reports') {
      return;
    }

    if (selectedReport) {
      releaseIncident(selectedReport, { clearSelection: true, silent: true });
    }
  }, [activeTab]);

  return (
    <div className="detail-shell">
      <section className="detail-hero">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="detail-eyebrow">Admin moderation</p>
            <h2 className="detail-title mt-2">Safety Control Center</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
              Review incidents, risky accounts, and appeals in one place without turning the page into a long moderation wall.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5">{REPORT_DETAILS_LIMIT} log items per detail page</span>
              <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5">{restrictedUsers} restricted accounts</span>
              <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5">{pendingAppeals} appeals waiting</span>
              <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5">{scheduledForDeletionUsers} accounts pending purge</span>
              <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5">History retained 90 days</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setActiveTab('reports')} className={getTabButtonClass(activeTab, 'reports')}>
              Report Queue
            </button>
            <button type="button" onClick={() => setActiveTab('users')} className={getTabButtonClass(activeTab, 'users')}>
              Accounts
            </button>
            <button type="button" onClick={() => setActiveTab('appeals')} className={getTabButtonClass(activeTab, 'appeals')}>
              Appeals
            </button>
            <button type="button" onClick={() => setActiveTab('history')} className={getTabButtonClass(activeTab, 'history')}>
              History
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            label="Open incidents"
            value={loadingReports ? '...' : reports.length}
            hint={`${loadingReports ? 'Loading' : criticalIncidents} critical, ${loadingReports ? 'loading' : highVolumeIncidents} high-volume groups`}
            active={activeTab === 'reports'}
            onClick={() => setActiveTab('reports')}
          />
          <AdminStatCard
            label="Report signals"
            value={loadingReports ? '...' : totalReportSignals}
            hint={`${loadingReports ? 'Loading' : freshIncidents} incidents updated in the last 24 hours`}
            active={activeTab === 'reports'}
            onClick={() => setActiveTab('reports')}
          />
          <AdminStatCard
            label="Restricted accounts"
            value={loadingUsers ? '...' : restrictedUsers}
            hint="Temporary suspensions and permanent bans in one place"
            active={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
          />
          <AdminStatCard
            label="Pending appeals"
            value={loadingAppeals ? '...' : pendingAppeals}
            hint="Appeals waiting for an explicit review note"
            active={activeTab === 'appeals'}
            onClick={() => setActiveTab('appeals')}
          />
          <AdminStatCard
            label="Audit history"
            value={loadingHistory ? '...' : history.length}
            hint="Ban, appeal, restore, and purge events kept for 90 days"
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      {activeTab === 'reports' ? (
        loadingReports && !reports.length ? (
          <SectionLoader message="Loading moderation queue..." />
        ) : reports.length ? (
          <div className="space-y-5">
            <ReportQueueFilters
              reportSearch={reportSearch}
              reportFilter={reportFilter}
              reportWorkflowFilter={reportWorkflowFilter}
              reportSort={reportSort}
              visibleReportsCount={visibleReports.length}
              openIncidents={openIncidents}
              assignedIncidents={assignedIncidents}
              onReportSearchChange={setReportSearch}
              onReportFilterChange={setReportFilter}
              onReportWorkflowFilterChange={setReportWorkflowFilter}
              onReportSortChange={setReportSort}
              onRefreshQueue={fetchReports}
            />

            <ReportQueueGrid
              reports={paginatedReports}
              selectedReportId={selectedReport?._id || ''}
              currentUserId={currentUserId}
              activeReportPage={activeReportPage}
              totalReportPages={totalReportPages}
              totalItems={visibleReports.length}
              pageSize={REPORT_QUEUE_PAGE_SIZE}
              onSelectReport={openIncident}
              onPreviousPage={() => setReportPage((prev) => Math.max(1, prev - 1))}
              onNextPage={() => setReportPage((prev) => Math.min(totalReportPages, prev + 1))}
            />

            <section>
              {selectedReport ? (
                <IncidentDetailPanel
                  report={selectedReport}
                  details={selectedReportDetails}
                  processingId={processingId}
                  onClose={() => releaseIncident(selectedReport, { clearSelection: true })}
                  onRefreshLog={() => fetchReportDetails(selectedReport, selectedReportDetails?.pagination?.page || 1)}
                  onRequestLogPage={(nextPage) => fetchReportDetails(selectedReport, nextPage)}
                  onDismiss={() => dismissReport(selectedReport)}
                  onBan={() => openActionModal('post-ban', selectedReport)}
                />
              ) : (
                <div className="detail-empty-state">
                  <div className="text-lg font-semibold text-white">No incident selected</div>
                  <p className="max-w-md text-sm text-slate-400">
                    Pick a report group from the queue to inspect the post, reason mix, and paginated reporter history.
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="detail-empty-state">
            <div className="text-lg font-semibold text-white">No reported posts to review</div>
            <p className="max-w-md text-sm text-slate-400">
              Reported stories and artworks will appear here as a moderation queue, with grouped counts and detailed history on demand.
            </p>
          </div>
        )
      ) : activeTab === 'users' ? (
        loadingUsers && !users.length ? (
          <SectionLoader message="Loading account moderation..." />
        ) : users.length ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="detail-subcard">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total accounts</p>
                <p className="mt-2 text-2xl font-semibold text-white">{users.length}</p>
                <p className="mt-1 text-sm text-slate-400">All profiles currently visible to moderators.</p>
              </div>
              <div className="detail-subcard">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin accounts</p>
                <p className="mt-2 text-2xl font-semibold text-white">{adminUsers.length}</p>
                <p className="mt-1 text-sm text-slate-400">Separated so staff accounts do not blend into member review.</p>
              </div>
              <div className="detail-subcard">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">User accounts</p>
                <p className="mt-2 text-2xl font-semibold text-white">{memberUsers.length}</p>
                <p className="mt-1 text-sm text-slate-400">Regular accounts with publishing and restriction status.</p>
              </div>
              <div className="detail-subcard">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active members</p>
                <p className="mt-2 text-2xl font-semibold text-white">{activeMembers}</p>
                <p className="mt-1 text-sm text-slate-400">Members who can currently publish without restriction.</p>
              </div>
            </div>

            <section className="space-y-3">
              <div className="detail-card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin accounts</p>
                    <p className="mt-2 text-sm text-slate-400">Staff accounts are grouped separately so you can identify who has moderation privileges at a glance.</p>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5 text-sm text-slate-300">{adminUsers.length} admins</span>
                </div>
              </div>

              {adminUsers.length ? (
                <div className="grid gap-4">{adminUsers.map(renderUserCard)}</div>
              ) : (
                <div className="detail-subcard text-sm text-slate-400">No admin accounts available.</div>
              )}
            </section>

            <section className="space-y-3">
              <div className="detail-card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">User accounts</p>
                    <p className="mt-2 text-sm text-slate-400">Regular member accounts with profile context, publishing stats, and moderation actions.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-slate-300">
                    <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5">{memberUsers.length} users</span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5">{restrictedUsers} restricted</span>
                  </div>
                </div>
              </div>

              {memberUsers.length ? (
                <div className="grid gap-4">{memberUsers.map(renderUserCard)}</div>
              ) : (
                <div className="detail-subcard text-sm text-slate-400">No user accounts available.</div>
              )}
            </section>
          </div>
        ) : (
          <div className="detail-empty-state">
            <div className="text-lg font-semibold text-white">No users available</div>
            <p className="max-w-md text-sm text-slate-400">
              Accounts will appear here with publishing status, ban reasons, and moderation controls.
            </p>
          </div>
        )
      ) : loadingAppeals && !appeals.length ? (
        <SectionLoader message="Loading appeal queue..." />
      ) : appeals.length ? (
        <div className="space-y-4">
          {appeals.map((appeal) => {
            const user = appeal.user;
            const isPending = appeal.status === 'pending';

            return (
              <article key={appeal._id} className="detail-card p-6">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase">
                      {isPending ? (
                        <StatusPill tone="warning">Pending</StatusPill>
                      ) : appeal.status === 'approved' ? (
                        <StatusPill tone="success">Approved</StatusPill>
                      ) : (
                        <StatusPill tone="danger">Rejected</StatusPill>
                      )}
                      <span className="text-slate-500">Submitted {formatRelative(appeal.createdAt)}</span>
                      {appeal.reviewedAt ? <span className="text-slate-500">Reviewed {formatRelative(appeal.reviewedAt)}</span> : null}
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-white">@{user?.username || 'Unknown user'}</h3>
                      <p className="mt-2 text-sm text-slate-400">{user?.email || 'No email available'}</p>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="detail-subcard">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ban Context</p>
                        <p className="mt-2 text-sm text-slate-300">Reason: {appeal.banReason}</p>
                        <p className="mt-2 text-sm text-slate-400">Banned at: {formatDateTime(appeal.bannedAt || user?.permanentlyBannedAt)}</p>
                        {user?.permanentDeletionScheduledFor ? (
                          <>
                            <p className="mt-2 text-sm text-amber-300">Scheduled purge: {formatDateTime(user.permanentDeletionScheduledFor)}</p>
                            <p className="mt-2 text-sm text-slate-400">Time remaining: {formatRemainingTime(user.permanentDeletionMillisecondsRemaining)}</p>
                          </>
                        ) : null}
                      </div>

                      <div className="detail-subcard">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Appeal Submission</p>
                        <p className="mt-2 text-sm text-slate-300">{appeal.appealReason}</p>
                        <p className="mt-2 text-sm text-slate-400">Evidence: {appeal.evidence || 'No supporting evidence provided'}</p>
                      </div>
                    </div>

                    <div className="detail-subcard">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Review Details</p>
                        <button
                          type="button"
                          onClick={() => setExpandedAppealId((prev) => (prev === appeal._id ? '' : appeal._id))}
                          className="text-sm text-slate-300 transition hover:text-white"
                        >
                          {expandedAppealId === appeal._id ? 'Hide full appeal' : 'View full appeal'}
                        </button>
                      </div>

                      {expandedAppealId === appeal._id ? (
                        <div className="mt-4 space-y-3 text-sm text-slate-300">
                          <p>Appeal message: {appeal.appealReason}</p>
                          <p>Evidence: {appeal.evidence || 'No evidence attached'}</p>
                          <p>Ban reason snapshot: {appeal.banReason}</p>
                          <p>Reviewer: {appeal.reviewedBy?.username || 'Not reviewed yet'}</p>
                          <p>Review note: {appeal.reviewReason || 'Not reviewed yet'}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-3 xl:w-60 xl:flex-col">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          disabled={processingId === `appeal-approve-${appeal._id}`}
                          onClick={() => approveAppeal(appeal)}
                          className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {processingId === `appeal-approve-${appeal._id}` ? 'Processing...' : 'Approve Appeal'}
                        </button>
                        <button
                          type="button"
                          disabled={processingId === `appeal-reject-${appeal._id}`}
                          onClick={() => openActionModal('appeal-reject', appeal)}
                          className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {processingId === `appeal-reject-${appeal._id}` ? 'Processing...' : 'Reject Appeal'}
                        </button>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4 text-sm text-slate-300">
                        <p className="font-medium text-white">Review completed</p>
                        <p className="mt-2">{appeal.reviewReason || 'No review note provided.'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        activeTab === 'history' ? (
          loadingHistory && !history.length ? (
            <SectionLoader message="Loading moderation history..." />
          ) : history.length ? (
            <div className="space-y-4">
              {history.map((item) => (
                <article key={item._id} className="detail-card p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={item.actionType === 'appeal-approved' || item.actionType === 'account-restored' ? 'success' : item.actionType === 'appeal-rejected' || item.actionType === 'account-purged' ? 'danger' : 'warning'}>
                          {getAuditActionLabel(item.actionType)}
                        </StatusPill>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{formatRelative(item.createdAt)}</span>
                      </div>

                      <div>
                        <h3 className="text-xl font-semibold text-white">@{item.targetUsernameSnapshot || 'Unknown user'}</h3>
                        <p className="mt-2 text-sm text-slate-400">Actor: @{item.actorUsernameSnapshot || 'system'}</p>
                        <p className="mt-2 text-sm text-slate-400">Target status snapshot: {item.targetUserStatus || 'N/A'}</p>
                      </div>

                      <div className="detail-subcard">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reason</p>
                        <p className="mt-2 text-sm text-slate-300">{item.reason || 'No explicit note provided.'}</p>
                      </div>

                      <div className="detail-subcard">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Metadata</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-300">
                          {item.metadata?.permanentDeletionScheduledFor ? <p>Scheduled purge: {formatDateTime(item.metadata.permanentDeletionScheduledFor)}</p> : null}
                          {Number.isFinite(item.metadata?.hiddenStories) ? <p>Hidden stories: {item.metadata.hiddenStories}</p> : null}
                          {Number.isFinite(item.metadata?.hiddenArtworks) ? <p>Hidden artworks: {item.metadata.hiddenArtworks}</p> : null}
                          {Number.isFinite(item.metadata?.restoredStories) ? <p>Restored stories: {item.metadata.restoredStories}</p> : null}
                          {Number.isFinite(item.metadata?.restoredArtworks) ? <p>Restored artworks: {item.metadata.restoredArtworks}</p> : null}
                          {Number.isFinite(item.metadata?.contentDeletedCount) ? <p>Permanently deleted content items: {item.metadata.contentDeletedCount}</p> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="detail-empty-state">
              <div className="text-lg font-semibold text-white">No moderation history yet</div>
              <p className="max-w-md text-sm text-slate-400">
                Permanent bans, appeal reviews, restores, and purge events will appear here and expire automatically after 90 days.
              </p>
            </div>
          )
        ) : (
        <div className="detail-empty-state">
          <div className="text-lg font-semibold text-white">No appeals submitted</div>
          <p className="max-w-md text-sm text-slate-400">
            Permanent-ban appeals will appear here with the ban reason, appeal text, evidence, and review actions.
          </p>
        </div>
        )
      )}

      {actionModal.action ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="detail-card w-full max-w-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="detail-eyebrow">Moderation reason</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{actionCopy.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{actionCopy.description}</p>
              </div>
              <button type="button" onClick={closeActionModal} className="detail-inline-button px-3 py-2 text-xs">
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Reason</label>
                <textarea
                  value={actionModal.reason}
                  onChange={(event) => setActionModal((prev) => ({ ...prev, reason: event.target.value }))}
                  rows={5}
                  className="input-base resize-none"
                  placeholder="Write a clear explanation for the affected user and the admin audit trail."
                />
              </div>

              {actionModal.error ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {actionModal.error}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={closeActionModal} className="detail-inline-button px-4 py-2 text-sm">
                  Close
                </button>
                <button
                  type="button"
                  disabled={actionModal.submitting}
                  onClick={submitAction}
                  className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionModal.submitting ? 'Submitting...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}