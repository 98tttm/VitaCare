const mongoose = require('mongoose');

const healthVideoSchema = new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true },
    long_description: { type: String },
    short_description: { type: String },
    description: { type: String }, // Mô tả chi tiết
    ingredients: { type: String }, // Nguyên liệu
    instructions: { type: String }, // Thực hiện
    notes: { type: String }, // Lưu ý
    classification: {
        playlist: { type: String },
        product_category: { type: String }
    },
    keywords: [{ type: String }],
    playlist_id: { type: String },
    isActive: { type: Boolean, default: true }
}, { timestamps: true, collection: 'vinmec_playlists' });

module.exports = mongoose.model('HealthVideo', healthVideoSchema);
