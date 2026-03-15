require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { connectDB, mongoose } = require('./db');
const { Schema } = mongoose;
const multer = require('multer');
const nodemailer = require('nodemailer');

// Email Transporter (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'vitacarehotro@gmail.com',
    pass: 'accu ivix xsbg opyi' // Gmail App Password
  }
});

let resetCodes = {}; // Temporary store for forgot password codes

// Mongoose models (được định nghĩa trong my-user/src/app/core/models)
const Product = require('../my-user/src/app/core/models/Product');
const Category = require('../my-user/src/app/core/models/Category');
const Blog = require('../my-user/src/app/core/models/Blog');
const HealthVideo = require('../my-user/src/app/core/models/HealthVideo');
const Consultation = require('../my-user/src/app/core/models/Consultation');
const Review = require('../my-user/src/app/core/models/Review');
const User = require('../my-user/src/app/core/models/User');
const Order = require('../my-user/src/app/core/models/Order');
const Cart = require('../my-user/src/app/core/models/Cart');
const HealthProfile = require('../my-user/src/app/core/models/HealthProfile');
const Prescription = require('../my-user/src/app/core/models/Prescription');
// const ProductFAQ = require('../my-user/src/app/core/models/ProductFAQ');
// const Quiz = require('../my-user/src/app/core/models/quiz');
// const Result = require('../my-user/src/app/core/models/result');

// --- Admin Models ---
const genericSchema = new Schema({
  _id: { type: Schema.Types.Mixed, default: () => new mongoose.Types.ObjectId() }
}, { strict: false, timestamps: true });
const AdminModel = mongoose.model('admins', genericSchema, 'admins');
const ProductModel = mongoose.model('admin_products', genericSchema, 'products');
const CategoryModel = mongoose.model('admin_categories', genericSchema, 'categories');
const UserModel = mongoose.model('admin_users', genericSchema, 'users');
const OrderModel = mongoose.model('admin_orders', genericSchema, 'orders');
const BlogModel = mongoose.model('admin_blogs', genericSchema, 'blog'); // Sửa 'blogs' thành 'blog'
const PromotionModel = mongoose.model('promotions', genericSchema, 'promotion_promotions'); // Sửa 'promotions' thành 'promotion_promotions'
const PromotionUsage = mongoose.model('promotion_usage', genericSchema, 'promotion_usage');
const PromotionTarget = mongoose.model('promotion_target', genericSchema, 'promotion_target');
const CustomerGroup = mongoose.model('customer_groups', genericSchema, 'customer_groups');
const ProductGroup = mongoose.model('product_groups', genericSchema, 'product_groups');
const Pharmacist = mongoose.model('pharmacists', genericSchema, 'pharmacists');
const ConsultationProductModel = mongoose.model('admin_consultations_product', genericSchema, 'consultations_product');
const ConsultationDiseaseModel = mongoose.model('admin_consultations_disease', genericSchema, 'consultations_disease');
const ConsultationPrescriptionModel = mongoose.model('admin_consultations_prescription', genericSchema, 'consultations_prescription');
const ReviewModel = mongoose.model('admin_reviews', genericSchema, 'reviews');
const DiseaseGroupModel = mongoose.model('disease_groups_metadata', genericSchema, 'disease_groups');


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Allow all origins for local development
// Tăng giới hạn kích thước body để hỗ trợ ảnh đánh giá (base64, nhiều file)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static files cho upload (hình ảnh lời nhắc)
const uploadsRoot = path.join(__dirname, 'uploads');
const reminderUploads = path.join(uploadsRoot, 'reminders');
if (!fs.existsSync(reminderUploads)) {
  fs.mkdirSync(reminderUploads, { recursive: true });
}
app.use('/uploads', express.static(uploadsRoot));

const reminderImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, reminderUploads);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '').toLowerCase();
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base || 'reminder'}-${unique}${ext}`);
  },
});

const uploadReminderImage = multer({
  storage: reminderImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('file');

// Collections chính trong MongoDB (giữ lại cho seed & một số thao tác đặc biệt)
const usersCollection = () => mongoose.connection.db.collection('users');
const productsCollection = () => mongoose.connection.db.collection('products');
const categoriesCollection = () => mongoose.connection.db.collection('categories');
const cartsCollection = () => mongoose.connection.db.collection('carts');
const otpCodesCollection = () => mongoose.connection.db.collection('otp_codes');
const addressesCollection = () => mongoose.connection.db.collection('addresses');
const healthprofilesCollection = () => mongoose.connection.db.collection('healthprofiles');
const healthProfilesCollection = () => mongoose.connection.db.collection('healthProfiles'); // New, camelCase version
const quizCollection = () => mongoose.connection.db.collection('quiz'); // New
const resultsCollection = () => mongoose.connection.db.collection('results'); // New
const locationsCollection = () => mongoose.connection.db.collection('tree_complete');
const ordersCollection = () => mongoose.connection.db.collection('orders');
const noticesCollection = () => mongoose.connection.db.collection('notice');
const storeSystemCollection = () => mongoose.connection.db.collection('storesystem_full');
const doctorsCollection = () => mongoose.connection.db.collection('doctors');
const remindersCollection = () => mongoose.connection.db.collection('reminders');

// Helper: lấy id string từ doc (hỗ trợ _id.$oid từ JSON)
function getId(doc) {
  if (!doc) return null;
  if (typeof doc === 'string') return doc;
  if (doc.$oid) return doc.$oid;
  const id = doc._id || doc.id;
  if (id) {
    if (typeof id === 'string') return id;
    if (id.$oid) return id.$oid;
    if (id.toString) return id.toString();
  }
  if (typeof doc.toString === 'function' && doc.toString() !== '[object Object]') return doc.toString();
  return null;
}

// ================= HELPER: ESCAPE REGEXP & NORMALIZE (FROM STABLE OLD PROJECT) =================
function escapeRegExp(string) {
  if (!string) return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

// GET /api/admin/notifications - tổng hợp thông báo cho admin (đơn hàng, tư vấn, hỏi đáp sản phẩm)
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 50);

    const [pendingOrders, returnOrders, consultPres, consultProd] = await Promise.all([
      ordersCollection()
        .find({ status: 'pending' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray(),
      ordersCollection()
        .find({ status: { $in: ['processing_return', 'returning'] } })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(limit)
        .toArray(),
      ConsultationPrescriptionModel.find({})
        .sort({ createdAt: -1 })
        .limit(limit),
      ConsultationProductModel.find({})
        .sort({ createdAt: -1 })
        .limit(limit),
      ConsultationDiseaseModel.find({})
        .sort({ createdAt: -1 })
        .limit(limit),
    ]);

    const notifications = [];

    pendingOrders.forEach((o) => {
      notifications.push({
        _id: getId(o),
        type: 'order_pending',
        title: 'Đơn hàng mới chờ xác nhận',
        message: `Đơn ${o.order_id || o.code || getId(o)} từ ${o.shippingInfo?.fullName || 'Khách lẻ'} đang chờ xác nhận.`,
        createdAt: o.createdAt || o.route?.pending || o.date || new Date(),
        link: `/admin/orders/detail/${getId(o)}`
      });
    });

    returnOrders.forEach((o) => {
      notifications.push({
        _id: `${getId(o)}_return`,
        type: 'order_return',
        title: 'Yêu cầu trả/hoàn hàng mới',
        message: `Đơn ${o.order_id || o.code || getId(o)} có yêu cầu trả/hoàn.`,
        createdAt: o.updatedAt || o.createdAt || new Date(),
        link: `/admin/orders/detail/${getId(o)}`
      });
    });

    consultPres.forEach((c) => {
      notifications.push({
        _id: getId(c),
        type: 'consultation_prescription',
        title: 'Đơn tư vấn thuốc mới',
        message: `${c.fullName || c.name || 'Khách hàng'} vừa gửi đơn tư vấn thuốc.`,
        createdAt: c.createdAt || new Date(),
        link: '/admin/consultation-prescription'
      });
    });

    consultProd.forEach((c) => {
      notifications.push({
        _id: getId(c),
        type: 'consultation_product',
        title: 'Câu hỏi tư vấn sản phẩm mới',
        message: `${c.fullName || c.name || 'Khách hàng'} vừa hỏi về sản phẩm ${c.productName || ''}`.trim(),
        createdAt: c.createdAt || new Date(),
        link: '/admin/consultation-product'
      });
    });

    const consultDis = await ConsultationDiseaseModel.find({}).sort({ createdAt: -1 }).limit(limit);
    consultDis.forEach((c) => {
      notifications.push({
        _id: getId(c),
        type: 'consultation_disease',
        title: 'Câu hỏi tư vấn bệnh mới',
        message: `${c.fullName || c.name || 'Khách hàng'} vừa hỏi về bệnh ${c.productName || ''}`.trim(),
        createdAt: c.createdAt || new Date(),
        link: '/admin/consultation-disease'
      });
    });

    notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({
      success: true,
      data: notifications.slice(0, limit)
    });
  } catch (err) {
    console.error('[GET /api/admin/notifications] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// GET /api/categories - danh sách danh mục (từ MongoDB)
// Query: level=1 chỉ lấy category cấp 1 (không có parentId)
app.get('/api/categories', async (req, res) => {
  try {
    const level1Only = req.query.level === '1' || req.query.level1 === 'true';
    const query = level1Only
      ? { $or: [{ parentId: null }, { parentId: { $exists: false } }] }
      : {};
    const list = await categoriesCollection()
      .find(query)
      .sort({ display_order: 1, name: 1 })
      .toArray();
    const items = list.map((c) => ({
      _id: getId(c),
      name: c.name,
      slug: c.slug || '',
      parentId: c.parentId ? getId(c.parentId) : null,
    }));
    res.json(items);
  } catch (err) {
    console.error('[GET /api/categories] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// GET /api/doctors - danh sách bác sĩ/dược sĩ (dùng cho About & Blog)
// Query: limit (mặc định 20), sort=priority (ưu tiên theo priority giảm dần, sau đó theo name)
app.get('/api/doctors', async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100);
    const sort = String(req.query.sort || 'priority');

    const col = doctorsCollection();
    const filter = {};
    let sortOption = { priority: -1, name: 1 };
    if (sort === 'name') sortOption = { name: 1 };

    const list = await col
      .find(filter)
      .sort(sortOption)
      .limit(limit)
      .toArray();

    const items = list.map((d) => ({
      _id: getId(d),
      name: d.name || d.full_name || '',
      slug: d.slug || d.slugName || '',
      degree: d.degree || d.title || '',
      specialize: d.specialize || d.specialty || '',
      organization: d.organization || d.hospital || '',
      position: d.position || '',
      biography: d.biography || d.bio || '',
      avatar: {
        alt: d.avatar?.alt || d.name || 'Doctor',
        src: d.avatar?.src || d.avatar || d.image || '',
        width: d.avatar?.width || 300,
        height: d.avatar?.height || 300,
      },
      priority: typeof d.priority === 'number' ? d.priority : 0,
    }));

    res.json(items);
  } catch (err) {
    console.error('[GET /api/doctors] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// GET /api/products - danh sách sản phẩm (từ MongoDB, có tìm kiếm + lọc)
app.get('/api/products', async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const categorySlug = String(req.query.categorySlug || '').trim();
    const brand = String(req.query.brand || '').trim();
    const categoryIdParam = String(req.query.categoryId || '').trim();
    const minPrice = req.query.minPrice !== undefined && req.query.minPrice !== '' ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice !== undefined && req.query.maxPrice !== '' ? Number(req.query.maxPrice) : null;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 12), 200);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sort = String(req.query.sort || 'newest');
    const hasDiscount = String(req.query.hasDiscount || '').trim().toLowerCase() === 'true';

    const filter = {};
    // Làm sạch dữ liệu rác "Có" như đã note
    filter.name = { $ne: "Có" };

    if (keyword) {
      const escKey = escapeRegExp(keyword);
      // Ensure filter.name is prioritized in $and if multiple conditions exist
      filter.name = { $regex: escKey, $options: 'i' };
    }

    // New filters from Advanced Sidebar
    const flavor = String(req.query.flavor || '').trim();
    const audience = String(req.query.audience || '').trim();
    const indication = String(req.query.indication || '').trim();
    const origin = String(req.query.origin || '').trim();
    const brandOrigin = String(req.query.brandOrigin || '').trim();

    const advancedConditions = [];

    if (flavor) {
      const flavors = flavor.split(',').map(f => f.trim()).filter(f => f && f !== 'Tất cả');
      if (flavors.length > 0) {
        const flavorOr = flavors.map(f => {
          const kw = f.replace(/^(Vị|Hương|Vị\s+|Hương\s+)/i, '').trim();
          return { name: { $regex: escapeRegExp(kw), $options: 'i' } };
        });
        advancedConditions.push({ $or: flavorOr });
      }
    }

    if (audience) {
      const audiences = audience.split(',').map(a => a.trim()).filter(a => a && a !== 'Tất cả');
      if (audiences.length > 0) {
        const audienceOr = audiences.map(a => {
          const escAud = escapeRegExp(a);
          return {
            $or: [
              { name: { $regex: escAud, $options: 'i' } },
              { description: { $regex: escAud, $options: 'i' } }
            ]
          };
        });
        advancedConditions.push({ $or: audienceOr });
      }
    }

    if (indication) {
      const indications = indication.split(',').map(i => i.trim()).filter(i => i && i !== 'Tất cả');
      if (indications.length > 0) {
        const indicationOr = indications.map(ind => {
          const escInd = escapeRegExp(ind);
          return {
            $or: [
              { name: { $regex: escInd, $options: 'i' } },
              { description: { $regex: escInd, $options: 'i' } },
              { usage: { $regex: escInd, $options: 'i' } }
            ]
          };
        });
        advancedConditions.push({ $or: indicationOr });
      }
    }

    if (origin) {
      const origins = origin.split(',').map(o => o.trim()).filter(o => o && o !== 'Tất cả');
      if (origins.length > 0) {
        const originOr = origins.map(o => ({ country: { $regex: escapeRegExp(o), $options: 'i' } }));
        advancedConditions.push({ $or: originOr });
      }
    }

    if (brandOrigin) {
      const bOrigins = brandOrigin.split(',').map(o => o.trim()).filter(o => o && o !== 'Tất cả');
      if (bOrigins.length > 0) {
        const bOriginOr = bOrigins.map(o => ({ country: { $regex: escapeRegExp(o), $options: 'i' } }));
        advancedConditions.push({ $or: bOriginOr });
      }
    }

    if (advancedConditions.length > 0) {
      // Nếu có dùng keyword search thì nhét nó vào $and luôn để không bị ghi đè field name
      if (filter.name) {
        advancedConditions.unshift({ name: filter.name });
        delete filter.name;
      }
      filter.$and = advancedConditions;
    }

    // Logic Đệ quy để lấy toàn bộ danh mục con (Vấn đề 1)
    const allCatsForRecursion = await categoriesCollection().find({}).toArray();
    const catMap = {};
    allCatsForRecursion.forEach(c => {
      // getId is robust for both string and objectId/Document
      const pid = c.parentId ? getId(c.parentId) : 'root';
      if (!catMap[pid]) catMap[pid] = [];
      catMap[pid].push(getId(c));
    });

    const getIdsRecursive = (id) => {
      let ids = [id];
      const children = catMap[id] || [];
      for (const cid of children) {
        ids = ids.concat(getIdsRecursive(cid));
      }
      return ids;
    };

    if (categorySlug) {
      const cat = await categoriesCollection().findOne({ slug: categorySlug });
      if (cat) {
        const catId = getId(cat);
        const allIds = getIdsRecursive(catId);
        // Mixed-Type Matching (Vấn đề 3)
        const objIds = allIds
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));
        const inValues = [...new Set([...allIds, ...objIds])];
        if (inValues.length > 0) {
          filter.categoryId = { $in: inValues };
        }
      }
    }

    if (categoryIdParam && !filter.categoryId) {
      const allIds = getIdsRecursive(categoryIdParam);
      const objIds = allIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const inValues = [...new Set([...allIds, ...objIds])];
      filter.categoryId = { $in: inValues };
    }
    if (brand) {
      const brands = brand.split(',').map(b => b.trim()).filter(b => b && b !== 'Tất cả');
      if (brands.length > 0) {
        const brandOr = brands.map(b => ({ brand: { $regex: escapeRegExp(b), $options: 'i' } }));
        if (!filter.$and) {
          filter.$and = [];
          if (filter.name) {
            filter.$and.push({ name: filter.name });
            delete filter.name;
          }
        }
        filter.$and.push({ $or: brandOr });
      }
    }
    if (hasDiscount) {
      filter.discount = { $gt: 0 };
    }
    if (minPrice != null && !isNaN(minPrice)) {
      filter.price = filter.price || {};
      filter.price.$gte = minPrice;
    }
    if (maxPrice != null && !isNaN(maxPrice)) {
      filter.price = filter.price || {};
      filter.price.$lte = maxPrice;
    }

    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    if (!includeInactive) {
      filter.isActive = { $ne: false };
    }

    const col = productsCollection();
    const skip = req.query.skip !== undefined ? parseInt(req.query.skip, 10) : (page - 1) * limit;
    let sortOption = { _id: -1 };
    if (sort === 'price_asc') {
      filter.price = { $gt: 0 };
      sortOption = { price: 1 };
    }
    if (sort === 'price_desc') {
      filter.price = { $gt: 0 };
      sortOption = { price: -1 };
    }
    if (sort === 'consultation') {
      filter.price = 0;
      sortOption = { _id: -1 };
    }
    if (sort === 'newest') sortOption = { _id: -1 };
    if (sort === 'discount') {
      // Vấn đề 2: Lọc sản phẩm có discount thực sự và sort (cái mới nhất trước)
      filter.$expr = { $gt: [{ $convert: { input: "$discount", to: "double", onError: 0, onNull: 0 } }, 0] };
      sortOption = { discount: -1, _id: -1 };
    }

    const [items, total] = await Promise.all([
      col.find(filter).sort(sortOption).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter)
    ]);


    const products = items.map((p) => {
      const id = getId(p);
      const categoryId = p.categoryId ? getId(p.categoryId) : null;

      // Ưu tiên lấy ảnh đúng từ MongoDB:
      // 1. p.image (field chuẩn trong collection products)
      // 2. Ảnh đầu tiên trong p.gallery (nếu có)
      // 3. p.imageUrl (một số seed cũ dùng field này)
      const primaryImage =
        p.image ||
        (Array.isArray(p.gallery) && p.gallery.length > 0 ? p.gallery[0] : '') ||
        p.imageUrl ||
        '';

      return {
        _id: id,
        name: p.name,
        productName: p.name,
        price: p.price,
        discount: p.discount,
        unit: p.unit || 'Hộp',
        image: primaryImage,
        categoryId,
        slug: p.slug || id,
        brand: p.brand || '',
        country: p.country || '',
        origin: p.origin || '',
        sku: p.sku || '',
        stock: p.stock !== undefined ? p.stock : 99,
        rating: p.rating || null,
        gallery: p.gallery || [],
      };
    });

    res.json({ products, total });
  } catch (err) {
    console.error('[GET /api/products] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// GET /api/product/:slug - chi tiết sản phẩm theo slug (hoặc _id)
app.get('/api/product/:slug', async (req, res) => {
  try {
    let slug = String(req.params.slug || '').trim();
    if (!slug || slug === 'undefined' || slug === 'null') {
      return res.status(400).json({ success: false, message: 'Thiếu slug sản phẩm.' });
    }

    const col = productsCollection();

    // 1. Ưu tiên tìm theo slug
    let product = await col.findOne({ slug });

    // 2. Nếu không có, thử tìm theo _id (string hoặc ObjectId)
    if (!product) {
      product = await col.findOne({ _id: slug });
    }
    if (!product && mongoose.Types.ObjectId.isValid(slug)) {
      product = await col.findOne({ _id: new mongoose.Types.ObjectId(slug) });
    }

    // 3. Backup: nếu chỉ có SKU (từ cart / đơn hàng cũ), dùng sku (string hoặc number) để tìm sản phẩm
    if (!product) {
      const skuStr = slug;
      const skuNum = !Number.isNaN(Number(slug)) ? Number(slug) : null;
      const skuFilter = skuNum !== null
        ? { $or: [{ sku: skuStr }, { sku: skuNum }] }
        : { sku: skuStr };
      product = await col.findOne(skuFilter);
    }

    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    res.json(product);
  } catch (err) {
    console.error('[GET /api/product/:slug] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy chi tiết sản phẩm.' });
  }
});

// GET /api/products/stats - số lượng sản phẩm theo categoryId
app.get('/api/products/stats', async (req, res) => {
  try {
    const stats = await productsCollection().aggregate([
      { $group: { _id: '$categoryId', count: { $sum: 1 } } }
    ]).toArray();

    const result = {};
    for (const s of stats) {
      const key = getId({ _id: s._id });
      if (key) {
        result[key] = s.count;
      }
    }

    res.json(result);
  } catch (err) {
    console.error('[GET /api/products/stats] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thống kê sản phẩm.' });
  }
});

// GET /api/products/related/:id - sản phẩm liên quan
app.get('/api/products/related/:id', async (req, res) => {
  try {
    const idParam = String(req.params.id || '').trim();
    if (!idParam) {
      return res.status(400).json({ success: false, message: 'Thiếu productId.' });
    }

    // Tìm sản phẩm gốc
    let base = await productsCollection().findOne({ _id: idParam });
    if (!base && mongoose.Types.ObjectId.isValid(idParam)) {
      base = await productsCollection().findOne({ _id: new mongoose.Types.ObjectId(idParam) });
    }
    if (!base) {
      return res.json([]);
    }

    const baseId = getId(base);
    const baseCategoryId = base.categoryId ? getId(base.categoryId) : null;
    const filter = {
      _id: { $ne: base._id }
    };
    if (baseCategoryId) {
      filter.categoryId = base.categoryId;
    }

    const relatedRaw = await productsCollection()
      .find(filter)
      .limit(24)
      .toArray();

    const related = relatedRaw.map((p) => {
      const id = getId(p);
      return {
        _id: id,
        name: p.name,
        productName: p.name,
        price: p.price,
        discount: p.discount,
        unit: p.unit || 'Hộp',
        image: p.image,
        categoryId: p.categoryId ? getId(p.categoryId) : null,
        slug: p.slug || id,
        stock: p.stock !== undefined ? p.stock : 99,
        gallery: p.gallery || [],
      };
    });

    res.json(related);
  } catch (err) {
    console.error('[GET /api/products/related/:id] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy sản phẩm liên quan.' });
  }
});
// GET /api/promotions - danh sách chương trình khuyến mãi
app.get('/api/promotions', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const list = await db.collection('promotion_promotions').find({ is_visible: { $ne: false } }).toArray();
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('[GET /api/promotions] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/promotion-targets - danh sách đối tượng áp dụng khuyến mãi
app.get('/api/promotion-targets', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const list = await db.collection('promotion_target').find({}).toArray();
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('[GET /api/promotion-targets] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/orders?user_id=...
app.get('/api/orders', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    console.log(`[GET /api/orders] Request for user_id: '${user_id}'`);

    if (!user_id) {
      console.log('[GET /api/orders] Missing user_id');
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    // Dùng raw collection; hỗ trợ cả user_id và userId (MongoDB có thể lưu một trong hai)
    const filter = {
      $or: [
        { user_id },
        { userId: user_id },
      ],
    };
    const items = await ordersCollection()
      .find(filter)
      .sort({ _id: -1 })
      .toArray();

    console.log(`[GET /api/orders] Found ${items.length} orders for user_id: '${user_id}'`);
    res.json({ success: true, items });
  } catch (err) {
    console.error('[GET /api/orders] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách đơn hàng.' });
  }
});

// POST /api/orders - Tạo đơn hàng mới (cho phép khách vãng lai: user_id null)
app.post('/api/orders', async (req, res) => {
  try {
    const {
      user_id, paymentMethod, statusPayment, atPharmacy, pharmacyAddress,
      subtotal, shippingFee, shippingDiscount, totalAmount,
      note, requestInvoice, hideProductInfo, item, shippingInfo,
    } = req.body || {};

    const uid = (user_id != null && user_id !== '') ? String(user_id).trim() : null;
    if (!Array.isArray(item) || item.length === 0) {
      return res.status(400).json({ success: false, message: 'Đơn hàng chưa có sản phẩm.' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ success: false, message: 'Chưa chọn phương thức thanh toán.' });
    }
    // Khách vãng lai: bắt buộc shippingInfo có fullName, phone (và address nếu giao tận nơi)
    const ship = shippingInfo || {};
    if (!uid) {
      if (!ship.fullName || !String(ship.fullName).trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập tên người nhận.' });
      }
      if (!ship.phone || !String(ship.phone).trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại.' });
      }
      if (!atPharmacy && (!ship.address || !String(ship.address).trim())) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ giao hàng.' });
      }
    }

    const col = ordersCollection();
    const count = await col.countDocuments();
    const orderId = `ORD${String(count + 1).padStart(6, '0')}`;
    const now = new Date().toISOString();

    const orderDoc = {
      order_id: orderId,
      user_id: uid || null,
      paymentMethod: paymentMethod || 'cod',
      statusPayment: (paymentMethod && paymentMethod !== 'cod') ? 'paid' : (statusPayment || 'unpaid'),
      atPharmacy: Boolean(atPharmacy),
      pharmacyAddress: pharmacyAddress || '',
      subtotal: Number(subtotal) || 0,
      promotion: [],
      shippingFee: Number(shippingFee) || 0,
      shippingDiscount: Number(shippingDiscount) || 0,
      totalAmount: Number(totalAmount) || 0,
      status: 'pending',
      returnReason: '',
      cancelReason: '',
      note: note || '',
      requestInvoice: Boolean(requestInvoice),
      hideProductInfo: Boolean(hideProductInfo),
      item: item.map(i => ({
        productId: i._id || i.productId || null,
        slug: i.slug || '',
        sku: i.sku || '',
        productName: i.productName || '',
        quantity: Number(i.quantity) || 1,
        price: Number(i.price) || 0,
        unit: i.unit || 'Hộp',
        hasPromotion: Boolean(i.hasPromotion),
        image: i.image || '',
      })),
      shippingInfo: shippingInfo || {},
      route: {
        pending: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    await col.insertOne(orderDoc);

    // Tạo thông báo "đơn hàng mới" cho user (chỉ khi có user_id)
    if (uid) {
      try {
        const ncol = noticesCollection();
        await ncol.insertOne({
          user_id: uid,
          type: 'order_created',
          title: 'Đặt hàng thành công',
          message: `Đơn hàng ${orderId} đã được tạo và đang chờ xác nhận.`,
          createdAt: now,
          read: false,
          link: '/account',
          linkLabel: 'Xem đơn hàng',
          meta: orderId,
        });
      } catch (e) {
        console.warn('[POST /api/orders] Cannot create notice:', e.message);
      }
    }

    console.log(`[POST /api/orders] Created order ${orderId} for user ${uid || 'guest'}`);
    res.json({ success: true, order_id: orderId, order: orderDoc });
  } catch (err) {
    console.error('[POST /api/orders] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo đơn hàng.' });
  }
});

// ========= NOTICES (Thông báo) - collection "notice" =========
/** Chuẩn hoá HH:mm cho so khớp completion_log */
function normalizeReminderTimeStr(t) {
  const s = String(t || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '00:00';
  return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`;
}
/** Ngày theo múi Việt Nam (YYYY-MM-DD) — trùng ngày dùng thuốc với user */
function vnTodayKey(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}
/** Số phút từ 0h đến hiện tại (VN) */
function vnMinutesSinceMidnight(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const min = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return h * 60 + min;
}
/** Lịch nhắc: trong ngày VN, đã qua giờ nhắc, chưa tick → thông báo */
async function buildDueReminderNoticeItems(user_id, now) {
  const todayKey = vnTodayKey(now);
  const curMin = vnMinutesSinceMidnight(now);
  const uid = String(user_id);
  const list = await remindersCollection()
    .find({ $or: [{ user_id: uid }, { user_id: user_id }] })
    .toArray();
  const out = [];
  for (const r of list) {
    if (r.schedule_status === 'Inactive' || r.config_status === 'Inactive') continue;
    const startStr = (r.start_date && String(r.start_date).slice(0, 10)) || todayKey;
    const endStr = (r.end_date && String(r.end_date).slice(0, 10)) || todayKey;
    if (todayKey < startStr) continue;
    /* Hết end_date: chỉ bỏ qua nếu đã tắt lịch; còn Active thì vẫn nhắc (DB Compass hay quên gia hạn) */
    if (todayKey > endStr) {
      if (r.schedule_status === 'Inactive' || r.config_status === 'Inactive') continue;
    }
    const times = Array.isArray(r.reminder_times) && r.reminder_times.length ? r.reminder_times : ['08:00'];
    const log = r.completion_log || [];
    for (const tRaw of times) {
      const timeNorm = normalizeReminderTimeStr(tRaw);
      const done = log.some((c) => c && c.date === todayKey && normalizeReminderTimeStr(c.time) === timeNorm);
      if (done) continue;
      const [hh, mm] = timeNorm.split(':').map((x) => parseInt(x, 10) || 0);
      const slotMin = hh * 60 + mm;
      if (curMin < slotMin) continue;
      const rid = getId(r) || String(r._id);
      out.push({
        id: `reminder-due-${rid}-${todayKey}-${timeNorm.replace(':', '')}`,
        type: 'medication_reminder',
        title: 'Nhắc uống thuốc',
        message: `${r.med_name || 'Thuốc'} — ${r.dosage || ''}${r.unit ? ' ' + r.unit : ''} (lịch ${timeNorm})`,
        time: now.toISOString(),
        read: false,
        link: '/account',
        linkLabel: 'Mở lịch nhắc',
        meta: `${timeNorm} · ${r.med_name || ''}`.trim(),
      });
    }
  }
  out.sort((a, b) => (b.meta || '').localeCompare(a.meta || ''));
  return out;
}

// GET /api/notices?user_id=...
app.get('/api/notices', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const col = noticesCollection();
    const docs = await col
      .find({ user_id })
      .sort({ createdAt: -1 })
      .toArray();
    const items = docs.map((d) => ({
      id: getId(d),
      type: d.type || 'order_created',
      title: d.title || '',
      message: d.message || '',
      time: d.createdAt ? new Date(d.createdAt).toISOString() : '',
      read: Boolean(d.read),
      link: d.link,
      linkLabel: d.linkLabel,
      meta: d.meta,
    }));
    const now = new Date();
    let dueReminders = [];
    try {
      dueReminders = await buildDueReminderNoticeItems(user_id, now);
    } catch (e) {
      console.warn('[GET /api/notices] due reminders:', e.message);
    }
    const merged = [...dueReminders, ...items];
    res.json({ success: true, items: merged });
  } catch (err) {
    console.error('[GET /api/notices] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thông báo.' });
  }
});

// PATCH /api/notices/:id/read - đánh dấu một thông báo đã đọc
app.patch('/api/notices/:id/read', async (req, res) => {
  try {
    const id = req.params.id;
    const user_id = String(req.query.user_id || req.body?.user_id || '').trim();
    const col = noticesCollection();
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { _id: new mongoose.Types.ObjectId(id), user_id }
      : { _id: id, user_id };
    const result = await col.updateOne(filter, { $set: { read: true } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/notices/:id/read] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật thông báo.' });
  }
});

// PATCH /api/notices/read-all - đánh dấu tất cả thông báo đã đọc (body: user_id)
app.patch('/api/notices/read-all', async (req, res) => {
  try {
    const user_id = String(req.body?.user_id || req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const col = noticesCollection();
    await col.updateMany({ user_id, read: { $ne: true } }, { $set: { read: true } });
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/notices/read-all] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đánh dấu đọc tất cả.' });
  }
});

const consultationsPrescriptionsCollection = () => mongoose.connection.db.collection('consultations_prescription');
const reviewsCollection = () => mongoose.connection.db.collection('reviews');
const consultationsProductCollection = () => mongoose.connection.db.collection('consultations_product');
const productFaqsCollection = () => mongoose.connection.db.collection('database.product_faqs');

// PUT /api/orders/:id/cancel - Huỷ đơn hàng
app.put('/api/orders/:id/cancel', async (req, res) => {
  try {
    const id = req.params.id;
    const { reason } = req.body || {};
    const col = mongoose.connection.db.collection('orders');
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { order_id: id }] }
      : { order_id: id };
    const doc = await col.findOne(filter);
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    const now = new Date().toISOString();
    await col.updateOne(filter, {
      $set: {
        status: 'cancelled',
        cancelReason: reason || '',
        'route.cancelled': now,
        updatedAt: now,
      },
    });
    // Tạo thông báo huỷ đơn hàng
    try {
      const userId = doc.user_id || doc.userId;
      if (userId) {
        await noticesCollection().insertOne({
          user_id: userId,
          type: 'order_updated',
          title: 'Đơn hàng đã được huỷ',
          message: `Đơn hàng ${doc.order_id || id} đã được huỷ${reason ? `: ${reason}` : '.'}`,
          createdAt: now,
          read: false,
          link: '/account',
          linkLabel: 'Xem đơn hàng',
          meta: doc.order_id || id,
        });
      }
    } catch (e) {
      console.warn('[PUT /api/orders/:id/cancel] Cannot create notice:', e.message);
    }
    res.json({ success: true, message: 'Đã huỷ đơn hàng.' });
  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// PUT /api/orders/:id/request-return - Yêu cầu trả hàng/hoàn tiền (chuyển trạng thái sang processing_return)
app.put('/api/orders/:id/request-return', async (req, res) => {
  try {
    const id = req.params.id;
    const { reason, detailedDescription } = req.body || {};
    const col = mongoose.connection.db.collection('orders');
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { order_id: id }] }
      : { order_id: id };
    const doc = await col.findOne(filter);
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    const allowedStatuses = ['delivered', 'unreview', 'reviewed', 'completed'];
    if (!allowedStatuses.includes(doc.status)) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ đơn đã giao mới có thể yêu cầu trả hàng/hoàn tiền.',
      });
    }
    const now = new Date().toISOString();
    const returnReasonText = [reason, detailedDescription].filter(Boolean).join(' - ') || '';
    await col.updateOne(filter, {
      $set: {
        status: 'processing_return',
        returnReason: returnReasonText,
        updatedAt: now,
      },
    });

    // Lưu notice cho user khi gửi yêu cầu trả hàng
    try {
      const userId = doc.user_id || doc.userId;
      if (userId) {
        await noticesCollection().insertOne({
          user_id: String(userId),
          type: 'order_updated',
          title: 'Yêu cầu trả hàng đã được gửi',
          message: `Yêu cầu trả hàng/hoàn tiền cho đơn hàng ${doc.order_id || id} đã được gửi. Chúng tôi sẽ xử lý trong thời gian sớm nhất.`,
          createdAt: now,
          read: false,
          link: '/account',
          linkLabel: 'Xem trạng thái',
          meta: doc.order_id || id,
        });
      }
    } catch (e) {
      console.warn('[PUT /api/orders/:id/request-return] Cannot create notice:', e.message);
    }

    res.json({ success: true, message: 'Đã gửi yêu cầu trả hàng/hoàn tiền.' });
  } catch (err) {
    console.error('Request return error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// PUT /api/orders/:id/confirm-received - Xác nhận đã nhận hàng
app.put('/api/orders/:id/confirm-received', async (req, res) => {
  try {
    const id = req.params.id;
    const col = mongoose.connection.db.collection('orders');
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { order_id: id }] }
      : { order_id: id };
    const doc = await col.findOne(filter);
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    const now = new Date().toISOString();

    // Sau khi người dùng bấm "Đã nhận hàng" trên frontend,
    // lưu trạng thái kỹ thuật là "unreview" để thể hiện "đã giao nhưng chưa đánh giá".
    await col.updateOne(filter, {
      $set: {
        status: 'unreview',
        statusPayment: 'paid', // Cập nhật sang Đã thanh toán khi nhận hàng (thường cho COD)
        'route.received': doc.route?.received || now,
        updatedAt: now,
      },
    });

    // Tạo thông báo đã nhận hàng
    try {
      const userId = doc.user_id || doc.userId;
      if (userId) {
        await noticesCollection().insertOne({
          user_id: userId,
          type: 'order_updated',
          title: 'Bạn đã nhận hàng',
          message: `Đơn hàng ${doc.order_id || id} đã được xác nhận giao thành công, chờ bạn đánh giá.`,
          createdAt: now,
          read: false,
          link: '/account',
          linkLabel: 'Xem đơn hàng',
          meta: doc.order_id || id,
        });
      }
    } catch (e) {
      console.warn('[PUT /api/orders/:id/confirm-received] Cannot create notice:', e.message);
    }

    res.json({ success: true, message: 'Đã xác nhận nhận hàng, chuyển sang chờ đánh giá' });
  } catch (err) {
    console.error('[PUT /api/orders/:id/confirm-received] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
  }
});

// PUT /api/orders/:id/confirm-returned - User xác nhận đã nhận hàng hoàn trả (từ returning -> returned)
app.put('/api/orders/:id/confirm-returned', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const orderId = req.params.id;

    const result = await db.collection('orders').findOneAndUpdate(
      { $or: [{ _id: orderId }, { order_id: orderId }] },
      {
        $set: {
          status: 'returned',
          'route.returned': new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    // Ghi log notice (tuỳ chọn)
    try {
      const orderData = result.value || result;
      const user_id = orderData.user_id || 'guest';
      await db.collection('notices').insertOne({
        user_id,
        title: 'Xác nhận nhận hàng hoàn trả',
        body: `Bạn đã xác nhận nhận hàng hoàn trả cho đơn ${orderId} thành công.`,
        type: 'order',
        isRead: false,
        createdAt: new Date()
      });
    } catch (e) {
      console.warn('[PUT /api/orders/:id/confirm-returned] Cannot create notice:', e.message);
    }

    res.json({ success: true, message: 'Đã xác nhận nhận hàng hoàn trả' });
  } catch (err) {
    console.error('[PUT /api/orders/:id/confirm-returned] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
  }
});

// PUT /api/orders/:id/cancel-return - User hủy yêu cầu trả hàng (từ processing_return -> unreview)
app.put('/api/orders/:id/cancel-return', async (req, res) => {
  try {
    const id = req.params.id;
    const col = mongoose.connection.db.collection('orders');

    // Log for debugging
    console.log('[DEBUG] Cancel return request for ID:', id);

    // Logic tìm kiếm giống với request-return
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { order_id: id }] }
      : { order_id: id };

    const doc = await col.findOne(filter);
    if (!doc) {
      console.error('[DEBUG] Order not found for filter:', JSON.stringify(filter));
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    const now = new Date().toISOString();
    await col.updateOne(filter, {
      $set: {
        status: 'unreview',
        returnReason: '', // Xóa lý do trả hàng
        updatedAt: now,
        'route.cancel_return': now
      }
    });

    // Ghi log notice
    try {
      const user_id = doc.user_id || doc.userId || 'guest';
      await mongoose.connection.db.collection('notices').insertOne({
        user_id,
        title: 'Hủy yêu cầu trả hàng',
        body: `Bạn đã hủy yêu cầu trả hàng cho đơn ${doc.order_id || id} thành công. Đơn hàng đã chuyển về trạng thái chờ đánh giá.`,
        type: 'order',
        isRead: false,
        createdAt: new Date()
      });
    } catch (e) {
      console.warn('[PUT /api/orders/:id/cancel-return] Cannot create notice:', e.message);
    }

    console.log('[DEBUG] Cancel return success for order:', doc.order_id || id);
    res.json({ success: true, message: 'Đã hủy yêu cầu trả hàng thành công' });
  } catch (err) {
    console.error('[PUT /api/orders/:id/cancel-return] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
  }
});

// PATCH /api/prescriptions/:id/cancel - Huỷ đơn thuốc / tư vấn
app.patch('/api/prescriptions/:id/cancel', async (req, res) => {
  try {
    const id = req.params.id;
    const now = new Date().toISOString();
    const col = consultationsPrescriptionsCollection();
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { _id: new mongoose.Types.ObjectId(id) }
      : { prescriptionId: id };
    const result = await col.updateOne(filter, {
      $set: {
        status: 'cancelled',
        'current_status.status': 'cancelled',
        'current_status.changedAt': now,
        updatedAt: now,
      },
      $push: { status_history: { status: 'cancelled', changedAt: now, changedBy: 'user' } },
    });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn tư vấn.' });
    }
    res.json({ success: true, message: 'Đã huỷ đơn tư vấn.' });
  } catch (err) {
    console.error('Cancel prescription error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// GET /api/prescriptions?user_id=...
app.get('/api/prescriptions', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    console.log(`[GET /api/prescriptions] Request for user_id: '${user_id}'`);

    if (!user_id) {
      console.log('[GET /api/prescriptions] Missing user_id');
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    // Dùng raw collection thay Mongoose model
    const items = await consultationsPrescriptionsCollection()
      .find({ user_id })
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`[GET /api/prescriptions] Found ${items.length} prescriptions for user_id: '${user_id}'`);
    res.json({ success: true, items });
  } catch (err) {
    console.error('[GET /api/prescriptions] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách đơn thuốc.' });
  }
});

// POST /api/prescriptions - Tạo đơn thuốc cần tư vấn (cho phép khách vãng lai: user_id null)
app.post('/api/prescriptions', async (req, res) => {
  try {
    const {
      user_id,
      full_name,
      phone,
      note,
      consultation_type,
      images,
      medicines_requested,
    } = req.body || {};

    const uid = (user_id != null && user_id !== '') ? String(user_id).trim() : null;
    if (!uid) {
      if (!full_name || !String(full_name).trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên.' });
      }
      if (!phone || !String(phone).trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại.' });
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Sinh mã đơn thuốc dạng PRE100000001, PRE100000002... tăng dần (chỉ dùng dải 100000001-100000999)
    const col = consultationsPrescriptionsCollection();
    const SEQ_MIN = 100000001;
    const SEQ_MAX = 100000999;
    let nextNumber = SEQ_MIN;
    try {
      const docs = await col.find({ prescriptionId: { $regex: '^PRE\\d+$' } }).toArray();
      let maxSeq = SEQ_MIN - 1;
      for (const d of docs) {
        const m = String(d.prescriptionId || '').match(/^PRE(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n) && n >= SEQ_MIN && n <= SEQ_MAX && n > maxSeq) {
            maxSeq = n;
          }
        }
      }
      nextNumber = maxSeq + 1;
    } catch (e) {
      console.warn('[POST /api/prescriptions] Cannot determine next prescriptionId, fallback:', e.message);
    }
    const prescriptionId = `PRE${nextNumber}`;

    const meds = Array.isArray(medicines_requested)
      ? medicines_requested.map((m) => ({
        id: m.id || m._id || new mongoose.Types.ObjectId().toString(),
        name: m.name || m.productName || '',
        sku: m.sku || '',
        image: m.image || '',
      }))
      : [];

    const doc = {
      prescriptionId,
      user_id: uid || null,
      full_name: full_name ? String(full_name).trim() : '',
      phone: phone ? String(phone).trim() : '',
      note: note ? String(note).trim() : '',
      consultation_type: consultation_type || 'online',
      images: Array.isArray(images) ? images.slice(0, 10) : [],
      medicines_requested: meds,
      status: 'pending',
      current_status: {
        status: 'pending',
        changedAt: nowIso,
        changedBy: uid || 'guest',
      },
      status_history: [
        {
          status: 'pending',
          changedAt: nowIso,
          changedBy: uid || 'guest',
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await col.insertOne(doc);
    const created = { ...doc, _id: insertResult.insertedId };

    // Tạo thông báo "đơn thuốc cần tư vấn" cho user (chỉ khi có user_id)
    if (uid) {
      try {
        const ncol = noticesCollection();
        await ncol.insertOne({
          user_id: uid,
          type: 'prescription_created',
          title: 'Đơn thuốc cần tư vấn',
          message: 'Yêu cầu tư vấn đơn thuốc của bạn đã được tạo. Dược sĩ sẽ liên hệ trong thời gian sớm nhất.',
          createdAt: now,
          read: false,
          link: '/account',
          linkLabel: 'Xem đơn thuốc',
          meta: prescriptionId,
        });
      } catch (e) {
        console.warn('[POST /api/prescriptions] Cannot create notice:', e.message);
      }
    }

    console.log(`[POST /api/prescriptions] Created prescription ${prescriptionId} for user ${uid || 'guest'}`);
    res.json({ success: true, item: created, prescriptionId });
  } catch (err) {
    console.error('[POST /api/prescriptions] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo đơn thuốc tư vấn.' });
  }
});

// ... (existing routes)

// GET /api/carts?user_id=...
app.get('/api/carts', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    // Dùng raw collection thay Mongoose model
    const cartDoc = await cartsCollection().findOne({ user_id });
    if (!cartDoc) {
      return res.json({
        success: true,
        cart: { user_id, items: [], itemCount: 0, totalQuantity: 0, totalPrice: 0 }
      });
    }

    const itemsArray = Array.isArray(cartDoc.items) ? cartDoc.items : [];

    // Fetch latest images from products collection
    if (itemsArray.length > 0) {
      const productIds = itemsArray.map(it => it._id?.$oid || String(it._id)).filter(Boolean);

      // Build query to handle both string and ObjectId
      const idFilters = productIds.map(id => {
        const filters = [{ _id: id }];
        if (mongoose.Types.ObjectId.isValid(id)) {
          filters.push({ _id: new mongoose.Types.ObjectId(id) });
        }
        filters.push({ "_id.$oid": id });
        return filters;
      }).flat();

      if (idFilters.length > 0) {
        const products = await productsCollection().find({ $or: idFilters }, { projection: { _id: 1, image: 1, gallery: 1, images: 1, imageUrl: 1 } }).toArray();

        const productMap = {};
        products.forEach(p => {
          const pid = p._id?.$oid || String(p._id);

          // Ưu tiên: field image -> images[0] -> gallery[0] -> imageUrl (Giống logic danh mục sản phẩm)
          const primaryImage = p.image ||
            (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : '') ||
            (Array.isArray(p.gallery) && p.gallery.length > 0 ? p.gallery[0] : '') ||
            p.imageUrl || '';

          productMap[pid] = primaryImage;
        });

        // Cập nhật lại mảng items
        itemsArray.forEach(it => {
          const itId = it._id?.$oid || String(it._id);
          if (productMap[itId]) {
            it.image = productMap[itId];
          }
        });
      }
    }

    const totalQuantity = itemsArray.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalPrice = itemsArray.reduce(
      (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0
    );

    const cart = {
      ...cartDoc,
      items: itemsArray,
      itemCount: itemsArray.length,
      totalQuantity,
      totalPrice
    };

    res.json({ success: true, cart });
  } catch (err) {
    console.error('[GET /api/carts] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy giỏ hàng.' });
  }
});

// POST /api/carts/add-item - thêm 1 item vào giỏ (tự tạo cart nếu chưa có)
app.post('/api/carts/add-item', async (req, res) => {
  try {
    const { user_id, item, quantity } = req.body || {};
    const uid = String(user_id || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    if (!item || (!item._id && !item.sku && !item.slug)) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin sản phẩm.' });
    }

    const qty = Math.max(1, Number(quantity) || 1);
    const col = cartsCollection();
    let cartDoc = await col.findOne({ user_id: uid });

    let items = cartDoc && Array.isArray(cartDoc.items) ? [...cartDoc.items] : [];

    const itemId = String(item._id || item.sku || item.slug || '');
    const now = new Date().toISOString();
    const existIdx = items.findIndex(it => String(it._id || it.sku || '') === itemId);

    // Fetch actual stock from Products DB
    const pInfo = await productsCollection().findOne(
      { $or: [{ _id: itemId }, { _id: mongoose.Types.ObjectId.isValid(itemId) ? new mongoose.Types.ObjectId(itemId) : null }, { sku: item.sku || itemId }].filter(q => q._id !== null) },
      { projection: { stock: 1 } }
    );
    const availableStock = pInfo?.stock !== undefined ? Number(pInfo.stock) : 99;

    if (existIdx > -1) {
      const nextQty = (Number(items[existIdx].quantity) || 0) + qty;
      items[existIdx].quantity = Math.min(nextQty, availableStock);
      items[existIdx].updatedAt = now;
      items[existIdx].stock = availableStock;
    } else {
      items.unshift({
        _id: itemId,
        sku: item.sku || '',
        productName: item.productName || item.name || '',
        quantity: Math.min(qty, availableStock),
        discount: Number(item.discount) || 0,
        price: Number(item.price) || 0,
        hasPromotion: Boolean(item.hasPromotion),
        image: item.image || '',
        unit: item.unit || 'Hộp',
        category: item.category || '',
        addedAt: now,
        updatedAt: now,
        stock: availableStock,
      });
    }

    // Refresh images from Products DB (Absolute Data Priority)
    const productIds = items.map(it => it._id?.$oid || String(it._id)).filter(Boolean);
    const idFilters = productIds.map(id => {
      const filters = [{ _id: id }];
      if (mongoose.Types.ObjectId.isValid(id)) filters.push({ _id: new mongoose.Types.ObjectId(id) });
      filters.push({ "_id.$oid": id });
      return filters;
    }).flat();

    if (idFilters.length > 0) {
      const products = await productsCollection().find({ $or: idFilters }, { projection: { _id: 1, image: 1, gallery: 1, images: 1, imageUrl: 1 } }).toArray();
      const productMap = {};
      products.forEach(p => {
        const pid = p._id?.$oid || String(p._id);
        const primaryImage = p.image || (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : '') || (Array.isArray(p.gallery) && p.gallery.length > 0 ? p.gallery[0] : '') || p.imageUrl || '';
        productMap[pid] = primaryImage;
      });
      items.forEach(it => {
        const itId = it._id?.$oid || String(it._id);
        if (productMap[itId]) it.image = productMap[itId];
      });
    }

    const totalQuantity = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const totalPrice = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);

    await col.updateOne(
      { user_id: uid },
      {
        $set: {
          user_id: uid,
          items,
          itemCount: items.length,
          totalQuantity,
          totalPrice,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    const cart = { user_id: uid, items, itemCount: items.length, totalQuantity, totalPrice };
    res.json({ success: true, cart });
  } catch (err) {
    console.error('[POST /api/carts/add-item] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thêm vào giỏ hàng.' });
  }
});

// PATCH /api/carts - cập nhật giỏ hàng
app.patch('/api/carts', async (req, res) => {
  try {
    const { user_id, items } = req.body || {};
    const uid = String(user_id || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    let itemsArray = Array.isArray(items) ? [...items] : [];

    // Refresh images from Products DB (Absolute Data Priority)
    if (itemsArray.length > 0) {
      const productIds = itemsArray.map(it => it._id?.$oid || String(it._id)).filter(Boolean);
      const idFilters = productIds.map(id => {
        const filters = [{ _id: id }];
        if (mongoose.Types.ObjectId.isValid(id)) filters.push({ _id: new mongoose.Types.ObjectId(id) });
        filters.push({ "_id.$oid": id });
        return filters;
      }).flat();

      if (idFilters.length > 0) {
        const dbProducts = await productsCollection().find({ $or: idFilters }, { projection: { _id: 1, image: 1, gallery: 1, images: 1, imageUrl: 1, stock: 1 } }).toArray();
        const productMap = {};
        dbProducts.forEach(p => {
          const pid = p._id?.$oid || String(p._id);
          const primaryImage = p.image || (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : '') || (Array.isArray(p.gallery) && p.gallery.length > 0 ? p.gallery[0] : '') || p.imageUrl || '';
          productMap[pid] = { image: primaryImage, stock: p.stock !== undefined ? p.stock : 99 };
        });
        itemsArray.forEach(it => {
          const itId = it._id?.$oid || String(it._id);
          if (productMap[itId]) {
            it.image = productMap[itId].image;
            const available = productMap[itId].stock;
            it.stock = available;
            it.quantity = Math.min(Number(it.quantity) || 1, available);
          }
        });
      }
    }

    const totalQuantity = itemsArray.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalPrice = itemsArray.reduce(
      (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0
    );

    await cartsCollection().updateOne(
      { user_id: uid },
      {
        $set: {
          user_id: uid,
          items: itemsArray,
          itemCount: itemsArray.length,
          totalQuantity,
          totalPrice,
          updatedAt: new Date().toISOString()
        },
        $setOnInsert: { createdAt: new Date().toISOString() }
      },
      { upsert: true }
    );

    const cart = {
      user_id: uid,
      items: itemsArray,
      itemCount: itemsArray.length,
      totalQuantity,
      totalPrice,
    };
    res.json({ success: true, cart });
  } catch (err) {
    console.error('[PATCH /api/carts] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật giỏ hàng.' });
  }
});

// Chuẩn hóa SĐT: bỏ khoảng trắng, giữ 9-11 số
const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

// Mật khẩu: ít nhất 8 ký tự, 1 chữ in hoa, 1 ký tự đặc biệt
const isValidPassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
  );
};
const PASSWORD_RULE_MSG = 'Mật khẩu gồm ít nhất 8 ký tự, 1 chữ in hoa và 1 ký tự đặc biệt.';

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'VitaCare API' });
});

// ========= ĐỊA GIỚI HÀNH CHÍNH (tree_complete) =========

// Helper: đọc tree_complete từ MongoDB; nếu trống thì fallback đọc file JSON trong /data
async function loadTreeDocs() {
  let docs = [];
  try {
    docs = await locationsCollection().find().toArray();
  } catch {
    docs = [];
  }

  if (docs.length > 0) return docs;

  const dataDir = path.join(__dirname, '../data');
  const treePath = path.join(dataDir, 'tree_complete.json');
  if (!fs.existsSync(treePath)) return [];

  try {
    const raw = fs.readFileSync(treePath, 'utf8');
    const json = JSON.parse(raw);
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') return [json];
    return [];
  } catch (e) {
    console.warn('Không đọc được tree_complete.json:', e.message);
    return [];
  }
}

// GET /api/tree_complete
app.get('/api/tree_complete', async (req, res) => {
  try {
    const docs = await loadTreeDocs();
    res.json(docs);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/locations/provinces
// Trả về danh sách Tỉnh/Thành phố
app.get('/api/locations/provinces', async (req, res) => {
  try {
    const docs = await loadTreeDocs();
    const items = [];

    for (const doc of docs) {
      for (const key of Object.keys(doc)) {
        if (key === '_id') continue;
        const province = doc[key];
        if (!province || !province.code || !province.name) continue;
        items.push({
          code: province.code,
          name: province.name,
          name_with_type: province.name_with_type || province.name,
        });
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    res.json({ success: true, items });
  } catch (err) {
    console.error('Get provinces error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tỉnh/thành phố.' });
  }
});

// GET /api/locations/districts?province_code=10
app.get('/api/locations/districts', async (req, res) => {
  try {
    const province_code = String(req.query.province_code || '').trim();
    if (!province_code) {
      return res.status(400).json({ success: false, message: 'Thiếu province_code.' });
    }

    const docs = await loadTreeDocs();
    let province;
    for (const doc of docs) {
      if (doc[province_code]) {
        province = doc[province_code];
        break;
      }
    }
    if (!province) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tỉnh/thành phố.' });
    }

    const districts = province['quan-huyen'] || {};
    const items = Object.keys(districts).map((code) => {
      const d = districts[code];
      return {
        code: d.code || code,
        name: d.name,
        name_with_type: d.name_with_type || d.name,
      };
    });

    items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    res.json({ success: true, items });
  } catch (err) {
    console.error('Get districts error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách quận/huyện.' });
  }
});

// GET /api/locations/wards?province_code=10&district_code=080
app.get('/api/locations/wards', async (req, res) => {
  try {
    const province_code = String(req.query.province_code || '').trim();
    const district_code = String(req.query.district_code || '').trim();
    if (!province_code || !district_code) {
      return res.status(400).json({ success: false, message: 'Thiếu province_code hoặc district_code.' });
    }

    const docs = await loadTreeDocs();
    let province;
    for (const doc of docs) {
      if (doc[province_code]) {
        province = doc[province_code];
        break;
      }
    }
    if (!province) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tỉnh/thành phố.' });
    }

    const districts = province['quan-huyen'] || {};
    const district = districts[district_code];
    if (!district) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy quận/huyện.' });
    }

    const wards = district['xa-phuong'] || {};
    const items = Object.keys(wards).map((code) => {
      const w = wards[code];
      return {
        code: w.code || code,
        name: w.name,
        name_with_type: w.name_with_type || w.name,
      };
    });

    items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    res.json({ success: true, items });
  } catch (err) {
    console.error('Get wards error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách phường/xã.' });
  }
});

// ========= STORE SYSTEM (Nhà thuốc VitaCare) =========
// GET /api/store-locations/provinces - danh sách Tỉnh/Thành phố có nhà thuốc
app.get('/api/store-locations/provinces', async (req, res) => {
  try {
    const col = storeSystemCollection();
    const docs = await col.aggregate([
      {
        $group: {
          _id: { ma_tinh: '$dia_chi.ma_tinh', tinh_thanh: '$dia_chi.tinh_thanh' },
          storeCount: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.tinh_thanh': 1,
        },
      },
    ]).toArray();

    const items = docs
      .filter(d => d._id && d._id.ma_tinh && d._id.tinh_thanh)
      .map(d => ({
        code: String(d._id.ma_tinh),
        name: String(d._id.tinh_thanh),
        storeCount: d.storeCount || 0,
      }));

    res.json({ success: true, items });
  } catch (err) {
    console.error('Get store provinces error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tỉnh/thành có nhà thuốc.' });
  }
});

// GET /api/store-locations/wards?province_code=79 - danh sách phường/xã theo Tỉnh/Thành phố
app.get('/api/store-locations/wards', async (req, res) => {
  try {
    const provinceCode = String(req.query.province_code || '').trim();
    if (!provinceCode) {
      return res.status(400).json({ success: false, message: 'Thiếu province_code.' });
    }

    const col = storeSystemCollection();
    const docs = await col.aggregate([
      {
        $match: {
          'dia_chi.ma_tinh': provinceCode,
        },
      },
      {
        $group: {
          _id: { phuong_xa: '$dia_chi.phuong_xa', quan_huyen: '$dia_chi.quan_huyen' },
          storeCount: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.quan_huyen': 1,
          '_id.phuong_xa': 1,
        },
      },
    ]).toArray();

    const items = docs
      .filter(d => d._id && d._id.phuong_xa)
      .map(d => ({
        ward: String(d._id.phuong_xa),
        district: String(d._id.quan_huyen || ''),
        storeCount: d.storeCount || 0,
      }));

    res.json({ success: true, items });
  } catch (err) {
    console.error('Get store wards error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách phường/xã có nhà thuốc.' });
  }
});

// ========= QUIZ (Trắc nghiệm sức khỏe) =========
// GET /api/quizzes - danh sách bộ câu hỏi
app.get('/api/quizzes', async (req, res) => {
  try {
    const quizzes = await quizCollection().find({}).toArray();

    // Gộp dữ liệu results vào quiz
    let resultsData = [];
    const resultsPath = path.join(__dirname, '../data/results.json');
    if (fs.existsSync(resultsPath)) {
      resultsData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    }

    const mergedQuizzes = quizzes.map(quiz => {
      const match = resultsData.find(r => r.disease_id === quiz.quiz_id);
      if (match && match.results) {
        return { ...quiz, results: match.results };
      }
      return quiz;
    });

    res.json(mergedQuizzes);
  } catch (err) {
    console.error('[GET /api/quizzes] Error:', err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách câu hỏi.' });
  }
});

// POST /api/quiz-results - gửi kết quả trắc nghiệm
app.post('/api/quiz-results', async (req, res) => {
  try {
    const newResult = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const saved = await resultsCollection().insertOne(newResult);
    res.status(201).json({ message: 'Đã lưu kết quả.', result: { ...newResult, _id: saved.insertedId } });
  } catch (err) {
    console.error('[POST /api/quiz-results] Error:', err);
    res.status(500).json({ message: 'Lỗi khi lưu kết quả.' });
  }
});

// GET /api/store-locations/tree - cây địa điểm đầy đủ (tỉnh -> quận -> phường) cho store-system
app.get('/api/store-locations/tree', async (req, res) => {
  try {
    const col = storeSystemCollection();
    const provincesRes = await col.aggregate([
      { $group: { _id: { ma_tinh: '$dia_chi.ma_tinh', tinh_thanh: '$dia_chi.tinh_thanh' } } },
      { $sort: { '_id.tinh_thanh': 1 } }
    ]).toArray();
    const tree = [];
    for (const p of provincesRes) {
      if (!p._id?.ma_tinh || !p._id?.tinh_thanh) continue;
      const wardsRes = await col.aggregate([
        { $match: { 'dia_chi.ma_tinh': p._id.ma_tinh } },
        { $group: { _id: { quan: '$dia_chi.quan_huyen', phuong: '$dia_chi.phuong_xa' } } },
        { $sort: { '_id.quan': 1, '_id.phuong': 1 } }
      ]).toArray();
      const byQuan = {};
      wardsRes.forEach((w) => {
        const q = String(w._id?.quan || '');
        const ph = String(w._id?.phuong || '');
        if (!q) return;
        if (!byQuan[q]) byQuan[q] = [];
        if (ph && !byQuan[q].includes(ph)) byQuan[q].push(ph);
      });
      const quans = Object.keys(byQuan).sort().map((ten) => ({ ten, phuongs: byQuan[ten].sort() }));
      tree.push({ tinh: String(p._id.tinh_thanh), quans });
    }
    res.json(tree);
  } catch (err) {
    console.error('Get store tree error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// GET /api/stores - danh sách nhà thuốc (có filter, phân trang)
app.get('/api/stores', async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const tinh_thanh = String(req.query.tinh_thanh || '').trim();
    const quan_huyen = String(req.query.quan_huyen || '').trim();
    const phuong_xa = String(req.query.phuong_xa || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 8));
    const filter = {};
    if (tinh_thanh && tinh_thanh !== 'Tất cả') {
      filter['dia_chi.tinh_thanh'] = tinh_thanh;
    }
    if (quan_huyen && quan_huyen !== 'Tất cả') {
      filter['dia_chi.quan_huyen'] = quan_huyen;
    }
    if (phuong_xa && phuong_xa !== 'Tất cả') {
      filter['dia_chi.phuong_xa'] = phuong_xa;
    }
    if (keyword) {
      const esc = escapeRegExp(keyword);
      filter.$or = [
        { ten_cua_hang: { $regex: esc, $options: 'i' } },
        { 'dia_chi.dia_chi_day_du': { $regex: esc, $options: 'i' } },
        { 'thong_tin_lien_he.so_dien_thoai': { $regex: esc, $options: 'i' } }
      ];
    }
    const col = storeSystemCollection();
    const [docs, total] = await Promise.all([
      col.find(filter).skip((page - 1) * limit).limit(limit).toArray(),
      col.countDocuments(filter)
    ]);
    const totalPages = Math.ceil(total / limit);
    res.json({ success: true, data: docs, total, totalPages });
  } catch (err) {
    console.error('Get stores error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách nhà thuốc.' });
  }
});

// GET /api/addresses?user_id=...
// Đọc danh sách địa chỉ giao hàng từ collection "addresses" theo user_id
app.get('/api/addresses', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    const items = await addressesCollection()
      .find({
        $or: [
          { user_id },
          { userId: user_id },
        ],
      })
      .sort({ isDefault: -1, createdAt: 1 })
      .toArray();

    // Chuẩn hóa _id thành string để frontend luôn nhận đúng
    const normalized = items.map((doc) => ({
      ...doc,
      _id: doc._id ? String(doc._id) : doc._id,
    }));

    console.log('GET /api/addresses user_id=%s found %d items', user_id, normalized.length);
    res.json({ success: true, items: normalized });
  } catch (err) {
    console.error('Get addresses error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách địa chỉ.' });
  }
});



// ========= HEALTH PROFILES (Công cụ sức khỏe) =========
// Helper: tính trạng thái BMI theo giá trị
function getBmiStatus(bmi) {
  if (bmi == null || isNaN(bmi)) return null;
  if (bmi < 18.5) return 'Thiếu cân';
  if (bmi < 25) return 'Bình thường';
  if (bmi < 30) return 'Thừa cân';
  return 'Béo phì';
}
// Helper: tính trạng thái huyết áp (systolic, diastolic)
function getBloodPressureStatus(systolic, diastolic) {
  const s = Number(systolic);
  const d = Number(diastolic);
  if (isNaN(s) || isNaN(d)) return null;
  if (s < 120 && d < 80) return 'Bình thường';
  if (s < 140 && d < 90) return 'Tiền tăng huyết áp';
  return 'Cao huyết áp';
}
// Helper: tính trạng thái đường huyết (mg/dL, lúc đói)
function getBloodSugarStatus(value) {
  const v = Number(value);
  if (isNaN(v)) return null;
  if (v < 100) return 'Bình thường';
  if (v < 126) return 'Tiền đái tháo đường';
  return 'Đái tháo đường';
}
// Helper: tính trạng thái cholesterol (mg/dL)
function getBloodFatStatus(cholesterol) {
  const v = Number(cholesterol);
  if (isNaN(v)) return null;
  if (v < 200) return 'Bình thường';
  if (v < 240) return 'Cao nhẹ';
  return 'Cao';
}
// Helper: tính trạng thái T-score (loãng xương)
function getOsteoporosisStatus(tScore) {
  const v = Number(tScore);
  if (isNaN(v)) return null;
  if (v > -1) return 'Bình thường';
  if (v > -2.5) return 'Loãng xương nhẹ';
  return 'Loãng xương';
}

// Helper: map document (nested hoặc flat) sang format API (flat)
function mapHealthProfileToApi(profile, userId) {
  if (!profile) {
    return {
      user_id: userId,
      bmi: null,
      bmiStatus: null,
      bmr: null,
      bmrStatus: null,
      bloodPressure: null,
      bloodPressureStatus: null,
      bloodSugar: null,
      bloodSugarStatus: null,
      bloodFat: null,
      bloodFatStatus: null,
      osteoporosis: null,
      osteoporosisStatus: null,
      menstruation: null,
      pregnancy: null,
      medicationReminder: [],
      updatedAt: null,
    };
  }
  const bp = profile.blood_pressure || profile.bloodPressure;
  const bs = profile.blood_sugar || profile.bloodSugar;
  const bf = profile.blood_fat || profile.bloodFat;
  const medList = profile.medication_reminders ?? profile.medicationReminder ?? [];
  const bmiVal = profile.bmi ?? (profile.bmi_score && (profile.bmi_score.value ?? profile.bmi_score));
  const bmrVal = profile.bmr ?? (profile.bmr_score && (profile.bmr_score.value ?? profile.bmr_score));
  const bd = profile.bone_density;

  const systolic = bp && typeof bp === 'object' ? (bp.systolic ?? bp.high) : null;
  const diastolic = bp && typeof bp === 'object' ? (bp.diastolic ?? bp.low) : null;
  const sugarVal = bs && typeof bs === 'object' ? (bs.value ?? bs.glucose) : null;
  const cholVal = bf && typeof bf === 'object' ? (bf.cholesterol ?? bf.value) : null;
  const tScoreVal = bd && typeof bd === 'object' ? (bd.value ?? bd.t_score) : null;

  const bloodPressureStr = profile.bloodPressure ?? (bp && typeof bp === 'object'
    ? `${bp.systolic ?? bp.high ?? ''}/${bp.diastolic ?? bp.low ?? ''} mmHg`
    : (typeof bp === 'string' ? bp : null)) ?? null;
  const bloodSugarStr = profile.bloodSugar ?? (bs && typeof bs === 'object'
    ? `${bs.value ?? ''} ${bs.unit || 'mg/dL'}`
    : (typeof bs === 'string' ? bs : null)) ?? null;
  const bloodFatStr = profile.bloodFat ?? (bf && typeof bf === 'object'
    ? `Cholesterol ${bf.cholesterol ?? bf.value ?? ''} ${bf.unit || 'mg/dL'}`
    : (typeof bf === 'string' ? bf : null)) ?? null;
  const osteoporosisStr = profile.osteoporosis ?? (bd && typeof bd === 'object'
    ? `T-score: ${bd.value ?? bd.t_score ?? ''}`
    : (typeof bd === 'string' ? bd : null)) ?? null;

  const bmiNum = bmiVal != null ? Number(bmiVal) : null;
  const bmiStatus = profile.bmiStatus ?? profile.bmi_status ?? getBmiStatus(bmiNum);

  return {
    user_id: profile.user_id || userId,
    bmi: bmiNum,
    bmiStatus: bmiStatus || null,
    bmr: bmrVal != null ? Number(bmrVal) : null,
    bmrStatus: profile.bmrStatus ?? profile.bmr_status ?? null,
    bloodPressure: bloodPressureStr,
    bloodPressureStatus: getBloodPressureStatus(systolic, diastolic),
    bloodSugar: bloodSugarStr,
    bloodSugarStatus: getBloodSugarStatus(sugarVal),
    bloodFat: bloodFatStr,
    bloodFatStatus: getBloodFatStatus(cholVal),
    osteoporosis: osteoporosisStr,
    osteoporosisStatus: getOsteoporosisStatus(tScoreVal),
    menstruation: profile.menstruation ?? (profile.menstrual_cycle && typeof profile.menstrual_cycle === 'object'
      ? `${profile.menstrual_cycle.status || ''}${profile.menstrual_cycle.days_remaining != null ? ` - Còn ${profile.menstrual_cycle.days_remaining} ngày` : ''}`.trim()
      : (typeof profile.menstrual_cycle === 'string' ? profile.menstrual_cycle : null)) ?? null,
    pregnancy: profile.pregnancy ?? (profile.is_pregnancy != null
      ? (profile.is_pregnancy ? 'Đang mang thai' : null)
      : null) ?? null,
    medicationReminder: Array.isArray(medList)
      ? medList.map((m) => ({
        time: m.time ?? '09:00',
        medicine: m.medicine ?? '',
        pills: m.pills ?? m.dosage ?? '',
      }))
      : [],
    updatedAt: profile.updatedAt ? (typeof profile.updatedAt === 'string' ? profile.updatedAt : profile.updatedAt.toISOString?.() ?? null) : null,
  };
}

// GET /api/healthprofiles?user_id=...
app.get('/api/healthprofiles', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const profile = await healthprofilesCollection().findOne({ user_id });
    const data = mapHealthProfileToApi(profile, user_id);
    res.json({ success: true, profile: data });
  } catch (err) {
    console.error('Get healthprofiles error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy sổ sức khỏe.' });
  }
});

// PATCH /api/healthprofiles - Cập nhật thông số (body: user_id + các trường cần cập nhật)
app.patch('/api/healthprofiles', async (req, res) => {
  try {
    const { user_id, ...updates } = req.body || {};
    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const allowed = [
      'bmi', 'bmiStatus', 'bmr', 'bmrStatus', 'bloodPressure', 'bloodSugar',
      'bloodFat', 'osteoporosis', 'menstruation', 'pregnancy', 'medicationReminder',
    ];
    const set = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) set[key] = updates[key];
    }
    if (Object.keys(set).length === 0) {
      return res.status(400).json({ success: false, message: 'Không có trường nào để cập nhật.' });
    }

    await healthprofilesCollection().updateOne(
      { user_id },
      { $set: set },
      { upsert: true }
    );

    const profile = await healthprofilesCollection().findOne({ user_id });
    const data = mapHealthProfileToApi(profile, user_id);
    res.json({ success: true, profile: data });
  } catch (err) {
    console.error('Patch healthprofiles error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật sổ sức khỏe.' });
  }
});

// ========= REMINDERS (Nhắc lịch uống thuốc) =========
// POST /api/reminders/upload-image - upload hình ảnh đơn thuốc
app.post('/api/reminders/upload-image', (req, res) => {
  uploadReminderImage(req, res, (err) => {
    if (err) {
      console.error('Upload reminder image error:', err);
      return res.status(400).json({ success: false, message: 'Tải ảnh thất bại.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file.' });
    }
    const url = `/uploads/reminders/${req.file.filename}`;
    res.json({ success: true, url });
  });
});

// GET /api/reminders?user_id=...
app.get('/api/reminders', async (req, res) => {
  try {
    if (!mongoose.connection || !mongoose.connection.db) {
      return res.status(503).json({ success: false, message: 'Cơ sở dữ liệu chưa sẵn sàng.' });
    }
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const list = await remindersCollection()
      .find({ user_id })
      .sort({ start_date: 1 })
      .toArray();
    const reminders = list.map((r) => {
      const id = getId(r);
      const log = Array.isArray(r.completion_log) ? r.completion_log : [];
      return {
        _id: id,
        user_id: r.user_id,
        start_date: r.start_date,
        end_date: r.end_date,
        frequency: r.frequency,
        times_per_day: r.times_per_day,
        reminder_times: Array.isArray(r.reminder_times) ? r.reminder_times : [],
        med_id: r.med_id,
        med_name: r.med_name,
        dosage: r.dosage,
        unit: r.unit,
        route: r.route,
        instruction: r.instruction,
        note: r.note,
        image_url: r.image_url,
        config_status: r.config_status,
        schedule_status: r.schedule_status,
        reminder_sound: r.reminder_sound,
        is_completed: r.is_completed,
        last_completed_date: r.last_completed_date,
        completion_log: log.map((c) => ({ date: String(c.date || ''), time: String(c.time || '') })),
      };
    });
    res.json({ success: true, reminders });
  } catch (err) {
    console.error('Get reminders error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy lời nhắc.' });
  }
});

// POST /api/reminders - Tạo lời nhắc mới
app.post('/api/reminders', async (req, res) => {
  try {
    const body = req.body || {};
    const user_id = String(body.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const doc = {
      user_id,
      is_completed: false,
      last_completed_date: null,
      start_date: body.start_date || new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
      end_date: body.end_date || body.start_date || new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
      frequency: body.frequency || 'Daily',
      times_per_day: body.times_per_day ?? (Array.isArray(body.reminder_times) ? body.reminder_times.length : 1),
      reminder_times: Array.isArray(body.reminder_times) ? body.reminder_times : ['08:00'],
      med_id: body.med_id || null,
      med_name: body.med_name || '',
      dosage: body.dosage || '',
      unit: body.unit || 'Viên',
      route: body.route || 'Uống',
      instruction: body.instruction || '',
      note: body.note || '',
      image_url: body.image_url || null,
      config_status: 'Active',
      schedule_status: 'Active',
      reminder_sound: body.reminder_sound !== false,
      completion_log: [],
    };
    const result = await remindersCollection().insertOne(doc);
    const reminder = { ...doc, _id: result.insertedId.toString() };
    res.json({ success: true, reminder });
  } catch (err) {
    console.error('Post reminders error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo lời nhắc.' });
  }
});

// PATCH /api/reminders/:id - Cập nhật lời nhắc
app.patch('/api/reminders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const oid = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
    const body = req.body || {};
    const allowed = [
      'start_date', 'end_date', 'frequency', 'times_per_day', 'reminder_times',
      'med_name', 'dosage', 'unit', 'route', 'instruction', 'note', 'image_url', 'config_status', 'schedule_status'
    ];
    const set = {};
    for (const key of allowed) {
      if (body[key] !== undefined) set[key] = body[key];
    }
    if (Object.keys(set).length === 0) {
      return res.status(400).json({ success: false, message: 'Không có trường nào để cập nhật.' });
    }
    const result = await remindersCollection().findOneAndUpdate(
      { _id: oid },
      { $set: set },
      { returnDocument: 'after' }
    );
    const doc = result && result.value !== undefined ? result.value : result;
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lời nhắc.' });
    }
    const reminder = { ...doc, _id: getId(doc) };
    res.json({ success: true, reminder });
  } catch (err) {
    console.error('Patch reminders error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật lời nhắc.' });
  }
});

// DELETE /api/reminders/:id
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const oid = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
    const result = await remindersCollection().deleteOne({ _id: oid });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lời nhắc.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete reminders error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa lời nhắc.' });
  }
});

// POST /api/reminders/:id/complete - Đánh dấu hoàn thành (theo ngày + giờ)
app.post('/api/reminders/:id/complete', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const { date, time } = req.body || {};
    if (!date || !time) {
      return res.status(400).json({ success: false, message: 'Thiếu date hoặc time.' });
    }
    const dateNorm = String(date).slice(0, 10);
    const timeNorm = normalizeReminderTimeStr(time);
    const update = {
      $set: { last_completed_date: new Date().toISOString() },
      $addToSet: { completion_log: { date: dateNorm, time: timeNorm } },
    };
    const opts = { returnDocument: 'after' };
    let doc = null;
    if (id.length === 24 && /^[a-f0-9]{24}$/i.test(id)) {
      const result = await remindersCollection().findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(id) },
        update,
        opts
      );
      doc = result && result.value !== undefined ? result.value : result;
    }
    if (!doc) {
      const result = await remindersCollection().findOneAndUpdate(
        { _id: id },
        update,
        opts
      );
      doc = result && result.value !== undefined ? result.value : result;
    }
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lời nhắc.' });
    }
    const reminder = { ...doc, _id: getId(doc) };
    res.json({ success: true, reminder });
  } catch (err) {
    console.error('Complete reminder error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đánh dấu hoàn thành.' });
  }
});

// ========= BLOGS =========
// Map health indicator → keywords để tìm blog liên quan
const HEALTH_INDICATOR_KEYWORDS = {
  bmi: ['BMI', 'chỉ số BMI', 'béo phì', 'thừa cân', 'thiếu cân', 'cân nặng'],
  bmr: ['BMR', 'calo', 'tỷ lệ trao đổi chất', 'chuyển hóa cơ bản'],
  bloodPressure: ['huyết áp', 'huyết áp cao', 'tăng huyết áp'],
  bloodSugar: ['đường huyết', 'tiểu đường', 'đái tháo đường', 'glucose'],
  bloodFat: ['mỡ máu', 'cholesterol', 'triglyceride'],
  osteoporosis: ['loãng xương', 'T-score', 'mật độ xương'],
  menstruation: ['kinh nguyệt', 'chu kỳ kinh nguyệt', 'đau bụng kinh'],
  pregnancy: ['thai kỳ', 'mẹ bầu', 'bà bầu', 'mang thai'],
};

// GET /api/blogs/category-counts - Thống kê số lượng bài viết theo danh mục
app.get('/api/blogs/category-counts', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const blogCount = await db.collection('blog').countDocuments().catch(() => 0);
    const collName = blogCount > 0 ? 'blog' : 'blogs';
    const blogsCol = db.collection(collName);

    const filter = {
      $and: [
        {
          $or: [
            { isActive: true },
            { isApproved: true },
            { isActive: { $exists: false }, isApproved: { $exists: false } }
          ]
        }
      ]
    };

    const stats = await blogsCol.aggregate([
      { $match: filter },
      {
        $project: {
          categories: {
            $setUnion: [
              { $ifNull: ["$categories.category.name", []] },
              { $ifNull: ["$categories.name", []] },
              { $cond: [{ $eq: [{ $type: "$category.name" }, "string"] }, ["$category.name"], []] },
              { $cond: [{ $eq: [{ $type: "$categoryName" }, "string"] }, ["$categoryName"], []] }
            ]
          }
        }
      },
      { $unwind: "$categories" },
      { $group: { _id: "$categories", count: { $sum: 1 } } }
    ]).toArray();

    const counts = {};
    stats.forEach(s => {
      if (s._id) counts[s._id] = s.count;
    });

    res.json({ success: true, counts });
  } catch (err) {
    console.error('[GET /api/blogs/category-counts] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
  }
});

// GET /api/blogs - danh sách bài viết sức khỏe (từ MongoDB collection blog/blogs)
app.get('/api/blogs', async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const healthIndicator = String(req.query.healthIndicator || '').trim();
    const category = String(req.query.category || '').trim();
    const subcategory = String(req.query.subcategory || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 10), 1000);
    const hasSkip = req.query.skip !== undefined;
    const skipParam = hasSkip ? parseInt(req.query.skip, 10) || 0 : (page - 1) * limit;
    const skip = Math.max(0, skipParam);

    const orConds = [];
    const keywordsParam = String(req.query.keywords || '').trim();

    if (keyword) {
      const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      orConds.push({ title: { $regex: esc, $options: 'i' } });
    }

    if (healthIndicator && HEALTH_INDICATOR_KEYWORDS[healthIndicator]) {
      const terms = HEALTH_INDICATOR_KEYWORDS[healthIndicator];
      terms.forEach((term) => {
        const escTerm = escapeRegExp(term);
        orConds.push({ title: { $regex: escTerm, $options: 'i' } });
      });
    }

    // Hỗ trợ isActive, isApproved; nếu không có thì lấy tất cả (dữ liệu local có thể thiếu field)
    const filter = {
      $and: [
        {
          $or: [
            { isActive: true },
            { isApproved: true },
            { isActive: { $exists: false }, isApproved: { $exists: false } }
          ]
        }
      ]
    };
    if (orConds.length) {
      filter.$and.push({ $or: orConds });
    }

    if (category) {
      filter.$and.push({
        $or: [
          { 'category.name': { $regex: category, $options: 'i' } },
          { 'categories.name': { $regex: category, $options: 'i' } },
          { 'categories.category.name': { $regex: category, $options: 'i' } },
          { categoryName: { $regex: category, $options: 'i' } }
        ]
      });
    }

    if (subcategory) {
      filter.$and.push({
        $or: [
          { 'categories.1.name': { $regex: subcategory, $options: 'i' } },
          { 'categories.category.name': { $regex: subcategory, $options: 'i' } },
          { 'category.name': { $regex: subcategory, $options: 'i' } }
        ]
      });
    }

    // Collection: prioritize 'blogs' (populated) then 'blog'
    const db = mongoose.connection.db;
    const colls = await db.listCollections({ name: { $in: ['blog', 'blogs'] } }).toArray();
    const collName = colls.some((c) => c.name === 'blog') ? 'blog' : 'blogs';
    const blogsCol = db.collection(collName);
    const projection = {
      title: 1,
      shortDescription: 1,
      excerpt: 1,
      description: 1,
      descriptionHtml: 1,
      content: 1,
      body: 1,
      slug: 1,
      image: 1,
      imageUrl: 1,
      primaryImage: 1,
      categories: 1,
      category: 1,
      categoryName: 1,
      author: 1,
      authorName: 1,
      publishedAt: 1,
      createdAt: 1,
      updatedAt: 1,
      viewCount: 1,
      views: 1,
    };

    const [items, total] = await Promise.all([
      blogsCol
        .find(filter, { projection })
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      blogsCol.countDocuments(filter),
    ]);

    const API_BASE = process.env.API_URL || `http://localhost:${PORT}`;
    const normImg = (url) => {
      if (!url || typeof url !== 'string') return url;
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('assets/')) return url;

      let cleanUrl = url.trim();
      if (cleanUrl.startsWith('./')) cleanUrl = cleanUrl.substring(2);

      const path = cleanUrl.startsWith('/') ? cleanUrl : `/${cleanUrl}`;

      // If the path doesn't start with /uploads/ or /assets/, it might be an uploaded file missing the prefix
      if (!path.startsWith('/uploads/') && !path.startsWith('/assets/')) {
        return `${API_BASE}/uploads${path}`;
      }

      return `${API_BASE}${path}`;
    };

    // Map categoryName và chuẩn hoá image URL (BLOG_CATEGORIES.md)
    const blogs = items.map((b) => {
      const primaryCat = Array.isArray(b.categories) ? b.categories.find((c) => c?.category?.isPrimary) : null;
      const cat = primaryCat?.category ?? (Array.isArray(b.categories) && b.categories[0]?.category) ?? null;
      const catName =
        cat?.name ||
        b.category?.name ||
        (Array.isArray(b.categories) && b.categories[0]?.name) ||
        (Array.isArray(b.categories) && typeof b.categories[0] === 'string' ? b.categories[0] : null);

      // Robust primaryImage handling
      let pImg = b.primaryImage;
      if (typeof pImg === 'string') {
        pImg = { url: pImg };
      }

      const normalizedPrimaryImage = (pImg && pImg.url)
        ? { ...pImg, url: normImg(pImg.url) }
        : null;

      const normalized = {
        ...b,
        categoryName: catName || 'Bài viết',
        primaryImage: normalizedPrimaryImage,
        image: normImg(b.image) || b.image,
        imageUrl: normImg(b.imageUrl) || b.imageUrl,
      };
      return normalized;
    });

    res.json({ blogs, total });
  } catch (err) {
    console.error('[GET /api/blogs] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách bài viết.' });
  }
});

// GET /api/blogs/:slug - chi tiết 1 bài viết (tìm theo slug hoặc _id)
app.get('/api/blogs/:slug', async (req, res) => {
  try {
    const slugParam = String(req.params.slug || '').trim();
    if (!slugParam) return res.status(400).json({ message: 'Not found' });

    const db = mongoose.connection.db;
    const blogCount = await db.collection('blog').countDocuments().catch(() => 0);
    const collName = blogCount > 0 ? 'blog' : 'blogs';
    const blogsCol = db.collection(collName);

    // Chuẩn hoá slug: có thể nhận "1-cai-xuc-xich..." hoặc "bai-viet/1-cai-xuc-xich....html"
    const candidates = new Set();
    candidates.add(slugParam);
    const noPrefix = slugParam.replace(/^bai-viet\//i, '');
    candidates.add(noPrefix);
    const noHtml = slugParam.replace(/\.html?$/i, '');
    candidates.add(noHtml);
    candidates.add(noPrefix.replace(/\.html?$/i, ''));
    candidates.add(`bai-viet/${slugParam}`);
    candidates.add(`bai-viet/${noHtml}.html`);
    if (!slugParam.includes('/')) {
      candidates.add(`bai-viet/${slugParam}.html`);
    }

    const or = [];
    for (const v of candidates) {
      if (!v) continue;
      or.push({ slug: v });
    }
    if (mongoose.Types.ObjectId.isValid(slugParam) && String(new mongoose.Types.ObjectId(slugParam)) === slugParam) {
      or.push({ _id: new mongoose.Types.ObjectId(slugParam) });
    }

    const doc = await blogsCol.findOne({ $or: or.length ? or : [{ slug: slugParam }] });
    if (!doc) return res.json({ message: 'Not found' });

    const primaryCat = Array.isArray(doc.categories) ? doc.categories.find((c) => c?.category?.isPrimary) : null;
    const cat = primaryCat?.category ?? (Array.isArray(doc.categories) && doc.categories[0]?.category) ?? null;
    const catName =
      cat?.name ||
      doc.category?.name ||
      (Array.isArray(doc.categories) && doc.categories[0]?.name) ||
      (Array.isArray(doc.categories) && typeof doc.categories[0] === 'string' ? doc.categories[0] : null);
    const API_BASE = process.env.API_URL || `http://localhost:${PORT}`;
    const normImg = (url) => {
      if (!url || typeof url !== 'string') return url;
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
    };
    // Robust primaryImage handling
    let pImg = doc.primaryImage;
    if (typeof pImg === 'string') {
      pImg = { url: pImg };
    }

    const normalizedPrimaryImage = (pImg && pImg.url)
      ? { ...pImg, url: normImg(pImg.url) }
      : null;

    const result = {
      ...doc,
      categoryName: catName || 'Bài viết',
      primaryImage: normalizedPrimaryImage,
      image: normImg(doc.image) || doc.image,
      imageUrl: normImg(doc.imageUrl) || doc.imageUrl,
    };
    res.json(result);
  } catch (err) {
    console.error('[GET /api/blogs/:slug] Error:', err);
    res.json({ message: 'Not found' });
  }
});

// GET /api/health-videos - danh sách video sức khỏe Vinmec (Đã tối ưu theo logic chuẩn từ VitaCare cũ)
app.get('/api/health-videos', async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 50);
    const keyword = String(req.query.keyword || '').trim();
    const productName = String(req.query.productName || '').trim();
    console.log(`[HealthVideos Standard] Matching for: "${productName}"`);

    const normProd = normalizeText(productName || '');
    const normKey = normalizeText(keyword || '');

    // 1. Tách từ trong tên sản phẩm (Split) - Loại bỏ các từ dừng (stopWords)
    const stopWords = [
      'vien', 'uong', 'siro', 'hop', 'chai', 'chinh', 'hang', 'ho-tro', 'san-pham', 'thuc', 'pham', 'chuc', 'nang',
      'giup', 'tang', 'giam', 'ho', 'ngua', 'cai', 'thien', 'bo', 'sung', 'suc', 'khoe', 'nu', 'gioi', 'nam',
      'cho', 'voi', 'va', 'cua', 'nhung', 'cac', 'co', 'la', 'tai', 'trong', 'mieng', 'dan', 'tuyp', 'gel',
      'loai', 'tot', 'nhat', 'cach', 'lam', 'the', 'nao', 'nen', 'hay', 'khong', 'bi', 'vi', 'huong', 'dan',
      'bac', 'si', 'loi', 'khuan', 'men', 'vi', 'sinh'
    ];
    const prodWords = normProd.split(' ').filter(w => w.length >= 2 && !stopWords.includes(w));

    // 2. Lấy danh sách video từ collection 'vinmec_playlists' (hoặc health_videos nếu có)
    const col = mongoose.connection.db.collection('vinmec_playlists');
    let allVideos = await col.find({ isActive: { $ne: false } }).toArray();

    // 3. So khớp cực kỳ nghiêm ngặt (Direct Matching) bằng cách tính điểm Score
    const matched = allVideos.map(video => {
      let score = 0;
      const titleNorm = normalizeText(video.title || '');
      const videoKeywords = (Array.isArray(video.keywords) ? video.keywords : []).map(k => normalizeText(k));

      const matchWhole = (target, word) => {
        const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
        return regex.test(target);
      };

      // A. Khớp từ trong Tên sản phẩm (Trọng số lớn nhất)
      prodWords.forEach(pw => {
        if (matchWhole(titleNorm, pw)) score += 100;
        if (videoKeywords.some(vk => matchWhole(vk, pw))) score += 50;
      });

      // B. Khớp Keyword phụ từ ô tìm kiếm
      const keyWords = normKey.split(' ').filter(w => w.length >= 2 && !stopWords.includes(w));
      keyWords.forEach(kw => {
        if (matchWhole(titleNorm, kw)) score += 30;
        if (videoKeywords.some(vk => matchWhole(vk, kw))) score += 20;
      });

      return { ...video, score };
    });

    // 4. LỌC NGHIÊM NGẶT: Phải có ít nhất 1 từ chuyên môn khớp (score >= 100)
    let results = matched
      .filter(v => v.score >= 100)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // 5. Fallback: Nếu không tìm thấy video nào thật sự khớp, lấy 4 video nổi bật ngẫu nhiên (hoặc các playlist bác sĩ tư vấn)
    if (results.length < 4) {
      const existingIds = new Set(results.map(v => String(v._id)));
      const fallback = allVideos
        .filter(v => !existingIds.has(String(v._id)))
        .sort(() => 0.5 - Math.random())
        .slice(0, 4);
      results = [...results, ...fallback].slice(0, limit);
    }

    console.log(`[HealthVideos Standard] Result: ${results.length} high-quality videos matched.`);
    res.json(results);
  } catch (err) {
    console.error('[HealthVideos Standard Error]:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách video sức khỏe.' });
  }
});

// ========= PRODUCT FAQS =========
// GET /api/product-faqs/:productId - danh sách FAQ theo sản phẩm
app.get('/api/product-faqs/:productId', async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Thiếu product_id.' });
    }

    const doc = await productFaqsCollection().findOne({ product_id: productId });
    const faqs = doc && Array.isArray(doc.faqs) ? doc.faqs : [];
    res.json(faqs);
  } catch (err) {
    console.error('[GET /api/product-faqs/:productId] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy FAQ sản phẩm.' });
  }
});

// ========= REVIEWS =========
// GET /api/reviews/:sku - lấy danh sách đánh giá cho 1 SKU
app.get('/api/reviews/:sku', async (req, res) => {
  try {
    const sku = String(req.params.sku || '').trim();
    if (!sku) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }

    const doc = await reviewsCollection().findOne({ sku });
    if (!doc) {
      return res.json({ sku, reviews: [] });
    }
    res.json(doc);
  } catch (err) {
    console.error('[GET /api/reviews/:sku] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy đánh giá sản phẩm.' });
  }
});

// POST /api/reviews - thêm đánh giá mới
app.post('/api/reviews', async (req, res) => {
  try {
    const {
      sku,
      rating,
      content,
      fullname,
      customer_id,
      order_id,
      images,
      time,
    } = req.body || {};
    const skuStr = String(sku || '').trim();
    if (!skuStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }
    const r = Number(rating);
    if (!r || Number.isNaN(r)) {
      return res.status(400).json({ success: false, message: 'Thiếu điểm đánh giá.' });
    }

    const safeRating = Math.max(1, Math.min(5, r));
    const safeName =
      (fullname && String(fullname).trim()) ||
      `Khách hàng vãng lai ${Math.floor(1000 + Math.random() * 9000)}`;

    const entry = {
      _id: new mongoose.Types.ObjectId().toString(),
      customer_id: customer_id ? String(customer_id).trim() : null,
      fullname: safeName,
      content: content || '',
      rating: safeRating,
      time: time ? new Date(time) : new Date(),
      order_id: order_id ? String(order_id).trim() : null,
      images: Array.isArray(images) ? images : [],
      likes: [],
      replies: []
    };

    const col = reviewsCollection();
    const existing = await col.findOne({ sku: skuStr });
    if (!existing) {
      await col.insertOne({
        sku: skuStr,
        reviews: [entry],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      await col.updateOne(
        { sku: skuStr },
        { $push: { reviews: entry }, $set: { updatedAt: new Date() } }
      );
    }

    // Nếu có order_id, cập nhật trạng thái đơn hàng tương ứng sang "reviewed"
    const orderIdStr = order_id ? String(order_id).trim() : '';
    if (orderIdStr) {
      try {
        const ocol = ordersCollection();
        await ocol.updateMany(
          { order_id: orderIdStr },
          {
            $set: {
              status: 'reviewed',
              updatedAt: new Date().toISOString(),
            },
          }
        );
      } catch (e) {
        console.warn('[POST /api/reviews] Cannot update order status to reviewed:', e.message);
      }
    }

    const updated = await col.findOne({ sku: skuStr });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[POST /api/reviews] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo đánh giá.' });
  }
});

// POST /api/reviews/reply - trả lời 1 đánh giá
app.post('/api/reviews/reply', async (req, res) => {
  try {
    const { sku, reviewId, content, fullname, isAdmin } = req.body || {};
    const skuStr = String(sku || '').trim();
    const reviewIdStr = String(reviewId || '').trim();
    if (!skuStr || !reviewIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc reviewId.' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung trả lời.' });
    }

    const col = reviewsCollection();
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    const review = (doc.reviews || []).find(r => r._id === reviewIdStr);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy review.' });
    }

    const reply = {
      _id: new mongoose.Types.ObjectId().toString(),
      user_id: null,
      fullname: (fullname && String(fullname).trim()) || 'Khách',
      avatar: '',
      content: content,
      is_admin: !!isAdmin,
      time: new Date(),
      likes: []
    };

    await col.updateOne(
      { sku: skuStr, 'reviews._id': reviewIdStr },
      { $push: { 'reviews.$.replies': reply }, $set: { updatedAt: new Date() } }
    );

    const updated = await col.findOne({ sku: skuStr });
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/reviews/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi trả lời đánh giá.' });
  }
});

// POST /api/reviews/like - like / unlike 1 đánh giá
app.post('/api/reviews/like', async (req, res) => {
  try {
    const { sku, reviewId, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const reviewIdStr = String(reviewId || '').trim();
    const userIdStr = String(userId || '').trim();
    if (!skuStr || !reviewIdStr || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, reviewId hoặc userId.' });
    }

    const col = reviewsCollection();
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    const review = (doc.reviews || []).find(r => r._id === reviewIdStr);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy review.' });
    }

    const likes = Array.isArray(review.likes) ? [...review.likes] : [];
    const idx = likes.indexOf(userIdStr);
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }

    await col.updateOne(
      { sku: skuStr, 'reviews._id': reviewIdStr },
      { $set: { 'reviews.$.likes': likes, updatedAt: new Date() } }
    );

    const updated = await col.findOne({ sku: skuStr });
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/reviews/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi like đánh giá.' });
  }
});

// ========= CONSULTATIONS (Hỏi đáp sản phẩm) =========
// GET /api/consultations/:sku - danh sách hỏi đáp cho SKU
app.get('/api/consultations/:sku', async (req, res) => {
  try {
    const sku = String(req.params.sku || '').trim();
    if (!sku) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }

    const doc = await consultationsProductCollection().findOne({ sku });
    if (!doc) {
      return res.json({ sku, questions: [] });
    }
    res.json(doc);
  } catch (err) {
    console.error('[GET /api/consultations/:sku] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy hỏi đáp.' });
  }
});

// POST /api/consultations - thêm câu hỏi mới
app.post('/api/consultations', async (req, res) => {
  try {
    const { sku, question, full_name, user_id } = req.body || {};
    const skuStr = String(sku || '').trim();
    if (!skuStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung câu hỏi.' });
    }

    const uid = user_id ? String(user_id).trim() : null;
    const qId = new mongoose.Types.ObjectId().toString();
    const entry = {
      _id: qId,
      id: qId,
      question: String(question).trim(),
      user_id: uid,
      full_name: (full_name && String(full_name).trim()) || 'Khách hàng vãng lai',
      answer: null,
      answeredBy: null,
      status: 'Pending',
      createdAt: new Date(),
      answeredAt: null,
      likes: [],
      replies: []
    };

    const col = consultationsProductCollection();

    // Lấy tên sản phẩm để ghi vào notice
    let productName = skuStr;
    try {
      const productDoc = await productsCollection().findOne({ sku: skuStr }, { projection: { name: 1, product_name: 1, productName: 1 } });
      if (productDoc) {
        productName = productDoc.name || productDoc.product_name || productDoc.productName || skuStr;
      }
    } catch (_) { }

    const existing = await col.findOne({ sku: skuStr });
    if (!existing) {
      await col.insertOne({ sku: skuStr, productName, questions: [entry], createdAt: new Date(), updatedAt: new Date() });
    } else {
      await col.updateOne({ sku: skuStr }, { $push: { questions: entry }, $set: { updatedAt: new Date() } });
    }

    // Lưu notice cho user (xác nhận câu hỏi đã được gửi)
    if (uid) {
      try {
        await noticesCollection().insertOne({
          user_id: uid,
          type: 'order_updated',
          title: 'Câu hỏi đã được gửi',
          message: `Câu hỏi của bạn về sản phẩm "${productName}" đã được gửi. Dược sĩ sẽ phản hồi sớm nhất có thể.`,
          createdAt: new Date().toISOString(),
          read: false,
          link: '/account',
          linkLabel: 'Xem thông báo',
          meta: skuStr,
        });
      } catch (e) {
        console.warn('[POST /api/consultations] Cannot create notice:', e.message);
      }
    }

    const updated = await col.findOne({ sku: skuStr });
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/consultations] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo câu hỏi.' });
  }
});

// POST /api/consultations/reply - trả lời 1 câu hỏi
app.post('/api/consultations/reply', async (req, res) => {
  try {
    const { sku, questionId, content, fullname, isAdmin } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    if (!skuStr || !qId) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc questionId.' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung trả lời.' });
    }

    const col = consultationsProductCollection();
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const question = (doc.questions || []).find((q) => q.id === qId || q._id === qId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const reply = {
      content: String(content).trim(),
      fullname: (fullname && String(fullname).trim()) || 'Khách',
      avatar: '',
      is_admin: !!isAdmin,
      time: new Date()
    };

    await col.updateOne(
      { sku: skuStr, $or: [{ 'questions.id': qId }, { 'questions._id': qId }] },
      { $push: { 'questions.$.replies': reply }, $set: { updatedAt: new Date() } }
    );

    const updated = await col.findOne({ sku: skuStr });
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/consultations/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi trả lời câu hỏi.' });
  }
});

// POST /api/consultations/like - like / unlike 1 câu hỏi
app.post('/api/consultations/like', async (req, res) => {
  try {
    const { sku, questionId, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const userIdStr = String(userId || '').trim();
    if (!skuStr || !qId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId hoặc userId.' });
    }

    const col = consultationsProductCollection();
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const question = (doc.questions || []).find((q) => q.id === qId || q._id === qId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const likes = Array.isArray(question.likes) ? [...question.likes] : [];
    const idx = likes.indexOf(userIdStr);
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }

    await col.updateOne(
      { sku: skuStr, $or: [{ 'questions.id': qId }, { 'questions._id': qId }] },
      { $set: { 'questions.$.likes': likes, updatedAt: new Date() } }
    );

    const updated = await col.findOne({ sku: skuStr });
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/consultations/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi like câu hỏi.' });
  }
});

// POST /api/addresses - Thêm địa chỉ giao hàng mới cho user
app.post('/api/addresses', async (req, res) => {
  try {
    const {
      user_id,
      name,
      full_name,
      phone,
      email,
      detail,
      fullAddress,
      full_address,
      province,
      district,
      ward,
      isDefault,
      is_default,
    } = req.body || {};

    const uid = String(user_id || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    const displayName = (name || full_name || '').toString().trim();
    if (!displayName) {
      return res.status(400).json({ success: false, message: 'Thiếu họ tên người nhận.' });
    }

    const phoneStr = String(phone || '').trim();
    if (!phoneStr) {
      return res.status(400).json({ success: false, message: 'Thiếu số điện thoại.' });
    }

    const fa = (fullAddress || full_address || '').toString().trim();
    if (!fa) {
      return res.status(400).json({ success: false, message: 'Thiếu địa chỉ nhận hàng.' });
    }

    const newDoc = {
      user_id: uid,
      name: displayName,
      phone: phoneStr,
      email: email ? String(email) : '',
      detail: detail ? String(detail) : '',
      fullAddress: fa,
      province: province ? String(province) : '',
      district: district ? String(district) : '',
      ward: ward ? String(ward) : '',
      isDefault: Boolean(isDefault ?? is_default),
      createdAt: new Date(),
    };

    // Nếu địa chỉ này là mặc định, bỏ cờ mặc định ở các địa chỉ khác của user
    if (newDoc.isDefault) {
      await addressesCollection().updateMany(
        { user_id: uid },
        { $set: { isDefault: false } }
      );
    }

    const result = await addressesCollection().insertOne(newDoc);
    const item = {
      ...newDoc,
      _id: result.insertedId.toString(),
    };

    res.status(201).json({ success: true, item });
  } catch (err) {
    console.error('Create address error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo địa chỉ.' });
  }
});

// PATCH /api/addresses/:id - Cập nhật địa chỉ (body: name, phone, email, detail, fullAddress, province, district, ward, isDefault)
app.patch('/api/addresses/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const {
      name,
      full_name,
      phone,
      email,
      detail,
      fullAddress,
      full_address,
      province,
      district,
      ward,
      isDefault,
      is_default,
    } = req.body || {};

    const col = addressesCollection();
    const existing = await col.findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ.' });
    }

    const displayName = (name || full_name || existing.name || '').toString().trim();
    const phoneStr = (phone || existing.phone || '').toString().trim();
    const fa = (fullAddress || full_address || existing.fullAddress || '').toString().trim();

    const update = {
      name: displayName || existing.name,
      phone: phoneStr || existing.phone,
      email: email !== undefined ? String(email) : existing.email,
      detail: detail !== undefined ? String(detail) : existing.detail,
      fullAddress: fa || existing.fullAddress,
      province: province !== undefined ? String(province) : existing.province,
      district: district !== undefined ? String(district) : existing.district,
      ward: ward !== undefined ? String(ward) : existing.ward,
      isDefault: Boolean(isDefault ?? is_default ?? existing.isDefault),
      updatedAt: new Date(),
    };

    if (update.isDefault && existing.user_id) {
      await col.updateMany(
        { user_id: existing.user_id, _id: { $ne: new mongoose.Types.ObjectId(id) } },
        { $set: { isDefault: false } }
      );
    }

    await col.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: update }
    );

    const item = { ...existing, ...update, _id: id };
    res.json({ success: true, item });
  } catch (err) {
    console.error('Patch address error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật địa chỉ.' });
  }
});

// DELETE /api/addresses/:id - Xóa địa chỉ
app.delete('/api/addresses/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const col = addressesCollection();
    const result = await col.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete address error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa địa chỉ.' });
  }
});

// ========= DISEASES (Tra cứu bệnh) - đọc từ MongoDB collection benh / disease_groups =========
// Helper: chọn collection bệnh phù hợp (ưu tiên collection có trường bodyPart nếu có)
async function resolveDiseaseCollection(db) {
  const collNames = (await db.listCollections().toArray()).map((c) => c.name);

  // Danh sách ưu tiên
  const candidates = [];
  if (collNames.includes('benh')) candidates.push('benh');
  if (collNames.includes('diseases')) candidates.push('diseases');

  if (candidates.length === 0) {
    return db.collection('benh');
  }

  // Ưu tiên collection có field bodyPart (phục vụ Body Map /disease)
  for (const name of candidates) {
    const col = db.collection(name);
    const docWithBodyPart = await col.findOne({ bodyPart: { $exists: true } });
    if (docWithBodyPart) {
      return col;
    }
  }

  // Nếu không có bodyPart ở đâu cả → dùng collection đầu tiên
  return db.collection(candidates[0]);
}

app.get('/api/disease-groups', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const diseasesCol = await resolveDiseaseCollection(db);

    // 1. Lấy danh sách 18 nhóm bệnh từ collection disease_groups
    const groupsFromDb = await DiseaseGroupModel.find().sort({ display_order: 1 }).lean();

    if (!groupsFromDb || groupsFromDb.length === 0) {
      return res.json([]);
    }

    // 2. Tính toán số lượng bài viết (bệnh) cho từng nhóm
    // Chúng ta sẽ đếm trực tiếp từ collection diseases (benh)
    const groupsWithCounts = await Promise.all(groupsFromDb.map(async (group) => {
      const slug = group.slug;
      // Tìm các bệnh có category tương ứng với nhóm này
      // Pattern: benh/nhom-benh/{slug}
      const count = await diseasesCol.countDocuments({
        'categories.fullPathSlug': { $regex: `benh/nhom-benh/${slug}`, $options: 'i' }
      });

      return {
        ...group,
        count: count || 0,
        icon: group.icon || null // Giữ lại trường icon nếu có
      };
    }));

    res.json(groupsWithCounts);
  } catch (err) {
    console.error('[GET /api/disease-groups] Error:', err);
    res.json([]);
  }
});

// Mapping từ slug nhóm bệnh (nhom-benh) -> tên bộ phận trên body map
// Mapping này dựa trên quy tắc y khoa + file README, KHÔNG dùng data/benh.json lúc runtime.
// Mapping trực tiếp từ tên bộ phận trên body map -> các slug nhóm bệnh liên quan
// Cấu trúc này giúp 1 nhóm có thể nằm ở nhiều bộ phận và loại bỏ các bệnh toàn thân khỏi body map (vd: Ung thư -> Đầu)
// Mapping từ slug bộ phận (dau, co...) hoặc tên (Đầu, Cổ...) -> các slug nhóm bệnh liên quan
const BODY_PART_TO_GROUPS = {
  // Slug keys
  'dau': ['than-kinh-tinh-than', 'tai-mui-hong', 'mat', 'rang-ham-mat', 'tam-than'],
  'co': ['tai-mui-hong', 'noi-tiet-chuyen-hoa', 'ho-hap'],
  'nguc': ['tim-mach', 'ho-hap'],
  'bung': ['tieu-hoa', 'than-tiet-nieu'],
  'sinh-duc': ['suc-khoe-sinh-san', 'suc-khoe-gioi-tinh'],
  'tu-chi': ['co-xuong-khop'],
  'da': ['da-toc-mong', 'di-ung'],

  // Backward compatibility for display names
  'Đầu': ['than-kinh-tinh-than', 'tai-mui-hong', 'mat', 'rang-ham-mat', 'tam-than'],
  'Cổ': ['tai-mui-hong', 'noi-tiet-chuyen-hoa'],
  'Ngực': ['tim-mach', 'ho-hap'],
  'Bụng': ['tieu-hoa', 'than-tiet-nieu'],
  'Sinh dục': ['suc-khoe-sinh-san', 'suc-khoe-gioi-tinh'],
  'Tứ chi': ['co-xuong-khop'],
  'Da': ['da-toc-mong', 'di-ung'],
};

// Fallback local dataset for diseases (from data/benh.json)
let LOCAL_DISEASES_CACHE = null;
function loadLocalDiseases() {
  if (LOCAL_DISEASES_CACHE) return LOCAL_DISEASES_CACHE;
  try {
    // Đọc file JSON tĩnh đã crawl sẵn
    // eslint-disable-next-line global-require, import/no-dynamic-require
    LOCAL_DISEASES_CACHE = require('../data/benh.json');
  } catch (e) {
    console.error('[LOCAL_DISEASES] Cannot load data/benh.json:', e?.message || e);
    LOCAL_DISEASES_CACHE = [];
  }
  return LOCAL_DISEASES_CACHE;
}

function getGroupSlugsForBodyPart(bodyPart) {
  if (!bodyPart) return [];
  // Thử tìm theo key chính xác (slug hoặc name có dấu)
  if (BODY_PART_TO_GROUPS[bodyPart]) return BODY_PART_TO_GROUPS[bodyPart];

  // Thử normalize/lowercase nếu gửi slug linh hoạt
  const key = bodyPart.toLowerCase().trim();
  if (BODY_PART_TO_GROUPS[key]) return BODY_PART_TO_GROUPS[key];

  return [];
}

app.get('/api/diseases', async (req, res) => {
  try {
    const bodyPart = String(req.query.bodyPart || '').trim();
    const groupSlug = String(req.query.groupSlug || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100);
    const db = mongoose.connection.db;
    const col = await resolveDiseaseCollection(db);
    const filter = {};

    // Body Map: ánh xạ bộ phận cơ thể -> các slug nhóm bệnh (nhom-benh)
    // rồi filter theo categories.fullPathSlug trong MongoDB.
    if (bodyPart) {
      // Chuẩn hóa slug từ bodyPart (để khớp với pattern benh/xem-theo-bo-phan-co-the/slug)
      const bodySlug = bodyPart.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-").trim();

      // Chỉ lấy các bài viết được gán nhãn đúng bộ phận này trong mảng categories
      filter['categories.fullPathSlug'] = `benh/xem-theo-bo-phan-co-the/${bodySlug}`;
    }
    if (groupSlug) {
      const slugLower = groupSlug.toLowerCase();
      const escGroupSlug = escapeRegExp(groupSlug);
      const thuongGapSlugs = ['benh-nam-gioi', 'benh-nu-gioi', 'benh-nguoi-gia', 'benh-tre-em'];
      if (thuongGapSlugs.includes(slugLower)) {
        filter['categories.fullPathSlug'] = { $regex: `benh/benh-thuong-gap/${escGroupSlug}`, $options: 'i' };
      } else if (slugLower === 'benh-theo-mua') {
        filter['categories.fullPathSlug'] = { $regex: 'benh/benh-theo-mua', $options: 'i' };
      } else {
        filter['categories.fullPathSlug'] = { $regex: `benh/nhom-benh/${escGroupSlug}`, $options: 'i' };
      }
    }
    const [items, total] = await Promise.all([
      col.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
      col.countDocuments(filter)
    ]);
    res.json({ diseases: items, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('[GET /api/diseases] Error:', err);
    res.json({ diseases: [], total: 0, totalPages: 1 });
  }
});

app.get('/api/diseases/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'Not found' });
    const db = mongoose.connection.db;
    const col = await resolveDiseaseCollection(db);
    // Chuẩn hoá slug/id lấy từ Long Châu để khớp với dữ liệu MongoDB.
    // Ví dụ các dạng đầu vào:
    //   "benh/di-tinh-mong-tinh-103.html"
    //   "di-tinh-mong-tinh-103.html"
    //   "di-tinh-mong-tinh-103"
    //   "benh-peyronie.html"
    // sẽ được map về nhiều biến thể ứng viên để khớp với cả slug và id trong DB.
    const baseCandidates = new Set();
    baseCandidates.add(id);
    const withoutBenhPrefix = id.replace(/^benh\//i, '');
    baseCandidates.add(withoutBenhPrefix);
    const withoutHtml = id.replace(/\.html?$/i, '');
    baseCandidates.add(withoutHtml);
    const withoutPrefixAndHtml = withoutBenhPrefix.replace(/\.html?$/i, '');
    baseCandidates.add(withoutPrefixAndHtml);

    const allCandidates = new Set();
    for (const raw of baseCandidates) {
      if (!raw) continue;
      const v = String(raw).trim();
      if (!v) continue;

      // Bản gốc
      allCandidates.add(v);

      // Thêm/bỏ tiền tố "benh/"
      if (!v.startsWith('benh/')) {
        allCandidates.add(`benh/${v}`);
      } else {
        allCandidates.add(v.replace(/^benh\//i, ''));
      }

      // Thêm/bỏ đuôi ".html"
      if (!/\.html?$/i.test(v)) {
        allCandidates.add(`${v}.html`);
      } else {
        allCandidates.add(v.replace(/\.html?$/i, ''));
      }
    }

    const or = [];
    for (const value of allCandidates) {
      if (!value) continue;
      or.push({ slug: value }, { id: value });
    }

    // Nếu id là ObjectId hợp lệ thì thử thêm vào danh sách tìm kiếm
    if (mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id) {
      or.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    const query = { $or: or };
    let doc = await col.findOne(query);

    // Nếu MongoDB không có, fallback sang data/benh.json để đảm bảo luôn có dữ liệu hiển thị
    if (!doc) {
      const local = loadLocalDiseases();
      if (Array.isArray(local) && local.length > 0) {
        doc = local.find((item) => {
          if (!item) return false;
          const slug = String(item.slug || '').trim();
          const numericId = item.id;
          for (const v of allCandidates) {
            const val = String(v).trim();
            if (!val) continue;
            if (slug === val) return true;
            if (slug === `benh/${val}`) return true;
            if (slug === `${val}.html`) return true;
            if (slug === `benh/${val}.html`) return true;
            if (numericId !== undefined && numericId !== null && String(numericId) === val) return true;
          }
          return false;
        }) || null;
      }
    }

    if (!doc) return res.json({ message: 'Not found' });
    res.json(doc);
  } catch (err) {
    console.error('[GET /api/diseases/:id] Error:', err);
    res.json({ message: 'Not found' });
  }
});

// GET /api/consultations/disease/:id - Lấy danh sách câu hỏi về bệnh (id có thể là slug hoặc productId)
app.get('/api/consultations/disease/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Tìm theo sku (id của bệnh)
    let consultation = await ConsultationDiseaseModel.findOne({ sku: id }).lean();
    if (!consultation) {
      // Nếu không tìm thấy, trả về list rỗng thay vì lỗi 404 để frontend dễ xử lý
      return res.json({ success: true, questions: [] });
    }
    res.json({ success: true, questions: consultation.questions || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/consultations/disease - Gửi câu hỏi mới về bệnh
app.post('/api/consultations/disease', async (req, res) => {
  try {
    const { sku, productName, question, user_id, full_name } = req.body;

    if (!sku || !question) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin sku hoặc câu hỏi.' });
    }

    let consultation = await ConsultationDiseaseModel.findOne({ sku });

    if (!consultation) {
      consultation = new ConsultationDiseaseModel({
        sku,
        productName: productName || sku,
        questions: []
      });
    }

    const newQuestion = {
      _id: new mongoose.Types.ObjectId().toString(),
      question,
      user_id: user_id || "",
      full_name: full_name || "Khách vãng lai",
      status: "pending",
      createdAt: new Date().toISOString(),
      answer: null,
      replies: []
    };

    consultation.questions.push(newQuestion);
    consultation.updatedAt = new Date();

    await consultation.save();
    res.status(201).json({ success: true, data: newQuestion });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || p.length < 9 || p.length > 11) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Mật khẩu không hợp lệ.' });
    }

    const user = await usersCollection().findOne({
      $or: [{ phone: p }, { phone: phone }]
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Số điện thoại hoặc mật khẩu không đúng.' });
    }
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Số điện thoại hoặc mật khẩu không đúng.' });
    }

    const { password: _, ...safe } = user;
    res.json({ success: true, user: safe });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/register-otp - Bước 1: Gửi OTP cho đăng ký (kiểm tra SĐT chưa tồn tại)
app.post('/api/auth/register-otp', async (req, res) => {
  try {
    const { phone } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || p.length < 9 || p.length > 11) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });
    }

    const existing = await usersCollection().findOne({ phone: p });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Số điện thoại đã được đăng ký.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 60000);
    await otpCodesCollection().updateOne(
      { phone: p },
      { $set: { phone: p, code: otp, expiry } },
      { upsert: true }
    );

    res.json({ success: true, otp, phone: p });
  } catch (err) {
    console.error('Register OTP error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/register - Đăng ký tài khoản mới
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || p.length < 9 || p.length > 11) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE_MSG });
    }

    const existing = await usersCollection().findOne({
      $or: [{ phone: p }, { phone: phone }]
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Số điện thoại đã được đăng ký.' });
    }

    const lastUser = await usersCollection()
      .find()
      .sort({ user_id: -1 })
      .limit(1)
      .toArray();
    let nextNum = 1;
    if (lastUser.length > 0) {
      const m = (lastUser[0].user_id || '').match(/CUS0*(\d+)/i);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const user_id = 'CUS' + String(nextNum).padStart(6, '0');

    const newUser = {
      user_id,
      avatar: null,
      full_name: '',
      email: '',
      password,
      phone: p,
      birthday: null,
      gender: 'Other',
      address: [],
      registerdate: new Date().toISOString(),
      totalspent: 0,
      tiering: 'Đồng'
    };

    await usersCollection().insertOne(newUser);

    const cartDoc = {
      user_id,
      items: []
    };
    await cartsCollection().insertOne(cartDoc).catch(() => { });

    const { password: _, ...safe } = newUser;
    res.json({ success: true, user: safe });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/forgot-password - Bước 1: Gửi OTP (trả về OTP cho dev/test; prod sẽ gửi SMS)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { phone } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || p.length < 9 || p.length > 11) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ success: false, message: 'Cơ sở dữ liệu chưa sẵn sàng.' });
    }
    const users = db.collection('users');
    const user = await users.findOne({ $or: [{ phone: p }, { phone: phone }] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Số điện thoại chưa đăng ký.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await users.updateOne(
      { _id: user._id },
      { $set: { otpCode: otp, otpExpiry: new Date(Date.now() + 60000) } }
    );

    res.json({ success: true, otp, phone: p });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/verify-otp - Bước 2: Xác thực OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body || {};
    const p = normalizePhone(phone);
    const otpStr = otp != null ? String(otp).trim() : '';
    if (!p || p.length < 9 || p.length > 11 || !otpStr) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin.' });
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ success: false, message: 'Cơ sở dữ liệu chưa sẵn sàng.' });
    }
    const users = db.collection('users');
    const user = await users.findOne({ $or: [{ phone: p }, { phone: phone }] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
    }
    const storedOtp = user.otpCode != null ? String(user.otpCode).trim() : '';
    if (storedOtp !== otpStr) {
      return res.status(401).json({ success: false, message: 'Mã OTP không đúng.' });
    }
    const expiry = user.otpExpiry;
    if (expiry) {
      try {
        const expiryDate = new Date(expiry);
        if (expiryDate.getTime() < Date.now()) {
          return res.status(401).json({ success: false, message: 'Mã OTP đã hết hạn.' });
        }
      } catch (_) {
        /* bỏ qua lỗi parse ngày */
      }
    }

    await users.updateOne(
      { _id: user._id },
      { $unset: { otpCode: 1, otpExpiry: 1 } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/reset-password - Bước 3: Đổi mật khẩu
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { phone, newPassword } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || !isValidPassword(newPassword)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE_MSG });
    }

    const result = await usersCollection().updateOne(
      { $or: [{ phone: p }, { phone: phone }] },
      { $set: { password: newPassword } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
    }

    const user = await usersCollection().findOne(
      { $or: [{ phone: p }, { phone: phone }] },
      { projection: { password: 0 } }
    );
    res.json({ success: true, user: user || undefined });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// PATCH /api/users/me - Cập nhật thông tin cá nhân (full_name, email, birthday, gender); không đổi SĐT/mật khẩu ở đây
app.patch('/api/users/me', async (req, res) => {
  try {
    const { user_id, full_name, email, birthday, gender, avatar } = req.body || {};
    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    const update = {};
    if (full_name !== undefined) update.full_name = String(full_name);
    if (email !== undefined) update.email = String(email);
    if (birthday !== undefined) update.birthday = birthday === '' ? null : String(birthday);
    if (gender !== undefined) update.gender = String(gender);
    if (avatar !== undefined) update.avatar = avatar;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'Không có trường nào để cập nhật.' });
    }

    const result = await usersCollection().updateOne(
      { user_id },
      { $set: update }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
    }
    const user = await usersCollection().findOne({ user_id }, { projection: { password: 0 } });
    res.json({ success: true, user });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/send-otp-any - Gửi OTP đến bất kỳ SĐT (dùng cho đổi SĐT: gửi đến SĐT mới)
app.post('/api/auth/send-otp-any', async (req, res) => {
  try {
    const { phone } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || p.length < 9 || p.length > 11) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 60000);
    await otpCodesCollection().updateOne(
      { phone: p },
      { $set: { phone: p, code: otp, expiry } },
      { upsert: true }
    );

    res.json({ success: true, otp, phone: p });
  } catch (err) {
    console.error('Send OTP any error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/verify-otp-any - Xác thực OTP (từ otp_codes, dùng cho đổi SĐT)
app.post('/api/auth/verify-otp-any', async (req, res) => {
  try {
    const { phone, otp } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || !otp) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin.' });
    }

    const doc = await otpCodesCollection().findOne({ phone: p });
    if (!doc) {
      return res.status(401).json({ success: false, message: 'Mã OTP không đúng hoặc đã hết hạn.' });
    }
    if (doc.code !== otp) {
      return res.status(401).json({ success: false, message: 'Mã OTP không đúng.' });
    }
    if (doc.expiry && new Date(doc.expiry) < new Date()) {
      await otpCodesCollection().deleteOne({ phone: p });
      return res.status(401).json({ success: false, message: 'Mã OTP đã hết hạn.' });
    }

    await otpCodesCollection().deleteOne({ phone: p });
    res.json({ success: true });
  } catch (err) {
    console.error('Verify OTP any error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// PATCH /api/users/me/phone - Đổi số điện thoại sau khi xác thực OTP (gửi đến SĐT mới)
app.patch('/api/users/me/phone', async (req, res) => {
  try {
    const { user_id, new_phone, otp } = req.body || {};
    const newP = normalizePhone(new_phone);
    if (!user_id || !newP || newP.length < 9 || newP.length > 11 || !otp) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin hoặc SĐT không hợp lệ.' });
    }

    const doc = await otpCodesCollection().findOne({ phone: newP });
    if (!doc || doc.code !== otp) {
      return res.status(401).json({ success: false, message: 'Mã OTP không đúng.' });
    }
    if (doc.expiry && new Date(doc.expiry) < new Date()) {
      await otpCodesCollection().deleteOne({ phone: newP });
      return res.status(401).json({ success: false, message: 'Mã OTP đã hết hạn.' });
    }

    const existing = await usersCollection().findOne({ $or: [{ phone: newP }, { phone: new_phone }] });
    if (existing && existing.user_id !== user_id) {
      return res.status(409).json({ success: false, message: 'Số điện thoại này đã được sử dụng.' });
    }

    await otpCodesCollection().deleteOne({ phone: newP });
    await usersCollection().updateOne(
      { user_id },
      { $set: { phone: newP } }
    );
    const user = await usersCollection().findOne({ user_id }, { projection: { password: 0 } });
    res.json({ success: true, user });
  } catch (err) {
    console.error('Update phone error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/chat - Chatbot tư vấn sức khỏe + gợi ý sản phẩm từ MongoDB (Gemini API)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash';

const SYSTEM_PROMPT = `Bạn là VitaBot của VitaCare - nền tảng chăm sóc sức khỏe và dược phẩm.
Nhiệm vụ:
- Trả lời ngắn gọn, chính xác về sức khỏe, thuốc, thực phẩm chức năng (không kê đơn).
- Khi người dùng hỏi mua gì, cần gợi ý sản phẩm, bạn sẽ được cung cấp danh sách sản phẩm thực từ kho VitaCare. Chỉ gợi ý sản phẩm có trong danh sách đó. Với mỗi sản phẩm gợi ý, hãy kèm link xem chi tiết dạng: /product/<slug> (ví dụ: /product/collagen-da).
- Không thay thế bác sĩ; khuyến khích đến cơ sở y tế khi cần.
Trả lời bằng tiếng Việt.`;

/** Lấy danh sách sản phẩm từ MongoDB để đưa vào ngữ cảnh chatbot (tìm theo từ khóa hoặc lấy mới nhất) */
async function getProductContextForChat(userMessage, maxProducts = 25) {
  if (!mongoose.connection || !mongoose.connection.db) return '';
  const col = productsCollection();
  const catsCol = categoriesCollection();
  let filter = {};
  const trimmed = String(userMessage || '').trim();
  const words = trimmed
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length > 0) {
    filter.$or = words.slice(0, 5).map((w) => ({ name: { $regex: escapeRegExp(w), $options: 'i' } }));
  }
  const items = await col
    .find(filter)
    .sort({ _id: -1 })
    .limit(maxProducts)
    .project({ name: 1, price: 1, slug: 1, categoryId: 1 })
    .toArray();
  if (!items || items.length === 0) {
    return '';
  }
  const categoryIds = [...new Set(items.map((p) => p.categoryId).filter(Boolean))];
  const categoryMap = {};
  if (categoryIds.length > 0) {
    const cats = await catsCol.find({ _id: { $in: categoryIds } }).project({ _id: 1, name: 1 }).toArray();
    cats.forEach((c) => {
      const id = getId(c);
      if (id) categoryMap[id] = c.name || '';
    });
  }
  const lines = items.map((p) => {
    const slug = p.slug || getId(p);
    const price = p.price != null ? Number(p.price).toLocaleString('vi-VN') : 'Liên hệ';
    const catIdStr = p.categoryId ? getId({ _id: p.categoryId }) : null;
    const cat = catIdStr ? categoryMap[catIdStr] || '' : '';
    return `- ${p.name || 'Sản phẩm'} | ${price}₫ | /product/${slug}${cat ? ` | ${cat}` : ''}`;
  });
  return `[Danh sách sản phẩm từ kho VitaCare (tên | giá | link | danh mục)]:\n${lines.join('\n')}`;
}

function buildGeminiContents(history, newMessage, productContext = '') {
  const contents = [];
  if (history && Array.isArray(history)) {
    for (const turn of history) {
      const role = turn.role === 'model' ? 'model' : 'user';
      const text = turn.parts?.find((p) => p.text)?.text || turn.text || '';
      if (text) contents.push({ role, parts: [{ text }] });
    }
  }
  let userText = newMessage;
  if (contents.length === 0) {
    userText = `${SYSTEM_PROMPT}\n\n${productContext ? productContext + '\n\n' : ''}[Người dùng]: ${newMessage}`;
  } else if (productContext) {
    userText = `[Cập nhật danh sách sản phẩm gợi ý]\n${productContext}\n\n[Người dùng]: ${newMessage}`;
  }
  contents.push({ role: 'user', parts: [{ text: userText }] });
  return contents;
}

app.post('/api/chat', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Chatbot tạm thời chưa khả dụng. Vui lòng cấu hình GEMINI_API_KEY trong môi trường.',
      });
    }
    const { message, history = [] } = req.body || {};
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung tin nhắn.' });
    }
    let productContext = '';
    try {
      productContext = await getProductContextForChat(text, 25);
    } catch (e) {
      console.warn('[POST /api/chat] getProductContextForChat error:', e.message);
    }
    const contents = buildGeminiContents(history, text, productContext);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: contents.map((c) => ({ role: c.role, parts: c.parts })),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95,
      },
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error('[POST /api/chat] Gemini response parse error:', parseErr.message);
      return res.status(502).json({
        success: false,
        message: 'Phản hồi từ Gemini không hợp lệ. Kiểm tra API key và thử lại.',
      });
    }
    if (!response.ok) {
      const errMsg = data?.error?.message || data?.error?.code || 'Gemini API lỗi';
      console.error('[POST /api/chat] Gemini API error:', response.status, JSON.stringify(data?.error || errMsg));
      let userMsg = 'Không thể xử lý tin nhắn. Vui lòng thử lại.';
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        userMsg = 'API key không hợp lệ hoặc bị từ chối. Kiểm tra GEMINI_API_KEY tại Google AI Studio.';
      } else if (response.status === 429) {
        userMsg = 'Vượt giới hạn gọi API. Vui lòng thử lại sau.';
      } else if (errMsg && typeof errMsg === 'string' && errMsg.length < 120) {
        userMsg = errMsg; /* trả về lỗi từ Gemini nếu ngắn gọn */
      }
      return res.status(response.status >= 500 ? 502 : 400).json({
        success: false,
        message: userMsg,
      });
    }
    const candidate = data?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const replyText = part?.text?.trim() || 'Xin lỗi, tôi chưa trả lời được. Bạn thử hỏi lại nhé.';
    res.json({ success: true, reply: replyText });
  } catch (err) {
    console.error('[POST /api/chat] Error:', err);
    const msg = err.message || 'Lỗi máy chủ. Vui lòng thử lại.';
    res.status(500).json({ success: false, message: msg });
  }
});

// Tự động load user từ data/userd.json hoặc data/users.json nếu collection "users" trống
async function seedUsersIfEmpty() {
  const col = usersCollection();
  const count = await col.countDocuments();
  if (count > 0) return;
  const dataDir = path.join(__dirname, '../data');
  const userdPath = path.join(dataDir, 'userd.json');
  const usersPath = path.join(dataDir, 'users.json');
  const filePath = fs.existsSync(userdPath) ? userdPath : usersPath;
  if (!fs.existsSync(filePath)) return;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data) || data.length === 0) return;
    await col.insertMany(data);
    console.log('✅ Đã tự động load', data.length, 'user từ', path.basename(filePath));
  } catch (e) {
    console.warn('Không load được user từ file:', e.message);
  }
}

async function seedOrdersIfEmpty() {
  const col = ordersCollection();
  try {
    const count = await col.countDocuments();
    if (count > 0) return;

    const dataDir = path.join(__dirname, '../data');
    const ordersPath = path.join(dataDir, 'orders.json');

    if (!fs.existsSync(ordersPath)) return;

    const raw = fs.readFileSync(ordersPath, 'utf8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data) || data.length === 0) return;

    await col.insertMany(data);
    console.log('✅ Đã tự động load', data.length, 'orders từ', path.basename(ordersPath));
  } catch (e) {
    console.warn('Không load được orders từ file:', e.message);
  }
}

async function seedCartsIfEmpty() {
  const col = cartsCollection();
  try {
    const count = await col.countDocuments();
    if (count > 0) return;

    const dataDir = path.join(__dirname, '../data');
    const cartsPath = path.join(dataDir, 'carts.json');

    if (!fs.existsSync(cartsPath)) return;

    const raw = fs.readFileSync(cartsPath, 'utf8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data) || data.length === 0) return;

    await col.insertMany(data);
    console.log('✅ Đã tự động load', data.length, 'carts từ', path.basename(cartsPath));
  } catch (e) {
    console.warn('Không load được carts từ file:', e.message);
  }
}

function normalizeDocId(v) {
  if (v == null) return v;
  if (typeof v === 'string') return v;
  if (v && v.$oid) return v.$oid;
  if (v && v.toString) return v.toString();
  return v;
}

async function seedCategoriesIfEmpty() {
  const col = categoriesCollection();
  try {
    const count = await col.countDocuments();
    if (count > 0) return;
    const dataDir = path.join(__dirname, '../data');
    const filePath = path.join(dataDir, 'categories.json');
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return;
    const docs = data.map((d) => ({
      _id: normalizeDocId(d._id) || d._id,
      name: d.name,
      slug: d.slug || '',
      parentId: d.parentId ? normalizeDocId(d.parentId) : null,
      icon: d.icon,
      display_order: d.display_order,
    }));
    await col.insertMany(docs);
    console.log('✅ Đã tự động load', docs.length, 'categories từ', path.basename(filePath));
  } catch (e) {
    console.warn('Không load được categories từ file:', e.message);
  }
}

async function seedProductsIfEmpty() {
  const col = productsCollection();
  try {
    const count = await col.countDocuments();
    if (count > 0) return;
    const dataDir = path.join(__dirname, '../data');
    const filePath = path.join(dataDir, 'products.json');
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return;
    const docs = data.map((d) => {
      const doc = { ...d };
      if (doc._id) doc._id = normalizeDocId(doc._id) || doc._id;
      if (doc.categoryId) doc.categoryId = normalizeDocId(doc.categoryId) || doc.categoryId;
      return doc;
    });
    await col.insertMany(docs);
    console.log('✅ Đã tự động load', docs.length, 'products từ', path.basename(filePath));
  } catch (e) {
    console.warn('Không load được products từ file:', e.message);
  }
}

async function seedHealthProfilesIfEmpty() {
  const col = mongoose.connection.db.collection('healthprofiles');
  try {
    const count = await col.countDocuments();
    if (count > 0) return;
    const filePath = path.join(__dirname, '../data/healthprofiles.json');
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data) || data.length === 0) return;
    // Map từ nested JSON sang flat fields mà backend API dùng
    const docs = data.map((d) => ({
      user_id: d.user_id,
      full_name: d.full_name,
      phone: d.phone,
      gender: d.gender,
      // Flat fields (đây là những gì API trả về)
      bmi: d.bmi_score?.value ?? d.bmi ?? null,
      bmiStatus: d.bmi_status ?? d.bmiStatus ?? null,
      bmr: d.bmr_score?.value ?? d.bmr ?? null,
      bmrStatus: d.bmr_status ?? d.bmrStatus ?? null,
      bloodPressure: d.blood_pressure
        ? `${d.blood_pressure.systolic}/${d.blood_pressure.diastolic} mmHg`
        : (d.bloodPressure ?? null),
      bloodSugar: d.blood_sugar
        ? `${d.blood_sugar.value} ${d.blood_sugar.unit || 'mg/dL'}`
        : (d.bloodSugar ?? null),
      bloodFat: d.blood_fat
        ? `Cholesterol ${d.blood_fat.cholesterol} ${d.blood_fat.unit || 'mg/dL'}`
        : (d.bloodFat ?? null),
      osteoporosis: d.bone_density
        ? `T-score: ${d.bone_density.value}`
        : (d.osteoporosis ?? null),
      menstruation: d.menstrual_cycle
        ? `${d.menstrual_cycle.status || ''}${d.menstrual_cycle.days_remaining != null ? ` - Còn ${d.menstrual_cycle.days_remaining} ngày` : ''}`
        : (d.menstruation ?? null),
      pregnancy: d.is_pregnancy != null
        ? (d.is_pregnancy ? 'Đang mang thai' : null)
        : (d.pregnancy ?? null),
      medicationReminder: Array.isArray(d.medication_reminders)
        ? d.medication_reminders.map((m) => ({
          time: m.time ?? '09:00',
          medicine: m.medicine ?? '',
          pills: m.dosage ?? '',
        }))
        : (Array.isArray(d.medicationReminder) ? d.medicationReminder : []),
      // Nested raw fields (giữ lại để PATCH sau này có thể dùng)
      height_cm: d.height_cm,
      weight_kg: d.weight_kg,
      bmi_score: d.bmi_score,
      bmi_status: d.bmi_status,
      bmr_score: d.bmr_score,
      bmr_status: d.bmr_status,
      blood_pressure: d.blood_pressure,
      heart_rate: d.heart_rate,
      blood_sugar: d.blood_sugar,
      blood_fat: d.blood_fat,
      createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
      updatedAt: d.updatedAt ? new Date(d.updatedAt) : new Date(),
    }));
    await col.insertMany(docs);
    console.log('✅ Đã tự động load', docs.length, 'health profiles từ healthprofiles.json');
  } catch (e) {
    console.warn('Không load được healthprofiles từ file:', e.message);
  }
}

async function seedRemindersIfEmpty() {
  const col = remindersCollection();
  try {
    const count = await col.countDocuments();
    if (count > 0) return;
    const filePath = path.join(__dirname, '../data/reminders.json');
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data) || data.length === 0) return;
    const docs = data.map((d) => {
      const { _id, ...rest } = d;
      return { ...rest, completion_log: rest.completion_log || [] };
    });
    await col.insertMany(docs);
    console.log('✅ Đã tự động load', docs.length, 'reminders từ reminders.json');
  } catch (e) {
    console.warn('Không load được reminders từ file:', e.message);
  }
}

async function seedPrescriptionsIfEmpty() {
  const col = consultationsPrescriptionsCollection();
  try {
    const count = await col.countDocuments();
    if (count > 0) return;
    const filePath = path.join(__dirname, '../data/prescriptions.json');
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data) || data.length === 0) return;
    await col.insertMany(data);
    console.log('✅ Đã tự động load', data.length, 'prescriptions từ prescriptions.json');
  } catch (e) {
    console.warn('Không load được prescriptions từ file:', e.message);
  }
}

async function seedNoticesIfEmpty() {
  const col = noticesCollection();
  try {
    const count = await col.countDocuments();
    if (count > 0) return;
    const firstUser = await usersCollection().findOne({}, { projection: { user_id: 1 } });
    const user_id = firstUser?.user_id || 'CUS000001';
    const now = new Date();
    const notices = [
      { user_id, type: 'order_created', title: 'Đơn hàng mới được tạo', message: 'Đơn hàng ORD000015 đã được đặt thành công và đang chờ xử lý.', createdAt: new Date(now.getTime() - 5 * 60 * 1000), read: false, link: '/account', linkLabel: 'Xem đơn hàng', meta: 'ORD000015' },
      { user_id, type: 'order_updated', title: 'Cập nhật trạng thái đơn hàng', message: 'Đơn hàng ORD000012 đã được chuyển sang trạng thái "Đang giao".', createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), read: false, link: '/account', linkLabel: 'Xem đơn hàng', meta: 'ORD000012' },
      { user_id, type: 'prescription_created', title: 'Đơn thuốc cần tư vấn', message: 'Bạn có đơn thuốc mới cần được tư vấn. Vui lòng xem chi tiết.', createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), read: true, link: '/account', linkLabel: 'Xem đơn thuốc', meta: '' },
      { user_id, type: 'prescription_updated', title: 'Cập nhật đơn thuốc tư vấn', message: 'Đơn thuốc tư vấn của bạn đã được cập nhật trạng thái mới.', createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000), read: true, link: '/account', linkLabel: 'Xem đơn thuốc', meta: '' },
      { user_id, type: 'health_check', title: 'Dữ liệu kiểm tra sức khỏe mới', message: 'Kết quả kiểm tra sức khỏe của bạn đã được lưu vào Sổ sức khỏe.', createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000), read: true, link: '/health', linkLabel: 'Xem sổ sức khỏe', meta: '' },
    ];
    await col.insertMany(notices);
    console.log('✅ Đã tự động load', notices.length, 'thông báo mẫu vào collection notice');
  } catch (e) {
    console.warn('Không seed notices:', e.message);
  }
}

async function seedBenhIfEmpty() {
  const db = mongoose.connection.db;
  if (!db) return;
  const col = db.collection('benh');
  try {
    const count = await col.countDocuments();
    if (count > 0) return;
    const filePath = path.join(__dirname, '../data/benh.json');
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data) || data.length === 0) return;
    await col.insertMany(data);
    console.log('✅ Đã tự động load', data.length, 'bệnh từ benh.json');
  } catch (e) {
    console.warn('Không seed benh:', e.message);
  }
}

async function ensureBlogSlugIndex() {
  try {
    const db = mongoose.connection.db;
    for (const name of ['blog', 'blogs']) {
      try {
        await db.collection(name).createIndex({ slug: 1 }, { background: true });
      } catch (e) {
        if (!e.message?.includes('already exists')) console.warn(`Index ${name}.slug:`, e.message);
      }
    }
  } catch (e) {
    console.warn('ensureBlogSlugIndex:', e.message);
  }
}

const start = async () => {
  try {
    await connectDB();

    // Start listening immediately to avoid ERR_CONNECTION_REFUSED
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 VitaCare API: http://localhost:${PORT}`);
    });

    // Run seeding/indexing in background
    (async () => {
      try {
        await ensureBlogSlugIndex();
        await seedUsersIfEmpty();
        await seedOrdersIfEmpty();
        await seedCartsIfEmpty();
        await seedCategoriesIfEmpty();
        await seedProductsIfEmpty();
        await seedHealthProfilesIfEmpty();
        await seedPrescriptionsIfEmpty();
        await seedNoticesIfEmpty();
        await seedRemindersIfEmpty();
        await seedBenhIfEmpty();
        await seedDiseaseGroups();
        await seedDataAdmin().catch(err => console.error('❌ Background Admin Seed Error:', err.message));
      } catch (e) {
        console.error('❌ Background seeding failed:', e.message);
      }
    })();
  } catch (err) {
    console.error('Start failed:', err);
    process.exit(1);
  }
};

start().catch((err) => {
  console.error('Start failed:', err);
  process.exit(1);
});

// --- Seeding Logic Admin ---
async function seedDataAdmin() {
  const dataDir = path.join(__dirname, '..', 'data');
  const seedMap = [
    { model: PromotionModel, file: 'promotions.json' },
    { model: ConsultationProductModel, file: 'consultations_product.json' },
    { model: ConsultationPrescriptionModel, file: 'consultations_prescription.json' },
    { model: Pharmacist, file: 'pharmacists.json' },
    { model: PromotionTarget, file: 'promotion_target.json' },
    { model: PromotionUsage, file: 'promotion_usage.json' },
    { model: CustomerGroup, file: 'customer_groups.json' },
    { model: ProductGroup, file: 'product_groups.json' },
    { model: ConsultationDiseaseModel, file: 'consultations_disease.json' }
  ];

  function convertMongoJson(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(convertMongoJson);
    const newObj = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === '$oid' && typeof val === 'string') return new mongoose.Types.ObjectId(val);
      if (key === '$date' && typeof val === 'string') return new Date(val);
      newObj[key] = convertMongoJson(val);
    }
    return newObj;
  }

  for (const item of seedMap) {
    try {
      const count = await item.model.countDocuments();
      if (count === 0) {
        const filePath = path.join(dataDir, item.file);
        if (fs.existsSync(filePath)) {
          const rawData = fs.readFileSync(filePath, 'utf8');
          let jsonData = convertMongoJson(JSON.parse(rawData));

          if (item.file === 'promotions.json') {
            jsonData = jsonData.map(p => ({
              ...p,
              type: p.type ? p.type.toLowerCase() : 'order',
              scope: p.scope ? p.scope.toLowerCase() : 'order'
            }));
          }
          await item.model.insertMany(jsonData);
          console.log(`🌱 Seeded ${jsonData.length} items for ${item.file}`);
        }
      }
    } catch (err) {
      console.error(`❌ Error seeding ${item.file}:`, err.message);
    }
  }
}

// --- Admin Routes ---

async function seedDiseaseGroups() {
  try {
    const count = await DiseaseGroupModel.countDocuments();
    // Nếu không đủ 18 nhóm thì sync lại từ đầu cho chuẩn
    if (count !== 18) {
      const data = [
        { "slug": "co-xuong-khop", "name": "Cơ xương khớp", "display_order": 1 },
        { "slug": "tieu-hoa", "name": "Tiêu hóa", "display_order": 2 },
        { "slug": "than-kinh-tinh-than", "name": "Thần kinh - Tinh thần", "display_order": 3 },
        { "slug": "truyen-nhiem", "name": "Truyền nhiễm", "display_order": 4 },
        { "slug": "ung-thu", "name": "Ung thư", "display_order": 5 },
        { "slug": "suc-khoe-sinh-san", "name": "Sức khỏe sinh sản", "display_order": 6 },
        { "slug": "tim-mach", "name": "Tim mạch", "display_order": 7 },
        { "slug": "da-toc-mong", "name": "Da - Tóc - Móng", "display_order": 8 },
        { "slug": "tai-mui-hong", "name": "Tai mũi họng", "display_order": 9 },
        { "slug": "mat", "name": "Mắt", "display_order": 10 },
        { "slug": "than-tiet-nieu", "name": "Thận - Tiết niệu", "display_order": 11 },
        { "slug": "ho-hap", "name": "Hô hấp", "display_order": 12 },
        { "slug": "di-ung", "name": "Dị ứng", "display_order": 13 },
        { "slug": "rang-ham-mat", "name": "Răng hàm mặt", "display_order": 14 },
        { "slug": "suc-khoe-gioi-tinh", "name": "Sức khỏe giới tính", "display_order": 15 },
        { "slug": "tam-than", "name": "Tâm thần", "display_order": 16 },
        { "slug": "mau", "name": "Máu", "display_order": 17 },
        { "slug": "noi-tiet-chuyen-hoa", "name": "Nội tiết - Chuyển hóa", "display_order": 18 }
      ];
      await DiseaseGroupModel.deleteMany({});
      await DiseaseGroupModel.insertMany(data);
    }
  } catch (error) {
    console.error('Seed Disease Groups Error:', error);
  }
}

// Dashboard Stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [products, users, orders, promos, blogs, pharmacists, consults_p, consults_pr, consults_d, revenue30dAgg, totalRevenueAgg] = await Promise.all([
      ProductModel.countDocuments(),
      UserModel.countDocuments(),
      OrderModel.countDocuments(),
      PromotionModel.countDocuments(),
      BlogModel.countDocuments(),
      Pharmacist.countDocuments(),
      ConsultationProductModel.countDocuments(),
      ConsultationPrescriptionModel.countDocuments(),
      ConsultationDiseaseModel.countDocuments(),
      OrderModel.aggregate([
        { $addFields: { rawDate: { $ifNull: ["$createdAt", "$route.pending"] } }, },
        { $addFields: { parsedDate: { $toDate: "$rawDate" } } },
        {
          $match: {
            parsedDate: { $gte: thirtyDaysAgo },
            $or: [{ statusPayment: 'paid' }, { status: 'delivered' }]
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$parsedDate" } },
            revenue: { $sum: "$totalAmount" }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      OrderModel.aggregate([
        { $match: { $or: [{ statusPayment: 'paid' }, { status: 'delivered' }] } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
      ])
    ]);

    // Fill gaps in revenue30d
    const revenueMap = {};
    if (revenue30dAgg) revenue30dAgg.forEach(r => { revenueMap[r._id] = r.revenue; });

    const finalRevenue = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().substring(0, 10);
      finalRevenue.push({ date: ds, revenue: revenueMap[ds] || 0 });
    }

    res.json({
      success: true,
      data: {
        products,
        users,
        orders,
        promotions: promos,
        blogs,
        pharmacists,
        consultations_product: consults_p,
        consultations_prescription: consults_pr,
        consultations_disease: consults_d,
        revenue30d: finalRevenue,
        totalRevenue: totalRevenueAgg[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admins
app.get('/api/admin/admins', async (req, res) => {
  try {
    const data = await AdminModel.find();
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Products with Advanced Filtering
app.get('/api/admin/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, categoryId, minPrice, maxPrice, units, stockStatus } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    const andFilters = [];

    if (search) {
      andFilters.push({
        $or: [
          { name: { $regex: escapeRegExp(search), $options: 'i' } },
          { sku: { $regex: escapeRegExp(search), $options: 'i' } }
        ]
      });
    }

    if (categoryId) {
      const cats = await CategoryModel.find().lean();
      const getIdStr = (id) => id ? String(id._id || id) : '';
      const getChildIds = (pid) => {
        const pIdStr = getIdStr(pid);
        const children = cats.filter(c => getIdStr(c.parentId) === pIdStr);
        let ids = [pIdStr];
        children.forEach(c => { ids = [...ids, ...getChildIds(c._id)]; });
        return ids;
      };
      const allCatIdsStrings = [...new Set(getChildIds(categoryId))];
      const allCatIdsMixed = [];
      allCatIdsStrings.forEach(id => {
        if (!id) return;
        const oidStr = String(id);
        allCatIdsMixed.push(oidStr);
        try { allCatIdsMixed.push(new mongoose.Types.ObjectId(oidStr)); } catch (e) { }
      });
      andFilters.push({
        $or: [
          { categoryId: { $in: allCatIdsMixed } },
          { "categoryId.$oid": { $in: allCatIdsStrings } }
        ]
      });
    }

    if (minPrice || maxPrice) {
      const priceQuery = { price: {} };
      if (minPrice) priceQuery.price.$gte = Number(minPrice);
      if (maxPrice) priceQuery.price.$lte = Number(maxPrice);
      andFilters.push(priceQuery);
    }

    if (units) {
      const unitArray = Array.isArray(units) ? units : units.split(',');
      andFilters.push({ unit: { $in: unitArray } });
    }

    if (stockStatus) {
      const statusArray = Array.isArray(stockStatus) ? stockStatus : stockStatus.split(',');
      const stockQueries = [];
      if (statusArray.includes('out_of_stock')) stockQueries.push({ stock: 0 });
      if (statusArray.includes('low_stock')) stockQueries.push({ stock: { $gt: 0, $lt: 10 } });
      if (statusArray.includes('in_stock')) stockQueries.push({ stock: { $gte: 10 } });
      if (stockQueries.length > 0) andFilters.push({ $or: stockQueries });
    }

    if (andFilters.length > 0) {
      query.$and = andFilters;
    }

    const totalItems = await ProductModel.countDocuments(query);

    const sortObj = {};
    if (req.query.sortColumn) {
      const col = req.query.sortColumn;
      sortObj[col] = req.query.sortDirection === 'desc' ? -1 : 1;
    } else {
      sortObj.created_at = -1;
    }

    const data = await ProductModel.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      success: true,
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / limitNum),
      currentPage: pageNum
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    const data = await ProductModel.findOne({ $or: query }).lean();
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/products', async (req, res) => {
  try {
    const item = new ProductModel(req.body);
    const data = await item.save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/admin/products/:id', async (req, res) => {
  try {
    const data = await ProductModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    await ProductModel.findOneAndDelete({ $or: query });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/categories', async (req, res) => {
  try {
    const data = await CategoryModel.find().lean();
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/categories', async (req, res) => {
  try {
    const item = new CategoryModel(req.body);
    const data = await item.save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/admin/categories/:id', async (req, res) => {
  try {
    const data = await CategoryModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/categories/:id', async (req, res) => {
  try {
    await CategoryModel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/orders', async (req, res) => {
  try {
    const data = await OrderModel.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/orders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`[GET /api/admin/orders/${id}] Fetching order...`);
    const data = await OrderModel.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null },
        { _id: id },
        { order_id: id },
        { code: id }
      ].filter(q => q._id !== null)
    }).lean();

    if (!data) {
      console.warn(`[GET /api/admin/orders/${id}] Order not found`);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    console.log(`[GET /api/admin/orders/${id}] Found order:`, data.code || data.order_id || data._id);
    res.json({ success: true, data: data });
  } catch (error) {
    console.error(`[GET /api/admin/orders/${id}] Error:`, error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/orders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }, { order_id: id }, { code: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    // Lấy doc cũ trước để so sánh trạng thái
    const oldDoc = await OrderModel.findOne({ $or: query }).lean();
    const data = await OrderModel.findOneAndUpdate({ $or: query }, req.body, { new: true });
    if (!data) return res.status(404).json({ success: false, message: 'Order not found' });

    // Lưu notice cho user khi admin thay đổi trạng thái đơn hàng
    const newStatus = req.body.status;
    if (newStatus && oldDoc && newStatus !== oldDoc.status) {
      const userId = data.user_id || oldDoc.user_id;
      if (userId) {
        const orderCode = data.order_id || oldDoc.order_id || id;
        const statusNoticeMap = {
          confirmed: { title: 'Đơn hàng đã được xác nhận', message: `Đơn hàng ${orderCode} đã được xác nhận và đang được chuẩn bị.` },
          shipping: { title: 'Đơn hàng đang được giao', message: `Đơn hàng ${orderCode} đang trên đường giao đến bạn.` },
          delivered: { title: 'Đơn hàng đã được giao', message: `Đơn hàng ${orderCode} đã được giao thành công. Vui lòng xác nhận nhận hàng.` },
          cancelled: { title: 'Đơn hàng đã bị huỷ', message: `Đơn hàng ${orderCode} đã bị huỷ bởi hệ thống.` },
          returning: { title: 'Yêu cầu trả hàng được chấp nhận', message: `Yêu cầu trả hàng đơn ${orderCode} đã được chấp nhận, đang xử lý hoàn trả.` },
          returned: { title: 'Đơn hàng đã hoàn trả', message: `Đơn hàng ${orderCode} đã được hoàn trả thành công.` },
          refund_rejected: { title: 'Yêu cầu hoàn tiền bị từ chối', message: `Yêu cầu hoàn tiền cho đơn hàng ${orderCode} đã bị từ chối.` },
        };
        const noticeInfo = statusNoticeMap[newStatus];
        if (noticeInfo) {
          try {
            await noticesCollection().insertOne({
              user_id: String(userId),
              type: 'order_updated',
              title: noticeInfo.title,
              message: noticeInfo.message,
              createdAt: new Date().toISOString(),
              read: false,
              link: '/account',
              linkLabel: 'Xem đơn hàng',
              meta: orderCode,
            });
          } catch (e) {
            console.warn('[PUT /api/admin/orders/:id] Cannot create notice:', e.message);
          }
        }
      }
    }

    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await OrderModel.findOneAndDelete({ $or: [{ _id: id }, { order_id: id }, { code: id }] });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/promotions', async (req, res) => {
  try {
    const promotions = await PromotionModel.find().lean();
    const usages = await PromotionUsage.find().lean();
    const targets = await PromotionTarget.find().lean();

    const data = promotions.map(p => {
      const pid = p._id ? p._id.toString() : null;
      const code = p.code;
      const usageData = usages.filter(u => (pid && u.promotion_id === pid) || (code && u.code === code));
      const targetData = targets.filter(t => (pid && t.promotion_id === pid) || (code && t.code === code));
      return { ...p, usages: usageData, targets: targetData };
    });
    const sortedData = data.sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
    res.json({ success: true, data: sortedData });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/promotions', async (req, res) => {
  try {
    const item = new PromotionModel(req.body);
    const data = await item.save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/admin/promotions/:id', async (req, res) => {
  try {
    const data = await PromotionModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/promotions/:id', async (req, res) => {
  try {
    await PromotionModel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/reviews', async (req, res) => {
  try {
    const data = await ReviewModel.find().sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/pharmacists', async (req, res) => {
  try {
    const data = await Pharmacist.find();
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/consultations_prescription', async (req, res) => {
  try {
    const data = await ConsultationPrescriptionModel.find().sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.patch('/api/admin/consultations_prescription/:id', async (req, res) => {
  try {
    const { status, pharmacist_id, pharmacistName, pharmacistPhone, current_status, status_history } = req.body;
    const id = String(req.params.id);

    // Hỗ trợ cả ObjectId lẫn chuỗi/id đơn thuốc
    const query = [{ _id: id }, { prescriptionId: id }, { id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    const updated = await ConsultationPrescriptionModel.findOneAndUpdate(
      { $or: query },
      {
        status,
        pharmacist_id,
        pharmacistName,
        pharmacistPhone,
        current_status,
        status_history,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Prescription not found' });

    // Lưu notice cho user khi admin thay đổi trạng thái đơn thuốc
    if (status) {
      const userId = updated.user_id;
      if (userId) {
        const prescriptionCode = updated.prescriptionId || id;
        const pharmacistInfo = pharmacistName ? ` bởi dược sĩ ${pharmacistName}` : '';
        const prescriptionStatusNoticeMap = {
          waiting: { title: 'Đơn thuốc đang được tư vấn', message: `Đơn thuốc ${prescriptionCode} đang được tư vấn${pharmacistInfo}. Dược sĩ sẽ liên hệ sớm nhất.` },
          advised: { title: 'Đơn thuốc đã được tư vấn', message: `Đơn thuốc ${prescriptionCode} đã được tư vấn xong${pharmacistInfo}.` },
          unreachable: { title: 'Dược sĩ chưa thể liên hệ', message: `Dược sĩ chưa thể liên hệ được với bạn về đơn thuốc ${prescriptionCode}. Vui lòng kiểm tra lại số điện thoại.` },
          cancelled: { title: 'Đơn thuốc tư vấn đã bị huỷ', message: `Đơn thuốc tư vấn ${prescriptionCode} đã bị huỷ.` },
        };
        const noticeInfo = prescriptionStatusNoticeMap[status];
        if (noticeInfo) {
          try {
            await noticesCollection().insertOne({
              user_id: String(userId),
              type: 'prescription_updated',
              title: noticeInfo.title,
              message: noticeInfo.message,
              createdAt: new Date().toISOString(),
              read: false,
              link: '/account',
              linkLabel: 'Xem đơn thuốc',
              meta: prescriptionCode,
            });
          } catch (e) {
            console.warn('[PATCH /api/admin/consultations_prescription/:id] Cannot create notice:', e.message);
          }
        }
      }
    }

    // Gửi email cho dược sĩ được phân công nhưng không chặn response
    if (pharmacist_id) {
      (async () => {
        try {
          const pharmacist = await Pharmacist.findOne({ _id: String(pharmacist_id) });
          if (pharmacist && pharmacist.pharmacistEmail) {
            const prescriptionCode = updated.prescriptionId || updated.id || 'Đơn thuốc';
            const createdAt = updated.createdAt
              ? new Date(updated.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
              : '';
            const customerName = updated.full_name || 'Khách vãng lai';
            const customerPhone = updated.phone || '';
            const note = updated.note || '';
            const assigner = (current_status && current_status.changedBy) || 'Admin VitaCare';

            const html = `
              <div style="font-family: system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f4f6fb; padding:24px;">
                <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:16px; padding:24px 28px; box-shadow:0 12px 30px rgba(15,23,42,0.18);">
                  <div style="text-align:center; margin-bottom:18px;">
                    <div style="font-size:20px; font-weight:700; color:#1d4ed8; text-transform:uppercase; letter-spacing:1px;">
                      VitaCare
                    </div>
                    <div style="font-size:13px; color:#64748b; margin-top:4px;">
                      Thông báo phân công tư vấn đơn thuốc
                    </div>
                  </div>

                  <h2 style="font-size:18px; margin:16px 0 8px; color:#0f172a;">
                    Bạn vừa được phân công tư vấn đơn thuốc <span style="color:#1d4ed8;">${prescriptionCode}</span>
                  </h2>

                  <p style="font-size:14px; color:#334155; line-height:1.6; margin:0 0 16px;">
                    Xin chào <strong>${pharmacist.pharmacistName || 'Dược sĩ'}</strong>,<br/>
                    Hệ thống VitaCare vừa phân công cho bạn phụ trách một yêu cầu tư vấn đơn thuốc mới.
                  </p>

                  <div style="border-radius:12px; border:1px solid #e2e8f0; padding:14px 16px; background:#f8fafc; margin-bottom:16px;">
                    <div style="font-size:13px; font-weight:600; color:#64748b; text-transform:uppercase; margin-bottom:8px;">
                      Thông tin đơn thuốc
                    </div>
                    <table style="width:100%; border-collapse:collapse; font-size:14px; color:#0f172a;">
                      <tr>
                        <td style="padding:4px 0; width:140px; color:#64748b;">Mã đơn thuốc</td>
                        <td style="padding:4px 0;"><strong>${prescriptionCode}</strong></td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; color:#64748b;">Thời gian gửi</td>
                        <td style="padding:4px 0;">${createdAt || '-'}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; color:#64748b;">Khách hàng</td>
                        <td style="padding:4px 0;">${customerName}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; color:#64748b;">Số điện thoại</td>
                        <td style="padding:4px 0;">${customerPhone || '-'}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; color:#64748b; vertical-align:top;">Ghi chú</td>
                        <td style="padding:4px 0; white-space:pre-line;">${note || 'Không có ghi chú từ khách hàng.'}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0 0; color:#64748b;">Người phân công</td>
                        <td style="padding:8px 0 0;">${assigner}</td>
                      </tr>
                    </table>
                  </div>

                  <div style="margin-top:18px; font-size:13px; color:#64748b;">
                    Vui lòng đăng nhập trang quản trị VitaCare để xem chi tiết và phản hồi cho khách hàng trong thời gian sớm nhất.
                  </div>

                  <div style="margin-top:20px; font-size:12px; color:#9ca3af; border-top:1px solid #e5e7eb; padding-top:10px;">
                    Email này được gửi tự động từ hệ thống VitaCare. Vui lòng không trả lời trực tiếp email này.
                  </div>
                </div>
              </div>
            `;

            const mailOptions = {
              from: 'vitacarehotro@gmail.com',
              to: pharmacist.pharmacistEmail,
              subject: `[VitaCare] Phân công tư vấn MỚI: ${prescriptionCode}`,
              html
            };

            transporter.sendMail(mailOptions).catch(() => { });
          }
        } catch (mailErr) {
          console.warn('[consultations_prescription] sendMail error:', mailErr?.message || mailErr);
        }
      })();
    }

    res.json({ success: true, data: updated });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/consultations_product', async (req, res) => {
  try {
    const data = await ConsultationProductModel.find().sort({ updatedAt: -1 });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/consultations_product/stats', async (req, res) => {
  try {
    const products = await ConsultationProductModel.find().lean();
    const stats = products.map(p => {
      const unanswered = (p.questions || []).filter(q => q.status === 'pending' || !q.answer).length;
      return {
        sku: p.sku,
        productName: p.productName,
        unansweredCount: unanswered,
        totalQuestions: (p.questions || []).length,
        _id: p._id
      };
    });
    res.json({ success: true, data: stats });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.patch('/api/admin/consultations_product/reply', async (req, res) => {
  try {
    const { sku, questionId, answer, answeredBy } = req.body;
    const product = await ConsultationProductModel.findOne({ sku });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    const question = product.questions?.id ? product.questions.id(questionId) : product.questions.find(q => q.id === questionId || q._id === questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const userId = question.user_id || null;
    const productName = product.productName || sku;

    question.answer = answer;
    question.answeredBy = answeredBy;
    question.status = 'answered';
    question.answeredAt = new Date();
    product.updatedAt = new Date();

    await product.save();

    // Lưu notice cho user khi admin trả lời câu hỏi sản phẩm
    if (userId) {
      try {
        await noticesCollection().insertOne({
          user_id: String(userId),
          type: 'order_updated',
          title: 'Câu hỏi sản phẩm đã có phản hồi',
          message: `Câu hỏi của bạn về sản phẩm "${productName}" đã được ${answeredBy || 'dược sĩ'} giải đáp.`,
          createdAt: new Date().toISOString(),
          read: false,
          link: '/account',
          linkLabel: 'Xem phản hồi',
          meta: sku,
        });
      } catch (e) {
        console.warn('[PATCH /api/admin/consultations_product/reply] Cannot create notice:', e.message);
      }
    }

    res.json({ success: true, data: product });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/consultations_disease', async (req, res) => {
  try {
    const data = await ConsultationDiseaseModel.find().sort({ updatedAt: -1 });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/consultations_disease/stats', async (req, res) => {
  try {
    const diseases = await ConsultationDiseaseModel.find().lean();
    const stats = diseases.map(d => {
      const unanswered = (d.questions || []).filter(q => q.status === 'pending' || !q.answer).length;
      return {
        sku: d.sku,
        productName: d.productName,
        unansweredCount: unanswered,
        totalQuestions: (d.questions || []).length,
        _id: d._id
      };
    });
    res.json({ success: true, data: stats });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.patch('/api/admin/consultations_disease/reply', async (req, res) => {
  try {
    const { sku, questionId, answer, answeredBy } = req.body;
    const disease = await ConsultationDiseaseModel.findOne({ sku });
    if (!disease) return res.status(404).json({ success: false, message: 'Disease not found' });
    const question = disease.questions?.id ? disease.questions.id(questionId) : disease.questions.find(q => q.id === questionId || q._id === questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const userId = question.user_id || null;
    const diseaseName = disease.productName || sku;

    question.answer = answer;
    question.answeredBy = answeredBy;
    question.status = 'answered';
    question.answeredAt = new Date();
    disease.updatedAt = new Date();

    await disease.save();

    // Lưu notice cho user khi admin trả lời câu hỏi về bệnh
    if (userId) {
      try {
        await noticesCollection().insertOne({
          user_id: String(userId),
          type: 'order_updated',
          title: 'Câu hỏi về bệnh đã có phản hồi',
          message: `Câu hỏi của bạn về bệnh "${diseaseName}" đã được ${answeredBy || 'dược sĩ'} giải đáp.`,
          createdAt: new Date().toISOString(),
          read: false,
          link: '/account',
          linkLabel: 'Xem phản hồi',
          meta: sku,
        });
      } catch (e) {
        console.warn('[PATCH /api/admin/consultations_disease/reply] Cannot create notice:', e.message);
      }
    }

    res.json({ success: true, data: disease });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/consultations_disease/:sku/:questionId', async (req, res) => {
  try {
    const { sku, questionId } = req.params;
    const disease = await ConsultationDiseaseModel.findOne({ sku });
    if (!disease) return res.status(404).json({ success: false, message: 'Disease not found' });

    disease.questions = disease.questions.filter(q => (q._id?.toString() !== questionId && q.id !== questionId));
    await disease.save();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const data = await UserModel.find().sort({ registerdate: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/users/:id', async (req, res) => {
  try {
    const data = await UserModel.findOne({ _id: String(req.params.id) });
    if (!data) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/users/:id/orders', async (req, res) => {
  try {
    const data = await OrderModel.find({ user_id: req.params.id });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const item = new UserModel(req.body);
    const data = await item.save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const data = await UserModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    await UserModel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/blogs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const totalItems = await BlogModel.countDocuments();
    const data = await BlogModel.find().sort({ publishedAt: -1 }).skip(skip).limit(limit).lean();
    res.json({
      success: true,
      data,
      pagination: {
        total: totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit) || 1
      }
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/blogs', async (req, res) => {
  try {
    const item = new BlogModel(req.body);
    const data = await item.save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/admin/blogs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    const data = await BlogModel.findOneAndUpdate({ $or: query }, req.body, { new: true });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/blogs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    await BlogModel.findOneAndDelete({ $or: query });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/customer_groups', async (req, res) => {
  try {
    const data = await CustomerGroup.find().sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/customer_groups', async (req, res) => {
  try {
    const data = await new CustomerGroup(req.body).save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/customer_groups/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    await CustomerGroup.findOneAndDelete({ $or: query });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/product_groups', async (req, res) => {
  try {
    const data = await ProductGroup.find().sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/product_groups', async (req, res) => {
  try {
    const data = await new ProductGroup(req.body).save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/product_groups/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    await ProductGroup.findOneAndDelete({ $or: query });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await AdminModel.findOne({ adminemail: email });
    if (admin && admin.password === password) {
      res.json({ success: true, message: 'Login success', admin });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const admin = await AdminModel.findOne({ adminemail: email });
    if (!admin) return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống' });
  } catch (err) { return res.status(500).json({ success: false, message: 'Lỗi kiểm tra email' }); }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  resetCodes[email] = code;

  const mailOptions = {
    from: 'vitacarehotro@gmail.com',
    to: email,
    subject: 'Yêu cầu đặt lại mật khẩu - VitaCare Admin',
    html: `
        <div style="background-color: #e8f0fe; padding: 50px 20px; font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
                <div style="background: linear-gradient(to right, #0056b3, #a594f9); padding: 40px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 38px; font-weight: bold; letter-spacing: 1px;">VitaCare</h1>
                </div>
                <div style="padding: 50px 40px; text-align: center;">
                    <h2 style="color: #004695; margin: 0 0 25px 0; font-size: 26px; font-weight: bold;">Yêu cầu đặt lại mật khẩu</h2>
                    <p style="color: #777; font-size: 18px; margin: 0;">Xin chào,</p>
                    <p style="color: #777; font-size: 17px; line-height: 1.6; margin: 10px 0 40px 0;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản VitaCare của bạn. Sử dụng mã OTP bên dưới để xác thực:</p>
                    <div style="background-color: #e3f2fd; padding: 25px 50px; border-radius: 12px; display: inline-block; margin-bottom: 40px;">
                        <span style="font-size: 52px; font-weight: 800; color: #1e5ba0; letter-spacing: 10px;">${code}</span>
                    </div>
                    <p style="color: #888; font-size: 15px; margin: 0 0 10px 0;">Mã xác thực này sẽ hết hạn trong <strong>10 phút</strong>.</p>
                    <p style="color: #999; font-size: 14px; line-height: 1.5;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email hoặc liên hệ với bộ phận hỗ trợ.</p>
                </div>
            </div>
        </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: `Mã xác thực đã được gửi tới ${email}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi khi gửi email' });
  }
});

app.post('/api/admin/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (resetCodes[email] && resetCodes[email] === code) {
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, message: 'Mã xác thực không chính xác' });
  }
});

app.post('/api/admin/reset-password', async (req, res) => {
  try {
    const updated = await AdminModel.findOneAndUpdate(
      { adminemail: req.body.email },
      { password: req.body.newPassword },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản admin' });
    delete resetCodes[req.body.email];
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/change-password', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    const admin = await AdminModel.findOne({ adminemail: email });
    if (!admin) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    if (admin.password !== oldPassword) return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác' });
    const updated = await AdminModel.findOneAndUpdate(
      { adminemail: email },
      { password: newPassword },
      { new: true }
    );
    res.json({ success: true, message: 'Đổi mật khẩu thành công', admin: updated });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});



