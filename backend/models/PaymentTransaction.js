import mongoose from 'mongoose';

const paymentTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArtistSubscription',
    default: null
  },
  provider: {
    type: String,
    enum: ['momo'],
    default: 'momo',
    required: true
  },
  transactionType: {
    type: String,
    enum: ['artist_subscription', 'premium_artist_upgrade'],
    default: 'artist_subscription',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'VND',
    required: true
  },
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  requestId: {
    type: String,
    required: true,
    index: true
  },
  momoTransId: {
    type: String,
    default: ''
  },
  payUrl: {
    type: String,
    default: ''
  },
  deeplink: {
    type: String,
    default: ''
  },
  qrCodeUrl: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled', 'expired'],
    default: 'pending',
    index: true
  },
  artistSnapshot: {
    username: {
      type: String,
      default: ''
    },
    priceAtCheckout: {
      type: Number,
      default: 0
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  rawCreateResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  rawCallbackPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  returnUrl: {
    type: String,
    default: ''
  },
  notifyUrl: {
    type: String,
    default: ''
  },
  paidAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

paymentTransactionSchema.index({ user: 1, artist: 1, status: 1, createdAt: -1 });

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);

export default PaymentTransaction;
