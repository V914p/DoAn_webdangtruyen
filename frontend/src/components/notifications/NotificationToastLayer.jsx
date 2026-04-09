import { motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatedList } from '../ui/animated-list';
import { getCurrentUser, getToken, subscribeToCurrentUserChange } from '../../services/authService';
import { emitNotificationChange, subscribeToNotificationChanges, subscribeToNotifications } from '../../services/notificationService';
import { getNotificationLink, getNotificationPresentation } from '../../utils/notifications';
import { formatRelative } from '../../utils/helpers';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const TOAST_LIFETIME = 7000;
const MAX_TOASTS = 4;
const TOAST_SYNC_KEY_PREFIX = 'notification-toast-sync';

function getToastGroupKey(notification) {
  if (notification?.type === 'follow') {
    return 'follow';
  }

  if (notification?.type === 'comment') {
    return 'comment';
  }

  return `${notification?.type || 'notification'}:${notification?._id || Date.now()}`;
}

function getNotificationUserId(notification) {
  if (!notification) {
    return null;
  }

  if (typeof notification.from === 'object') {
    return notification.from?._id || null;
  }

  return notification.from || null;
}

function getToastUsers(notifications) {
  const users = [];
  const seenUserIds = new Set();

  notifications.forEach((notification) => {
    const userId = getNotificationUserId(notification);

    if (!userId || seenUserIds.has(String(userId))) {
      return;
    }

    seenUserIds.add(String(userId));
    users.push(notification.from);
  });

  return users;
}

function buildToastEntry(notification, existingToast = null) {
  const nextNotifications = existingToast
    ? [notification, ...existingToast.notifications.filter((item) => item._id !== notification._id)]
    : [notification];

  nextNotifications.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  return {
    toastId: existingToast?.toastId || getToastGroupKey(notification),
    groupKey: existingToast?.groupKey || getToastGroupKey(notification),
    type: notification.type,
    notifications: nextNotifications,
    latestNotification: nextNotifications[0]
  };
}

function getToastSummary(toast) {
  const latestNotification = toast.latestNotification;
  const users = getToastUsers(toast.notifications);
  const primaryUser = users[0];
  const primaryLabel = primaryUser?.username ? `@${primaryUser.username}` : 'System update';
  const otherUsersCount = Math.max(0, users.length - 1);
  const otherNotificationsCount = Math.max(0, toast.notifications.length - 1);
  const allSameContent = toast.notifications.every((notification) => String(notification.contentId || '') === String(latestNotification?.contentId || ''));

  if (latestNotification?.contentDeleted) {
    return {
      heading: primaryLabel,
      description: latestNotification?.contentTitle
        ? `"${latestNotification.contentTitle}" was deleted before you opened it.`
        : 'This post was deleted before you opened it.',
      cta: getNotificationPresentation(latestNotification).cta,
      link: getNotificationLink(latestNotification),
      markAsReadOnOpen: !latestNotification?.read
    };
  }

  if (toast.type === 'follow' && otherUsersCount > 0) {
    return {
      heading: `${primaryLabel} + ${otherUsersCount}`,
      description: `${primaryLabel} and ${otherUsersCount} other users are following you.`,
      cta: 'Open inbox',
      link: '/notifications',
      markAsReadOnOpen: false
    };
  }

  if (toast.type === 'comment' && otherUsersCount > 0) {
    return {
      heading: `${primaryLabel} + ${otherUsersCount}`,
      description: allSameContent
        ? `${primaryLabel} and ${otherUsersCount} other users are commenting on your ${latestNotification?.contentType?.toLowerCase() || 'post'}.`
        : `${primaryLabel} and ${otherUsersCount} other users are commenting on your posts.`,
      cta: allSameContent && latestNotification?.contentId ? 'Open latest post' : 'Open inbox',
      link: allSameContent && latestNotification?.contentId ? getNotificationLink(latestNotification) : '/notifications',
      markAsReadOnOpen: false
    };
  }

  if (toast.type === 'comment' && otherNotificationsCount > 0) {
    return {
      heading: `${primaryLabel} x${toast.notifications.length}`,
      description: allSameContent
        ? `${primaryLabel} left ${toast.notifications.length} new comments on your ${latestNotification?.contentType?.toLowerCase() || 'post'}.`
        : `${primaryLabel} left ${toast.notifications.length} new comments on your posts.`,
      cta: allSameContent && latestNotification?.contentId ? 'Open latest post' : 'Open inbox',
      link: allSameContent && latestNotification?.contentId ? getNotificationLink(latestNotification) : '/notifications',
      markAsReadOnOpen: false
    };
  }

  return {
    heading: primaryLabel,
    description: latestNotification?.commentDeleted
      ? 'The original comment was deleted, but you can still open the post.'
      : latestNotification?.commentPreview || latestNotification?.message || 'You have a new notification.',
    cta: getNotificationPresentation(latestNotification).cta,
    link: getNotificationLink(latestNotification),
    markAsReadOnOpen: !latestNotification?.read
  };
}

function getToastSyncKey(userId) {
  return `${TOAST_SYNC_KEY_PREFIX}:${userId}`;
}

function readToastSyncTimestamp(userId) {
  if (!userId) {
    return null;
  }

  const rawValue = localStorage.getItem(getToastSyncKey(userId));
  const parsedValue = Number(rawValue);

  if (!rawValue || Number.isNaN(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function writeToastSyncTimestamp(userId, createdAt) {
  if (!userId || !createdAt) {
    return;
  }

  const nextTimestamp = new Date(createdAt).getTime();

  if (Number.isNaN(nextTimestamp) || nextTimestamp <= 0) {
    return;
  }

  localStorage.setItem(getToastSyncKey(userId), String(nextTimestamp));
}

function getToastTheme(notification) {
  if (notification.contentDeleted) {
    return {
      cardBorder: 'border-amber-300/20',
      iconRing: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
      button: 'border-amber-300/20 bg-amber-400/10 hover:bg-amber-400/15',
      progress: 'from-amber-400 via-orange-300 to-yellow-300'
    };
  }

  if (notification.type === 'comment') {
    return {
      cardBorder: 'border-sky-300/15',
      iconRing: 'border-sky-300/20 bg-sky-400/10 text-sky-100',
      button: 'border-sky-300/20 bg-sky-400/10 hover:bg-sky-400/15',
      progress: 'from-sky-400 via-cyan-300 to-blue-300'
    };
  }

  if (notification.type === 'follow') {
    return {
      cardBorder: 'border-fuchsia-300/15',
      iconRing: 'border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100',
      button: 'border-fuchsia-300/20 bg-fuchsia-400/10 hover:bg-fuchsia-400/15',
      progress: 'from-fuchsia-400 via-pink-300 to-rose-300'
    };
  }

  if (notification.type === 'approval') {
    return {
      cardBorder: 'border-emerald-300/15',
      iconRing: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
      button: 'border-emerald-300/20 bg-emerald-400/10 hover:bg-emerald-400/15',
      progress: 'from-emerald-400 via-lime-300 to-teal-300'
    };
  }

  return {
    cardBorder: 'border-white/10',
    iconRing: 'border-white/10 bg-white/5 text-white',
    button: 'border-white/10 bg-white/5 hover:bg-white/10',
    progress: 'from-brand via-sky-400 to-cyan-300'
  };
}

export function NotificationToastLayer() {
  const [toasts, setToasts] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const timersRef = useRef(new Map());
  const seenNotificationIdsRef = useRef(new Set());
  const navigate = useNavigate();
  const currentUserId = currentUser?._id || currentUser?.id || null;

  const clearTimer = (toastId) => {
    const timer = timersRef.current.get(toastId);

    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(toastId);
    }
  };

  const dismissToast = (toastId) => {
    clearTimer(toastId);
    setToasts((prev) => prev.filter((item) => item.toastId !== toastId));
  };

  const scheduleDismiss = (toastId) => {
    clearTimer(toastId);

    const timer = window.setTimeout(() => {
      dismissToast(toastId);
    }, TOAST_LIFETIME);

    timersRef.current.set(toastId, timer);
  };

  const pushToast = (notification) => {
    if (!notification?._id) {
      return;
    }

    if (seenNotificationIdsRef.current.has(notification._id)) {
      return;
    }

    seenNotificationIdsRef.current.add(notification._id);

    setToasts((prev) => {
      const groupKey = getToastGroupKey(notification);
      const existingToast = prev.find((item) => item.groupKey === groupKey);
      const nextToast = buildToastEntry(notification, existingToast);
      const nextToasts = [nextToast, ...prev.filter((item) => item.groupKey !== groupKey)].slice(0, MAX_TOASTS);

      prev
        .filter((item) => !nextToasts.some((nextItem) => nextItem.toastId === item.toastId))
        .forEach((item) => clearTimer(item.toastId));

      scheduleDismiss(nextToast.toastId);
      return nextToasts;
    });
  };

  useEffect(() => {
    setToasts([]);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    seenNotificationIdsRef.current.clear();
  }, [currentUserId]);

  useEffect(() => subscribeToCurrentUserChange(setCurrentUser), []);

  useEffect(() => {
    return subscribeToNotificationChanges((payload) => {
      if (payload?.type !== 'updated' || !payload.notification) {
        return;
      }

      setToasts((prev) => prev.map((toast) => {
        const hasNotification = toast.notifications.some((item) => item._id === payload.notification._id);

        if (!hasNotification) {
          return toast;
        }

        return buildToastEntry(payload.notification, toast);
      }));
    });
  }, []);

  useEffect(() => {
    return subscribeToNotifications((notification) => {
      pushToast(notification);

      if (currentUserId) {
        writeToastSyncTimestamp(currentUserId, notification.createdAt);
      }
    });
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !getToken()) {
      return undefined;
    }

    let cancelled = false;

    const syncMissedNotifications = async () => {
      try {
        const response = await fetch(`${API_URL}/api/notifications`, {
          headers: {
            Authorization: `Bearer ${getToken()}`
          }
        });

        const data = await response.json();

        if (!data.success || cancelled) {
          return;
        }

        const notifications = Array.isArray(data.data) ? data.data : [];
        const unreadNotifications = notifications.filter((item) => !item.read);
        const lastSyncedAt = readToastSyncTimestamp(currentUserId);

        const notificationsToToast = lastSyncedAt
          ? unreadNotifications.filter((item) => new Date(item.createdAt).getTime() > lastSyncedAt)
          : unreadNotifications;

        notificationsToToast
          .slice(0, 50)
          .reverse()
          .forEach((notification) => {
            pushToast(notification);
          });

        if (notifications[0]?.createdAt) {
          writeToastSyncTimestamp(currentUserId, notifications[0].createdAt);
        }
      } catch (error) {
        console.error('Failed to sync missed notification toasts:', error);
      }
    };

    syncMissedNotifications();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (data.success) {
        emitNotificationChange({
          type: 'updated',
          notificationId,
          read: true
        });
      }
    } catch (error) {
      console.error('Failed to mark notification as read from toast:', error);
    }
  };

  const handleOpen = async (toast) => {
    const summary = getToastSummary(toast);
    const latestNotification = toast.latestNotification;

    if (summary.markAsReadOnOpen && latestNotification?._id) {
      await markAsRead(latestNotification._id);
    }

    dismissToast(toast.toastId);
    navigate(summary.link, {
      state: {
        notification: latestNotification,
        openedFromNotification: true,
        ...(latestNotification?.commentId
          ? {
              targetCommentId: String(latestNotification.commentId)
            }
          : {})
      }
    });
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] w-[min(92vw,24rem)] sm:right-6 sm:top-6">
      <AnimatedList delay={180} className="items-stretch gap-3">
        {[...toasts].reverse().map((toast) => {
          const notification = toast.latestNotification;
          const { Icon, name } = getNotificationPresentation(notification);
          const summary = getToastSummary(toast);
          const theme = getToastTheme(notification);

          return (
            <motion.article
              key={toast.toastId}
              layout
              className={`pointer-events-auto relative overflow-hidden rounded-[1.5rem] border bg-slate-950/96 text-left shadow-[0_18px_40px_rgba(2,6,23,0.4)] ${theme.cardBorder}`}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.09),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.96))]" />

              <div className="relative p-4">
                <div className="flex items-start gap-3 pr-10">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${theme.iconRing}`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{name}</p>
                    <h3 className="mt-1 text-base font-semibold text-white">{summary.heading}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{summary.description}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {notification.from?.avatar ? (
                      <img
                        src={notification.from.avatar.startsWith('http') ? notification.from.avatar : `${API_URL}${notification.from.avatar}`}
                        alt={notification.from.username}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                        {notification.from?.username?.[0]?.toUpperCase() || '!'}
                      </div>
                    )}
                    <span className="truncate text-xs text-slate-400">{formatRelative(notification.createdAt)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpen(toast)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-100 transition ${theme.button}`}
                  >
                    {summary.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.toastId)}
                  className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/20 p-1.5 text-slate-300 transition hover:border-white/20 hover:text-white"
                  aria-label="Close notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: TOAST_LIFETIME / 1000, ease: 'linear' }}
                className={`absolute inset-x-0 bottom-0 h-1 origin-left bg-gradient-to-r ${theme.progress}`}
              />
            </motion.article>
          );
        })}
      </AnimatedList>
    </div>
  );
}