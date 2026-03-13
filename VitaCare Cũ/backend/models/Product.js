const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    brand: { type: String },
    country: { type: String },
    description: { type: String },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    unit: { type: String },
    image: { type: String }, // Main image
    gallery: [{ type: String }], // Array of image URLs
    usage: { type: String },
    ingredients: { type: String },
    warnings: { type: String },
    prescriptionRequired: { type: String }, // "Có" or "Không"
    categoryId: { type: mongoose.Schema.Types.Mixed, ref: 'Category' },
    activeIngredientIds: [{ type: String }],
    herbIds: [{ type: String }],
    isActive: { type: Boolean, default: true },
    sku: { type: String },
    rating: { type: Number, default: null },
    slug: { type: String }
}, { timestamps: true });

// Index for searching
productSchema.index({ name: 'text', description: 'text', brand: 'text' });

module.exports = mongoose.model('Product', productSchema);
