import mongoose from 'mongoose';

const artistSubscriptionSchema = new mongoose.Schema({
  subscriber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  priceAtPurchase: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'cancelled'],
    default: 'pending'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

artistSubscriptionSchema.index(
  { subscriber: 1, artist: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

const ArtistSubscription = mongoose.model('ArtistSubscription', artistSubscriptionSchema);

export default ArtistSubscription;
