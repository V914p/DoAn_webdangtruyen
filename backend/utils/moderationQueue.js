import ModerationCase from '../models/ModerationCase.js';
import Report from '../models/Report.js';

export function normalizeReportContentType(value = '') {
  const normalizedValue = String(value).trim().toLowerCase();

  if (normalizedValue === 'story') return 'Story';
  if (normalizedValue === 'artwork') return 'Artwork';
  return null;
}

function normalizeWorkflowStatus(value = '') {
  return String(value).trim().toLowerCase() === 'assigned' ? 'assigned' : 'open';
}

export function serializeWorkflow(caseItem) {
  const status = normalizeWorkflowStatus(caseItem?.workflowStatus);

  return {
    status,
    assignedTo: status === 'assigned' && caseItem?.assignedTo
      ? {
          _id: caseItem.assignedTo._id,
          username: caseItem.assignedTo.username,
          avatar: caseItem.assignedTo.avatar || null
        }
      : null,
    workflowNote: caseItem?.workflowNote || '',
    updatedAt: caseItem?.updatedAt || null,
    lastUpdatedBy: caseItem?.lastUpdatedBy
      ? {
          _id: caseItem.lastUpdatedBy._id,
          username: caseItem.lastUpdatedBy.username,
          avatar: caseItem.lastUpdatedBy.avatar || null
        }
      : null
  };
}

export function buildReasonSummaryPipeline(matchStage = null) {
  const pipeline = [];

  if (matchStage) {
    pipeline.push({ $match: matchStage });
  }

  pipeline.push(
    {
      $project: {
        contentType: 1,
        contentId: 1,
        primaryReason: {
          $trim: {
            input: {
              $ifNull: [
                {
                  $arrayElemAt: [{ $split: ['$reason', ':'] }, 0]
                },
                ''
              ]
            }
          }
        }
      }
    },
    {
      $group: {
        _id: {
          contentType: '$contentType',
          contentId: '$contentId',
          reason: '$primaryReason'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  );

  return pipeline;
}

function getAssignedUserId(caseItem) {
  if (!caseItem?.assignedTo) {
    return null;
  }

  return String(caseItem.assignedTo._id || caseItem.assignedTo);
}

function isAssignedToAnotherAdmin(caseItem, adminUserId) {
  return normalizeWorkflowStatus(caseItem?.workflowStatus) === 'assigned'
    && Boolean(getAssignedUserId(caseItem))
    && getAssignedUserId(caseItem) !== String(adminUserId);
}

async function populateModerationCase(query) {
  return ModerationCase.findOne(query)
    .populate('assignedTo', 'username avatar')
    .populate('lastUpdatedBy', 'username avatar');
}

export async function ensureIncidentExists(contentId, contentType) {
  const activeReportCount = await Report.countDocuments({
    contentId,
    contentType
  });

  return activeReportCount > 0;
}

export async function releaseIncidentAssignment(contentId, contentType, adminUserId) {
  return ModerationCase.findOneAndUpdate(
    {
      contentId,
      contentType,
      assignedTo: adminUserId
    },
    {
      $set: {
        workflowStatus: 'open',
        assignedTo: null,
        workflowNote: '',
        lastUpdatedBy: adminUserId
      }
    },
    {
      new: true
    }
  )
    .populate('assignedTo', 'username avatar')
    .populate('lastUpdatedBy', 'username avatar');
}

export async function assignIncidentToAdmin(contentId, contentType, adminUserId) {
  try {
    const moderationCase = await ModerationCase.findOneAndUpdate(
      {
        contentId,
        contentType,
        $or: [
          { workflowStatus: { $ne: 'assigned' } },
          { assignedTo: adminUserId },
          { assignedTo: null }
        ]
      },
      {
        $set: {
          workflowStatus: 'assigned',
          assignedTo: adminUserId,
          workflowNote: '',
          lastUpdatedBy: adminUserId
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    )
      .populate('assignedTo', 'username avatar')
      .populate('lastUpdatedBy', 'username avatar');

    if (moderationCase) {
      return {
        moderationCase,
        conflict: null
      };
    }
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }

  const existingCase = await populateModerationCase({ contentId, contentType });

  if (isAssignedToAnotherAdmin(existingCase, adminUserId)) {
    return {
      moderationCase: null,
      conflict: existingCase
    };
  }

  const moderationCase = await ModerationCase.findOneAndUpdate(
    {
      contentId,
      contentType
    },
    {
      $set: {
        workflowStatus: 'assigned',
        assignedTo: adminUserId,
        workflowNote: '',
        lastUpdatedBy: adminUserId
      }
    },
    {
      new: true
    }
  )
    .populate('assignedTo', 'username avatar')
    .populate('lastUpdatedBy', 'username avatar');

  return {
    moderationCase,
    conflict: null
  };
}