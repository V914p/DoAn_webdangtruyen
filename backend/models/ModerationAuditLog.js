import mongoose from 'mongoose';

const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;

const moderationAuditLogSchema = new mongoose.Schema({
  actionType: {
    type: String,
    enum: ['permanent-ban', 'appeal-approved', 'appeal-rejected', 'account-restored', 'account-purged'],
    required: true
  },
  actorUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actorUsernameSnapshot: {
    type: String,
    trim: true,
    default: 'system'
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  targetUsernameSnapshot: {
    type: String,
    trim: true,
    default: ''
  },
  targetUserStatus: {
    type: String,
    trim: true,
    default: ''
  },
  reason: {
    type: String,
    trim: true,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

moderationAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_IN_SECONDS });
moderationAuditLogSchema.index({ actionType: 1, createdAt: -1 });
moderationAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });

const ModerationAuditLog = mongoose.model('ModerationAuditLog', moderationAuditLogSchema);

export default ModerationAuditLog;
