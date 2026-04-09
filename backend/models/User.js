import mongoose from 'mongoose';
import { buildSearchNameFields } from '../utils/search.js';

// User schema for authentication and profile
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: null
  },
  phoneNumber: {
    type: String,
    trim: true,
    lowercase: false,
    unique: true,
    sparse: true,
    default: null
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 300,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  searchName: {
    type: String,
    default: '',
    index: true
  },
  searchTokens: [{
    type: String,
    index: true
  }],
  accountStatus: {
    type: String,
    enum: ['active', 'permanently-banned'],
    default: 'active'
  },
  permanentBanReason: {
    type: String,
    trim: true,
    default: ''
  },
  permanentlyBannedAt: {
    type: Date,
    default: null
  },
  postingRestrictedUntil: {
    type: Date,
    default: null
  },
  postingRestrictionReason: {
    type: String,
    trim: true,
    default: ''
  },
  postingRestrictionSource: {
    type: String,
    enum: ['content-ban', 'account-ban', null],
    default: null
  },
  lastModeratedAt: {
    type: Date,
    default: null
  },
  pendingLoginNoticeType: {
    type: String,
    enum: ['success', 'info', null],
    default: null
  },
  pendingLoginNoticeTitle: {
    type: String,
    trim: true,
    default: ''
  },
  pendingLoginNoticeMessage: {
    type: String,
    trim: true,
    default: ''
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'  // Can reference both Story and Artwork
  }],
  bookmarks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'  // Can reference both Story and Artwork
  }],
  favoriteTags: [{
    type: String,
    trim: true
  }],
  readingHistory: [{
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    contentType: {
      type: String,
      enum: ['Story', 'Artwork'],
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true  // Adds createdAt and updatedAt
});

// Indexes are already created by unique: true, no need to add them again

userSchema.pre('save', function setSearchFields(next) {
  if (this.isModified('username') || !this.searchName) {
    const searchFields = buildSearchNameFields(this.username);
    this.searchName = searchFields.searchName;
    this.searchTokens = searchFields.searchTokens;
  }

  next();
});

const User = mongoose.model('User', userSchema);

export default User;
