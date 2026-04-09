import mongoose from 'mongoose';

// Comment schema for user comments on content
const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  contentType: {
    type: String,
    enum: ['Story', 'Artwork'],
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 1000
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create indexes for faster queries
commentSchema.index({ contentId: 1 });
commentSchema.index({ createdAt: 1 });

const Comment = mongoose.model('Comment', commentSchema);

export default Comment;
