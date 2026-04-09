import Comment from '../models/Comment.js';
import Notification from '../models/Notification.js';
import { connectToDatabase, disconnectFromDatabase } from '../config/database.js';
import { validateEnvironment } from '../config/env.js';

const isDryRun = process.argv.includes('--dry-run');
const WINDOW_MS = 1000 * 60 * 30;
const BATCH_SIZE = 200;

function buildPreview(text = '') {
  return String(text || '').trim().replace(/\s+/g, ' ').slice(0, 280);
}

async function resolveCommentForNotification(notification) {
  if (!notification.contentId || !notification.from) {
    return { resolvedComment: null, reason: 'missing-content-or-author' };
  }

  const createdAt = notification.createdAt ? new Date(notification.createdAt) : new Date();
  const minDate = new Date(createdAt.getTime() - WINDOW_MS);
  const maxDate = new Date(createdAt.getTime() + WINDOW_MS);

  const matchingComments = await Comment.find({
    contentId: notification.contentId,
    contentType: notification.contentType,
    user: notification.from,
    createdAt: {
      $gte: minDate,
      $lte: maxDate
    }
  })
    .sort({ createdAt: 1 })
    .lean();

  if (!matchingComments.length) {
    return { resolvedComment: null, reason: 'no-matching-comments' };
  }

  if (matchingComments.length === 1) {
    return { resolvedComment: matchingComments[0], reason: 'single-match' };
  }

  let closestComment = null;
  let smallestDelta = Number.POSITIVE_INFINITY;

  matchingComments.forEach((comment) => {
    const delta = Math.abs(new Date(comment.createdAt).getTime() - createdAt.getTime());

    if (delta < smallestDelta) {
      smallestDelta = delta;
      closestComment = comment;
    }
  });

  return { resolvedComment: closestComment, reason: 'closest-match' };
}

async function run() {
  validateEnvironment({ requireDatabase: true });
  await connectToDatabase();
  console.log(`Connected to MongoDB${isDryRun ? ' (dry run)' : ''}`);

  let lastId = null;
  let scanned = 0;
  let updated = 0;
  let unresolved = 0;

  while (true) {
    const query = {
      type: 'comment',
      ...(lastId ? { _id: { $gt: lastId } } : {})
    };

    const notifications = await Notification.find(query)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE);

    if (!notifications.length) {
      break;
    }

    lastId = notifications[notifications.length - 1]._id;
    scanned += notifications.length;

    for (const notification of notifications) {
      let changed = false;

      if (notification.commentId) {
        const existingComment = await Comment.findById(notification.commentId).select('_id text').lean();

        const nextPreview = existingComment ? buildPreview(existingComment.text) : notification.commentPreview || '';
        const nextDeleted = !existingComment;

        if ((notification.commentPreview || '') !== nextPreview) {
          notification.commentPreview = nextPreview;
          changed = true;
        }

        if (Boolean(notification.commentDeleted) !== nextDeleted) {
          notification.commentDeleted = nextDeleted;
          changed = true;
        }
      } else {
        const { resolvedComment } = await resolveCommentForNotification(notification);

        if (resolvedComment) {
          notification.commentId = resolvedComment._id;
          notification.commentPreview = buildPreview(resolvedComment.text);
          notification.commentDeleted = false;
          changed = true;
        } else {
          unresolved += 1;
        }
      }

      if (!changed) {
        continue;
      }

      if (!isDryRun) {
        await notification.save();
      }

      updated += 1;
    }

    console.log(`[notification-backfill] scanned=${scanned} updated=${updated} unresolved=${unresolved}`);
  }

  console.log('[notification-backfill] Complete.');
  console.log(`[notification-backfill] Notifications scanned: ${scanned}`);
  console.log(`[notification-backfill] Notifications updated: ${updated}`);
  console.log(`[notification-backfill] Notifications unresolved: ${unresolved}`);
}

run()
  .catch((error) => {
    console.error('Notification comment metadata backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectFromDatabase();
    } catch {
      // Ignore disconnect errors during shutdown.
    }
  });