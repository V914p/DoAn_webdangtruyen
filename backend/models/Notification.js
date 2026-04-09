import mongoose from 'mongoose';

// Notification schema for real-time notifications
const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['follow', 'comment', 'approval', 'rejection', 'post'],
    required: true
  },
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  commentId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  commentPreview: {
    type: String,
    default: ''
  },
  commentDeleted: {
    type: Boolean,
    default: false
  },
  contentType: {
    type: String,
    enum: ['Story', 'Artwork', null],
    default: null
  },
  contentTitle: {
    type: String,
    default: ''
  },
  contentDeleted: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for querying unread notifications
notificationSchema.index({ recipient: 1, read: 1 });
// Index for sorting by date
notificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
