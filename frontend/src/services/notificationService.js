const NOTIFICATION_EVENT = 'app-notification-received';
const NOTIFICATION_CHANGE_EVENT = 'app-notification-changed';
const COMMENT_EVENT = 'app-comment-received';
const NOTIFICATION_SOCKET_EVENT = 'app-notification-socket-state';
let socket = null;
let reconnectTimeout = null;
let manualDisconnect = false;
const contentSubscriptionCounts = new Map();

function emitNotification(notification) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, {
    detail: notification
  }));

  emitNotificationChange({
    type: 'created',
    notification
  });
}

export function emitNotificationChange(payload) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_CHANGE_EVENT, {
    detail: payload
  }));
}

function emitCommentEvent(payload) {
  window.dispatchEvent(new CustomEvent(COMMENT_EVENT, {
    detail: payload
  }));
}

function emitNotificationSocketState(payload) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_SOCKET_EVENT, {
    detail: payload
  }));
}

function buildSocketUrl(token) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const url = new URL(apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/notifications';
  url.searchParams.set('token', token);
  return url.toString();
}

export function connectNotificationSocket(token = localStorage.getItem('token'), options = {}) {
  const { reason = 'manual' } = options;

  if (!token) return null;

  if (socket && socket.readyState <= 1) {
    return socket;
  }

  manualDisconnect = false;

  const activeSocket = new WebSocket(buildSocketUrl(token));
  socket = activeSocket;
  window.ws = activeSocket;

  activeSocket.addEventListener('open', () => {
    emitNotificationSocketState({
      type: 'open',
      reason
    });

    contentSubscriptionCounts.forEach((count, contentId) => {
      if (count > 0) {
        activeSocket.send(JSON.stringify({
          type: 'subscribe-content',
          contentId
        }));
      }
    });
  });

  activeSocket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'notification' && payload.data) {
        emitNotification(payload.data);
      }

      if (payload.type === 'notification-updated' && payload.data) {
        emitNotificationChange({
          type: 'updated',
          notificationId: payload.data._id,
          read: payload.data.read,
          notification: payload.data
        });
      }

      if (payload.type === 'comment-created' && payload.data) {
        emitCommentEvent({
          type: 'created',
          contentId: String(payload.data.contentId),
          comment: payload.data.comment
        });
      }

      if (payload.type === 'comment-deleted' && payload.data) {
        emitCommentEvent({
          type: 'deleted',
          contentId: String(payload.data.contentId),
          commentId: String(payload.data.commentId)
        });
      }
    } catch (error) {
      console.error('Notification socket parse error:', error);
    }
  });

  activeSocket.addEventListener('close', () => {
    emitNotificationSocketState({
      type: 'close',
      reason
    });

    if (window.ws === activeSocket) {
      window.ws = null;
    }

    if (socket === activeSocket) {
      socket = null;
    }

    if (!manualDisconnect && localStorage.getItem('token') && !reconnectTimeout) {
      reconnectTimeout = window.setTimeout(() => {
        reconnectTimeout = null;
        connectNotificationSocket(localStorage.getItem('token'), {
          reason: 'reconnect'
        });
      }, 1500);
    }
  });

  return activeSocket;
}

export function disconnectNotificationSocket() {
  manualDisconnect = true;

  if (reconnectTimeout) {
    window.clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  if (window.ws) {
    window.ws = null;
  }
}

export function subscribeToNotifications(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener(NOTIFICATION_EVENT, handler);

  return () => {
    window.removeEventListener(NOTIFICATION_EVENT, handler);
  };
}

export function subscribeToNotificationChanges(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener(NOTIFICATION_CHANGE_EVENT, handler);

  return () => {
    window.removeEventListener(NOTIFICATION_CHANGE_EVENT, handler);
  };
}

export function subscribeToContentComments(contentId, callback) {
  const normalizedContentId = String(contentId);
  const currentCount = contentSubscriptionCounts.get(normalizedContentId) || 0;

  contentSubscriptionCounts.set(normalizedContentId, currentCount + 1);

  const activeSocket = connectNotificationSocket();
  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.send(JSON.stringify({
      type: 'subscribe-content',
      contentId: normalizedContentId
    }));
  }

  const handler = (event) => {
    if (String(event.detail?.contentId) !== normalizedContentId) {
      return;
    }

    callback(event.detail);
  };

  window.addEventListener(COMMENT_EVENT, handler);

  return () => {
    window.removeEventListener(COMMENT_EVENT, handler);

    const nextCount = (contentSubscriptionCounts.get(normalizedContentId) || 1) - 1;

    if (nextCount <= 0) {
      contentSubscriptionCounts.delete(normalizedContentId);

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'unsubscribe-content',
          contentId: normalizedContentId
        }));
      }

      return;
    }

    contentSubscriptionCounts.set(normalizedContentId, nextCount);
  };
}

export function subscribeToNotificationSocketState(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener(NOTIFICATION_SOCKET_EVENT, handler);

  return () => {
    window.removeEventListener(NOTIFICATION_SOCKET_EVENT, handler);
  };
}
