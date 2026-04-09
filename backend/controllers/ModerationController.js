import mongoose from 'mongoose';
import Story from '../models/Story.js';
import Artwork from '../models/Artwork.js';
import Report from '../models/Report.js';
import User from '../models/User.js';
import AccountAppeal from '../models/AccountAppeal.js';
import ModerationAuditLog from '../models/ModerationAuditLog.js';
import ModerationCase from '../models/ModerationCase.js';
import webSocketManager from '../websocket/WebSocketManager.js';
import { POSTING_RESTRICTION_DAYS, applyPostingRestriction, getActivePostingRestriction, getPermanentBanDeletionDeadline, normalizeModerationReason, serializePermanentBan, serializePostingRestriction } from '../utils/moderation.js';
import {
  assignIncidentToAdmin,
  buildReasonSummaryPipeline,
  ensureIncidentExists,
  normalizeReportContentType,
  releaseIncidentAssignment,
  serializeWorkflow
} from '../utils/moderationQueue.js';
import { CACHE_NAMESPACES, invalidateCacheNamespaces } from '../services/cacheStore.js';
import { recordModerationAuditEvent } from '../services/moderationAudit.js';
import { hideUserContentForPermanentBan, restoreUserContentAfterPermanentBan } from '../services/permanentBanCleanup.js';
import { removeContentFromAllSavedCollections } from '../utils/savedContent.js';

const MAX_REPORT_DETAILS_LIMIT = 50;

function getPrimaryReason(reason = '') {
  return String(reason).split(':')[0].trim();
}

function formatRestrictionEnd(value) {
  return new Date(value).toLocaleString();
}

function getContentModel(type) {
  if (type === 'story') return Story;
  if (type === 'artwork') return Artwork;
  return null;
}

async function deleteModerationCaseForContent(contentId, contentType) {
  await ModerationCase.deleteOne({ contentId, contentType });
}

async function loadContent(type, id) {
  const Model = getContentModel(type);
  return Model ? Model.findById(id) : null;
}

async function getActorUsername(userId) {
  if (!userId) {
    return 'system';
  }

  const actor = await User.findById(userId).select('username');
  return actor?.username || 'system';
}

// Dismiss reports and keep the content visible
export async function dismissReports(req, res) {
  try {
    const { id } = req.params;
    const { type } = req.query;

    const content = await loadContent(type, id);

    if (!content) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    content.status = 'approved';
    await content.save();
    await invalidateCacheNamespaces([
      CACHE_NAMESPACES.CONTENT_DISCOVERY,
      CACHE_NAMESPACES.CREATOR_SEARCH,
      CACHE_NAMESPACES.PUBLIC_PROFILE
    ]);
    const contentType = type === 'story' ? 'Story' : 'Artwork';
    const deletedReports = await Report.deleteMany({ contentId: content._id, contentType });
    await deleteModerationCaseForContent(content._id, contentType);

    await webSocketManager.sendNotification(content.author, {
      recipient: content.author,
      type: 'approval',
      from: req.user.userId,
      contentId: content._id,
      contentType,
      message: `Reports for your ${type} "${content.title}" were reviewed and the post remains visible.`
    });

    return res.status(200).json({
      success: true,
      message: 'Reports dismissed successfully',
      data: {
        content,
        removedReports: deletedReports.deletedCount || 0
      }
    });
  } catch (error) {
    console.error('Dismiss reports error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getModerationAuditHistory(req, res) {
  try {
    const limitParam = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(limitParam, MAX_REPORT_DETAILS_LIMIT);
    const beforeId = String(req.query.before || '').trim();
    const query = {};

    if (beforeId && mongoose.Types.ObjectId.isValid(beforeId)) {
      query._id = { $lt: mongoose.Types.ObjectId(beforeId) };
    }

    const events = await ModerationAuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ success: true, data: events, message: 'Moderation audit history loaded' });
  } catch (error) {
    console.error('Get moderation audit history error:', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

// Ban content after reviewing reports
export async function banContent(req, res) {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const reason = normalizeModerationReason(req.body.reason);

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A ban reason is required'
        }
      });
    }

    const content = await loadContent(type, id);

    if (!content) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    content.status = 'deleted';
    await content.save();
    await removeContentFromAllSavedCollections(content._id);
    await invalidateCacheNamespaces([
      CACHE_NAMESPACES.CONTENT_DISCOVERY,
      CACHE_NAMESPACES.CREATOR_SEARCH,
      CACHE_NAMESPACES.PUBLIC_PROFILE
    ]);
    const contentType = type === 'story' ? 'Story' : 'Artwork';
    const deletedReports = await Report.deleteMany({ contentId: content._id, contentType });
    await deleteModerationCaseForContent(content._id, contentType);
    const author = await User.findById(content.author);
    let restriction = null;

    if (author) {
      await applyPostingRestriction(author, {
        reason,
        source: 'content-ban'
      });
      restriction = getActivePostingRestriction(author);
    }

    await webSocketManager.sendNotification(content.author, {
      recipient: content.author,
      type: 'rejection',
      from: req.user.userId,
      contentId: content._id,
      contentType,
      message: `Your ${type} "${content.title}" was removed after report review. Reason: ${reason}.${restriction ? ` You cannot publish new posts until ${formatRestrictionEnd(restriction.until)}.` : ''}`
    });

    return res.status(200).json({
      success: true,
      message: 'Post banned successfully',
      data: {
        content,
        removedReports: deletedReports.deletedCount || 0,
        postingRestrictedUntil: restriction?.until ?? null,
        postingRestrictionReason: restriction?.reason ?? reason
      }
    });
  } catch (error) {
    console.error('Ban content error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getUsersForModeration(req, res) {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    const userIds = users.map((user) => user._id);

    const [storyCounts, artworkCounts] = await Promise.all([
      Story.aggregate([
        { $match: { author: { $in: userIds }, status: { $ne: 'deleted' } } },
        { $group: { _id: '$author', count: { $sum: 1 } } }
      ]),
      Artwork.aggregate([
        { $match: { author: { $in: userIds }, status: { $ne: 'deleted' } } },
        { $group: { _id: '$author', count: { $sum: 1 } } }
      ])
    ]);

    const storyCountMap = new Map(storyCounts.map((item) => [String(item._id), item.count]));
    const artworkCountMap = new Map(artworkCounts.map((item) => [String(item._id), item.count]));

    return res.status(200).json({
      success: true,
      data: users.map((user) => ({
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        accountStatus: user.accountStatus,
        permanentBanReason: user.permanentBanReason,
        permanentlyBannedAt: user.permanentlyBannedAt,
        createdAt: user.createdAt,
        lastModeratedAt: user.lastModeratedAt,
        storyCount: storyCountMap.get(String(user._id)) || 0,
        artworkCount: artworkCountMap.get(String(user._id)) || 0,
        ...serializePostingRestriction(user)
      })),
      message: 'Users loaded successfully'
    });
  } catch (error) {
    console.error('Get users for moderation error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function banUser(req, res) {
  try {
    const { id } = req.params;
    const reason = normalizeModerationReason(req.body.reason);

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A ban reason is required'
        }
      });
    }

    if (id === req.user.userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'You cannot ban your own account'
        }
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin accounts cannot be banned here'
        }
      });
    }

    await applyPostingRestriction(user, {
      reason,
      source: 'account-ban'
    });

    const restriction = getActivePostingRestriction(user);

    await webSocketManager.sendNotification(user._id, {
      recipient: user._id,
      type: 'rejection',
      from: req.user.userId,
      contentId: null,
      contentType: null,
      message: `Your account posting access has been suspended for ${POSTING_RESTRICTION_DAYS} days. Reason: ${reason}. You can publish again on ${formatRestrictionEnd(restriction.until)}.`
    });

    return res.status(200).json({
      success: true,
      message: 'User suspended successfully',
      data: {
        _id: user._id,
        ...serializePostingRestriction(user)
      }
    });
  } catch (error) {
    console.error('Ban user error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function permanentlyBanUser(req, res) {
  try {
    const { id } = req.params;
    const reason = normalizeModerationReason(req.body.reason);

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A ban reason is required'
        }
      });
    }

    if (id === req.user.userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'You cannot permanently ban your own account'
        }
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin accounts cannot be permanently banned here'
        }
      });
    }

    user.accountStatus = 'permanently-banned';
    user.permanentBanReason = reason;
    user.permanentlyBannedAt = new Date();
    user.postingRestrictedUntil = null;
    user.postingRestrictionReason = '';
    user.postingRestrictionSource = null;
    user.lastModeratedAt = new Date();
    await user.save();

    const actorUsername = await getActorUsername(req.user.userId);
    const hiddenContent = await hideUserContentForPermanentBan(user._id);

    await AccountAppeal.updateMany(
      { user: user._id, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          reviewReason: 'A new permanent ban replaced the previous appeal review cycle.',
          reviewedBy: req.user.userId,
          reviewedAt: new Date()
        }
      }
    );

    await recordModerationAuditEvent({
      actionType: 'permanent-ban',
      actorUserId: req.user.userId,
      actorUsername,
      targetUser: user,
      reason,
      metadata: {
        hiddenStories: hiddenContent?.hiddenStories || [],
        hiddenArtworks: hiddenContent?.hiddenArtworks || [],
        permanentDeletionScheduledFor: getPermanentBanDeletionDeadline(user)
      }
    });

    await webSocketManager.sendNotification(user._id, {
      recipient: user._id,
      type: 'rejection',
      from: req.user.userId,
      contentId: null,
      contentType: null,
      message: `Your account has been permanently banned. Reason: ${reason}. You can sign in to review the decision and submit an appeal to the admin team.`
    });

    return res.status(200).json({
      success: true,
      message: 'User permanently banned successfully',
      data: {
        _id: user._id,
        accountStatus: user.accountStatus,
        permanentBanReason: user.permanentBanReason,
        permanentlyBannedAt: user.permanentlyBannedAt,
        ...serializePostingRestriction(user)
      }
    });
  } catch (error) {
    console.error('Permanent ban user error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function unbanUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    user.accountStatus = 'active';
    user.permanentBanReason = '';
    user.permanentlyBannedAt = null;
    user.postingRestrictedUntil = null;
    user.postingRestrictionReason = '';
    user.postingRestrictionSource = null;
    user.lastModeratedAt = new Date();
    user.pendingLoginNoticeType = 'success';
    user.pendingLoginNoticeTitle = 'Account restored';
    user.pendingLoginNoticeMessage = 'Your account appeal was approved. Your access has been restored and you can use the platform again.';
    await user.save();

    const actorUsername = await getActorUsername(req.user.userId);
    const restoredContent = await restoreUserContentAfterPermanentBan(user._id);

    await recordModerationAuditEvent({
      actionType: 'account-restored',
      actorUserId: req.user.userId,
      actorUsername,
      targetUser: user,
      reason: 'Manual admin restore',
      metadata: restoredContent
    });

    await webSocketManager.sendNotification(user._id, {
      recipient: user._id,
      type: 'approval',
      from: req.user.userId,
      contentId: null,
      contentType: null,
      message: 'Your posting restriction has been lifted by the admin team.'
    });

    return res.status(200).json({
      success: true,
      message: 'User restriction cleared successfully',
      data: {
        _id: user._id,
        ...serializePostingRestriction(user)
      }
    });
  } catch (error) {
    console.error('Unban user error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getAccountAppeals(req, res) {
  try {
    const appeals = await AccountAppeal.find()
      .populate('user', 'username email avatar accountStatus permanentBanReason permanentlyBannedAt')
      .populate('reviewedBy', 'username')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: appeals,
      message: 'Appeals loaded successfully'
    });
  } catch (error) {
    console.error('Get appeals error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function approveAccountAppeal(req, res) {
  try {
    const { id } = req.params;
    const appeal = await AccountAppeal.findById(id).populate('user');

    if (!appeal) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appeal not found'
        }
      });
    }

    if (appeal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'This appeal has already been reviewed'
        }
      });
    }

    appeal.status = 'approved';
    appeal.reviewReason = String(req.body.reason || 'Appeal approved by admin.').trim();
    appeal.reviewedBy = req.user.userId;
    appeal.reviewedAt = new Date();
    await appeal.save();

    const user = appeal.user;
    if (user) {
      user.accountStatus = 'active';
      user.permanentBanReason = '';
      user.permanentlyBannedAt = null;
      user.postingRestrictedUntil = null;
      user.postingRestrictionReason = '';
      user.postingRestrictionSource = null;
      user.lastModeratedAt = new Date();
      user.pendingLoginNoticeType = 'success';
      user.pendingLoginNoticeTitle = 'Account restored';
      user.pendingLoginNoticeMessage = 'Your appeal was approved. Your account has been unbanned successfully.';
      await user.save();

      const actorUsername = await getActorUsername(req.user.userId);
      const restoredContent = await restoreUserContentAfterPermanentBan(user._id);

      await recordModerationAuditEvent({
        actionType: 'appeal-approved',
        actorUserId: req.user.userId,
        actorUsername,
        targetUser: user,
        reason: appeal.reviewReason,
        metadata: restoredContent
      });

      await webSocketManager.sendNotification(user._id, {
        recipient: user._id,
        type: 'approval',
        from: req.user.userId,
        contentId: null,
        contentType: null,
        message: 'Your account appeal was approved and your access has been restored.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Appeal approved successfully',
      data: appeal
    });
  } catch (error) {
    console.error('Approve appeal error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function rejectAccountAppeal(req, res) {
  try {
    const { id } = req.params;
    const reason = normalizeModerationReason(req.body.reason);

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A rejection reason is required'
        }
      });
    }

    const appeal = await AccountAppeal.findById(id).populate('user');

    if (!appeal) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appeal not found'
        }
      });
    }

    if (appeal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'This appeal has already been reviewed'
        }
      });
    }

    appeal.status = 'rejected';
    appeal.reviewReason = reason;
    appeal.reviewedBy = req.user.userId;
    appeal.reviewedAt = new Date();
    await appeal.save();

    const actorUsername = await getActorUsername(req.user.userId);

    await recordModerationAuditEvent({
      actionType: 'appeal-rejected',
      actorUserId: req.user.userId,
      actorUsername,
      targetUser: appeal.user,
      reason,
      metadata: {
        permanentDeletionScheduledFor: appeal.user ? getPermanentBanDeletionDeadline(appeal.user) : null
      }
    });

    if (appeal.user?._id) {
      await webSocketManager.sendNotification(appeal.user._id, {
        recipient: appeal.user._id,
        type: 'rejection',
        from: req.user.userId,
        contentId: null,
        contentType: null,
        message: `Your account appeal was rejected. Reason: ${reason}. You can submit another appeal later if you have new information.`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Appeal rejected successfully',
      data: appeal
    });
  } catch (error) {
    console.error('Reject appeal error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

// Get all reports (admin only)
export async function getReports(req, res) {
  try {
    const [groupedReports, groupedReasons] = await Promise.all([
      Report.aggregate([
        {
          $group: {
            _id: {
              contentType: '$contentType',
              contentId: '$contentId'
            },
            reportCount: { $sum: 1 },
            latestReportAt: { $max: '$createdAt' }
          }
        },
        { $sort: { latestReportAt: -1 } }
      ]),
      Report.aggregate([
        ...buildReasonSummaryPipeline(),
        {
          $group: {
            _id: {
              contentType: '$_id.contentType',
              contentId: '$_id.contentId'
            },
            reasonSummary: {
              $push: {
                reason: '$_id.reason',
                count: '$count'
              }
            }
          }
        }
      ])
    ]);

    const storyIds = groupedReports.filter((item) => item._id.contentType === 'Story').map((item) => item._id.contentId);
    const artworkIds = groupedReports.filter((item) => item._id.contentType === 'Artwork').map((item) => item._id.contentId);

    const [stories, artworks] = await Promise.all([
      storyIds.length
        ? Story.find({ _id: { $in: storyIds } }).populate('author', 'username avatar')
        : Promise.resolve([]),
      artworkIds.length
        ? Artwork.find({ _id: { $in: artworkIds } }).populate('author', 'username avatar')
        : Promise.resolve([])
    ]);

    const storyMap = new Map(stories.map((item) => [String(item._id), item]));
    const artworkMap = new Map(artworks.map((item) => [String(item._id), item]));
    const reasonSummaryMap = new Map(
      groupedReasons.map((item) => [
        `${item._id.contentType}:${item._id.contentId}`,
        item.reasonSummary.filter((entry) => entry.reason).slice(0, 5)
      ])
    );

    const moderationCaseFilters = [
      storyIds.length ? { contentType: 'Story', contentId: { $in: storyIds } } : null,
      artworkIds.length ? { contentType: 'Artwork', contentId: { $in: artworkIds } } : null
    ].filter(Boolean);

    const moderationCases = moderationCaseFilters.length
      ? await ModerationCase.find({ $or: moderationCaseFilters })
          .populate('assignedTo', 'username avatar')
          .populate('lastUpdatedBy', 'username avatar')
      : [];

    const moderationCaseMap = new Map(
      moderationCases.map((item) => [`${item.contentType}:${item.contentId}`, item])
    );

    const queue = groupedReports.flatMap((item) => {
      const groupKey = `${item._id.contentType}:${item._id.contentId}`;
      const content = item._id.contentType === 'Story' ? storyMap.get(String(item._id.contentId)) : artworkMap.get(String(item._id.contentId));

      if (!content) {
        return [];
      }

      return [{
        _id: groupKey,
        contentType: item._id.contentType,
        contentId: content,
        reportCount: item.reportCount,
        latestReportAt: item.latestReportAt,
        reasonSummary: reasonSummaryMap.get(groupKey) || [],
        workflow: serializeWorkflow(moderationCaseMap.get(groupKey))
      }];
    });

    return res.status(200).json({
      success: true,
      data: queue,
      message: 'Reported posts loaded successfully'
    });
  } catch (error) {
    console.error('Get reports error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function openReportIncident(req, res) {
  try {
    const { id, contentType } = req.params;
    const normalizedContentType = normalizeReportContentType(contentType);
    const previousContentId = String(req.body.previousContentId || '').trim();
    const previousContentType = normalizeReportContentType(req.body.previousContentType || '');

    if (!normalizedContentType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid content type'
        }
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid content id'
        }
      });
    }

    const contentObjectId = new mongoose.Types.ObjectId(id);
    const incidentExists = await ensureIncidentExists(contentObjectId, normalizedContentType);

    if (!incidentExists) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No active incident found for this content'
        }
      });
    }

    const { moderationCase, conflict } = await assignIncidentToAdmin(contentObjectId, normalizedContentType, req.user.userId);

    if (conflict) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'INCIDENT_ALREADY_ASSIGNED',
          message: `This incident is already assigned to @${conflict.assignedTo?.username || 'another admin'}.`
        },
        data: {
          contentId: id,
          contentType: normalizedContentType,
          workflow: serializeWorkflow(conflict)
        }
      });
    }

    let releasedIncident = null;

    if (previousContentType && previousContentId && previousContentId !== id && mongoose.Types.ObjectId.isValid(previousContentId)) {
      releasedIncident = await releaseIncidentAssignment(
        new mongoose.Types.ObjectId(previousContentId),
        previousContentType,
        req.user.userId
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        current: {
          contentId: id,
          contentType: normalizedContentType,
          workflow: serializeWorkflow(moderationCase)
        },
        previous: releasedIncident
          ? {
              contentId: String(releasedIncident.contentId),
              contentType: releasedIncident.contentType,
              workflow: serializeWorkflow(releasedIncident)
            }
          : null
      },
      message: 'Incident opened successfully'
    });
  } catch (error) {
    console.error('Open report incident error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function releaseReportIncident(req, res) {
  try {
    const { id, contentType } = req.params;
    const normalizedContentType = normalizeReportContentType(contentType);

    if (!normalizedContentType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid content type'
        }
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid content id'
        }
      });
    }

    const contentObjectId = new mongoose.Types.ObjectId(id);
    const moderationCase = await releaseIncidentAssignment(contentObjectId, normalizedContentType, req.user.userId);

    return res.status(200).json({
      success: true,
      data: {
        contentId: id,
        contentType: normalizedContentType,
        workflow: serializeWorkflow(moderationCase)
      },
      message: 'Incident released successfully'
    });
  } catch (error) {
    console.error('Release report incident error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}

export async function getReportDetails(req, res) {
  try {
    const { id, contentType } = req.params;
    const normalizedContentType = normalizeReportContentType(contentType);

    if (!normalizedContentType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid content type'
        }
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid content id'
        }
      });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), MAX_REPORT_DETAILS_LIMIT);
    const contentObjectId = new mongoose.Types.ObjectId(id);
    const reportFilter = {
      contentId: contentObjectId,
      contentType: normalizedContentType
    };

    const [reportCount, reports, reasonSummary] = await Promise.all([
      Report.countDocuments(reportFilter),
      Report.find(reportFilter)
        .populate('reporter', 'username avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Report.aggregate([
        ...buildReasonSummaryPipeline(reportFilter),
        {
          $project: {
            _id: 0,
            reason: '$_id.reason',
            count: '$count'
          }
        }
      ])
    ]);

    const totalPages = reportCount ? Math.ceil(reportCount / limit) : 1;

    return res.status(200).json({
      success: true,
      data: {
        reportCount,
        reasonSummary: reasonSummary.filter((item) => item.reason),
        reports: reports.map((report) => ({
          _id: report._id,
          reason: report.reason,
          primaryReason: getPrimaryReason(report.reason),
          createdAt: report.createdAt,
          reporter: report.reporter
        })),
        pagination: {
          page,
          limit,
          totalItems: reportCount,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages
        }
      },
      message: 'Report details loaded successfully'
    });
  } catch (error) {
    console.error('Get report details error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}
