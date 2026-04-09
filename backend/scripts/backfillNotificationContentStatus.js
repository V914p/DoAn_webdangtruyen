import Artwork from '../models/Artwork.js';
import Notification from '../models/Notification.js';
import Story from '../models/Story.js';
import { connectToDatabase, disconnectFromDatabase } from '../config/database.js';
import { validateEnvironment } from '../config/env.js';

const isDryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 200;

function extractTitleFromMessage(message = '') {
  const match = String(message).match(/"([^"]+)"/);
  return match?.[1]?.trim() || '';
}

async function findContent(notification) {
  if (!notification?.contentId || !notification?.contentType) {
    return null;
  }

  if (notification.contentType === 'Story') {
    return Story.findById(notification.contentId).select('title status').lean();
  }

  if (notification.contentType === 'Artwork') {
    return Artwork.findById(notification.contentId).select('title status').lean();
  }

  return null;
}

async function run() {
  validateEnvironment({ requireDatabase: true });
  await connectToDatabase();
  console.log(`Connected to MongoDB${isDryRun ? ' (dry run)' : ''}`);

  let lastId = null;
  let scanned = 0;
  let updated = 0;
  let deletedMarked = 0;
  let titleFilled = 0;
  let unresolved = 0;

  while (true) {
    const query = {
      contentId: { $ne: null },
      contentType: { $in: ['Story', 'Artwork'] },
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
      const content = await findContent(notification);
      const inferredTitle = content?.title || notification.contentTitle || extractTitleFromMessage(notification.message);
      const inferredDeleted = !content || content.status === 'deleted';
      let changed = false;

      if ((notification.contentTitle || '') !== inferredTitle) {
        notification.contentTitle = inferredTitle;
        titleFilled += 1;
        changed = true;
      }

      if (Boolean(notification.contentDeleted) !== inferredDeleted) {
        notification.contentDeleted = inferredDeleted;
        if (inferredDeleted) {
          deletedMarked += 1;
        }
        changed = true;
      }

      if (!content && !inferredTitle) {
        unresolved += 1;
      }

      if (!changed) {
        continue;
      }

      if (!isDryRun) {
        await notification.save();
      }

      updated += 1;
    }

    console.log(`[notification-content-backfill] scanned=${scanned} updated=${updated} deletedMarked=${deletedMarked} titleFilled=${titleFilled} unresolved=${unresolved}`);
  }

  console.log('[notification-content-backfill] Complete.');
  console.log(`[notification-content-backfill] Notifications scanned: ${scanned}`);
  console.log(`[notification-content-backfill] Notifications updated: ${updated}`);
  console.log(`[notification-content-backfill] Deleted notifications marked: ${deletedMarked}`);
  console.log(`[notification-content-backfill] Titles filled: ${titleFilled}`);
  console.log(`[notification-content-backfill] Unresolved notifications: ${unresolved}`);
}

run()
  .catch((error) => {
    console.error('Notification content status backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectFromDatabase();
    } catch {
      // Ignore disconnect errors during shutdown.
    }
  });