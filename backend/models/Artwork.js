import mongoose from 'mongoose';
import { buildContentSearchFields } from '../utils/search.js';

// Artwork schema for image-based content
const artworkSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true
  },
  searchTitle: {
    type: String,
    default: '',
    index: true
  },
  searchDescription: {
    type: String,
    default: ''
  },
  searchTokens: [{
    type: String,
    index: true
  }],
  images: [{
    type: String,
    required: true
  }],
  tags: [{
    type: String,
    trim: true
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'deleted'],
    default: 'pending'
  },
  likes: {
    type: Number,
    default: 0
  },
  bookmarks: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Create indexes for faster queries
artworkSchema.index({ author: 1 });
artworkSchema.index({ status: 1 });
artworkSchema.index({ createdAt: -1 });
artworkSchema.index({ tags: 1 });

artworkSchema.pre('save', function setSearchFields(next) {
  if (this.isModified('title') || this.isModified('description') || !this.searchTitle) {
    const searchFields = buildContentSearchFields(this.title, this.description);
    this.searchTitle = searchFields.searchTitle;
    this.searchDescription = searchFields.searchDescription;
    this.searchTokens = searchFields.searchTokens;
  }

  next();
});

const Artwork = mongoose.model('Artwork', artworkSchema);

export default Artwork;
