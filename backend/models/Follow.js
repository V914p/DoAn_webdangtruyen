import mongoose from 'mongoose';

// Follow schema for user following relationships
const followSchema = new mongoose.Schema({
  follower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  following: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index to prevent duplicate follows
followSchema.index({ follower: 1, following: 1 }, { unique: true });
// Index for counting followers
followSchema.index({ following: 1 });

const Follow = mongoose.model('Follow', followSchema);

export default Follow;
