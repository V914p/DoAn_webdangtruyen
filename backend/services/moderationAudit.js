import ModerationAuditLog from '../models/ModerationAuditLog.js';

export async function recordModerationAuditEvent({
  actionType,
  actorUserId = null,
  actorUsername = 'system',
  targetUser = null,
  targetUserId = null,
  targetUsername = '',
  targetUserStatus = '',
  reason = '',
  metadata = {}
}) {
  return ModerationAuditLog.create({
    actionType,
    actorUser: actorUserId,
    actorUsernameSnapshot: String(actorUsername || 'system').trim() || 'system',
    targetUserId: targetUser?._id || targetUserId || null,
    targetUsernameSnapshot: String(targetUser?.username || targetUsername || '').trim(),
    targetUserStatus: String(targetUser?.accountStatus || targetUserStatus || '').trim(),
    reason: String(reason || '').trim(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {}
  });
}
