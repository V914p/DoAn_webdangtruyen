import mongoose from 'mongoose';

const moderationCaseSchema = new mongoose.Schema({
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  contentType: {
    type: String,
    enum: ['Story', 'Artwork'],
    required: true
  },
  workflowStatus: {
    type: String,
    enum: ['open', 'assigned'],
    default: 'open'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  workflowNote: {
    type: String,
    trim: true,
    default: ''
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

moderationCaseSchema.index({ contentType: 1, contentId: 1 }, { unique: true });
moderationCaseSchema.index({ workflowStatus: 1, updatedAt: -1 });

const ModerationCase = mongoose.model('ModerationCase', moderationCaseSchema);

export default ModerationCase;