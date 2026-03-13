const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema({
    articleId: Number,
    slug: String,
    url: String,
    title: { type: String, required: true },
    shortDescription: String,
    descriptionHtml: String,
    publishedAt: String,
    primaryImage: {
        url: String
    },
    author: {
        fullName: String
    },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Index for search
BlogSchema.index({ title: 'text', shortDescription: 'text' });

module.exports = mongoose.model('Blog', BlogSchema, 'blogs');
