const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    icon: { type: String },
    display_order: { type: Number },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
