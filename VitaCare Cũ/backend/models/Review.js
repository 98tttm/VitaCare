const mongoose = require('mongoose');

const ReplySchema = new mongoose.Schema({
    user_id: String,
    fullname: String,
    avatar: String,
    content: String,
    is_admin: { type: Boolean, default: false },
    time: { type: Date, default: Date.now },
    likes: { type: Array, default: [] }
});

const ReviewEntrySchema = new mongoose.Schema({
    customer_id: String,
    fullname: String,
    content: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
    time: { type: Date, default: Date.now },
    order_id: String,
    images: { type: Array, default: [] },
    likes: { type: Array, default: [] },
    replies: [ReplySchema]
});

const ReviewSchema = new mongoose.Schema({
    sku: { type: String, required: true, unique: true },
    reviews: [ReviewEntrySchema],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Review', ReviewSchema);
