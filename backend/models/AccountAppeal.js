import mongoose from 'mongoose';

const accountAppealSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  banReason: {
    type: String,
    required: true,
    trim: true
  },
  bannedAt: {
    type: Date,
    default: null
  },
  appealReason: {
    type: String,
    required: true,
    trim: true
  },
  evidence: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewReason: {
    type: String,
    default: '',
    trim: true
  },
  reviewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

accountAppealSchema.index({ user: 1, status: 1, createdAt: -1 });

const AccountAppeal = mongoose.model('AccountAppeal', accountAppealSchema);

export default AccountAppeal;