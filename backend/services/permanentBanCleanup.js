import AccountAppeal from '../models/AccountAppeal.js';
import Artwork from '../models/Artwork.js';
import Comment from '../models/Comment.js';
import Follow from '../models/Follow.js';
import ModerationCase from '../models/ModerationCase.js';
import Notification from '../models/Notification.js';
import Report from '../models/Report.js';
import Story from '../models/Story.js';
import User from '../models/User.js';
import { CACHE_NAMESPACES, invalidateCacheNamespaces } from './cacheStore.js';
import { recordModerationAuditEvent } from './moderationAudit.js';
import { getPermanentBanDeletionDeadline } from '../utils/moderation.js';

export const PERMANENT_BAN_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

let cleanupTimer = null;
let cleanupInFlight = null;

async function invalidatePublicUserCaches() {
  await invalidateCacheNamespaces([
    CACHE_NAMESPACES.CONTENT_DISCOVERY,
    CACHE_NAMESPACES.CREATOR_SEARCH,
    CACHE_NAMESPACES.PUBLIC_PROFILE
  ]);
}

async function hideModelContentForPermanentBan(Model, authorId) {
  const items = await Model.find({
    author: authorId,
    status: { $ne: 'deleted' },
    hiddenByPermanentBan: { $ne: true }
  });

  await Promise.all(items.map(async (item) => {
    item.statusBeforePermanentBan = item.status;
    item.hiddenByPermanentBan = true;
    item.status = 'deleted';
    await item.save();
  }));

  return items.length;
}

async function restoreModelContentFromPermanentBan(Model, authorId) {
  const items = await Model.find({
    author: authorId,
    hiddenByPermanentBan: true
  });

  await Promise.all(items.map(async (item) => {
    item.status = item.statusBeforePermanentBan || 'approved';
    item.statusBeforePermanentBan = null;
    item.hiddenByPermanentBan = false;
    await item.save();
  }));

  return items.length;
}

export async function hideUserContentForPermanentBan(authorId) {
  const [hiddenStories, hiddenArtworks] = await Promise.all([
    hideModelContentForPermanentBan(Story, authorId),
    hideModelContentForPermanentBan(Artwork, authorId)
  ]);

  await invalidatePublicUserCaches();

  return {
    hiddenStories,
    hiddenArtworks
  };
}

export async function restoreUserContentAfterPermanentBan(authorId) {
  const [restoredStories, restoredArtworks] = await Promise.all([
    restoreModelContentFromPermanentBan(Story, authorId),
    restoreModelContentFromPermanentBan(Artwork, authorId)
  ]);

  await invalidatePublicUserCaches();

  return {
    restoredStories,
    restoredArtworks
  };
}

async function purgePermanentlyBannedUser(user) {
  const [storyIds, artworkIds] = await Promise.all([
    Story.find({ author: user._id }).distinct('_id'),
    Artwork.find({ author: user._id }).distinct('_id')
  ]);

  const contentIds = [...storyIds, ...artworkIds];

  await Promise.all([
    contentIds.length
      ? User.updateMany(
          {},
          {
            $pull: {
              likes: { $in: contentIds },
              bookmarks: { $in: contentIds },
              readingHistory: { contentId: { $in: contentIds } }
            }
          }
        )
      : Promise.resolve(),
    Story.deleteMany({ author: user._id }),
    Artwork.deleteMany({ author: user._id }),
    Comment.deleteMany({
      $or: [
        { user: user._id },
        contentIds.length ? { contentId: { $in: contentIds } } : null
      ].filter(Boolean)
    }),
    Follow.deleteMany({
      $or: [
        { follower: user._id },
        { following: user._id }
      ]
    }),
    Notification.deleteMany({
      $or: [
        { recipient: user._id },
        { from: user._id },
        contentIds.length ? { contentId: { $in: contentIds } } : null
      ].filter(Boolean)
    }),
    Report.deleteMany({
      $or: [
        { reporter: user._id },
        contentIds.length ? { contentId: { $in: contentIds } } : null
      ].filter(Boolean)
    }),
    contentIds.length
      ? ModerationCase.deleteMany({ contentId: { $in: contentIds } })
      : Promise.resolve(),
    AccountAppeal.deleteMany({ user: user._id })
  ]);

  await recordModerationAuditEvent({
    actionType: 'account-purged',
    targetUser: user,
    reason: 'Permanent ban grace period expired without a successful appeal.',
    metadata: {
      contentDeletedCount: contentIds.length,
      storyDeletedCount: storyIds.length,
      artworkDeletedCount: artworkIds.length,
      permanentlyBannedAt: user.permanentlyBannedAt,
      permanentDeletionScheduledFor: getPermanentBanDeletionDeadline(user)
    }
  });

  await User.deleteOne({ _id: user._id });
}

export async function processExpiredPermanentBanDeletions(now = new Date()) {
  const expiredUsers = await User.find({
    accountStatus: 'permanently-banned',
    permanentlyBannedAt: {
      $ne: null,
      $lte: now
    }
  });

  const eligibleUsers = expiredUsers.filter((user) => {
    const deadline = getPermanentBanDeletionDeadline(user);
    return deadline && deadline <= now;
  });

  if (!eligibleUsers.length) {
    return {
      purgedUsers: 0
    };
  }

  const pendingAppealUserIds = new Set(
    (await AccountAppeal.find({
      user: { $in: eligibleUsers.map((user) => user._id) },
      status: 'pending'
    }).distinct('user')).map((value) => String(value))
  );

  const purgeTargets = eligibleUsers.filter((user) => !pendingAppealUserIds.has(String(user._id)));

  for (const user of purgeTargets) {
    await purgePermanentlyBannedUser(user);
  }

  if (purgeTargets.length) {
    await invalidatePublicUserCaches();
  }

  return {
    purgedUsers: purgeTargets.length
  };
}

export async function runPermanentBanCleanupCycle() {
  if (cleanupInFlight) {
    return cleanupInFlight;
  }

  cleanupInFlight = processExpiredPermanentBanDeletions()
    .catch((error) => {
      console.error('[permanent-ban-cleanup] Failed to process expired deletions:', error);
      throw error;
    })
    .finally(() => {
      cleanupInFlight = null;
    });

  return cleanupInFlight;
}

export function startPermanentBanCleanupScheduler() {
  if (cleanupTimer) {
    return cleanupTimer;
  }

  cleanupTimer = setInterval(() => {
    runPermanentBanCleanupCycle().catch(() => {});
  }, PERMANENT_BAN_CLEANUP_INTERVAL_MS);

  runPermanentBanCleanupCycle().catch(() => {});

  return cleanupTimer;
}

export function stopPermanentBanCleanupScheduler() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
