const mongoose = require('mongoose');

const ReplySchema = new mongoose.Schema({
    content: String,
    fullname: String,
    avatar: String,
    is_admin: { type: Boolean, default: false },
    time: { type: Date, default: Date.now }
});

const QuestionSchema = new mongoose.Schema({
    id: String, // String ID for compatibility with existing frontend logic
    question: { type: String, required: true },
    user_id: String,
    full_name: { type: String, default: 'Khách hàng vãng lai' },
    answer: { type: String, default: null },
    answeredBy: { type: String, default: null },
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
    likes: { type: [String], default: [] },
    replies: [ReplySchema]
});

const ConsultationSchema = new mongoose.Schema({
    sku: { type: String, required: true, unique: true }, // slug or sku
    questions: [QuestionSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Consultation', ConsultationSchema);
