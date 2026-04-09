import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../services/authService';
import { emitNotificationChange, subscribeToNotificationChanges, subscribeToNotifications } from '../services/notificationService';
import { formatRelative } from '../utils/helpers';
import { getNotificationLink, getNotificationPresentation } from '../utils/notifications';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function NotificationPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    return subscribeToNotifications((notification) => {
      setNotifications((prev) => {
        if (prev.some((item) => item._id === notification._id)) {
          return prev;
        }
        return [notification, ...prev];
      });
    });
  }, []);

  useEffect(() => {
    return subscribeToNotificationChanges((payload) => {
      if (payload?.type === 'updated' && payload.notification) {
        setNotifications((prev) => prev.map((item) => (
          item._id === payload.notification._id ? { ...item, ...payload.notification } : item
        )));
      }

      if (payload?.type === 'deleted' && payload.notificationId) {
        setNotifications((prev) => prev.filter((item) => item._id !== payload.notificationId));
      }
    });
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/notifications`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setNotifications(data.data || []);
        setError('');
      } else {
        setError(data.error?.message || 'Failed to load notifications');
      }
    } catch (err) {
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        return;
      }

      setNotifications((prev) => prev.map((item) => (
        item._id === notificationId ? { ...item, read: true } : item
      )));

      emitNotificationChange({
        type: 'updated',
        notificationId,
        read: true
      });
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleOpenNotification = async (notification) => {
    const target = getNotificationLink(notification);

    if (!notification.read) {
      await markAsRead(notification._id);
    }

    if (target && target !== '/notifications') {
      navigate(target, {
        state: {
          notification,
          openedFromNotification: true,
          ...(notification.commentId
            ? {
                targetCommentId: String(notification.commentId)
              }
            : {})
        }
      });
    }
  };

  const deleteNotification = async (notificationId) => {
    const targetNotification = notifications.find((item) => item._id === notificationId);

    try {
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        return;
      }

      setNotifications((prev) => prev.filter((item) => item._id !== notificationId));
      emitNotificationChange({
        type: 'deleted',
        notificationId,
        read: targetNotification?.read ?? data.data?.read ?? true
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const unreadCount = notifications.filter((item) => !item.read).length;

  if (loading) {
    return (
      <div className="panel flex min-h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-brand" />
          <p className="text-sm">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-shell">
      <section className="detail-hero">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="detail-eyebrow">Realtime inbox</p>
            <h2 className="detail-title mt-2">Notifications</h2>
            <p className="mt-2 text-sm text-slate-400">
              Follow, comment, moderation, appeal, and account access updates appear here in realtime.
            </p>
          </div>
          <div className="detail-count-pill">
            {unreadCount} unread
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      {notifications.length > 0 ? (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <article
              key={notification._id}
              className={`detail-card p-5 transition ${notification.read ? 'opacity-80' : 'border-brand/40'} ${(notification.commentDeleted || notification.contentDeleted) ? 'border-amber-400/25' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {notification.from?.avatar ? (
                    <img
                      src={notification.from.avatar.startsWith('http') ? notification.from.avatar : `${API_URL}${notification.from.avatar}`}
                      alt={notification.from.username}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-sm font-semibold text-white">
                      {notification.from?.username?.[0]?.toUpperCase() || '!'}
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                      {getNotificationPresentation(notification).name}
                    </p>
                    <p className="text-sm font-medium leading-6 text-white sm:text-base">{notification.message}</p>
                    {notification.commentPreview ? (
                      <div className={`mt-2 rounded-2xl border px-3 py-2 text-sm leading-6 ${notification.commentDeleted ? 'border-amber-500/25 bg-amber-500/10 text-amber-100' : 'border-slate-700 bg-slate-950/50 text-slate-300'}`}>
                        {notification.commentDeleted ? 'Deleted comment: ' : ''}
                        {notification.commentPreview}
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                      {notification.from?.username ? `@${notification.from.username} • ` : ''}
                      {formatRelative(notification.createdAt)}
                    </p>
                    {notification.contentDeleted ? (
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-300">
                        Original post was deleted
                      </p>
                    ) : null}
                    {notification.commentDeleted ? (
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-300">
                        Original comment was deleted
                      </p>
                    ) : null}
                    {getNotificationLink(notification) && getNotificationLink(notification) !== '/notifications' ? (
                      <button
                        type="button"
                        onClick={() => handleOpenNotification(notification)}
                        className="mt-3 text-sm text-brand-light transition hover:text-brand"
                      >
                        {getNotificationPresentation(notification).cta} →
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!notification.read ? (
                    <button
                      type="button"
                      onClick={() => markAsRead(notification._id)}
                      className="detail-inline-button px-3 py-2 text-xs"
                    >
                      Mark as read
                    </button>
                  ) : (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                      Read
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteNotification(notification._id)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-300 transition hover:border-rose-400/40 hover:text-rose-200"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="detail-empty-state">
          <div className="text-lg font-semibold text-white">No notifications yet</div>
          <p className="max-w-md text-sm text-slate-400">
            New follows, comments, approvals, appeal reviews, and account moderation updates will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
