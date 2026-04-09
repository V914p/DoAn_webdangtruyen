import mongoose from 'mongoose';

// Report schema for content reporting
const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'contentType'
  },
  contentType: {
    type: String,
    enum: ['Story', 'Artwork'],
    required: true
  },
  reason: {
    type: String,
    required: true,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index to prevent duplicate reports
reportSchema.index({ reporter: 1, contentId: 1 }, { unique: true });

const Report = mongoose.model('Report', reportSchema);

export default Report;
