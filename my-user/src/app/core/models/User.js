const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true },
    avatar: { type: String, default: null },
    full_name: { type: String, default: '' },
    email: { type: String, default: '' },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    birthday: { type: String, default: null },
    gender: { type: String, default: 'Other' },
    address: { type: Array, default: [] },
    registerdate: { type: String },
    totalspent: { type: Number, default: 0 },
    tiering: { type: String, default: 'Đồng' },
    // OTP fields used by auth flows
    otpCode: { type: String },
    otpExpiry: { type: Date },
    favorites: { type: Array, default: [] }
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

module.exports = mongoose.model('User', userSchema);

