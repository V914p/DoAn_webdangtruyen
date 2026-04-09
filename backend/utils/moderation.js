export const POSTING_RESTRICTION_DAYS = 3;
export const PERMANENT_BAN_APPEAL_WINDOW_DAYS = 5;

export function normalizeModerationReason(reason) {
  return String(reason || '').trim();
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getPermanentBanDeletionDeadline(user) {
  if (!user?.permanentlyBannedAt) {
    return null;
  }

  const bannedAt = new Date(user.permanentlyBannedAt);
  if (Number.isNaN(bannedAt.getTime())) {
    return null;
  }

  return addDays(bannedAt, PERMANENT_BAN_APPEAL_WINDOW_DAYS);
}

export function getPermanentBanDeletionStatus(user, now = new Date()) {
  const scheduledFor = getPermanentBanDeletionDeadline(user);

  if (!scheduledFor) {
    return {
      isPendingPermanentDeletion: false,
      permanentDeletionScheduledFor: null,
      permanentDeletionMillisecondsRemaining: null,
      permanentDeletionDaysRemaining: null,
      isPermanentDeletionOverdue: false
    };
  }

  const millisecondsRemaining = scheduledFor.getTime() - now.getTime();

  return {
    isPendingPermanentDeletion: true,
    permanentDeletionScheduledFor: scheduledFor,
    permanentDeletionMillisecondsRemaining: Math.max(0, millisecondsRemaining),
    permanentDeletionDaysRemaining: Math.max(0, Math.ceil(millisecondsRemaining / (24 * 60 * 60 * 1000))),
    isPermanentDeletionOverdue: millisecondsRemaining <= 0
  };
}

export function serializePermanentBan(user, now = new Date()) {
  return getPermanentBanDeletionStatus(user, now);
}

export function getActivePostingRestriction(user) {
  if (!user?.postingRestrictedUntil) {
    return null;
  }

  const restrictedUntil = new Date(user.postingRestrictedUntil);
  if (Number.isNaN(restrictedUntil.getTime()) || restrictedUntil <= new Date()) {
    return null;
  }

  return {
    until: restrictedUntil,
    reason: user.postingRestrictionReason || '',
    source: user.postingRestrictionSource || null
  };
}

export async function clearExpiredPostingRestriction(user) {
  if (!user?.postingRestrictedUntil) {
    return user;
  }

  const restrictedUntil = new Date(user.postingRestrictedUntil);
  if (Number.isNaN(restrictedUntil.getTime()) || restrictedUntil > new Date()) {
    return user;
  }

  user.postingRestrictedUntil = null;
  user.postingRestrictionReason = '';
  user.postingRestrictionSource = null;
  await user.save();
  return user;
}

export async function applyPostingRestriction(user, { reason, source, days = POSTING_RESTRICTION_DAYS }) {
  const nextRestrictionEnd = addDays(new Date(), days);
  const currentRestrictionEnd = user.postingRestrictedUntil ? new Date(user.postingRestrictedUntil) : null;

  user.postingRestrictedUntil = currentRestrictionEnd && currentRestrictionEnd > nextRestrictionEnd
    ? currentRestrictionEnd
    : nextRestrictionEnd;
  user.postingRestrictionReason = normalizeModerationReason(reason);
  user.postingRestrictionSource = source;
  user.lastModeratedAt = new Date();

  await user.save();
  return user;
}

export function serializePostingRestriction(user) {
  const restriction = getActivePostingRestriction(user);

  return {
    isPostingRestricted: Boolean(restriction),
    postingRestrictedUntil: restriction?.until ?? null,
    postingRestrictionReason: restriction?.reason ?? '',
    postingRestrictionSource: restriction?.source ?? null
  };
}