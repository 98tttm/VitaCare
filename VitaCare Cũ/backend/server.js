const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { connectDB } = require('./db');
const Category = require('./models/Category');
const Product = require('./models/Product');
const HealthVideo = require('./models/HealthVideo');
const Review = require('./models/Review');
const Blog = require('./models/Blog');
const Consultation = require('./models/Consultation');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
connectDB();

// ================= HELPER: ESCAPE REGEXP =================
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ================= GET ALL CATEGORIES =================
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find({
            isActive: { $ne: false }
        }).sort('display_order');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ================= GET SINGLE PRODUCT BY ID OR SLUG (STABLE V2.1) =================
app.get('/api/product/:identifier', async (req, res) => {
    try {
        const identifier = req.params.identifier ? req.params.identifier.trim() : '';

        if (!identifier || identifier === 'undefined' || identifier === 'null') {
            console.warn(`[Backend V2.1] Invalid request: "${identifier}"`);
            return res.status(400).json({ message: 'Sản phẩm không hợp lệ' });
        }

        console.log(`[Backend V2.1] Fetching Product: "${identifier}"`);
        let product = null;

        if (mongoose.Types.ObjectId.isValid(identifier)) {
            product = await Product.findById(identifier).lean();
        }
        if (!product) {
            product = await Product.findOne({ slug: identifier }).lean();
        }
        if (!product) {
            product = await Product.findOne({ _id: identifier }).lean();
        }

        if (!product) {
            console.warn(`[Backend V2.1] NOT FOUND: ${identifier}`);
            return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
        }

        res.json(product);
    } catch (error) {
        console.error('[Backend V2.1 Error]:', error);
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
});

// ================= GET PRODUCT STATS =================
app.get('/api/products/stats', async (req, res) => {
    try {
        const stats = await Product.aggregate([
            { $match: { isActive: { $ne: false } } },
            { $group: { _id: "$categoryId", count: { $sum: 1 } } }
        ]);
        const countMap = {};
        stats.forEach(s => { if (s._id) countMap[s._id] = s.count; });
        res.json(countMap);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ================= GET PRODUCTS WITH FULL FILTERING (RESTORED) =================
app.get('/api/products', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            skip: reqSkip,
            categorySlug,
            categoryId,
            brand,
            minPrice,
            maxPrice,
            sort = 'newest',
            audience,
            indication,
            flavor,
            origin,
            keyword // Renamed from q to match frontend params
        } = req.query;

        // Only filter isActive — remove anti-junk price/name filters that block products
        // when price is stored as string or name has unusual format
        const andFilters = [
            { isActive: { $ne: false } }
        ];

        // 0. Search Logic
        if (keyword) {
            console.log(`[Backend Search] Keyword: "${keyword}"`);
            const searchRegex = new RegExp(escapeRegExp(keyword), 'i');
            andFilters.push({
                $or: [
                    { name: searchRegex },
                    { description: searchRegex },
                    { ingredients: searchRegex }
                ]
            });
        }

        // 1. Category Filtering (Robust - backup approach)
        let targetCategory = null;
        if (categoryId) {
            // Use $expr to compare as string — works even if stored as ObjectId or string
            targetCategory = await Category.findOne({
                $expr: { $eq: [{ $toString: '$_id' }, categoryId.toString()] }
            });
        } else if (categorySlug && categorySlug !== 'san-pham' && categorySlug !== 'products') {
            targetCategory = await Category.findOne({
                slug: new RegExp('^' + escapeRegExp(categorySlug) + '$', 'i')
            });
        }

        if (targetCategory) {
            // Build catMap: parentId_string → [childId_strings]
            const allCats = await Category.find({ isActive: { $ne: false } }).select('_id parentId').lean();
            const catMap = {};
            allCats.forEach(c => {
                const pid = c.parentId ? c.parentId.toString() : 'root';
                if (!catMap[pid]) catMap[pid] = [];
                catMap[pid].push(c._id.toString());
            });

            // Recursively get all descendant IDs as strings
            const getIdsRecursive = (id) => {
                let ids = [id];
                const children = catMap[id] || [];
                children.forEach(cid => { ids = ids.concat(getIdsRecursive(cid)); });
                return ids;
            };

            const searchIds = getIdsRecursive(targetCategory._id.toString());

            // Push BOTH string and ObjectId versions — matches regardless of how categoryId is stored in DB
            const mixedIds = searchIds.reduce((acc, id) => {
                acc.push(id); // string version
                if (mongoose.Types.ObjectId.isValid(id)) acc.push(new mongoose.Types.ObjectId(id)); // ObjectId version
                return acc;
            }, []);

            console.log(`[Backend] Category "${targetCategory.name}" => ${searchIds.length} sub-categories, ${mixedIds.length} mixed IDs`);
            andFilters.push({ categoryId: { $in: mixedIds } });
        }

        // 1.1 Special Filter for Discount Sort (V12)
        if (sort === 'discount') {
            // Only show items that actually have a discount when specialized sort is requested
            andFilters.push({
                $and: [
                    { discount: { $exists: true } },
                    { $expr: { $gt: [{ $convert: { input: "$discount", to: "double", onError: 0, onNull: 0 } }, 0] } }
                ]
            });
        }

        // 2. Brand & Origin
        if (brand) {
            andFilters.push({ brand: new RegExp(escapeRegExp(brand), 'i') });
        }
        if (origin) {
            const countries = origin.split(',');
            andFilters.push({ country: { $in: countries.map(c => new RegExp(`^${escapeRegExp(c)}$`, 'i')) } });
        }

        // 3. Price Filter
        const safeDouble = (field) => ({ $convert: { input: field, to: "double", onError: 0, onNull: 0 } });
        if (minPrice !== undefined || maxPrice !== undefined) {
            const min = Number(minPrice);
            const max = Number(maxPrice);
            if (!isNaN(min) && minPrice !== 'null' && minPrice !== null) {
                andFilters.push({ $expr: { $gte: [{ $subtract: [safeDouble("$price"), safeDouble("$discount")] }, min] } });
            }
            if (!isNaN(max) && maxPrice !== 'null' && maxPrice !== null) {
                andFilters.push({ $expr: { $lte: [{ $subtract: [safeDouble("$price"), safeDouble("$discount")] }, max] } });
            }
        }

        // 4. Characteristic Filters
        if (audience) {
            const regex = new RegExp(audience.split(',').map(escapeRegExp).join('|'), 'i');
            andFilters.push({ $or: [{ name: regex }, { description: regex }] });
        }
        if (indication) {
            const regex = new RegExp(indication.split(',').map(escapeRegExp).join('|'), 'i');
            andFilters.push({ $or: [{ name: regex }, { description: regex }, { ingredients: regex }] });
        }

        const query = { $and: andFilters };

        // 5. Sorting & Pagination
        let sortStage = { createdAt: -1, _id: 1 };
        if (sort === 'price_asc') sortStage = { effectivePrice: 1, _id: 1 };
        else if (sort === 'price_desc') sortStage = { effectivePrice: -1, _id: 1 };
        else if (sort === 'discount') sortStage = { discountPercentage: -1, effectivePrice: 1 };
        else if (sort === 'best_seller') sortStage = { rating: -1, stock: -1, _id: 1 };

        const limitVal = parseInt(limit);
        const skipVal = reqSkip !== undefined ? parseInt(reqSkip) : (parseInt(page) - 1) * limitVal;

        const pipeline = [
            { $match: query },
            {
                $addFields: {
                    priceDbl: safeDouble("$price"),
                    discountDbl: safeDouble("$discount"),
                    effectivePrice: { $subtract: [safeDouble("$price"), safeDouble("$discount")] }
                }
            },
            {
                $addFields: {
                    discountPercentage: {
                        $cond: {
                            if: { $gt: ["$priceDbl", 0] },
                            then: { $multiply: [{ $divide: ["$discountDbl", "$priceDbl"] }, 100] },
                            else: 0
                        }
                    }
                }
            },
            { $sort: sortStage },
            { $skip: skipVal },
            { $limit: limitVal }
        ];

        const [products, total] = await Promise.all([
            Product.aggregate(pipeline),
            Product.countDocuments(query)
        ]);

        res.json({
            products,
            total,
            totalPages: Math.ceil(total / limitVal),
            currentPage: parseInt(page),
            limit: limitVal
        });
    } catch (error) {
        console.error('[API Products Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

// ================= HELPER: NORMALIZE TEXT =================
function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ").trim();
}



// ================= GET HEALTH VIDEOS (MATCHING V9 - ULTRA STRICT) =================
app.get('/api/health-videos', async (req, res) => {
    try {
        const { limit = 20, keyword, productName } = req.query;
        console.log(`[HealthVideos V9] Matching for: "${productName}"`);

        const normProd = normalizeText(productName || '');
        const normKey = normalizeText(keyword || '');

        // 1. Tách từ trong tên sản phẩm (Split)
        const stopWords = [
            'vien', 'uong', 'siro', 'hop', 'chai', 'chinh', 'hang', 'ho-tro', 'san-pham', 'thuc', 'pham', 'chuc', 'nang',
            'giup', 'tang', 'giam', 'ho', 'ngua', 'cai', 'thien', 'bo', 'sung', 'suc', 'khoe', 'nu', 'gioi', 'nam',
            'cho', 'voi', 'va', 'cua', 'nhung', 'cac', 'co', 'la', 'tai', 'trong', 'mieng', 'dan', 'tuyp', 'gel',
            'loai', 'tot', 'nhat', 'cach', 'lam', 'the', 'nao', 'nen', 'hay', 'khong', 'bi', 'vi', 'huong', 'dan',
            'bac', 'si', 'loi', 'khuan', 'men', 'vi', 'sinh'
        ];
        const prodWords = normProd.split(' ').filter(w => w.length >= 2 && !stopWords.includes(w));

        // 2. Lấy danh sách video
        let allVideos = await HealthVideo.find({ isActive: { $ne: false } }).lean();

        // 3. So khớp cực kỳ nghiêm ngặt (Direct Matching)
        const matched = allVideos.map(video => {
            let score = 0;
            const titleNorm = normalizeText(video.title);
            const videoKeywords = (video.keywords || []).map(k => normalizeText(k));
            const videoCatNorm = normalizeText(video.category || '');

            const matchWhole = (target, word) => {
                const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
                return regex.test(target);
            };

            // A. Khớp từ trong Tên sản phẩm (Trọng số lớn nhất)
            prodWords.forEach(pw => {
                if (matchWhole(titleNorm, pw)) score += 100;
                if (videoKeywords.some(vk => matchWhole(vk, pw))) score += 50;
            });

            // B. Khớp Keyword phụ
            const keyWords = normKey.split(' ').filter(w => w.length >= 2 && !stopWords.includes(w));
            keyWords.forEach(kw => {
                if (matchWhole(titleNorm, kw)) score += 30;
                if (videoKeywords.some(vk => matchWhole(vk, kw))) score += 20;
            });

            return { ...video, score };
        });

        // 4. LỌC NGHIÊM NGẶT: Phải có ít nhất 1 từ chuyên môn khớp hoàn toàn
        let results = matched
            .filter(v => v.score >= 100)
            .sort((a, b) => b.score - a.score)
            .slice(0, parseInt(limit));

        console.log(`[HealthVideos V9] Result: ${results.length} high-quality videos matched.`);
        res.json(results);
    } catch (e) {
        console.error('[HealthVideo V9 Error]:', e);
        res.status(500).json({ message: e.message });
    }
});

// ================= GET RELATED PRODUCTS (STABLE V2.1) =================
app.get('/api/products/related/:identifier', async (req, res) => {
    try {
        const identifier = req.params.identifier;
        if (!identifier || identifier === 'undefined') return res.json([]);

        let product = null;
        if (mongoose.Types.ObjectId.isValid(identifier)) product = await Product.findById(identifier).lean();
        if (!product) product = await Product.findOne({ slug: identifier }).lean();
        if (!product) product = await Product.findOne({ _id: identifier }).lean();

        if (!product) return res.json([]);

        const getMixedIds = (id) => {
            if (!id) return [];
            let idStr = id.$oid || id.toString();
            const ids = [idStr];
            if (mongoose.Types.ObjectId.isValid(idStr)) ids.push(new mongoose.Types.ObjectId(idStr));
            return ids;
        };

        const targetCatIds = getMixedIds(product.categoryId);
        let related = await Product.find({
            categoryId: { $in: targetCatIds },
            _id: { $ne: product._id },
            isActive: { $ne: false }
        }).limit(10).lean();

        // Ensure every product has a slug for navigation
        related = related.map(p => ({ ...p, slug: p.slug || (p._id?.$oid || p._id.toString()) }));
        res.json(related);
    } catch (error) {
        console.error('[Related products error]:', error);
        res.json([]);
    }
});

// ================= GET PRODUCT REVIEWS BY SKU =================
app.get('/api/reviews/:sku', async (req, res) => {
    try {
        const sku = req.params.sku;
        if (!sku) return res.status(400).json({ message: 'SKU is required' });

        const reviewData = await Review.findOne({ sku }).lean();
        if (!reviewData) {
            return res.json({ sku, reviews: [] });
        }
        res.json(reviewData);
    } catch (error) {
        console.error('[API Reviews Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

// ================= SUBMIT REVIEW (POST) =================
app.post('/api/reviews', async (req, res) => {
    try {
        const { sku, rating, content, fullname } = req.body;

        if (!sku || !rating) {
            return res.status(400).json({ message: 'Missing required fields (sku, rating)' });
        }

        // Generate Guest Name if not provided
        // Use a simple random number for guest suffix
        const guestName = fullname || `Khách hàng vãng lai ${Math.floor(1000 + Math.random() * 9000)}`;

        const newReviewEntry = {
            customer_id: `GUEST_${Date.now()}`,
            fullname: guestName,
            content: content || '',
            rating: Number(rating),
            time: new Date(),
            replies: [],
            likes: [],
            images: []
        };

        let reviewDoc = await Review.findOne({ sku });

        if (reviewDoc) {
            reviewDoc.reviews.push(newReviewEntry);
            await reviewDoc.save();
        } else {
            reviewDoc = new Review({
                sku: sku,
                reviews: [newReviewEntry],
                isActive: true
            });
            await reviewDoc.save();
        }

        console.log(`[API Review] Added new review for SKU ${sku} by ${guestName}`);
        res.json(reviewDoc);
    } catch (error) {
        console.error('[API Submit Review Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

// ================= SUBMIT REPLY (POST) =================
app.post('/api/reviews/reply', async (req, res) => {
    try {
        const { sku, reviewId, content, fullname, isAdmin, avatar } = req.body;

        if (!sku || !reviewId || !content) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const replyData = {
            user_id: `REPLY_${Date.now()}`,
            fullname: fullname || 'Khách',
            avatar: avatar || 'assets/images/user-placeholder.png', // Default
            content: content,
            is_admin: isAdmin || false,
            time: new Date(),
            likes: []
        };

        const result = await Review.updateOne(
            { sku: sku, "reviews._id": reviewId },
            { $push: { "reviews.$.replies": replyData } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Review not found or not updated' });
        }

        const updatedDoc = await Review.findOne({ sku });
        res.json(updatedDoc);
    } catch (error) {
        console.error('[API Submit Reply Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

// ================= LIKE REVIEW (POST) =================
app.post('/api/reviews/like', async (req, res) => {
    try {
        const { sku, reviewId, userId } = req.body;
        // In real app, userId comes from session/token
        const safeUserId = userId || 'GUEST_USER';

        const doc = await Review.findOne({ sku });
        if (!doc) return res.status(404).json({ message: 'Review doc not found' });

        const reviewItem = doc.reviews.id(reviewId);
        if (!reviewItem) return res.status(404).json({ message: 'Review item not found' });

        if (!reviewItem.likes) reviewItem.likes = [];

        const index = reviewItem.likes.indexOf(safeUserId);
        if (index > -1) {
            reviewItem.likes.splice(index, 1); // Unlike
        } else {
            reviewItem.likes.push(safeUserId); // Like
        }

        await doc.save();
        res.json(doc);
    } catch (error) {
        console.error('[API Like Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/consultations/:sku', async (req, res) => {
    try {
        const { sku } = req.params;

        // 1. Try MongoDB first
        let consultation = await Consultation.findOne({ sku });

        if (consultation) {
            return res.json(consultation);
        }

        // 2. Fallback to JSON for legacy data
        const filePath = path.join(__dirname, '../data/consultations_product.json');
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const allConsultations = JSON.parse(fileContent);
            const productConsultation = allConsultations.find(c => c.sku === sku);
            if (productConsultation) {
                return res.json(productConsultation);
            }
        }

        res.json({ sku, questions: [] });
    } catch (error) {
        console.error('[API Fetch Consultations Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/consultations', async (req, res) => {
    try {
        const { sku, question, full_name } = req.body;

        // 1. Find in MongoDB
        let consultation = await Consultation.findOne({ sku });

        // 2. If not in MongoDB, try to migrate from JSON
        if (!consultation) {
            const filePath = path.join(__dirname, '../data/consultations_product.json');
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const allConsultations = JSON.parse(fileContent);
                const productConsultation = allConsultations.find(c => c.sku === sku);
                if (productConsultation) {
                    consultation = new Consultation({
                        sku: productConsultation.sku,
                        questions: productConsultation.questions,
                        createdAt: productConsultation.createdAt || new Date(),
                        updatedAt: new Date()
                    });
                }
            }
        }

        // 3. Still not found, create new
        if (!consultation) {
            consultation = new Consultation({ sku, questions: [] });
        }

        const newQuestion = {
            id: Date.now().toString(),
            question,
            user_id: "Guest_" + Math.floor(Math.random() * 10000),
            full_name: full_name || `Khách hàng vãng lai ${Math.floor(1000 + Math.random() * 9000)}`,
            answer: null,
            answeredBy: null,
            status: "Pending",
            createdAt: new Date(),
            answeredAt: null,
            likes: [],
            replies: []
        };

        consultation.questions.unshift(newQuestion);
        consultation.updatedAt = new Date();
        await consultation.save();

        res.status(201).json(newQuestion);
    } catch (error) {
        console.error('[API Submit Consultation Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

// ================= LIKE QUESTION (POST) =================
app.post('/api/consultations/like', async (req, res) => {
    try {
        const { sku, questionId, userId } = req.body;

        // 1. Find in MongoDB
        let consultation = await Consultation.findOne({ sku });

        // 2. If not found, migrate from JSON
        if (!consultation) {
            const filePath = path.join(__dirname, '../data/consultations_product.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const prodCons = data.find(c => c.sku === sku);
                if (prodCons) {
                    consultation = new Consultation({
                        sku: prodCons.sku,
                        questions: prodCons.questions,
                        createdAt: prodCons.createdAt || new Date(),
                        updatedAt: new Date()
                    });
                }
            }
        }

        if (!consultation) return res.status(404).json({ message: 'Consultation not found' });

        const question = consultation.questions.find(q => q.id === questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });

        if (!question.likes) question.likes = [];
        const idx = question.likes.indexOf(userId);
        if (idx > -1) {
            question.likes.splice(idx, 1);
        } else {
            question.likes.push(userId);
        }

        consultation.updatedAt = new Date();
        await consultation.save();
        res.json(consultation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ================= REPLY TO QUESTION (POST) =================
app.post('/api/consultations/reply', async (req, res) => {
    try {
        const { sku, questionId, content, fullname, isAdmin } = req.body;

        // 1. Find in MongoDB
        let consultation = await Consultation.findOne({ sku });

        // 2. If not found, migrate from JSON
        if (!consultation) {
            const filePath = path.join(__dirname, '../data/consultations_product.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const prodCons = data.find(c => c.sku === sku);
                if (prodCons) {
                    consultation = new Consultation({
                        sku: prodCons.sku,
                        questions: prodCons.questions,
                        createdAt: prodCons.createdAt || new Date(),
                        updatedAt: new Date()
                    });
                }
            }
        }

        if (!consultation) return res.status(404).json({ message: 'Consultation not found' });

        const question = consultation.questions.find(q => q.id === questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });

        if (!question.replies) question.replies = [];
        question.replies.push({
            id: Date.now().toString(),
            fullname: fullname || `Khách hàng vãng lai ${Math.floor(1000 + Math.random() * 9000)}`,
            content,
            avatar: isAdmin ? 'https://res.cloudinary.com/dpjkzxjl2/image/upload/v1771155535/Artboard_7_c4h7h2.png' : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
            is_admin: isAdmin,
            time: new Date()
        });

        consultation.updatedAt = new Date();
        await consultation.save();
        res.json(consultation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ================= GET BLOGS WITH SEARCH =================
app.get('/api/blogs', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            skip: reqSkip,
            keyword
        } = req.query;

        const andFilters = [
            { isActive: { $ne: false } }
        ];

        // Search by title only (simple keyword matching)
        if (keyword) {
            console.log(`[Backend Blogs Search] Keyword: "${keyword}"`);
            const searchRegex = new RegExp(escapeRegExp(keyword), 'i');
            andFilters.push({ title: searchRegex });
        }

        const query = { $and: andFilters };

        // Sorting by publishedAt (newest first)
        const sortStage = { publishedAt: -1, _id: 1 };

        const limitVal = parseInt(limit);
        const skipVal = reqSkip !== undefined ? parseInt(reqSkip) : (parseInt(page) - 1) * limitVal;

        const [blogs, total] = await Promise.all([
            Blog.find(query).sort(sortStage).skip(skipVal).limit(limitVal).lean(),
            Blog.countDocuments(query)
        ]);

        res.json({
            blogs,
            total,
            totalPages: Math.ceil(total / limitVal),
            currentPage: parseInt(page),
            limit: limitVal
        });
    } catch (error) {
        console.error('[API Blogs Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

// ================= GET DISEASES FROM JSON =================
let diseasesCache = null;
let bodyPartIndex = {};   // Pre-indexed: { 'dau': [...], 'co': [...], ... }
let diseaseGroupIndex = {}; // Pre-indexed by group slug
let diseaseGroupMeta = []; // [{ slug, name, count }, ...]

const bodyPartSlugMap = {
    'Đầu': 'dau', 'Cổ': 'co', 'Ngực': 'nguc',
    'Bụng': 'bung', 'Sinh dục': 'sinh-duc', 'Tứ chi': 'tu-chi', 'Da': 'da'
};

function loadAndIndexDiseases() {
    try {
        const filePath = path.join(__dirname, '../data/benh.json');
        console.log('[Backend] Pre-loading benh.json...');
        const rawData = fs.readFileSync(filePath, 'utf8');
        diseasesCache = JSON.parse(rawData);

        const slugValues = Object.values(bodyPartSlugMap);
        slugValues.forEach(slug => { bodyPartIndex[slug] = []; });

        const groupMap = {};
        diseasesCache.forEach(d => {
            if (!d.categories) return;
            d.categories.forEach(cat => {
                if (!cat.fullPathSlug) return;
                // Body part index (exact match — tránh 'da' khớp nhầm 'dau')
                slugValues.forEach(slug => {
                    if (cat.fullPathSlug === `benh/xem-theo-bo-phan-co-the/${slug}`) {
                        bodyPartIndex[slug].push(d);
                    }
                });
                // Disease group index
                if (cat.fullPathSlug.startsWith('benh/nhom-benh/')) {
                    const groupSlug = cat.fullPathSlug.replace('benh/nhom-benh/', '');
                    if (!groupMap[groupSlug]) {
                        groupMap[groupSlug] = { name: cat.name, slug: groupSlug, diseases: [] };
                    }
                    groupMap[groupSlug].diseases.push(d);
                }
            });
        });

        diseaseGroupIndex = {};
        Object.values(groupMap).forEach(g => { diseaseGroupIndex[g.slug] = g.diseases; });
        diseaseGroupMeta = Object.values(groupMap)
            .map(g => ({ slug: g.slug, name: g.name, count: g.diseases.length }))
            .sort((a, b) => b.count - a.count);

        console.log(`[Backend] ✅ Body parts indexed, ${diseaseGroupMeta.length} disease groups indexed`);
    } catch (err) {
        console.error('[Backend] Failed to load benh.json:', err.message);
    }
}
loadAndIndexDiseases();

// GET /api/disease-groups
app.get('/api/disease-groups', (req, res) => {
    res.json(diseaseGroupMeta);
});

// ================= PRODUCT FAQS (FROM JSON) =================
let productFaqsCache = null;
function getProductFaqs() {
    try {
        if (!productFaqsCache) {
            const filePath = path.join(__dirname, '../data/product_faqs.json');
            if (fs.existsSync(filePath)) {
                console.log('[Backend] Loading product_faqs.json...');
                const data = fs.readFileSync(filePath, 'utf8');
                productFaqsCache = JSON.parse(data);
                console.log(`[Backend] Loaded ${productFaqsCache.length} product FAQs`);
            } else {
                productFaqsCache = [];
            }
        }
        return productFaqsCache;
    } catch (err) {
        console.error('[Backend] Error loading product_faqs.json:', err.message);
        return [];
    }
}

app.get('/api/product-faqs/:productId', (req, res) => {
    try {
        const { productId } = req.params;
        const faqs = getProductFaqs();
        // find product by id (it can be an ObjectId string or a simple string)
        const productData = faqs.find(item => item.product_id === productId);

        if (productData) {
            res.json(productData.faqs || []);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/diseases', (req, res) => {
    try {
        // Server vẫn đang khởi tạo
        if (!diseasesCache) {
            return res.status(503).json({ message: 'Server is initializing, please retry', diseases: [], total: 0, totalPages: 0 });
        }

        const { keyword, limit = 20, page = 1, slug, id, bodyPart, groupSlug } = req.query;

        if (id) {
            const disease = diseasesCache?.find(d => String(d.id) === String(id));
            return res.json(disease || { message: 'Not found' });
        }

        if (slug) {
            const disease = diseasesCache?.find(d => d.slug === slug || d.url?.includes(slug));
            return res.json(disease || { message: 'Not found' });
        }

        let results = diseasesCache || [];
        if (bodyPart && bodyPartSlugMap[bodyPart]) {
            results = bodyPartIndex[bodyPartSlugMap[bodyPart]] || [];
        } else if (groupSlug && diseaseGroupIndex[groupSlug]) {
            results = diseaseGroupIndex[groupSlug] || [];
        }

        if (keyword) {
            const searchRegex = new RegExp(escapeRegExp(keyword), 'i');
            results = results.filter(d => searchRegex.test(d.name) || searchRegex.test(d.headline));
        }

        // Sắp xếp A-Z theo tên bệnh (tiếng Việt có dấu, giống Long Châu)
        results = [...results].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', 'vi', { sensitivity: 'base' })
        );

        const pageVal = parseInt(page);
        const limitVal = parseInt(limit);
        const start = (pageVal - 1) * limitVal;

        res.json({
            diseases: results.slice(start, start + limitVal),
            total: results.length,
            page: pageVal,
            limit: limitVal,
            totalPages: Math.ceil(results.length / limitVal)
        });
    } catch (error) {
        console.error('[API Diseases Error]:', error);
        res.status(500).json({ message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 [V2.1-RESTORED] Server running on http://localhost:${PORT}`);
});
