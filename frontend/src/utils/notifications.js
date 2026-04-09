import {
  BellRing,
  CheckCheck,
  MessageCircleMore,
  ShieldAlert,
  UserRoundPlus
} from 'lucide-react';

export function buildRemovedContentLink({ contentId, contentType, contentTitle, creatorUsername, creatorId } = {}) {
  const params = new URLSearchParams();

  if (contentId) {
    params.set('contentId', String(contentId));
  }

  if (contentType) {
    params.set('contentType', String(contentType));
  }

  if (contentTitle) {
    params.set('title', String(contentTitle));
  }

  if (creatorUsername) {
    params.set('creator', String(creatorUsername));
  }

  if (creatorId) {
    params.set('creatorId', String(creatorId));
  }

  const query = params.toString();
  return query ? `/post-unavailable?${query}` : '/post-unavailable';
}

export function getNotificationLink(notification) {
  if (!notification) {
    return '/notifications';
  }

  const senderId = typeof notification.from === 'object' ? notification.from?._id : notification.from;
  const senderUsername = typeof notification.from === 'object' ? notification.from?.username : '';

  if (notification.contentDeleted) {
    return buildRemovedContentLink({
      contentId: notification.contentId,
      contentType: notification.contentType,
      contentTitle: notification.contentTitle,
      creatorUsername: senderUsername,
      creatorId: senderId
    });
  }

  if (notification.type === 'follow' && senderId) {
    return `/profile/${senderId}`;
  }

  if (notification.contentId && notification.contentType && notification.type !== 'rejection') {
    const basePath = notification.contentType === 'Story'
      ? `/story/${notification.contentId}`
      : `/artwork/${notification.contentId}`;

    if (notification.commentId) {
      return `${basePath}?comment=${notification.commentId}#comment-${notification.commentId}`;
    }

    return basePath;
  }

  return '/notifications';
}

export function getNotificationPresentation(notification) {
  if (notification?.contentDeleted) {
    return {
      Icon: ShieldAlert,
      name: 'Post removed',
      cta: 'View removal notice'
    };
  }

  switch (notification?.type) {
    case 'follow':
      return {
        Icon: UserRoundPlus,
        name: 'New follower',
        cta: 'View profile'
      };
    case 'comment':
      return {
        Icon: MessageCircleMore,
        name: notification?.commentDeleted ? 'Comment removed' : 'New comment',
        cta: notification?.contentId ? (notification?.commentDeleted ? 'Open comments' : 'Open post') : 'Open inbox'
      };
    case 'approval':
      return {
        Icon: CheckCheck,
        name: 'Approved update',
        cta: notification?.contentId ? 'Open post' : 'Open inbox'
      };
    case 'post':
      return {
        Icon: BellRing,
        name: 'New post',
        cta: notification?.contentId ? 'Open post' : 'Open inbox'
      };
    case 'rejection':
      return {
        Icon: ShieldAlert,
        name: 'Moderation update',
        cta: 'Open inbox'
      };
    default:
      return {
        Icon: BellRing,
        name: 'Notification',
        cta: 'Open inbox'
      };
  }
}