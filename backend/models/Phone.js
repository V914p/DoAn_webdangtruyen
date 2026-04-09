import mongoose from 'mongoose';

const phoneSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  number: {
    type: String,
    required: true,
    trim: true
  },
  normalized: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  verified: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

const Phone = mongoose.model('Phone', phoneSchema);
export default Phone;
