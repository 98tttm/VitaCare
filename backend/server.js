require('dotenv').config();
const path = require('path');
// Allow backend to reuse its own `node_modules` when importing Mongoose models
// from `my-user/src/...` (those model files do `require('mongoose')`).
const Module = require('module');
const backendNodeModulesPath = path.join(__dirname, 'node_modules');
if (!process.env.NODE_PATH) {
  process.env.NODE_PATH = backendNodeModulesPath;
} else if (!process.env.NODE_PATH.split(path.delimiter).includes(backendNodeModulesPath)) {
  process.env.NODE_PATH = `${backendNodeModulesPath}${path.delimiter}${process.env.NODE_PATH}`;
}
Module.Module._initPaths();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { connectDB, mongoose } = require('./db');
const { Schema } = mongoose;
const multer = require('multer');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { GridFSBucket } = require('mongodb');

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
const PromotionTarget = mongoose.model('promotion_target', genericSchema, 'promotion_promotion_target');
/**
 * Nhóm khách hàng (admin). Collection thực tế trên MongoDB: `customer_groups` (số nhiều — trùng Compass / dữ liệu cũ).
 */
const CustomerGroup = mongoose.model('customer_group', genericSchema, 'customer_groups');
const ProductGroup = mongoose.model('product_groups', genericSchema, 'product_groups');
const Pharmacist = mongoose.model('pharmacists', genericSchema, 'pharmacists');
const ConsultationProductModel = mongoose.model('admin_consultations_product', genericSchema, 'consultations_product');
const ConsultationDiseaseModel = mongoose.model('admin_consultations_disease', genericSchema, 'consultations_disease');
const DiseaseArticleRatingModel = mongoose.model('disease_article_ratings_doc', genericSchema, 'disease_article_ratings');
const ConsultationPrescriptionModel = mongoose.model('admin_consultations_prescription', genericSchema, 'consultations_prescription');
const ReviewModel = mongoose.model('admin_reviews', genericSchema, 'reviews');
const DiseaseModel = mongoose.model('admin_diseases', genericSchema, 'benh');
const DiseaseGroupModel = mongoose.model('disease_groups_metadata', genericSchema, 'disease_groups');

// --- CUSTOMER TIERING HELPERS ---
/**
 * Tính tiering từ tổng tiền đã chi của các đơn giao thành công.
 * Ngưỡng mặc định (có thể chỉnh lại theo business):
 *  - < 3.000.000đ: Đồng
 *  - 3.000.000 – < 10.000.000đ: Bạc
 *  - >= 10.000.000đ: Vàng
 */
function getTierFromTotalSpent(total) {
  const t = Number(total) || 0;
  if (t >= 10_000_000) return 'Vàng';
  if (t >= 3_000_000) return 'Bạc';
  return 'Đồng';
}

/** Tính totalspent/tiering từ toàn bộ trạng thái thể hiện giao thành công (mới + legacy). */
const SUCCESS_ORDER_STATUSES_FOR_SPENDING = ['delivered', 'unreview', 'reviewed', 'completed', 'received'];

function normalizeUserIdForSpending(raw) {
  if (raw == null) return '';
  return String(raw).trim();
}

/**
 * Recompute totalspent + tiering từ toàn bộ đơn thành công của 1 user.
 * Dùng khi đơn đổi trạng thái để tránh lệch tier theo thời gian.
 */
async function recomputeUserTotalSpentAndTier(rawUserId) {
  const rawNorm = normalizeUserIdForSpending(rawUserId);
  if (!rawNorm) return null;

  const userQuery = [{ user_id: rawNorm }, { _id: rawNorm }];
  if (mongoose.Types.ObjectId.isValid(rawNorm)) {
    userQuery.push({ _id: new mongoose.Types.ObjectId(rawNorm) });
  }
  const userDoc = await usersCollection().findOne(
    { $or: userQuery },
    { projection: { user_id: 1, _id: 1 } }
  );

  const userId = normalizeUserIdForSpending(userDoc?.user_id || rawNorm);
  const candidates = Array.from(new Set([
    rawNorm,
    userId,
    normalizeUserIdForSpending(userDoc?._id),
  ].filter(Boolean)));

  const rows = await ordersCollection().aggregate([
    {
      $addFields: {
        status_norm: {
          $trim: { input: { $toLower: { $toString: { $ifNull: ['$status', ''] } } } }
        },
        user_id_norm: {
          $trim: { input: { $toString: { $ifNull: ['$user_id', ''] } } }
        }
      }
    },
    { $match: { status_norm: { $in: SUCCESS_ORDER_STATUSES_FOR_SPENDING } } },
    { $match: { $expr: { $in: ['$user_id_norm', candidates] } } },
    {
      $group: {
        _id: null,
        totalspent: {
          $sum: {
            $toDouble: {
              $ifNull: [
                '$totalAmount',
                { $ifNull: ['$total', { $ifNull: ['$amount', 0] }] }
              ]
            }
          }
        }
      }
    }
  ]).toArray();

  const totalspent = Number(rows?.[0]?.totalspent) || 0;
  const tiering = getTierFromTotalSpent(totalspent);
  if (userDoc?._id != null) {
    await usersCollection().updateOne(
      { _id: userDoc._id },
      { $set: { totalspent, tiering } },
    );
  } else {
    await usersCollection().updateOne(
      { user_id: userId },
      { $set: { totalspent, tiering } },
    );
  }
  return { user_id: userId, totalspent, tiering };
}

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

// =========================
// GridFS "media" - fallback cho ảnh cũ
// =========================
// Các promo cũ đang lưu URL dạng `/api/media/file/<gridfsFileId>`
// (bucketName: "media" với collections: "media.files" & "media.chunks").
app.get('/api/media/file/:id', async (req, res) => {
  try {
    const idRaw = String(req.params.id || '').trim();
    if (!idRaw) return res.status(400).json({ success: false, message: 'Missing file id' });

    const db = mongoose.connection.db;
    if (!db) return res.status(500).json({ success: false, message: 'Mongo not ready' });

    const bucket = new GridFSBucket(db, { bucketName: 'media' });

    // GridFS file _id thường là ObjectId hex string
    const fileId = mongoose.Types.ObjectId.isValid(idRaw) ? new mongoose.Types.ObjectId(idRaw) : idRaw;

    const stream = bucket.openDownloadStream(fileId);
    stream.on('file', (file) => {
      res.setHeader('Content-Type', file?.contentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    });
    stream.on('error', (err) => {
      console.error('[GET /api/media/file/:id] Error:', err?.message || err);
      if (!res.headersSent) res.status(404).end();
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[GET /api/media/file/:id] Error:', err?.message || err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Static uploads cho blog images
const blogUploads = path.join(uploadsRoot, 'blogs');
if (!fs.existsSync(blogUploads)) {
  fs.mkdirSync(blogUploads, { recursive: true });
}

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

const blogImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, blogUploads);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '').toLowerCase();
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base || 'blog'}-${unique}${ext}`);
  },
});

const uploadBlogImage = multer({
  storage: blogImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('file');

// --- Promotion banner images (lưu ảnh trực tiếp vào MongoDB) ---
const promoImageStorage = multer.memoryStorage();
const uploadPromoBannerImage = multer({
  storage: promoImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('file');

const promoBannerImagesCollection = () => mongoose.connection.db.collection('promotion_banner_images');

// Collections chính trong MongoDB (giữ lại cho seed & một số thao tác đặc biệt)
const usersCollection = () => mongoose.connection.db.collection('users');
const usersMemoryCollection = () => mongoose.connection.db.collection('users_memory');
const productsCollection = () => mongoose.connection.db.collection('products');
const categoriesCollection = () => mongoose.connection.db.collection('categories');
const cartsCollection = () => mongoose.connection.db.collection('carts');
const recentlyViewedCollection = () => mongoose.connection.db.collection('recently_viewed');
const otpCodesCollection = () => mongoose.connection.db.collection('otp_codes');
const addressesCollection = () => mongoose.connection.db.collection('addresses');
const healthprofilesCollection = () => mongoose.connection.db.collection('healthprofiles');
const healthProfilesCollection = () => mongoose.connection.db.collection('healthProfiles'); // New, camelCase version
const quizCollection = () => mongoose.connection.db.collection('quiz'); // New
/** Cấu hình logic / ngưỡng kết quả bài test (disease_id, results[], logic_type) — đọc cho GET /api/quizzes */
const resultsCollection = () => mongoose.connection.db.collection('results');
/** Lượt làm bài test đã lưu của user (user_id, quiz_id, điểm, tiêu đề…) — tách khỏi `results` cấu hình */
const USERS_RESULT_TEST_COLLECTION_NAME = 'users_result_test';
const usersResultTestCollection = () => mongoose.connection.db.collection(USERS_RESULT_TEST_COLLECTION_NAME);

let usersResultTestCollectionEnsured = false;

/** Tạo collection `users_result_test` nếu chưa có (gọi trước insert khi user hoàn thành bài test). */
async function ensureUsersResultTestCollection() {
  if (usersResultTestCollectionEnsured) return;
  const db = mongoose.connection.db;
  const existing = await db.listCollections({ name: USERS_RESULT_TEST_COLLECTION_NAME }).toArray();
  if (existing.length === 0) {
    await db.createCollection(USERS_RESULT_TEST_COLLECTION_NAME);
  }
  usersResultTestCollectionEnsured = true;
}

const locationsCollection = () => mongoose.connection.db.collection('tree_complete');
const ordersCollection = () => mongoose.connection.db.collection('orders');
/** Thông báo lưu cho admin panel (đơn hàng, sau này mở rộng). `roles`: ai được xem — ví dụ chỉ admin cho đơn hàng. */
const adminNoticeCollection = () => mongoose.connection.db.collection('admin_notice');

/** Đánh dấu thông báo admin_notice (tư vấn đơn thuốc) đã xử lý — ẩn khỏi chuông admin. */
async function markPrescriptionConsultAdminNoticesResolved(prescriptionId) {
  const pid = String(prescriptionId ?? '').trim();
  if (!pid) return;
  try {
    await adminNoticeCollection().updateMany(
      {
        type: 'consultation_prescription',
        $or: [{ 'meta.prescriptionId': pid }, { 'meta.prescription_id': pid }],
      },
      { $set: { resolved: true, resolvedAt: new Date() } }
    );
  } catch (e) {
    console.warn('[admin_notice] mark prescription consultation resolved:', e?.message || e);
  }
}

/** Xóa thông báo đơn tư vấn thuốc gửi nhầm cho dược sĩ (chạy một lần khi khởi động). */
async function cleanupLegacyPrescriptionNotificationsForPharmacist() {
  try {
    const pn = await pharmacistNoticeCollection().deleteMany({
      type: { $in: ['consultation_prescription', 'prescription_consultation', 'prescription_pending'] },
    });
    if (pn.deletedCount) {
      console.log(`[cleanup] pharmacist_notice: đã xóa ${pn.deletedCount} bản ghi thông báo liên quan đơn tư vấn thuốc.`);
    }
    const an = await adminNoticeCollection().deleteMany({
      type: 'consultation_prescription',
      roles: { $in: ['pharmacist'] },
    });
    if (an.deletedCount) {
      console.log(`[cleanup] admin_notice: đã xóa ${an.deletedCount} thông báo đơn thuốc có role dược sĩ.`);
    }
  } catch (e) {
    console.warn('[cleanup] prescription notifications:', e?.message || e);
  }
}

/** Đơn pending cũ chưa có bản ghi admin_notice — tạo một lần để chuông admin không mất dữ liệu. */
async function backfillPrescriptionConsultAdminNoticesIfMissing() {
  try {
    const pending = await ConsultationPrescriptionModel.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();
    let added = 0;
    for (const p of pending) {
      const pid = String(p.prescriptionId || '').trim();
      if (!pid) continue;
      const exists = await adminNoticeCollection().findOne({
        type: 'consultation_prescription',
        $or: [{ 'meta.prescriptionId': pid }, { 'meta.prescription_id': pid }],
      });
      if (exists) continue;
      const who = String(p.full_name || p.name || '').trim() || 'Khách hàng';
      await adminNoticeCollection().insertOne({
        type: 'consultation_prescription',
        title: 'Đơn tư vấn thuốc mới',
        message: `${who} vừa gửi đơn tư vấn thuốc.`,
        createdAt: p.createdAt || new Date(),
        link: '/admin/consultation-prescription',
        meta: { prescriptionId: pid },
        roles: ['admin'],
        resolved: false,
      });
      added += 1;
    }
    if (added) console.log(`[backfill] admin_notice: đã thêm ${added} thông báo đơn tư vấn thuốc (đơn pending cũ).`);
  } catch (e) {
    console.warn('[backfill] prescription admin_notice:', e?.message || e);
  }
}

/** Thông báo cho dược sĩ (vd. câu hỏi tư vấn bệnh từ user) — đọc qua GET /api/admin/notifications?role=pharmacist. */
const pharmacistNoticeCollection = () => mongoose.connection.db.collection('pharmacist_notice');
const noticesCollection = () => mongoose.connection.db.collection('notice');

/** Bộ lọc tìm document sản phẩm theo _id (string / ObjectId / $oid JSON) */
function productIdFiltersFromRaw(rawId) {
  const idStr = String(rawId);
  const filters = [{ _id: idStr }];
  if (mongoose.Types.ObjectId.isValid(idStr)) {
    filters.push({ _id: new mongoose.Types.ObjectId(idStr) });
  }
  filters.push({ '_id.$oid': idStr });
  return filters;
}

function getProductStockFromDoc(p) {
  if (!p) return 0;
  if (p.stock === undefined || p.stock === null) return 99;
  const n = Number(p.stock);
  return Number.isFinite(n) ? n : 0;
}

/** Kiểm tra đủ tồn kho trước khi tạo đơn (không cho âm kho khi đặt). */
async function assertInventoryAvailableForOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: 'Đơn hàng chưa có sản phẩm.' };
  }
  for (const it of items) {
    const rawId = it.productId || it.product_id || it._id;
    const qty = Number(it.quantity) || 1;
    if (!rawId || qty <= 0) continue;
    const idStr = String(rawId);
    const filters = productIdFiltersFromRaw(idStr);
    const p = await productsCollection().findOne({ $or: filters }, { projection: { stock: 1, name: 1 } });
    const available = getProductStockFromDoc(p);
    if (available < qty) {
      const name = (p && p.name) || it.productName || it.sku || idStr;
      return {
        ok: false,
        message: `Sản phẩm "${String(name).slice(0, 100)}" chỉ còn ${available} trong kho, không đủ ${qty} sản phẩm.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Hoàn lại tồn kho + giảm lượt bán khi huỷ đơn / hoàn đơn (sold không âm).
 */
async function restoreInventoryForOrderLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  for (const it of items) {
    const rawId = it.productId || it.product_id || it._id;
    const qty = Number(it.quantity) || 1;
    if (!rawId || qty <= 0) continue;
    const idStr = String(rawId);
    const filters = productIdFiltersFromRaw(idStr);
    await productsCollection().updateOne(
      { $or: filters },
      [
        {
          $set: {
            stock: { $add: [{ $ifNull: ['$stock', 0] }, qty] },
            sold: { $max: [0, { $subtract: [{ $ifNull: ['$sold', 0] }, qty] }] },
          },
        },
      ],
    );
  }
}
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

/**
 * Gắn categoryPath (tên cấp cha → lá) cho danh sách sản phẩm admin — đọc trực tiếp từ collection categories,
 * chuẩn hoá id giống GET /api/categories (tránh lệch ObjectId / BSON khi chỉ resolve phía Angular).
 */
async function enrichAdminProductsCategoryPaths(productDocs) {
  if (!Array.isArray(productDocs) || productDocs.length === 0) return productDocs;
  const cats = await categoriesCollection().find({}).toArray();
  const catById = Object.create(null);
  for (const c of cats) {
    const id = getId(c);
    if (!id) continue;
    const parentRaw = c.parentId;
    const parentId =
      parentRaw == null || parentRaw === ''
        ? null
        : getId({ _id: parentRaw }) || getId(parentRaw);
    catById[String(id)] = { name: c.name || '', parentId: parentId ? String(parentId) : null };
  }
  const pathFor = (cidRaw) => {
    const idStr = cidRaw == null ? '' : String(cidRaw);
    if (!idStr || !catById[idStr]) return [];
    const path = [];
    let cur = catById[idStr];
    let guard = 0;
    while (cur && guard++ < 32) {
      path.unshift(cur.name);
      cur = cur.parentId ? catById[cur.parentId] : null;
    }
    return path;
  };
  return productDocs.map((p) => {
    const raw = p.categoryId;
    const cid =
      raw == null || raw === ''
        ? null
        : getId(raw) || getId({ _id: raw });
    const cidStr = cid ? String(cid) : '';
    const categoryPath = pathFor(cidStr);
    return {
      ...p,
      categoryPath,
      categoryName: categoryPath.length ? categoryPath.join(' > ') : '',
    };
  });
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

/** Còn câu hỏi sản phẩm chưa trả lời / chờ xử lý (khớp logic stats admin). */
function consultationProductHasUnanswered(p) {
  const qs = p.questions || [];
  return qs.some((q) => {
    if (q.status === 'assigned' && !q.answer) return true;
    if (q.status === 'answered') return false;
    return q.status === 'pending' || q.status === 'unreviewed' || !q.answer;
  });
}

/**
 * Query role: `admin` | `pharmacist` (mặc định admin nếu thiếu/sai).
 * - Đơn hàng (order_pending): chỉ admin.
 * - Tư vấn bệnh (consultation_disease): chỉ dược sĩ — admin không bao giờ nhận trên API này.
 */
function parseNotificationsAccountRole(req) {
  const r = String(req.query.role || req.query.accountRole || '').trim().toLowerCase();
  return r === 'pharmacist' ? 'pharmacist' : 'admin';
}

/** Tư vấn bệnh (admin API + thông báo) chỉ dược sĩ — query `role=pharmacist` giống GET /api/admin/notifications. */
function assertConsultationDiseasePharmacistOnly(req, res) {
  if (parseNotificationsAccountRole(req) !== 'pharmacist') {
    res.status(403).json({
      success: false,
      message: 'Tư vấn bệnh chỉ dành cho tài khoản dược sĩ.',
    });
    return false;
  }
  return true;
}

function adminNoticeVisibleForRole(doc, accountRole) {
  const roles = doc.roles;
  if (!Array.isArray(roles) || roles.length === 0) {
    return accountRole === 'admin';
  }
  const set = new Set(roles.map((x) => String(x).toLowerCase()));
  return set.has(accountRole);
}

/**
 * Thông báo trong `pharmacist_notice`.
 * - `consultation_disease`: luôn gửi cho mọi tài khoản dược sĩ (một bản ghi chung, không gán theo pharmacistId).
 */
function pharmacistNoticeVisibleForRole(doc, accountRole) {
  if (accountRole !== 'pharmacist') return false;
  if (String(doc?.type || '') === 'consultation_disease') return true;
  const roles = doc.roles;
  if (!Array.isArray(roles) || roles.length === 0) {
    return true;
  }
  const set = new Set(roles.map((x) => String(x).toLowerCase()));
  return set.has(accountRole);
}

function pharmacistIdsMatchForNotice(a, b) {
  const sa = String(a ?? '').trim();
  const sb = String(b ?? '').trim();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  if (mongoose.Types.ObjectId.isValid(sa) && mongoose.Types.ObjectId.isValid(sb)) {
    try {
      return new mongoose.Types.ObjectId(sa).equals(new mongoose.Types.ObjectId(sb));
    } catch (_) {
      /* ignore */
    }
  }
  return false;
}

/** Chỉ dược sĩ đã trả lời (id trong DB hoặc bản ghi cũ khớp tên từ Pharmacist lookup) mới được PATCH sửa. */
function diseaseQuestionEditableByRequestingPharmacist(question, pidRaw, requesterNameFromDb) {
  const hadAnswer =
    question?.answer != null && String(question.answer).trim() !== '';
  if (!hadAnswer) return true;
  const reqId = String(pidRaw ?? '').trim();
  const storedAuthorId = String(
    question.answeredByPharmacistId ?? question.answered_by_pharmacist_id ?? ''
  ).trim();
  if (storedAuthorId && reqId) {
    return pharmacistIdsMatchForNotice(storedAuthorId, reqId);
  }
  const storedName = normalizeText(String(question.answeredBy ?? ''));
  const requesterName = normalizeText(String(requesterNameFromDb ?? ''));
  if (storedName && requesterName && storedName === requesterName) return true;
  return false;
}

/** Phân công đơn thuốc — chỉ dược sĩ khớp `pharmacistId` hoặc email (query từ client). */
function pharmacistPrescriptionAssignmentNoticeVisibleForRequest(doc, req) {
  const meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
  const assignedId = String(meta.pharmacistId || meta.pharmacist_id || '').trim();
  const qId = String(req.query.pharmacistId || '').trim();
  if (qId && pharmacistIdsMatchForNotice(assignedId, qId)) return true;
  const qEmail = String(req.query.pharmacistEmail || '').trim().toLowerCase();
  const metaEmail = String(meta.pharmacistEmail || meta.email || '').trim().toLowerCase();
  if (qEmail && metaEmail && qEmail === metaEmail) return true;
  const qName = normalizeText(String(req.query.pharmacistName || ''));
  const metaName = normalizeText(String(meta.pharmacistName || ''));
  return !!(qName && metaName && qName === metaName);
}

/** Phân công tư vấn sản phẩm — chỉ dược sĩ khớp `pharmacistId` hoặc email (query từ client). */
function pharmacistProductAssignmentNoticeVisibleForRequest(doc, req) {
  const meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
  const assignedId = String(
    meta.pharmacistId || meta.pharmacist_id || meta.assignedPharmacistId || meta.assigned_pharmacist_id || ''
  ).trim();
  const qId = String(req.query.pharmacistId || '').trim();
  if (qId && pharmacistIdsMatchForNotice(assignedId, qId)) return true;

  const qEmail = String(req.query.pharmacistEmail || '').trim().toLowerCase();
  const metaEmail = String(
    meta.pharmacistEmail || meta.email || meta.assignedPharmacistEmail || meta.assigned_pharmacist_email || ''
  )
    .trim()
    .toLowerCase();
  if (qEmail && metaEmail && qEmail === metaEmail) return true;

  const qName = normalizeText(String(req.query.pharmacistName || ''));
  const metaName = normalizeText(
    String(meta.pharmacistName || meta.assignedPharmacistName || meta.assigned_pharmacist_name || '')
  );
  return !!(qName && metaName && qName === metaName);
}

function pharmacistNoticeDocVisibleInNotifications(doc, accountRole, req) {
  if (accountRole !== 'pharmacist') return false;
  const t = String(doc?.type || '');
  if (t === 'consultation_disease') return pharmacistNoticeVisibleForRole(doc, accountRole);
  if (t === 'consultation_prescription_assigned' || t === 'consultation_prescription_reminder') {
    return pharmacistPrescriptionAssignmentNoticeVisibleForRequest(doc, req);
  }
  if (t === 'consultation_product_assigned') {
    return pharmacistProductAssignmentNoticeVisibleForRequest(doc, req);
  }
  return false;
}

/** Mốc bắt đầu lần «đang tư vấn» hiện tại (phân công / chuyển waiting) — dùng cho nhắc nhở sau 2 giờ. */
function getPrescriptionWaitingSinceDateFromDoc(doc) {
  if (!doc) return null;
  if (String(doc.status || '').trim().toLowerCase() !== 'waiting') return null;
  const cur = doc.current_status && typeof doc.current_status === 'object' ? doc.current_status : null;
  if (cur && String(cur.status || '').trim().toLowerCase() === 'waiting' && cur.changedAt) {
    const d = new Date(cur.changedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const h = Array.isArray(doc.status_history) ? doc.status_history : [];
  for (let i = h.length - 1; i >= 0; i -= 1) {
    const e = h[i];
    if (String(e?.status || '').trim().toLowerCase() === 'waiting' && e?.changedAt) {
      const d = new Date(e.changedAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const fb = doc.updatedAt || doc.createdAt;
  if (fb) {
    const d = new Date(fb);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Đơn thuốc có `pharmacist_id` khớp session dược sĩ (id / email / tên trên đơn sau khi phân công). */
function prescriptionConsultVisibleForPharmacistQuery(item, pharmacistId, pharmacistEmail, pharmacistName) {
  const assignedId = String(item.pharmacist_id || item.pharmacistId || '').trim();
  if (pharmacistId && pharmacistIdsMatchForNotice(assignedId, pharmacistId)) return true;
  const docName = normalizeText(String(item.pharmacistName || ''));
  const qName = normalizeText(pharmacistName || '');
  if (qName && docName && qName === docName) return true;
  const docEmail = String(item.pharmacistEmail || item.pharmacist_email || '').trim().toLowerCase();
  if (pharmacistEmail && docEmail && pharmacistEmail === docEmail) return true;
  return false;
}

/**
 * Đánh dấu thông báo tư vấn bệnh đã xử lý (vẫn giữ bản ghi — UI hiển thị nền xanh + tag).
 * `consultedByName`: tên dược sĩ trả lời (hiển thị "Đã tư vấn bởi Dược sĩ …").
 */
async function markPharmacistDiseaseNoticesResolved(sku, questionId, consultedByName) {
  const skuStr = String(sku ?? '').trim();
  const qId = String(questionId ?? '').trim();
  if (!skuStr || !qId) return;
  const skuCand = getDiseaseSkuLookupCandidates(skuStr);
  if (!skuCand.length) return;

  const qOr = [{ 'meta.questionId': qId }];
  if (mongoose.Types.ObjectId.isValid(qId)) {
    try {
      const oid = new mongoose.Types.ObjectId(qId);
      if (String(oid) === qId) {
        qOr.push({ 'meta.questionId': oid });
      }
    } catch (_) {
      /* ignore */
    }
  }

  const setDoc = { resolved: true, resolvedAt: new Date() };
  const byName = String(consultedByName ?? '').trim();
  if (byName) setDoc.consultedByName = byName;

  try {
    await pharmacistNoticeCollection().updateMany(
      {
        type: 'consultation_disease',
        resolved: { $ne: true },
        'meta.sku': { $in: skuCand },
        $or: qOr,
      },
      { $set: setDoc }
    );
  } catch (e) {
    console.warn('[pharmacist_notice] mark resolved:', e?.message || e);
  }
}

/**
 * Cập nhật `consultedByName` trên mọi thông báo khớp sku/câu hỏi (kể cả đã resolved).
 * `markPharmacistDiseaseNoticesResolved` chỉ sửa bản ghi chưa resolved — hàm này bù khi sửa trả lời hoặc tên thật lưu sau.
 */
async function syncPharmacistDiseaseNoticeConsultedByName(sku, questionId, consultedByName) {
  const byName = String(consultedByName ?? '').trim();
  if (!byName || byName === 'Dược sĩ' || byName === 'Admin') return;
  const skuStr = String(sku ?? '').trim();
  const qId = String(questionId ?? '').trim();
  if (!skuStr || !qId) return;
  const skuCand = getDiseaseSkuLookupCandidates(skuStr);
  if (!skuCand.length) return;
  const qOr = [{ 'meta.questionId': qId }];
  if (mongoose.Types.ObjectId.isValid(qId)) {
    try {
      const oid = new mongoose.Types.ObjectId(qId);
      if (String(oid) === qId) {
        qOr.push({ 'meta.questionId': oid });
      }
    } catch (_) {
      /* ignore */
    }
  }
  try {
    await pharmacistNoticeCollection().updateMany(
      {
        type: 'consultation_disease',
        'meta.sku': { $in: skuCand },
        $or: qOr,
      },
      { $set: { consultedByName: byName } }
    );
  } catch (e) {
    console.warn('[pharmacist_notice] sync consultedByName:', e?.message || e);
  }
}

/** Đơn đã giao / kết thúc — thông báo "chờ xác nhận" coi là đã giải quyết (không cần bấm Đã xử lý). */
const ORDER_PENDING_AUTO_RESOLVED_STATUSES = new Set([
  // Admin đã xác nhận / chuyển sang giao — coi thông báo “chờ xác nhận” là đã xử lý
  'confirmed',
  'shipping',
  'delivered',
  'unreview',
  'reviewed',
  'completed',
  'received',
  'cancelled',
  'refunded',
  'returned',
  'rejected',
  'refund_rejected',
  'processing_return',
  'returning',
]);

function extractOrderMongoIdFromAdminNotice(doc) {
  const m = doc?.meta?.order_mongo_id;
  if (m != null && String(m).trim()) return String(m).trim();
  const link = String(doc?.link || '');
  const match = link.match(/\/admin\/orders\/detail\/([^/?#]+)/);
  return match ? match[1].trim() : '';
}

function isOrderPendingAutoResolvedStatus(status) {
  return ORDER_PENDING_AUTO_RESOLVED_STATUSES.has(String(status || '').trim().toLowerCase());
}

async function fetchOrderStatusesForNoticePending(idStrs) {
  const map = new Map();
  if (!Array.isArray(idStrs) || idStrs.length === 0) return map;
  const or = [];
  const seen = new Set();
  for (const raw of idStrs) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    or.push({ _id: id });
    if (mongoose.Types.ObjectId.isValid(id)) {
      try {
        or.push({ _id: new mongoose.Types.ObjectId(id) });
      } catch (_) {
        /* ignore */
      }
    }
  }
  if (!or.length) return map;
  const docs = await ordersCollection().find({ $or: or }).project({ status: 1 }).toArray();
  for (const o of docs) {
    const sid = getId(o);
    if (sid) map.set(String(sid), o.status);
  }
  return map;
}

/** prescriptionId -> thông tin phân công (chuông admin: đơn tư vấn thuốc đã gán dược sĩ). */
async function fetchPrescriptionPharmacistAssignmentMapByPrescriptionIds(prescriptionIds) {
  const map = new Map();
  const unique = [...new Set((prescriptionIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!unique.length) return map;
  try {
    // Đọc trực tiếp collection (tránh lệch schema Mongoose với dữ liệu seed/JSON).
    const col = mongoose.connection.db.collection('consultations_prescription');
    const docs = await col
      .find({
        $or: [{ prescriptionId: { $in: unique } }, { id: { $in: unique } }],
      })
      .project({ prescriptionId: 1, id: 1, pharmacist_id: 1, pharmacistId: 1, pharmacistName: 1 })
      .toArray();
    for (const d of docs) {
      const pid = String(d.prescriptionId ?? d.id ?? '').trim();
      if (!pid) continue;
      const phId = String(d.pharmacist_id ?? d.pharmacistId ?? '').trim();
      const phName = String(d.pharmacistName ?? '').trim();
      if (!phId && !phName) continue;
      const entry = { pharmacistId: phId, pharmacistName: phName || 'Dược sĩ' };
      map.set(pid, entry);
    }
  } catch (e) {
    console.warn('[notifications] prescription assignment map:', e?.message || e);
  }
  return map;
}

/** prescriptionId -> trạng thái tư vấn hiện tại của dược sĩ. */
async function fetchPrescriptionConsultStatusMapByPrescriptionIds(prescriptionIds) {
  const map = new Map();
  const unique = [...new Set((prescriptionIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!unique.length) return map;
  try {
    const col = mongoose.connection.db.collection('consultations_prescription');
    const docs = await col
      .find({
        $or: [{ prescriptionId: { $in: unique } }, { id: { $in: unique } }],
      })
      .project({ prescriptionId: 1, id: 1, status: 1 })
      .toArray();
    for (const d of docs) {
      const pid = String(d.prescriptionId ?? d.id ?? '').trim();
      if (!pid) continue;
      const st = String(d.status ?? '').trim().toLowerCase();
      if (!st) continue;
      map.set(pid, st);
    }
  } catch (e) {
    console.warn('[notifications] prescription consult status map:', e?.message || e);
  }
  return map;
}

/** Một lần khi chạy server: ghi meta phân công lên admin_notice theo đúng consultations_prescription (dữ liệu cũ / seed). */
async function backfillPrescriptionNoticeAssignmentMetaFromDB() {
  try {
    const notices = await adminNoticeCollection()
      .find({ type: 'consultation_prescription', resolved: { $ne: true } })
      .project({ meta: 1 })
      .toArray();
    let updated = 0;
    for (const doc of notices) {
      const m = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
      const pCode = String(m.prescriptionId || m.prescription_id || '').trim();
      if (!pCode) continue;
      if (String(m.assignedPharmacistName || '').trim() || String(m.assignedPharmacistId || '').trim()) {
        continue;
      }
      const col = mongoose.connection.db.collection('consultations_prescription');
      const row = await col.findOne({
        $or: [{ prescriptionId: pCode }, { id: pCode }],
      });
      if (!row) continue;
      const phId = String(row.pharmacist_id ?? row.pharmacistId ?? '').trim();
      const phName = String(row.pharmacistName ?? '').trim();
      if (!phId && !phName) continue;
      await syncPrescriptionAdminNoticePharmacistAssignment(pCode, phId || String(row._id || 'assigned'), phName);
      updated += 1;
    }
    if (updated) {
      console.log(`[backfill] admin_notice: đã đồng bộ meta phân công dược sĩ cho ${updated} thông báo đơn thuốc.`);
    }
  } catch (e) {
    console.warn('[backfill] prescription notice assignment meta:', e?.message || e);
  }
}

/** Ghi vào admin_notice khi admin phân công — GET chuông không phụ thuộc join lệch collection. */
async function syncPrescriptionAdminNoticePharmacistAssignment(prescriptionCode, pharmacistIdRaw, pharmacistNameFromBody) {
  const code = String(prescriptionCode || '').trim();
  const phId = String(pharmacistIdRaw || '').trim();
  if (!code || !phId) return;
  let displayName = String(pharmacistNameFromBody || '').trim();
  if (!displayName) {
    const pq = [{ _id: String(phId) }];
    if (mongoose.Types.ObjectId.isValid(String(phId))) {
      try {
        pq.push({ _id: new mongoose.Types.ObjectId(String(phId)) });
      } catch (_) {
        /* ignore */
      }
    }
    try {
      const ph = await Pharmacist.findOne({ $or: pq }).lean();
      displayName = String(ph?.pharmacistName || '').trim();
    } catch (_) {
      /* ignore */
    }
  }
  if (!displayName) displayName = 'Dược sĩ';
  try {
    await adminNoticeCollection().updateMany(
      {
        type: 'consultation_prescription',
        resolved: { $ne: true },
        $or: [{ 'meta.prescriptionId': code }, { 'meta.prescription_id': code }],
      },
      {
        $set: {
          'meta.assignedPharmacistId': phId,
          'meta.assignedPharmacistName': displayName,
        },
      }
    );
  } catch (e) {
    console.warn('[admin_notice] sync prescription assignment:', e?.message || e);
  }
}

async function clearPrescriptionAdminNoticePharmacistAssignmentMeta(prescriptionCode) {
  const code = String(prescriptionCode || '').trim();
  if (!code) return;
  try {
    await adminNoticeCollection().updateMany(
      {
        type: 'consultation_prescription',
        $or: [{ 'meta.prescriptionId': code }, { 'meta.prescription_id': code }],
      },
      { $unset: { 'meta.assignedPharmacistId': '', 'meta.assignedPharmacistName': '' } }
    );
  } catch (e) {
    console.warn('[admin_notice] clear prescription assignment meta:', e?.message || e);
  }
}

/** Đồng bộ trạng thái đơn tư vấn thuốc lên thông báo phân công (dược sĩ) — UI chuông theo advised / unreachable / consultation_failed. */
async function syncPharmacistPrescriptionAssignedNoticeStatus(prescriptionCode, status) {
  const code = String(prescriptionCode || '').trim();
  const st = String(status || '').trim().toLowerCase();
  if (!code || !st) return;
  try {
    await pharmacistNoticeCollection().updateMany(
      {
        type: 'consultation_prescription_assigned',
        $or: [{ 'meta.prescriptionId': code }, { 'meta.prescription_id': code }],
      },
      { $set: { 'meta.prescriptionStatus': st, updatedAt: new Date() } }
    );
  } catch (e) {
    console.warn('[pharmacist_notice] sync prescription status:', e?.message || e);
  }
}

/**
 * Xóa khỏi DB các admin_notice đơn thuốc (chưa resolved) mà meta.prescriptionId không còn trong consultations_prescription.
 * Trả về mảng đã lọc (dùng cho GET notifications).
 */
async function deleteOrphanPrescriptionAdminNoticesInList(noticeDocs) {
  if (!Array.isArray(noticeDocs) || !noticeDocs.length) return noticeDocs;
  const presc = noticeDocs.filter(
    (d) => String(d.type || '') === 'consultation_prescription' && d.resolved !== true
  );
  if (!presc.length) return noticeDocs;

  const pids = [
    ...new Set(
      presc
        .map((d) => {
          const m = d.meta && typeof d.meta === 'object' ? d.meta : {};
          return String(m.prescriptionId || m.prescription_id || '').trim();
        })
        .filter(Boolean)
    ),
  ];
  if (!pids.length) return noticeDocs;

  try {
    const col = mongoose.connection.db.collection('consultations_prescription');
    const existingRows = await col
      .find({ $or: [{ prescriptionId: { $in: pids } }, { id: { $in: pids } }] })
      .project({ prescriptionId: 1, id: 1 })
      .toArray();
    const existing = new Set();
    for (const e of existingRows) {
      const k = String(e.prescriptionId || e.id || '').trim();
      if (k) existing.add(k);
    }

    const orphanIds = [];
    for (const d of presc) {
      const m = d.meta && typeof d.meta === 'object' ? d.meta : {};
      const pid = String(m.prescriptionId || m.prescription_id || '').trim();
      if (!pid || existing.has(pid)) continue;
      if (d._id != null) orphanIds.push(d._id);
    }
    if (orphanIds.length) {
      await adminNoticeCollection().deleteMany({
        _id: { $in: orphanIds },
        type: 'consultation_prescription',
      });
      console.log(
        `[cleanup] admin_notice: đã xóa ${orphanIds.length} thông báo đơn thuốc (đơn không còn trong consultations_prescription).`
      );
    }

    const dead = new Set(orphanIds.map((id) => (id && id.toString ? id.toString() : String(id))));
    return noticeDocs.filter((d) => {
      if (String(d.type || '') !== 'consultation_prescription') return true;
      const idStr = d._id && d._id.toString ? d._id.toString() : String(d._id || '');
      return !dead.has(idStr);
    });
  } catch (e) {
    console.warn('[cleanup] orphan prescription admin_notice:', e?.message || e);
    return noticeDocs;
  }
}

async function deleteAllOrphanPrescriptionAdminNoticesGlobally() {
  try {
    const all = await adminNoticeCollection()
      .find({ type: 'consultation_prescription', resolved: { $ne: true } })
      .toArray();
    await deleteOrphanPrescriptionAdminNoticesInList(all);
  } catch (e) {
    console.warn('[cleanup] global orphan prescription notices:', e?.message || e);
  }
}

/**
 * Xóa khỏi DB các admin_notice tư vấn sản phẩm mà câu hỏi gốc không còn trong consultations_product.
 * Trả về mảng đã lọc (dùng cho GET notifications).
 */
async function deleteOrphanProductAdminNoticesInList(noticeDocs) {
  if (!Array.isArray(noticeDocs) || !noticeDocs.length) return noticeDocs;
  const productNotices = noticeDocs.filter(
    (d) => String(d.type || '') === 'consultation_product'
  );
  if (!productNotices.length) return noticeDocs;

  const skuList = [
    ...new Set(
      productNotices
        .map((d) => {
          const m = d.meta && typeof d.meta === 'object' ? d.meta : {};
          return String(m.sku || '').trim();
        })
        .filter(Boolean)
    ),
  ];

  // Notice thiếu sku thì coi như orphan để dọn dữ liệu rác cũ.
  const orphanIds = [];
  for (const d of productNotices) {
    const m = d.meta && typeof d.meta === 'object' ? d.meta : {};
    const sku = String(m.sku || '').trim();
    if (!sku && d._id != null) orphanIds.push(d._id);
  }
  if (!skuList.length) {
    if (orphanIds.length) {
      await adminNoticeCollection().deleteMany({
        _id: { $in: orphanIds },
        type: 'consultation_product',
      });
    }
    const deadOnly = new Set(orphanIds.map((id) => (id && id.toString ? id.toString() : String(id))));
    return noticeDocs.filter((d) => {
      const idStr = d._id && d._id.toString ? d._id.toString() : String(d._id || '');
      return !deadOnly.has(idStr);
    });
  }

  try {
    const rows = await ConsultationProductModel.find({ sku: { $in: skuList } })
      .select({ sku: 1, questions: 1 })
      .lean();

    const questionKeys = new Set();
    const skuWithAnyQuestion = new Set();
    for (const row of rows) {
      const sku = String(row?.sku || '').trim();
      if (!sku) continue;
      const questions = Array.isArray(row?.questions) ? row.questions : [];
      if (questions.length) skuWithAnyQuestion.add(sku);
      for (const q of questions) {
        const qid = String(q?.id || q?._id || '').trim();
        if (!qid) continue;
        questionKeys.add(`${sku}::${qid}`);
      }
    }

    for (const d of productNotices) {
      const m = d.meta && typeof d.meta === 'object' ? d.meta : {};
      const sku = String(m.sku || '').trim();
      const qid = String(m.questionId || m.question_id || '').trim();
      if (!sku) continue;

      // Có questionId thì đối chiếu chính xác theo sku+questionId.
      if (qid) {
        if (!questionKeys.has(`${sku}::${qid}`) && d._id != null) orphanIds.push(d._id);
        continue;
      }
      // Legacy notice thiếu questionId: nếu sku không còn câu hỏi nào thì dọn.
      if (!skuWithAnyQuestion.has(sku) && d._id != null) orphanIds.push(d._id);
    }

    if (orphanIds.length) {
      await adminNoticeCollection().deleteMany({
        _id: { $in: orphanIds },
        type: 'consultation_product',
      });
      console.log(
        `[cleanup] admin_notice: đã xóa ${orphanIds.length} thông báo tư vấn sản phẩm mồ côi (câu hỏi không còn trong consultations_product).`
      );
    }

    const dead = new Set(orphanIds.map((id) => (id && id.toString ? id.toString() : String(id))));
    return noticeDocs.filter((d) => {
      if (String(d.type || '') !== 'consultation_product') return true;
      const idStr = d._id && d._id.toString ? d._id.toString() : String(d._id || '');
      return !dead.has(idStr);
    });
  } catch (e) {
    console.warn('[cleanup] orphan product admin_notice:', e?.message || e);
    return noticeDocs;
  }
}

// GET /api/admin/notifications - DB admin_notice + đơn trả hàng + tư vấn (đơn chờ từ admin_notice khi đặt hàng)
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 50);
    const scanCap = Math.min(300, Math.max(limit * 15, limit));
    const accountRole = parseNotificationsAccountRole(req);

    // Tư vấn bệnh: giữ cả thông báo đã trả lời (resolved) để drawer tab vẫn hiện + nền xanh / tag.
    const pharmacistDiseaseNoticeQuery =
      accountRole === 'pharmacist'
        ? pharmacistNoticeCollection()
            .find({
              type: {
                $in: [
                  'consultation_disease',
                  'consultation_prescription_assigned',
                  'consultation_prescription_reminder',
                  'consultation_product_assigned'
                ],
              },
            })
            .sort({ createdAt: -1 })
            .limit(120)
            .toArray()
        : Promise.resolve([]);

    // Đơn tư vấn thuốc: chỉ đọc từ admin_notice (POST /api/prescriptions ghi vào đó), không tổng hợp từ consultations_prescription.
    const [adminNoticeDocsRaw, returnOrders, consultProdRaw, rawPharmacistDiseaseNoticeDocs] = await Promise.all([
      adminNoticeCollection()
        .find({})
        .sort({ createdAt: -1 })
        .limit(Math.min(100, limit * 3))
        .toArray(),
      ordersCollection()
        .find({ status: { $in: ['processing_return', 'returning'] } })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(limit)
        .toArray(),
      ConsultationProductModel.find({})
        .sort({ updatedAt: -1 })
        .limit(scanCap)
        .lean(),
      pharmacistDiseaseNoticeQuery,
    ]);

    let adminNoticeDocs = adminNoticeDocsRaw;
    if (accountRole === 'admin') {
      adminNoticeDocs = await deleteOrphanPrescriptionAdminNoticesInList(adminNoticeDocs);
      adminNoticeDocs = await deleteOrphanProductAdminNoticesInList(adminNoticeDocs);
    }

    let pharmacistDiseaseNoticeDocs = rawPharmacistDiseaseNoticeDocs;
    if (
      accountRole === 'pharmacist' &&
      Array.isArray(pharmacistDiseaseNoticeDocs) &&
      pharmacistDiseaseNoticeDocs.length
    ) {
      pharmacistDiseaseNoticeDocs = await Promise.all(
        pharmacistDiseaseNoticeDocs.map((d) =>
          String(d.type || '') === 'consultation_disease'
            ? enrichPharmacistDiseaseNoticeConsultedBy(d)
            : Promise.resolve(d)
        )
      );
    }

    const consultProd = consultProdRaw.filter(consultationProductHasUnanswered).slice(0, limit);

    const pendingOrderMongoIds = new Set();
    for (const doc of adminNoticeDocs) {
      // Tư vấn bệnh chỉ từ collection pharmacist_notice — không hiển thị qua admin_notice (tránh lệch roles trong DB).
      if (String(doc.type || '') === 'consultation_disease') continue;
      if (String(doc.type || '') === 'order_pending' && accountRole !== 'admin') continue;
      if (!adminNoticeVisibleForRole(doc, accountRole)) continue;
      if (String(doc.type || '') !== 'order_pending') continue;
      const oid = extractOrderMongoIdFromAdminNotice(doc);
      if (oid) pendingOrderMongoIds.add(oid);
    }
    const orderStatusByMongoId = await fetchOrderStatusesForNoticePending([...pendingOrderMongoIds]);

    const prescriptionIdsForAssignment = [];
    if (accountRole === 'admin') {
      for (const d of adminNoticeDocs) {
        if (String(d.type || '') !== 'consultation_prescription') continue;
        const m = d.meta && typeof d.meta === 'object' ? d.meta : {};
        const pid = String(m.prescriptionId || m.prescription_id || '').trim();
        if (pid) prescriptionIdsForAssignment.push(pid);
      }
    }
    const [prescriptionAssignmentMap, prescriptionConsultStatusMap] =
      accountRole === 'admin' && prescriptionIdsForAssignment.length
        ? await Promise.all([
            fetchPrescriptionPharmacistAssignmentMapByPrescriptionIds(prescriptionIdsForAssignment),
            fetchPrescriptionConsultStatusMapByPrescriptionIds(prescriptionIdsForAssignment),
          ])
        : [new Map(), new Map()];

    const notifications = [];

    for (const doc of adminNoticeDocs) {
      if (String(doc.type || '') === 'consultation_disease') continue;
      // Đơn thuốc từ khách (admin_notice): chỉ admin — dược sĩ chỉ nhận thông báo khi admin phân công (pharmacist_notice).
      if (String(doc.type || '') === 'consultation_prescription') {
        if (accountRole !== 'admin') continue;
      }
      // Đơn chờ xác nhận: chỉ admin — không gửi cho dược sĩ dù document trong DB có roles lệch
      if (String(doc.type || '') === 'order_pending' && accountRole !== 'admin') continue;
      if (!adminNoticeVisibleForRole(doc, accountRole)) continue;
      const payload = {
        _id: getId(doc),
        type: doc.type || 'admin_notice',
        title: doc.title || '',
        message: doc.message || '',
        createdAt: doc.createdAt || new Date(),
        link: doc.link || '',
      };
      // Tôn trọng trạng thái resolved từ DB cho mọi loại thông báo admin_notice.
      if (doc.resolved === true) {
        payload.autoResolved = true;
      }
      if (String(doc.type || '') === 'order_pending') {
        const oid = extractOrderMongoIdFromAdminNotice(doc);
        const st = oid ? orderStatusByMongoId.get(oid) : undefined;
        if (st != null && String(st).trim() !== '') {
          payload.orderStatus = st;
        }
        if (isOrderPendingAutoResolvedStatus(st)) {
          payload.autoResolved = true;
        }
      }
      if (String(doc.type || '') === 'consultation_prescription') {
        const nm = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
        const pCode = String(nm.prescriptionId || nm.prescription_id || '').trim();
        const metaName = String(nm.assignedPharmacistName || '').trim();
        const metaPhId = String(nm.assignedPharmacistId || '').trim();
        if (metaName || metaPhId) {
          payload.prescriptionPharmacistAssigned = true;
          payload.assignedPharmacistName = metaName || 'Dược sĩ';
        } else {
          const asg = pCode ? prescriptionAssignmentMap.get(pCode) : null;
          if (asg && (asg.pharmacistId || asg.pharmacistName)) {
            payload.prescriptionPharmacistAssigned = true;
            payload.assignedPharmacistName = asg.pharmacistName;
          }
        }
        const stMeta = String(nm.prescriptionStatus || '').trim().toLowerCase();
        const stDb = pCode ? String(prescriptionConsultStatusMap.get(pCode) || '').trim().toLowerCase() : '';
        const st = stMeta || stDb;
        if (st) payload.prescriptionConsultStatus = st;
      }

      if (String(doc.type || '') === 'consultation_product') {
        const nm = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
        const asgId = String(nm.assignedPharmacistId || nm.assigned_pharmacist_id || '').trim();
        const asgName = String(nm.assignedPharmacistName || nm.assigned_pharmacist_name || '').trim();
        if (asgId) {
          payload.productPharmacistAssigned = true;
          payload.assignedPharmacistId = asgId;
          payload.assignedPharmacistName = asgName || 'Dược sĩ';
        }
      }
      notifications.push(payload);
    }

    if (accountRole === 'admin') {
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
    }

    // Fallback dữ liệu cũ:
    // Nếu collection consultations_product có câu hỏi chưa xử lý nhưng chưa có bản ghi admin_notice,
    // vẫn tạo thông báo tạm để admin không bị mất chuông cho data lịch sử.
    if (accountRole === 'admin') {
      const existingConsultProductSku = new Set(
        adminNoticeDocs
          .filter((doc) => String(doc.type || '') === 'consultation_product')
          .map((doc) => String((doc.meta && doc.meta.sku) || '').trim())
          .filter(Boolean)
      );
      consultProd.forEach((c) => {
        const sku = String(c?.sku || '').trim();
        if (!sku) return;
        if (existingConsultProductSku.has(sku)) return;
        notifications.push({
          _id: getId(c),
          type: 'consultation_product',
          title: 'Câu hỏi tư vấn sản phẩm mới',
          message: `${c.fullName || c.name || 'Khách hàng'} vừa hỏi về sản phẩm ${c.productName || ''}`.trim(),
          createdAt: c.createdAt || new Date(),
          link: '/admin/consultation-product'
        });
      });
    }

    // Tư vấn bệnh chỉ trong phạm vi dược sĩ — lưu collection pharmacist_notice khi user gửi câu hỏi.
    let pharmacistRxStatusByCode = {};
    let pharmacistProductQuestionStatusByKey = {};
    if (accountRole === 'pharmacist' && pharmacistDiseaseNoticeDocs.length) {
      const codesNeeding = [];
      const productNoticeKeys = [];
      for (const doc of pharmacistDiseaseNoticeDocs) {
        const dtype = String(doc.type || '');
        if (dtype === 'consultation_prescription_assigned') {
          const am = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
          const pcode = String(am.prescriptionId || am.prescription_id || '').trim();
          if (!pcode) continue;
          const hasSt = String(am.prescriptionStatus || '').trim();
          if (!hasSt) codesNeeding.push(pcode);
          continue;
        }
        if (dtype === 'consultation_product_assigned') {
          const am = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
          const sku = String(am.sku || '').trim();
          const qid = String(am.questionId || am.question_id || '').trim();
          if (!sku || !qid) continue;
          productNoticeKeys.push({ sku, qid });
        }
      }
      const uniqueCodes = [...new Set(codesNeeding)];
      if (uniqueCodes.length) {
        try {
          const rxCol = mongoose.connection.db.collection('consultations_prescription');
          const rxRows = await rxCol
            .find({ $or: [{ prescriptionId: { $in: uniqueCodes } }, { id: { $in: uniqueCodes } }] })
            .project({ prescriptionId: 1, id: 1, status: 1 })
            .toArray();
          for (const r of rxRows) {
            const k = String(r.prescriptionId || r.id || '').trim();
            if (k) pharmacistRxStatusByCode[k] = String(r.status || '').trim().toLowerCase();
          }
        } catch (e) {
          console.warn('[GET /api/admin/notifications] pharmacist rx status:', e?.message || e);
        }
      }

      const uniqueProductSkus = [...new Set(productNoticeKeys.map((x) => x.sku).filter(Boolean))];
      if (uniqueProductSkus.length) {
        try {
          const productRows = await ConsultationProductModel.find({ sku: { $in: uniqueProductSkus } })
            .select({ sku: 1, questions: 1 })
            .lean();
          for (const row of productRows) {
            const sku = String(row?.sku || '').trim();
            if (!sku) continue;
            const questions = Array.isArray(row?.questions) ? row.questions : [];
            for (const q of questions) {
              const qid = String(q?.id || q?._id || '').trim();
              if (!qid) continue;
              const qStatus = String(q?.status || '').trim().toLowerCase();
              if (!qStatus) continue;
              pharmacistProductQuestionStatusByKey[`${sku}::${qid}`] = qStatus;
            }
          }
        } catch (e) {
          console.warn('[GET /api/admin/notifications] pharmacist product status:', e?.message || e);
        }
      }
    }

    if (accountRole === 'pharmacist') {
      pharmacistDiseaseNoticeDocs.forEach((doc) => {
        if (!pharmacistNoticeDocVisibleInNotifications(doc, accountRole, req)) return;
        const t = String(doc.type || '');
        if (t === 'consultation_disease') {
          const meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
          const fn = meta.full_name || 'Khách hàng';
          const name = meta.productName || meta.sku || '';
          const isResolved = doc.resolved === true;
          const consultedBy = String(doc.consultedByName || '').trim();
          notifications.push({
            _id: getId(doc),
            type: 'consultation_disease',
            title: doc.title || 'Câu hỏi tư vấn bệnh mới',
            message:
              doc.message ||
              `${fn} vừa hỏi về bệnh ${name}`.trim(),
            createdAt: doc.createdAt || new Date(),
            link: doc.link || '/admin/consultation-disease',
            consultationDiseaseResolved: isResolved,
            consultedByPharmacistName: consultedBy,
          });
        } else if (t === 'consultation_prescription_assigned') {
          const am = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
          const pcode = String(am.prescriptionId || am.prescription_id || '').trim();
          const rxStatus =
            String(am.prescriptionStatus || '').trim().toLowerCase() ||
            (pcode ? pharmacistRxStatusByCode[pcode] || '' : '');
          const fallbackAssign = pcode
            ? `Bạn vừa được phân công tư vấn đơn thuốc ${pcode}`
            : 'Bạn vừa được phân công tư vấn đơn thuốc';
          const line = String(doc.title || doc.message || fallbackAssign).trim() || fallbackAssign;
          const sub = String(doc.message || '').trim();
          const basePath = '/admin/consultation-prescription';
          let nlink = String(doc.link || '').trim() || basePath;
          if (pcode && !nlink.includes('prescriptionId=')) {
            nlink = `${basePath}?prescriptionId=${encodeURIComponent(pcode)}`;
          }
          notifications.push({
            _id: getId(doc),
            type: 'consultation_prescription_assigned',
            title: line,
            message: sub && sub !== line ? sub : '',
            createdAt: doc.createdAt || new Date(),
            link: nlink,
            prescriptionConsultStatus: rxStatus,
          });
        } else if (t === 'consultation_prescription_reminder') {
          const am = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
          const pcode = String(am.prescriptionId || am.prescription_id || '').trim();
          const fallbackRemind = pcode
            ? `Nhắc nhở: đơn thuốc ${pcode} chưa được cập nhật trạng thái tư vấn`
            : 'Bạn có nhắc nhở: đơn thuốc đã phân công chưa được cập nhật trạng thái tư vấn';
          const line = String(doc.title || '').trim() || fallbackRemind;
          const sub = String(doc.message || '').trim();
          const basePath = '/admin/consultation-prescription';
          let nlink = String(doc.link || '').trim() || basePath;
          if (pcode && !nlink.includes('prescriptionId=')) {
            nlink = `${basePath}?prescriptionId=${encodeURIComponent(pcode)}`;
          }
          notifications.push({
            _id: getId(doc),
            type: 'consultation_prescription_reminder',
            title: line,
            message: sub && sub !== line ? sub : '',
            createdAt: doc.createdAt || new Date(),
            link: nlink,
          });
        } else if (t === 'consultation_product_assigned') {
          const am = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
          const sku = String(am.sku || '').trim();
          const productName = String(am.productName || '').trim();
          const questionId = String(am.questionId || am.question_id || '').trim();
          const questionStatusFromMeta = String(am.questionStatus || am.status || '').trim().toLowerCase();
          const questionStatusFromDb =
            sku && questionId ? String(pharmacistProductQuestionStatusByKey[`${sku}::${questionId}`] || '').trim().toLowerCase() : '';
          const productConsultStatus = questionStatusFromMeta || questionStatusFromDb;
          const assignedPharmacistId = String(
            am.pharmacistId || am.pharmacist_id || am.assignedPharmacistId || ''
          ).trim();
          const assignedPharmacistName = String(
            am.pharmacistName || am.assignedPharmacistName || ''
          ).trim();

          const fallbackTitle = sku
            ? `Bạn vừa được phân công tư vấn sản phẩm (${sku})`
            : 'Bạn vừa được phân công tư vấn sản phẩm';
          const line = String(doc.title || '').trim() || fallbackTitle;
          const sub = String(doc.message || '').trim();

          let nlink = String(doc.link || '').trim() || '/admin/consultation-product';
          if (sku && !nlink.includes('sku=')) {
            nlink = `/admin/consultation-product?sku=${encodeURIComponent(sku)}`;
          }

          notifications.push({
            _id: getId(doc),
            type: 'consultation_product_assigned',
            title: line,
            message: sub && sub !== line ? sub : '',
            createdAt: doc.createdAt || new Date(),
            link: nlink,
            productPharmacistAssigned: true,
            assignedPharmacistId: assignedPharmacistId || '',
            assignedPharmacistName: assignedPharmacistName || 'Dược sĩ',
            sku,
            productName,
            questionId,
            productConsultStatus,
          });
        }
      });
    }

    notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const outLimit = accountRole === 'pharmacist' ? Math.max(limit, 100) : limit;
    res.json({
      success: true,
      data: notifications.slice(0, outLimit)
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
      icon: typeof c.icon === 'string' ? c.icon : '',
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
    const parseSoldValue = (raw) => {
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      if (typeof raw === 'string') {
        const cleaned = raw.replace(/[^\d.-]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const keyword = String(req.query.keyword || '').trim();
    const categorySlug = String(req.query.categorySlug || '').trim();
    const brand = String(req.query.brand || '').trim();
    const categoryIdParam = String(req.query.categoryId || '').trim();
    const minPrice = req.query.minPrice !== undefined && req.query.minPrice !== '' ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice !== undefined && req.query.maxPrice !== '' ? Number(req.query.maxPrice) : null;
    const hasDiscount = String(req.query.hasDiscount || '').trim().toLowerCase() === 'true';
    let limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 12), 1000);
    if (hasDiscount) limit = 100000; // Mở tối đa 100k sản phẩm
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sort = String(req.query.sort || 'newest');

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
      const discountCond = {
        $or: [
          { discount: { $exists: true, $ne: 0, $ne: "0", $ne: "" } },
          { salePrice: { $exists: true, $ne: 0, $ne: "0", $ne: "" } },
          { giaKhuyenMai: { $exists: true, $ne: 0, $ne: "0", $ne: "" } },
          { originalPrice: { $exists: true, $ne: 0, $ne: "0", $ne: "" } },
          { giaGoc: { $exists: true, $ne: 0, $ne: "0", $ne: "" } },
          // Thêm check so sánh giá bàng $expr để vét nốt các trường hợp ko có field discount riêng
          { $expr: { $gt: [{ $convert: { input: "$originalPrice", to: "double", onError: 0, onNull: 0 } }, { $convert: { input: "$price", to: "double", onError: 0, onNull: 0 } }] } },
          { $expr: { $gt: [{ $convert: { input: "$giaGoc", to: "double", onError: 0, onNull: 0 } }, { $convert: { input: "$price", to: "double", onError: 0, onNull: 0 } }] } }
        ]
      };
      if (filter.$and) filter.$and.push(discountCond);
      else filter.$and = [discountCond];

      // Reset limit cao hơn ở đây nếu cần (đã làm ở trên)
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
    if (sort === 'best_seller') {
      // Sản phẩm bán chạy: sold cao xuống thấp
      sortOption = { sold: -1, _id: -1 };
    }
    if (sort === 'newest') sortOption = { _id: -1 };
    if (sort === 'discount') {
      // Bỏ $expr để không ghi đè filter.hasDiscount đã xử lý ở trên
      sortOption = { discount: -1, _id: -1 };
    }

    const [items, total] = await Promise.all([
      col.find(filter).sort(sortOption).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter)
    ]);

    if (hasDiscount) {
      console.log(`\n--- FLASH SALE DEBUG ---`);
      console.log(`[Filter]:`, JSON.stringify(filter));
      console.log(`[Found]: ${items.length} products`);
      console.log(`[Sample Discount]:`, items.length > 0 ? items[0].discount : 'N/A');
      console.log(`-------------------------\n`);
    }

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
        originalPrice: p.originalPrice || p.giaGoc || undefined,
        salePrice: p.salePrice || p.giaKhuyenMai || undefined,
        discount: p.discount,
        unit: p.unit || p.unitOfMeasure || p.donViTinh || 'Hộp',
        image: primaryImage,
        categoryId,
        slug: p.slug || id,
        brand: p.brand || '',
        country: p.country || '',
        origin: p.origin || '',
        sku: p.sku || '',
        stock: p.stock !== undefined ? p.stock : 99,
        sold: parseSoldValue(p.sold),
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
    const parseSoldValue = (raw) => {
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      if (typeof raw === 'string') {
        const cleaned = raw.replace(/[^\d.-]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };

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

    // 4. Bổ sung thông tin categoryName và categorySlug (Join với categories)
    if (product.categoryId) {
      const cId = product.categoryId._id || product.categoryId;
      const cat = await categoriesCollection().findOne({
        $or: [
          { _id: cId },
          { _id: new mongoose.Types.ObjectId(String(cId)) },
          { _id: String(cId) }
        ]
      });
      if (cat) {
        product.categoryName = cat.name;
        product.categorySlug = cat.slug;
      }
    }

    product.sold = parseSoldValue(product.sold);

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

// ================= STORE SYSTEM API =================

// GET /api/store-locations/tree - Lấy cây địa điểm (Tỉnh -> Quận -> Phường)
app.get('/api/store-locations/tree', async (req, res) => {
  try {
    // Lấy cây địa điểm trực tiếp từ collection store để chỉ trả khu vực có cửa hàng.
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

      const quans = Object.keys(byQuan)
        .sort()
        .map((ten) => ({ ten, phuongs: byQuan[ten].sort() }));
      tree.push({ tinh: String(p._id.tinh_thanh), quans });
    }

    res.json(tree);
  } catch (err) {
    console.error('[GET /api/store-locations/tree] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách địa điểm.' });
  }
});

// GET /api/stores - Lấy danh sách cửa hàng (có phân trang & lọc)
app.get('/api/stores', async (req, res) => {
  try {
    const { keyword, tinh_thanh, quan_huyen, phuong_xa, page = 1, limit = 8 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    if (keyword) {
      const esc = escapeRegExp(String(keyword));
      query.$or = [
        { ten_cua_hang: { $regex: esc, $options: 'i' } },
        { 'dia_chi.dia_chi_day_du': { $regex: esc, $options: 'i' } },
        { 'thong_tin_lien_he.so_dien_thoai': { $regex: esc, $options: 'i' } }
      ];
    }

    if (tinh_thanh && tinh_thanh !== 'Tất cả') {
      const esc = escapeRegExp(String(tinh_thanh));
      query['dia_chi.tinh_thanh'] = { $regex: `^${esc}$`, $options: 'i' };
    }
    if (quan_huyen && quan_huyen !== 'Tất cả') {
      const esc = escapeRegExp(String(quan_huyen));
      query['dia_chi.quan_huyen'] = { $regex: `^${esc}$`, $options: 'i' };
    }
    if (phuong_xa && phuong_xa !== 'Tất cả') {
      const esc = escapeRegExp(String(phuong_xa));
      query['dia_chi.phuong_xa'] = { $regex: `^${esc}$`, $options: 'i' };
    }

    const col = storeSystemCollection();
    const [items, total] = await Promise.all([
      col.find(query).skip(skip).limit(parseInt(limit)).toArray(),
      col.countDocuments(query)
    ]);

    // Map data to match frontend Model
    const mappedData = items.map(s => {
      // Handle dia_chi (string in DB -> object in Frontend)
      const dia_chi_str = s.dia_chi || '';
      const mappedDiaChi = (typeof dia_chi_str === 'string')
        ? { dia_chi_day_du: dia_chi_str }
        : dia_chi_str;

      // Handle so_dien_thoai (string in DB -> array in Frontend)
      const sdt = s.so_dien_thoai || s.phone || '';
      const sdt_array = (typeof sdt === 'string' && sdt) ? [sdt] : (Array.isArray(sdt) ? sdt : []);

      return {
        ...s,
        dia_chi: mappedDiaChi,
        thong_tin_lien_he: {
          ...s.thong_tin_lien_he,
          so_dien_thoai: sdt_array
        }
      };
    });

    res.json({
      success: true,
      data: mappedData,
      total,
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('[GET /api/stores] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách cửa hàng.' });
  }
});

// ================= HEALTH TEST API =================

// GET /api/quizzes - Lấy danh sách bài kiểm tra sức khỏe (gộp logic phân tích từ collection `results` hoặc data/results.json — không phải lịch sử user)
app.get('/api/quizzes', async (req, res) => {
  try {
    const quizzes = await quizCollection().find({}).toArray();
    let resultsDocs = [];
    try {
      resultsDocs = await resultsCollection().find({}).toArray();
    } catch (e) {
      console.warn('[GET /api/quizzes] Không đọc được collection results:', e);
    }
    let resultsFromFile = [];
    const resultsPath = path.join(__dirname, '../data/results.json');
    if (fs.existsSync(resultsPath)) {
      try {
        resultsFromFile = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        if (!Array.isArray(resultsFromFile)) resultsFromFile = [];
      } catch (e) {
        console.warn('[GET /api/quizzes] results.json không hợp lệ:', e);
      }
    }

    const pickResultConfig = (quizId) => {
      const fromDb = resultsDocs.find(
        (r) =>
          r &&
          r.disease_id === quizId &&
          Array.isArray(r.results) &&
          r.results.length > 0
      );
      if (fromDb) {
        return {
          results: fromDb.results,
          logic_type: fromDb.logic_type
        };
      }
      const fromFile = resultsFromFile.find(
        (r) =>
          r &&
          r.disease_id === quizId &&
          Array.isArray(r.results) &&
          r.results.length > 0
      );
      if (fromFile) {
        return {
          results: fromFile.results,
          logic_type: fromFile.logic_type
        };
      }
      return null;
    };

    const mergedQuizzes = quizzes.map((quiz) => {
      const cfg = pickResultConfig(quiz.quiz_id);
      if (!cfg) return quiz;
      return { ...quiz, results: cfg.results, logic_type: cfg.logic_type };
    });

    res.json(mergedQuizzes);
  } catch (err) {
    console.error('[GET /api/quizzes] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách bài thi.' });
  }
});

// POST /api/quiz-results — Lưu một lượt làm bài vào `users_result_test` (không ghi vào `results` — collection đó dành cho cấu hình phân tích)
app.post('/api/quiz-results', async (req, res) => {
  try {
    const uid = String(req.body.user_id || '').trim();
    if (!uid || uid === 'guest') {
      return res.json({ success: true, skipped: true, message: 'Không lưu lịch sử cho khách vãng lai.' });
    }
    const quiz_id = String(req.body.quiz_id || '').trim();
    const score = Number(req.body.score) || 0;
    const resultDoc = {
      user_id: uid,
      quiz_id,
      score,
      result_id: String(req.body.result_id || ''),
      result_title: String(req.body.result_title || ''),
      result_badge: String(req.body.result_badge || ''),
      recommendation: String(req.body.recommendation || ''),
      name: String(req.body.name || ''),
      province: String(req.body.province || ''),
      phone: String(req.body.phone || ''),
      createdAt: new Date().toISOString()
    };
    await ensureUsersResultTestCollection();
    await usersResultTestCollection().insertOne(resultDoc);
    res.json({ success: true, message: 'Đã lưu kết quả thành công.' });
  } catch (err) {
    console.error('[POST /api/quiz-results] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi lưu kết quả.' });
  }
});

/** Gộp lịch sử từ users_result_test và (tùy chọn) bản ghi cũ nhầm lưu trong `results` có user_id + quiz_id */
async function getQuizHistoryMerged(quiz_id, user_id, limit = 50) {
  const sort = { createdAt: -1, _id: -1 };
  const [fromDedicated, fromLegacyResults] = await Promise.all([
    usersResultTestCollection().find({ quiz_id, user_id }).sort(sort).limit(limit).toArray(),
    // Bản ghi cũ (nhầm) từng insert vào `results`: có cả quiz_id + user_id; doc cấu hình chỉ có disease_id
    resultsCollection()
      .find({ quiz_id, user_id })
      .sort(sort)
      .limit(limit)
      .toArray()
  ]);
  const seen = new Set();
  const merged = [];
  const pushDedup = (doc) => {
    const key = doc && doc._id != null ? String(doc._id) : null;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    merged.push(doc);
  };
  for (const d of fromDedicated) pushDedup(d);
  for (const d of fromLegacyResults) pushDedup(d);
  merged.sort((a, b) => {
    const ta = new Date(a.createdAt || a.created_at || 0).getTime();
    const tb = new Date(b.createdAt || b.created_at || 0).getTime();
    if (tb !== ta) return tb - ta;
    const ida = a._id && String(a._id);
    const idb = b._id && String(b._id);
    return idb.localeCompare(ida);
  });
  return merged.slice(0, limit);
}

// GET /api/quiz-history/:quiz_id?user_id= — Lịch sử theo user + bài test (bắt buộc user_id)
app.get('/api/quiz-history/:quiz_id', async (req, res) => {
  try {
    const quiz_id = String(req.params.quiz_id || '').trim();
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const history = await getQuizHistoryMerged(quiz_id, user_id, 50);
    res.json(history);
  } catch (err) {
    console.error('[GET /api/quiz-history] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải lịch sử.' });
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
    // Đọc từ collection chuẩn 'promotion_promotion_target' thông qua model PromotionTarget
    const list = await PromotionTarget.find().lean();
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('[GET /api/promotion-targets] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/promo-images/:token - lấy ảnh banner khuyến mãi theo token ngắn
app.get('/api/promo-images/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    const doc = await promoBannerImagesCollection().findOne({ token });
    if (!doc || !doc.data) return res.status(404).json({ success: false, message: 'Image not found' });

    let buffer = doc.data;
    if (doc.data && Buffer.isBuffer(doc.data)) {
      buffer = doc.data;
    } else if (doc.data && doc.data.buffer) {
      // Some Mongo drivers may wrap BinData into an object containing ArrayBuffer.
      const byteOffset = Number(doc.data.byteOffset || 0) || 0;
      const byteLength = Number(doc.data.byteLength || doc.data.length || 0) || 0;
      buffer = byteLength > 0
        ? Buffer.from(doc.data.buffer, byteOffset, byteLength)
        : Buffer.from(doc.data.buffer);
    }

    if (!Buffer.isBuffer(buffer)) return res.status(500).json({ success: false, message: 'Invalid image buffer' });

    res.setHeader('Content-Type', doc.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(buffer);
  } catch (err) {
    console.error('[GET /api/promo-images/:token] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// data URL / ảnh lớn => lưu buffer trong Mongo, URL ngắn /api/promo-images/:token (dùng chung: KM, avatar, ...)
const normalizePromotionImagesToShortLinks = async (images) => {
  if (!Array.isArray(images)) return images;

  const out = [];
  for (const raw of images) {
    const value = String(raw || '').trim();
    if (!value) continue;

    if (
      value.startsWith('/api/promo-images/') ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('/uploads/')
    ) {
      out.push(value);
      continue;
    }

    const m = value.match(/^data:(.+?);base64,(.+)$/);
    if (m) {
      const mimeType = m[1] || 'image/jpeg';
      const b64 = m[2] || '';
      const buffer = Buffer.from(b64, 'base64');
      const token = crypto.randomBytes(6).toString('base64url');

      await promoBannerImagesCollection().insertOne({
        token,
        mimeType,
        data: buffer,
        size: buffer.length,
        originalName: '',
        createdAt: new Date().toISOString()
      });

      out.push(`/api/promo-images/${token}`);
      continue;
    }

    out.push(value);
  }
  return out;
};

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
      subtotal, directDiscount, voucherDiscount, vitaXuDiscount, shippingFee, shippingDiscount, totalAmount,
      note, requestInvoice, hideProductInfo, item, shippingInfo, promotion,
      pharmacistWalkIn, createdByAdmin, createdByPharmacist, pickupStoreId,
      status: bodyStatus,
    } = req.body || {};

    const uid = (user_id != null && user_id !== '') ? String(user_id).trim() : null;
    if (!Array.isArray(item) || item.length === 0) {
      return res.status(400).json({ success: false, message: 'Đơn hàng chưa có sản phẩm.' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ success: false, message: 'Chưa chọn phương thức thanh toán.' });
    }

    const normCreator = (o) => {
      if (!o || typeof o !== 'object') return null;
      const id = o.id != null ? String(o.id).trim() : '';
      const name = o.name != null ? String(o.name).trim() : '';
      if (!id && !name) return null;
      return { id: id || '', name: name || '' };
    };
    const normalizedPharmacist = normCreator(createdByPharmacist);
    const normalizedAdmin = normCreator(createdByAdmin);
    const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
    const atPharmacyBool = asBool(atPharmacy);
    const walkInFlag = asBool(pharmacistWalkIn);
    const hasPickupStore = String(pickupStoreId || '').trim() !== '';
    /** Có người tạo là dược sĩ + nhận tại CH + mã cửa — coi như đơn quầy dù flag pharmacistWalkIn lỗi encoding */
    const pharmacistPickup =
      (walkInFlag && atPharmacyBool) ||
      (atPharmacyBool && hasPickupStore && normalizedPharmacist != null);
    // Alias cũ (lưu DB / validate địa chỉ quầy)
    const walkInPharmacist = pharmacistPickup;

    const explicitCounterComplete =
      String(bodyStatus || '').toLowerCase() === 'delivered' &&
      String(statusPayment || '').toLowerCase() === 'paid' &&
      atPharmacyBool &&
      hasPickupStore;
    const pharmacistCounterComplete =
      walkInPharmacist ||
      (explicitCounterComplete && (normalizedPharmacist != null || walkInFlag));

    // Khách vãng lai: bắt buộc shippingInfo có fullName, phone (và address nếu giao tận nơi)
    // Đơn tạo bởi dược sĩ (admin panel): có thể bỏ qua tên/SĐT → mặc định "Khách vãng lai", nhận tại cửa hàng
    let ship = { ...(shippingInfo || {}) };
    if (!uid) {
      if (pharmacistCounterComplete) {
        const phAddr = String(pharmacyAddress || '').trim();
        if (!phAddr) {
          return res.status(400).json({ success: false, message: 'Vui lòng chọn cửa hàng nhận hàng.' });
        }
        ship = {
          ...ship,
          fullName: (ship.fullName && String(ship.fullName).trim()) || 'Khách vãng lai',
          phone: ship.phone != null ? String(ship.phone).trim() : '',
          email: ship.email != null ? String(ship.email).trim() : '',
          address: phAddr,
        };
      } else {
        if (!ship.fullName || !String(ship.fullName).trim()) {
          return res.status(400).json({ success: false, message: 'Vui lòng nhập tên người nhận.' });
        }
        if (!ship.phone || !String(ship.phone).trim()) {
          return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại.' });
        }
        if (!atPharmacyBool && (!ship.address || !String(ship.address).trim())) {
          return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ giao hàng.' });
        }
      }
    }

    const col = ordersCollection();
    const count = await col.countDocuments();
    const orderId = `ORD${String(count + 1).padStart(6, '0')}`;
    const now = new Date().toISOString();

    const pmNorm = String(paymentMethod || 'cod').trim().toLowerCase();

    /** Đơn tạo bởi dược sĩ tại quầy: coi như đã giao & đã thanh toán ngay (không qua chờ xác nhận / đang giao). */
    const statusPaymentResolved = pharmacistCounterComplete
      ? 'paid'
      : ((pmNorm && pmNorm !== 'cod') ? 'paid' : (statusPayment || 'unpaid'));
    const orderStatusResolved = pharmacistCounterComplete ? 'delivered' : 'pending';
    const routeResolved = pharmacistCounterComplete
      ? { pending: now, confirmed: now, shipping: now, delivered: now }
      : { pending: now };

    const orderDoc = {
      order_id: orderId,
      user_id: uid || null,
      paymentMethod: pmNorm || 'cod',
      statusPayment: statusPaymentResolved,
      atPharmacy: atPharmacyBool,
      pharmacyAddress: pharmacistCounterComplete ? String(pharmacyAddress || '').trim() : (pharmacyAddress || ''),
      pharmacistWalkIn: pharmacistCounterComplete,
      pickupStoreId: pickupStoreId != null ? String(pickupStoreId).trim() : '',
      createdByAdmin: normalizedAdmin,
      createdByPharmacist: normalizedPharmacist,
      subtotal: Number(subtotal) || 0,
      directDiscount: Number(directDiscount) || 0,
      voucherDiscount: Number(voucherDiscount) || 0,
      vitaXuDiscount: Number(vitaXuDiscount) || 0,
      promotion: Array.isArray(promotion) ? promotion : [],
      shippingFee: Number(shippingFee) || 0,
      shippingDiscount: Number(shippingDiscount) || 0,
      totalAmount: Number(totalAmount) || 0,
      status: orderStatusResolved,
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
      shippingInfo: ship,
      route: routeResolved,
      createdAt: now,
      updatedAt: now,
      inventoryReleased: false,
    };

    const invCheck = await assertInventoryAvailableForOrderItems(orderDoc.item);
    if (!invCheck.ok) {
      return res.status(400).json({ success: false, message: invCheck.message });
    }

    // Vita Xu: trừ số dư + prepend history; giữ lastCompletedDate / currentStreak.
    // Dùng pipeline $concatArrays để không ghi đè nhầm history; chuẩn hoá history nếu DB lưu object thay vì array.
    if (uid) {
      const uidNorm = String(uid).trim();
      const xuToUse = Math.max(0, Math.floor(Number(vitaXuDiscount) || 0));
      if (xuToUse > 0) {
        const memoryUser = await usersMemoryCollection().findOne({ user_id: uidNorm });
        const coins = memoryUser?.coins || { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] };
        const currentBalance = Number(coins.balance) || 0;
        if (currentBalance < xuToUse) {
          return res.status(400).json({
            success: false,
            message: `Số dư Vita Xu không đủ. Hiện có ${currentBalance}, cần ${xuToUse}.`
          });
        }

        let prevHistory = [];
        if (Array.isArray(coins.history)) prevHistory = coins.history;
        else if (coins.history && typeof coins.history === 'object') prevHistory = Object.values(coins.history);

        const newBalance = Math.max(0, currentBalance - xuToUse);
        const spendDateKey = `vita-xu-order-${orderId}`;
        const spendEntry = {
          amount: -xuToUse,
          reason: `Sử dụng Vita Xu cho đơn hàng ${orderId}`,
          date: new Date().toISOString(),
          dateKey: spendDateKey,
        };

        try {
          await usersMemoryCollection().updateOne(
            { user_id: uidNorm },
            [
              {
                $set: {
                  user_id: uidNorm,
                  updatedAt: new Date(),
                  coins: {
                    $let: {
                      vars: {
                        c: { $ifNull: ['$coins', { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] }] },
                      },
                      in: {
                        balance: {
                          $max: [
                            { $subtract: [{ $toDouble: { $ifNull: ['$$c.balance', 0] } }, xuToUse] },
                            0,
                          ],
                        },
                        lastCompletedDate: { $ifNull: ['$$c.lastCompletedDate', null] },
                        currentStreak: { $toInt: { $ifNull: ['$$c.currentStreak', 0] } },
                        history: {
                          $concatArrays: [
                            [{ $literal: spendEntry }],
                            {
                              $cond: [{ $isArray: '$$c.history' }, '$$c.history', []],
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            { upsert: true }
          );
        } catch (e) {
          console.warn('[POST /api/orders] Vita Xu pipeline fallback:', e?.message || e);
          const newCoins = {
            balance: newBalance,
            lastCompletedDate: coins.lastCompletedDate != null ? coins.lastCompletedDate : null,
            currentStreak: Math.max(0, Math.floor(Number(coins.currentStreak) || 0)),
            history: [spendEntry, ...prevHistory],
          };
          await usersMemoryCollection().updateOne(
            { user_id: uidNorm },
            { $set: { user_id: uidNorm, coins: newCoins, updatedAt: new Date() } },
            { upsert: true }
          );
        }
      }
    }

    const insertOrderResult = await col.insertOne(orderDoc);
    const orderMongoId = insertOrderResult?.insertedId
      ? String(insertOrderResult.insertedId)
      : getId(orderDoc);

    // Thông báo admin: đơn mới chờ xác nhận — chỉ admin (dược sĩ không nhận) — lưu MongoDB collection admin_notice
    try {
      const customerName = String(orderDoc.shippingInfo?.fullName || orderDoc.shippingInfo?.full_name || '').trim() || 'Khách lẻ';
      await adminNoticeCollection().insertOne({
        type: 'order_pending',
        title: 'Đơn hàng mới chờ xác nhận',
        message: `Đơn ${orderId} từ ${customerName} đang chờ xác nhận.`,
        createdAt: new Date(),
        link: `/admin/orders/detail/${orderMongoId}`,
        meta: {
          order_id: orderId,
          order_mongo_id: orderMongoId,
        },
        roles: ['admin'],
      });
    } catch (e) {
      console.warn('[POST /api/orders] Cannot create admin_notice:', e?.message || e);
    }

    // Sau khi tạo đơn: trừ tồn kho sản phẩm và cập nhật lượt sử dụng khuyến mãi (nếu có)
    try {
      // Trừ stock cho từng sản phẩm trong đơn
      if (Array.isArray(orderDoc.item) && orderDoc.item.length > 0) {
        for (const it of orderDoc.item) {
          const rawId = it.productId || it.product_id || it._id;
          const qty = Number(it.quantity) || 1;
          if (!rawId || qty <= 0) continue;
          const idStr = String(rawId);
          const filters = productIdFiltersFromRaw(idStr);
          await productsCollection().updateOne(
            { $or: filters },
            { $inc: { stock: -qty, sold: qty } },
          );
        }
      }

      // Ghi nhận lượt sử dụng khuyến mãi
      if (Array.isArray(orderDoc.promotion) && orderDoc.promotion.length > 0) {
        for (const p of orderDoc.promotion) {
          const pid = p.promotion_id || p.promotionId || null;
          if (!pid) continue;
          const promotionId = String(pid);

          // Cập nhật bảng usage: thêm user và order vào mảng
          await PromotionUsage.updateOne(
            { promotion_id: promotionId },
            {
              $setOnInsert: { promotion_id: promotionId },
              $addToSet: {
                user_id: uid || null,
                order_id: orderId,
              },
            },
            { upsert: true },
          );

          // Tăng bộ đếm usage_count trong promotion_promotions
          await PromotionModel.updateOne(
            { promotion_id: promotionId },
            { $inc: { usage_count: 1 } },
          );
        }
      }
    } catch (e) {
      console.warn('[POST /api/orders] Cannot update stock or promotion usage:', e.message);
    }

    // Đồng bộ totalspent/tiering ngay nếu đơn này đã ở trạng thái thành công.
    if (uid && SUCCESS_ORDER_STATUSES_FOR_SPENDING.includes(String(orderDoc.status || '').toLowerCase())) {
      try {
        await recomputeUserTotalSpentAndTier(uid);
      } catch (e) {
        console.warn('[POST /api/orders] Cannot recompute customer spending:', e.message);
      }
    }

    // Tạo thông báo "đơn hàng mới" cho user (chỉ khi có user_id)
    if (uid) {
      try {
        const ncol = noticesCollection();
        const noticeTitle = pharmacistCounterComplete ? 'Đơn hàng hoàn tất tại quầy' : 'Đặt hàng thành công';
        const noticeMsg = pharmacistCounterComplete
          ? `Đơn hàng ${orderId} đã giao và thanh toán tại nhà thuốc.`
          : `Đơn hàng ${orderId} đã được tạo và đang chờ xác nhận.`;
        await ncol.insertOne({
          user_id: uid,
          type: 'order_created',
          title: noticeTitle,
          message: noticeMsg,
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

    // Gửi email xác nhận cho khách vãng lai
    if (!uid) {
      try {
        const customerEmail = (ship.email || '').trim();
        if (customerEmail) {
          const customerName = ship.fullName || ship.full_name || ship.name || '';
          const orderItems = Array.isArray(orderDoc.item) ? orderDoc.item : [];
          const itemsRows = orderItems.map((i) => {
            const qty = Number(i.quantity) || 1;
            const price = Number(i.price) || 0;
            const lineTotal = qty * price;
            return `
              <tr>
                <td style="padding:14px 12px; border-bottom:1px solid #e6e9ef; vertical-align:top;">
                  <div style="font-size:14px; font-weight:500; color:#1f2937; line-height:1.4;">${(i.productName || i.product_name || i.sku || '').toString().slice(0, 120)}</div>
                </td>
                <td style="padding:14px 12px; border-bottom:1px solid #e6e9ef; text-align:center; white-space:nowrap; font-size:14px; color:#1f2937;">${qty}</td>
                <td style="padding:14px 12px; border-bottom:1px solid #e6e9ef; text-align:right; white-space:nowrap; font-size:14px; color:#1f2937;">${price.toLocaleString('vi-VN')}đ</td>
                <td style="padding:14px 12px; border-bottom:1px solid #e6e9ef; text-align:right; white-space:nowrap; font-size:14px; color:#1f2937; font-weight:600;">${lineTotal.toLocaleString('vi-VN')}đ</td>
              </tr>
            `;
          }).join('');

          const estimatedLabel = String(orderDoc.estimatedDelivery || '').trim() || 'Không có';
          const isPickupAtPharmacy = !!orderDoc.atPharmacy;
          const deliveryAddress = isPickupAtPharmacy
            ? String(orderDoc.pharmacyAddress || '').trim()
            : String(ship.address || '').trim();
          const deliveryAddressLabel = deliveryAddress || 'Không có';
          const addressTitle = isPickupAtPharmacy ? 'Nhà thuốc nhận hàng' : 'Địa chỉ nhận hàng';
          const totalPay = Number(orderDoc.totalAmount) || 0;

          const html = `
            <div style="background:#f3f6fb; padding:28px 12px; font-family: Arial, sans-serif;">
              <div style="max-width:760px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e7eaf0;">
                <div style="background:#00589F; padding:22px 28px;">
                  <div style="font-size:42px; font-weight:800; color:#fff; line-height:1.2;">VitaCare</div>
                  <div style="font-size:14px; color:#eaf4ff; margin-top:8px; line-height:1.3;">Xác nhận đặt hàng thành công</div>
                </div>

                <div style="padding:28px;">
                  <div style="font-size:14px; color:#1f2937; line-height:1.5;">
                    Xin chào <strong>${customerName ? customerName : 'khách hàng'}</strong>,
                  </div>

                  <div style="margin-top:18px; font-size:14px; color:#1f2937; line-height:1.5;">
                    Đơn hàng <strong>${orderId}</strong> của bạn đã được đặt thành công và đang được xử lý.
                  </div>

                  <div style="margin-top:18px; background:#f7f8fb; border:1px solid #dfe4ec; border-radius:14px; padding:18px 20px;">
                    <div style="font-size:14px; color:#1f2937; line-height:1.4; margin-bottom:8px;">
                      <strong>Thời gian nhận hàng dự kiến:</strong> ${estimatedLabel}
                    </div>
                    <div style="font-size:14px; color:#1f2937; line-height:1.55; margin-bottom:8px;">
                      <strong>${addressTitle}:</strong> ${deliveryAddressLabel}
                    </div>
                    <div style="font-size:14px; color:#1f2937; line-height:1.4;">
                      <strong>Tổng thanh toán:</strong> ${totalPay.toLocaleString('vi-VN')}đ
                    </div>
                  </div>

                  <div style="margin-top:20px; font-size:32px; font-weight:800; color:#1f2937;">Sản phẩm</div>

                  <div style="margin-top:10px; border-top:1px solid #e6e9ef;">
                    <table style="width:100%; border-collapse:collapse;">
                      <thead>
                        <tr>
                          <th style="text-align:left; font-size:15px; color:#374151; font-weight:700; padding:12px; border-bottom:1px solid #e6e9ef;">Sản phẩm</th>
                          <th style="text-align:center; font-size:15px; color:#374151; font-weight:700; padding:12px; border-bottom:1px solid #e6e9ef;">SL</th>
                          <th style="text-align:right; font-size:15px; color:#374151; font-weight:700; padding:12px; border-bottom:1px solid #e6e9ef;">Đơn giá</th>
                          <th style="text-align:right; font-size:15px; color:#374151; font-weight:700; padding:12px; border-bottom:1px solid #e6e9ef;">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemsRows || `<tr><td colspan="4" style="padding:16px 12px; color:#6b7280; font-size:14px;">Không có sản phẩm</td></tr>`}
                      </tbody>
                    </table>
                  </div>

                  <div style="margin-top:20px; font-size:14px; color:#6b7280; line-height:1.55;">
                    Cảm ơn bạn đã mua sắm tại VitaCare. Nếu cần hỗ trợ, vui lòng phản hồi email này hoặc liên hệ hotline.
                  </div>
                </div>
              </div>
            </div>
          `;

          const mailOptions = {
            from: 'vitacarehotro@gmail.com',
            to: customerEmail,
            subject: `[VitaCare] Xác nhận đặt hàng thành công - ${orderId}`,
            html,
          };

          transporter.sendMail(mailOptions).catch(() => { });
        }
      } catch (mailErr) {
        console.warn('[POST /api/orders] Send guest order confirmation mail error:', mailErr?.message || mailErr);
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
      // Thông báo "tiệm cận" trước giờ uống 1 giờ.
      const leadMin = 60;
      const notifyMin = slotMin - leadMin;
      if (curMin < notifyMin) continue;
      const rid = getId(r) || String(r._id);
      // `time` của reminder notice dùng cho hiển thị/sort phải là GIỜ UỐNG THẬT,
      // còn "hiển thị sớm" do điều kiện curMin >= slotMin - leadMin ở trên.
      const slotDate = new Date(`${todayKey}T${timeNorm}:00+07:00`);
      const dueTimeMs = slotDate.getTime();
      const medName = String(r.med_name || '').trim() || 'Thuốc';
      out.push({
        id: `reminder-due-${rid}-${todayKey}-${timeNorm.replace(':', '')}`,
        type: 'medication_reminder',
        title: 'Nhắc uống thuốc',
        message: `${medName} — ${r.dosage || ''}${r.unit ? ' ' + r.unit : ''} (lịch ${timeNorm})`,
        time: new Date(dueTimeMs).toISOString(),
        read: false,
        link: '/account',
        linkLabel: 'Mở lịch nhắc',
        meta: `${timeNorm} · ${medName}`.trim(),
        meta_label: medName,
      });
    }
  }
  out.sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });
  return out;
}

// GET /api/notices?user_id=...
app.get('/api/notices', async (req, res) => {
  const q_uid = String(req.query.user_id || '').trim();
  console.log('[GET /api/notices] start. user_id:', q_uid);
  try {
    const user_id = q_uid;
    console.log('[GET /api/notices] user_id:', user_id);
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
      meta_label: d.meta_label,
      noticeTag: d.noticeTag,
    }));
    const now = new Date();
    let dueReminders = [];
    try {
      dueReminders = await buildDueReminderNoticeItems(user_id, now);
    } catch (e) {
      console.warn('[GET /api/notices] due reminders:', e.message);
    }
    const merged = [...dueReminders, ...items];
    // Sort lại sau khi merge để notification luôn đúng theo thời gian mới nhất.
    merged.sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return tb - ta;
    });
    res.json({ success: true, items: merged });
  } catch (err) {
    console.error('[GET /api/notices] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thông báo.' });
  }
});

/** Tên hiển thị khách (like): cố định theo id — "Khách vãng lai" + 3 chữ số */
function guestHelpfulDisplayName(guestId) {
  const s = String(guestId);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0) % 1000;
  return `Khách vãng lai ${String(n).padStart(3, '0')}`;
}

// POST /api/users/display-names — map user_id → tên hiển thị (tooltip "Hữu ích")
app.post('/api/users/display-names', async (req, res) => {
  try {
    let ids = req.body?.ids;
    if (!Array.isArray(ids)) ids = [];
    const unique = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 100);
    const names = {};
    if (unique.length === 0) {
      return res.json({ success: true, names });
    }

    const needDb = unique.filter((id) => !id.toLowerCase().startsWith('guest_'));
    for (const id of unique) {
      if (id.toLowerCase().startsWith('guest_')) {
        names[id] = guestHelpfulDisplayName(id);
      } else {
        names[id] = 'Thành viên';
      }
    }

    if (needDb.length === 0) {
      return res.json({ success: true, names });
    }

    const objectIds = [];
    for (const id of needDb) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        try {
          objectIds.push(new mongoose.Types.ObjectId(id));
        } catch (_) {}
      }
    }

    const orConds = [{ user_id: { $in: needDb } }];
    if (objectIds.length) orConds.push({ _id: { $in: objectIds } });

    const docs = await usersCollection()
      .find({ $or: orConds })
      .project({ user_id: 1, full_name: 1, fullname: 1 })
      .toArray();

    const resolveOne = (id) => {
      const idStr = String(id);
      const byUid = docs.find((d) => d.user_id != null && String(d.user_id) === idStr);
      if (byUid) {
        const n = String(byUid.full_name || byUid.fullname || '').trim();
        return n || 'Thành viên';
      }
      const byOid = docs.find((d) => d._id != null && String(d._id) === idStr);
      if (byOid) {
        const n = String(byOid.full_name || byOid.fullname || '').trim();
        return n || 'Thành viên';
      }
      return 'Thành viên';
    };

    for (const id of needDb) {
      names[id] = resolveOne(id);
    }

    res.json({ success: true, names });
  } catch (err) {
    console.error('[POST /api/users/display-names] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
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

// DELETE /api/notices/:id - Xóa thông báo theo user_id
app.delete('/api/notices/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const user_id = String(req.query.user_id || req.body?.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const col = noticesCollection();

    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { _id: new mongoose.Types.ObjectId(id), user_id }
      : { _id: id, user_id };

    const result = await col.deleteOne(filter);
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/notices/:id] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa thông báo.' });
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
    if (doc.status === 'cancelled') {
      return res.json({ success: true, message: 'Đơn đã được huỷ trước đó.' });
    }
    const now = new Date().toISOString();
    if (!doc.inventoryReleased) {
      try {
        await restoreInventoryForOrderLineItems(doc.item || []);
      } catch (e) {
        console.warn('[PUT /api/orders/:id/cancel] restore inventory:', e.message);
      }
    }
    await col.updateOne(filter, {
      $set: {
        status: 'cancelled',
        cancelReason: reason || '',
        'route.cancelled': now,
        updatedAt: now,
        inventoryReleased: true,
      },
    });
    // Huỷ đơn sẽ ảnh hưởng totalspent/tiering nếu đơn trước đó từng được tính là thành công.
    try {
      const userId = doc.user_id || doc.userId;
      if (userId) {
        await recomputeUserTotalSpentAndTier(userId);
      }
    } catch (e) {
      console.warn('[PUT /api/orders/:id/cancel] Cannot recompute customer spending:', e.message);
    }
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

    // "unreview" là đơn đã hoàn tất => cộng totalspent và xét lại tier ngay.
    try {
      const userId = doc.user_id || doc.userId;
      if (userId) {
        await recomputeUserTotalSpentAndTier(userId);
      }
    } catch (e) {
      console.warn('[PUT /api/orders/:id/confirm-received] Cannot recompute customer spending:', e.message);
    }

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
    const id = req.params.id;
    const col = mongoose.connection.db.collection('orders');
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { order_id: id }] }
      : { order_id: id };
    const doc = await col.findOne(filter);
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    if (doc.status === 'returned') {
      return res.json({ success: true, message: 'Đơn hàng đã ở trạng thái hoàn trả.' });
    }
    const now = new Date().toISOString();
    if (!doc.inventoryReleased) {
      try {
        await restoreInventoryForOrderLineItems(doc.item || []);
      } catch (e) {
        console.warn('[PUT /api/orders/:id/confirm-returned] restore inventory:', e.message);
      }
    }
    await col.updateOne(filter, {
      $set: {
        status: 'returned',
        'route.returned': now,
        updatedAt: now,
        inventoryReleased: true,
      },
    });
    // Hoàn trả đơn có thể làm giảm totalspent và đổi tier.
    try {
      const userId = doc.user_id || doc.userId;
      if (userId) {
        await recomputeUserTotalSpentAndTier(userId);
      }
    } catch (e) {
      console.warn('[PUT /api/orders/:id/confirm-returned] Cannot recompute customer spending:', e.message);
    }

    try {
      const user_id = doc.user_id || doc.userId || 'guest';
      await noticesCollection().insertOne({
        user_id,
        type: 'order_updated',
        title: 'Xác nhận nhận hàng hoàn trả',
        message: `Bạn đã xác nhận nhận hàng hoàn trả cho đơn ${doc.order_id || id} thành công.`,
        createdAt: now,
        read: false,
        link: '/account',
        linkLabel: 'Xem đơn hàng',
        meta: doc.order_id || id,
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
      await noticesCollection().insertOne({
        user_id,
        type: 'order_updated',
        title: 'Hủy yêu cầu trả hàng',
        message: `Bạn đã hủy yêu cầu trả hàng cho đơn ${doc.order_id || id} thành công. Đơn hàng đã chuyển về trạng thái chờ đánh giá.`,
        createdAt: new Date().toISOString(),
        read: false,
        link: '/account',
        linkLabel: 'Xem đơn hàng',
        meta: doc.order_id || id,
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
    const existing = await col.findOne(filter);
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
    const pid = String(existing?.prescriptionId || '').trim();
    if (pid) await markPrescriptionConsultAdminNoticesResolved(pid);
    res.json({ success: true, message: 'Đã huỷ đơn tư vấn.' });
  } catch (err) {
    console.error('Cancel prescription error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// PATCH /api/prescriptions/:id/recontact - Khách yêu cầu dược sĩ liên lạc lại cho đơn thất bại/không liên hệ được
app.patch('/api/prescriptions/:id/recontact', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const userId = String(req.body?.user_id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Thiếu mã đơn tư vấn.' });
    }

    const col = consultationsPrescriptionsCollection();
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { _id: new mongoose.Types.ObjectId(id) }
      : { prescriptionId: id };

    const existing = await col.findOne(filter);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn tư vấn.' });
    }

    const ownerId = String(existing.user_id || '').trim();
    if (userId && ownerId && userId !== ownerId) {
      return res.status(403).json({ success: false, message: 'Không có quyền cập nhật đơn này.' });
    }

    const prevStatus = String(existing.status || '').trim().toLowerCase();
    if (prevStatus !== 'consultation_failed' && prevStatus !== 'unreachable') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể yêu cầu liên lạc lại với đơn thất bại hoặc chưa thể liên hệ.',
      });
    }

    const now = new Date().toISOString();
    const historyEntry = { status: 'waiting', changedAt: now, changedBy: 'user_recontact' };
    await col.updateOne(filter, {
      $set: {
        status: 'waiting',
        'current_status.status': 'waiting',
        'current_status.changedAt': now,
        'current_status.changedBy': 'user_recontact',
        updatedAt: now,
      },
      $push: { status_history: historyEntry },
    });

    const prescriptionCode = String(existing.prescriptionId || id).trim();
    if (prescriptionCode) {
      await syncPharmacistPrescriptionAssignedNoticeStatus(prescriptionCode, 'waiting');
    }

    const updated = await col.findOne(filter);
    return res.json({
      success: true,
      message: 'Đã gửi yêu cầu tư vấn lại. Dược sĩ sẽ liên hệ lại sớm nhất.',
      item: updated,
    });
  } catch (err) {
    console.error('Recontact prescription error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// PATCH /api/prescriptions/:id/review — Khách đánh giá đơn đã tư vấn thành công (lưu DB, phục vụ dữ liệu)
app.patch('/api/prescriptions/:id/review', async (req, res) => {
  try {
    const id = req.params.id;
    const { rating, note, user_id } = req.body || {};
    const uid = String(user_id || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5 || Math.round(r) !== r) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn từ 1 đến 5 sao.' });
    }
    const noteStr = note != null ? String(note).trim().slice(0, 2000) : '';

    const col = consultationsPrescriptionsCollection();
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { _id: new mongoose.Types.ObjectId(id) }
      : { prescriptionId: id };
    const existing = await col.findOne(filter);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn tư vấn.' });
    }
    if (String(existing.user_id || '').trim() !== uid) {
      return res.status(403).json({ success: false, message: 'Không có quyền đánh giá đơn này.' });
    }
    if (String(existing.status || '').toLowerCase() !== 'advised') {
      return res.status(400).json({ success: false, message: 'Chỉ đánh giá được đơn đã tư vấn thành công.' });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    await col.updateOne(filter, {
      $set: {
        user_prescription_rating: r,
        user_prescription_review: noteStr,
        user_prescription_reviewed_at: nowIso,
        updatedAt: now,
      },
    });

    const updated = await col.findOne(filter);
    res.json({
      success: true,
      message: 'Cảm ơn bạn đã đánh giá.',
      item: updated,
    });
  } catch (err) {
    console.error('Review prescription error:', err);
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

    // Thông báo admin panel — collection admin_notice (chỉ role admin; dược sĩ không đọc).
    try {
      const who = String(full_name || '').trim() || 'Khách hàng';
      await adminNoticeCollection().insertOne({
        type: 'consultation_prescription',
        title: 'Đơn tư vấn thuốc mới',
        message: `${who} vừa gửi đơn tư vấn thuốc.`,
        createdAt: new Date(),
        link: '/admin/consultation-prescription',
        meta: { prescriptionId },
        roles: ['admin'],
        resolved: false,
      });
    } catch (e) {
      console.warn('[POST /api/prescriptions] Cannot create admin_notice:', e?.message || e);
    }

    // Tạo thông báo "đơn thuốc cần tư vấn" cho user (chỉ khi có user_id)
    if (uid) {
      try {
        const ncol = noticesCollection();
        await ncol.insertOne({
          user_id: uid,
          type: 'prescription_created',
          title: 'Đơn thuốc cần tư vấn',
          message: 'Yêu cầu tư vấn đơn thuốc của bạn đã được gửi. Chúng tôi sẽ liên hệ trong thời gian sớm nhất.',
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

    /**
     * Tối ưu hiệu năng:
     * Trước đây mỗi lần mở giỏ hàng FE sẽ gọi GET /api/carts,
     * route này lại join sang collection products để lấy ảnh mới nhất
     * cho từng sản phẩm trong giỏ → tạo một truy vấn $or rất lớn,
     * dễ làm request chậm khi giỏ hoặc bảng sản phẩm lớn.
     *
     * Để tránh lag khi mở giỏ, ta bỏ bước join nặng này
     * và chỉ chuẩn hoá lại dữ liệu số ngay trên items hiện có.
     * Ảnh sản phẩm đã được lưu trong cart khi thêm vào giỏ,
     * FE vẫn có thể hiển thị bình thường.
     */
    if (itemsArray.length > 0) {
      itemsArray.forEach((it) => {
        it.quantity = Number(it.quantity) || 1;
        it.price = Number(it.price) || 0;
        it.discount = Number(it.discount) || 0;
      });
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
      // Dùng regex để tránh lỗi mismatch do khác biệt unicode/whitespace
      const esc = escapeRegExp(tinh_thanh);
      filter['dia_chi.tinh_thanh'] = { $regex: `^${esc}$`, $options: 'i' };
    }
    if (quan_huyen && quan_huyen !== 'Tất cả') {
      const esc = escapeRegExp(quan_huyen);
      filter['dia_chi.quan_huyen'] = { $regex: `^${esc}$`, $options: 'i' };
    }
    if (phuong_xa && phuong_xa !== 'Tất cả') {
      const esc = escapeRegExp(phuong_xa);
      filter['dia_chi.phuong_xa'] = { $regex: `^${esc}$`, $options: 'i' };
    }

    if (String(req.query.debug || '') === '1') {
      return res.json({
        success: true,
        received: { tinh_thanh, quan_huyen, phuong_xa },
        filter,
      });
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
        tag_label: r.tag_label ?? null,
        tag_color: r.tag_color ?? null,
        config_status: r.config_status,
        schedule_status: r.schedule_status,
        reminder_sound: r.reminder_sound,
        is_completed: r.is_completed,
        last_completed_date: r.last_completed_date,
        completion_log: log.map((c) => ({ date: String(c.date || ''), time: String(c.time || '') })),
        skipped_dates: Array.isArray(r.skipped_dates)
          ? r.skipped_dates
              .map((x) => normalizeCalendarYmd(String(x)))
              .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))
          : [],
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
      tag_label: body.tag_label || null,
      tag_color: body.tag_color || null,
      config_status: 'Active',
      schedule_status: 'Active',
      reminder_sound: body.reminder_sound !== false,
      completion_log: [],
      skipped_dates: Array.isArray(body.skipped_dates)
        ? body.skipped_dates
            .map((x) => normalizeCalendarYmd(String(x)))
            .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))
        : [],
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
      'med_name', 'dosage', 'unit', 'route', 'instruction', 'note', 'image_url', 'tag_label', 'tag_color', 'config_status', 'schedule_status',
      'skipped_dates',
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

/** Chuẩn YYYY-MM-DD (hỗ trợ 2026-3-20) */
function normalizeCalendarYmd(s) {
  const m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
/** Cộng ngày trên lịch civil — khớp “date key” giống UI */
function addCalendarDaysYmd(ymd, deltaDays) {
  const key = normalizeCalendarYmd(ymd);
  if (!key) return '';
  const [y, mo, d] = key.split('-').map((x) => parseInt(x, 10));
  const ms = Date.UTC(y, mo - 1, d + deltaDays);
  return new Date(ms).toISOString().slice(0, 10);
}
function pickQueryParam(reqQuery, key) {
  const v = reqQuery?.[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Nhật ký: dùng POST + JSON body để scope=day không bị mất (một số proxy/client cắt query DELETE).
 * DELETE không date: xóa full document.
 */
async function runReminderCalendarDelete(req, res, id, fromPost) {
  try {
    const reminderDateKey = (val) => {
      if (val == null) return '';
      if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10);
      const s = String(val).trim();
      const mx = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (mx) return mx[1];
      const d = new Date(s);
      return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    };

    const idStr = String(id || '').trim();
    const body = req.body || {};
    const q = req.query || {};

    let qDate = '';
    let scopeRaw = 'from';
    let rangeStartQ = '';
    let rangeEndQ = '';

    if (fromPost) {
      qDate = normalizeCalendarYmd(body.calendarDate || body.date);
      scopeRaw = String(body.scope ?? body.mode ?? '')
        .trim()
        .toLowerCase();
      rangeStartQ = normalizeCalendarYmd(body.rangeStart);
      rangeEndQ = normalizeCalendarYmd(body.rangeEnd);
      if (!qDate || !/^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
        return res.status(400).json({ success: false, message: 'Thiếu hoặc sai calendarDate (YYYY-MM-DD).' });
      }
      if (!rangeStartQ || !rangeEndQ) {
        return res.status(400).json({ success: false, message: 'Thiếu rangeStart / rangeEnd.' });
      }
      if (!scopeRaw || (scopeRaw !== 'day' && scopeRaw !== 'from' && scopeRaw !== 'single' && scopeRaw !== 'singleday')) {
        return res.status(400).json({ success: false, message: 'scope phải là day hoặc from.' });
      }
    } else {
      qDate = normalizeCalendarYmd(pickQueryParam(q, 'date'));
      scopeRaw = String(pickQueryParam(q, 'scope') ?? '')
        .trim()
        .toLowerCase();
      rangeStartQ = normalizeCalendarYmd(pickQueryParam(q, 'rangeStart'));
      rangeEndQ = normalizeCalendarYmd(pickQueryParam(q, 'rangeEnd'));
    }

    const hasDate = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate);

    /* Không mặc định scope=from: thiếu scope + có ?date → từng gây cắt hết từ ngày đó (21,22,23… mất). */
    if (!fromPost && hasDate) {
      if (
        !scopeRaw ||
        (scopeRaw !== 'day' && scopeRaw !== 'from' && scopeRaw !== 'single' && scopeRaw !== 'singleday')
      ) {
        return res.status(400).json({
          success: false,
          message: 'DELETE với ?date phải kèm scope=day hoặc scope=from.',
        });
      }
    }
    const singleDayScope =
      scopeRaw === 'day' || scopeRaw === 'single' || scopeRaw === 'singleday';

    const hasClientRange =
      /^\d{4}-\d{2}-\d{2}$/.test(rangeStartQ) &&
      /^\d{4}-\d{2}-\d{2}$/.test(rangeEndQ) &&
      rangeStartQ <= rangeEndQ;

    /** Luôn dùng _id đúng kiểu BSON trong DB (tránh 404 oan khi so khớp ObjectId vs chuỗi). */
    let doc = null;
    if (idStr && mongoose.Types.ObjectId.isValid(idStr)) {
      doc = await remindersCollection().findOne({ _id: new mongoose.Types.ObjectId(idStr) });
    }
    if (!doc && idStr) {
      doc = await remindersCollection().findOne({ _id: idStr });
    }
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lời nhắc.' });
    }
    const oid = doc._id;

    const oldStart = hasClientRange ? rangeStartQ : reminderDateKey(doc.start_date) || qDate;
    const oldEnd = hasClientRange ? rangeEndQ : reminderDateKey(doc.end_date) || qDate;

    if (!hasDate) {
      if (fromPost) {
        return res.status(400).json({ success: false, message: 'Thiếu ngày xóa.' });
      }
      await remindersCollection().deleteOne({ _id: oid });
      return res.json({ success: true });
    }

    /** Chỉ bỏ một ngày: lưu skipped_dates (một bản ghi thuốc; tần suất cách ngày/tuần không bị lệch). */
    if (singleDayScope) {
      if (qDate < oldStart || qDate > oldEnd) {
        return res.json({ success: true, message: 'Ngày không nằm trong khoảng lịch.' });
      }

      const dayKeyFromLog = (e) =>
        normalizeCalendarYmd(String(e.date || '')) || String(e.date || '').slice(0, 10);

      const newLog = (doc.completion_log || []).filter((e) => dayKeyFromLog(e) !== qDate);

      const prevSkipped = Array.isArray(doc.skipped_dates)
        ? doc.skipped_dates.map((x) => normalizeCalendarYmd(String(x))).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))
        : [];
      if (prevSkipped.includes(qDate)) {
        return res.json({ success: true });
      }

      const freq = String(doc.frequency || 'Daily');
      const singleCalendarDayInRange = oldStart === oldEnd;
      const onlyOnceDay = freq === 'Once' && qDate === oldStart;

      if ((singleCalendarDayInRange && qDate === oldStart) || onlyOnceDay) {
        await remindersCollection().deleteOne({ _id: oid });
        return res.json({ success: true });
      }

      await remindersCollection().updateOne(
        { _id: oid },
        {
          $addToSet: { skipped_dates: qDate },
          $set: { completion_log: newLog, updatedAt: new Date() },
        }
      );
      return res.json({ success: true });
    }

    if (qDate <= oldStart) {
      await remindersCollection().deleteOne({ _id: oid });
      return res.json({ success: true });
    }

    if (qDate > oldEnd) {
      return res.json({ success: true, message: 'Không có khoảng lịch bị hủy.' });
    }

    const newEndKey = addCalendarDaysYmd(qDate, -1);

    const fromLog = (doc.completion_log || []).filter((e) => {
      const dk =
        normalizeCalendarYmd(String(e.date || '')) || String(e.date || '').slice(0, 10);
      return dk && dk <= newEndKey;
    });

    await remindersCollection().updateOne(
      { _id: oid },
      { $set: { end_date: newEndKey + 'T00:00:00.000Z', completion_log: fromLog, updatedAt: new Date() } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete reminders error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa lời nhắc.' });
  }
}

app.post('/api/reminders/:id/delete-calendar', async (req, res) => {
  await runReminderCalendarDelete(req, res, req.params.id, true);
});

/**
 * Chỉ bỏ một ngày trên lịch (skipped_dates) — không có scope, không cắt end_date.
 * Tránh nhầm với nhánh "từ ngày đến hết" làm mất cả 21,22,23…
 */
app.post('/api/reminders/:id/skip-one-day', async (req, res) => {
  try {
    const idStr = String(req.params.id || '').trim();
    const body = req.body || {};
    const qDate = normalizeCalendarYmd(body.calendarDate || body.date);
    const rangeStartQ = normalizeCalendarYmd(body.rangeStart);
    const rangeEndQ = normalizeCalendarYmd(body.rangeEnd);
    if (!qDate || !/^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
      return res.status(400).json({ success: false, message: 'Thiếu hoặc sai calendarDate (YYYY-MM-DD).' });
    }
    if (!rangeStartQ || !rangeEndQ) {
      return res.status(400).json({ success: false, message: 'Thiếu rangeStart / rangeEnd.' });
    }
    if (rangeStartQ > rangeEndQ) {
      return res.status(400).json({ success: false, message: 'rangeStart phải ≤ rangeEnd.' });
    }

    let doc = null;
    if (idStr && mongoose.Types.ObjectId.isValid(idStr)) {
      doc = await remindersCollection().findOne({ _id: new mongoose.Types.ObjectId(idStr) });
    }
    if (!doc && idStr) {
      doc = await remindersCollection().findOne({ _id: idStr });
    }
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lời nhắc.' });
    }
    const oid = doc._id;
    const oldStart = rangeStartQ;
    const oldEnd = rangeEndQ;

    if (qDate < oldStart || qDate > oldEnd) {
      return res.json({ success: true, message: 'Ngày không nằm trong khoảng lịch.' });
    }

    const dayKeyFromLog = (e) =>
      normalizeCalendarYmd(String(e.date || '')) || String(e.date || '').slice(0, 10);

    const newLog = (doc.completion_log || []).filter((e) => dayKeyFromLog(e) !== qDate);

    const prevSkipped = Array.isArray(doc.skipped_dates)
      ? doc.skipped_dates.map((x) => normalizeCalendarYmd(String(x))).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))
      : [];
    if (prevSkipped.includes(qDate)) {
      return res.json({ success: true });
    }

    const freq = String(doc.frequency || 'Daily');
    const singleCalendarDayInRange = oldStart === oldEnd;
    const onlyOnceDay = freq === 'Once' && qDate === oldStart;

    if ((singleCalendarDayInRange && qDate === oldStart) || onlyOnceDay) {
      await remindersCollection().deleteOne({ _id: oid });
      return res.json({ success: true });
    }

    await remindersCollection().updateOne(
      { _id: oid },
      {
        $addToSet: { skipped_dates: qDate },
        $set: { completion_log: newLog, updatedAt: new Date() },
      }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Skip one reminder day error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi bỏ một ngày lịch.' });
  }
});

// DELETE /api/reminders/:id
// - Không có ?date: xóa toàn bộ document.
// - Có query: legacy (nhật ký dùng POST delete-calendar)
app.delete('/api/reminders/:id', async (req, res) => {
  await runReminderCalendarDelete(req, res, req.params.id, false);
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

// POST /api/reminders/:id/uncomplete - Bỏ đánh dấu hoàn thành (theo ngày + giờ)
app.post('/api/reminders/:id/uncomplete', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const { date, time } = req.body || {};
    if (!date || !time) {
      return res.status(400).json({ success: false, message: 'Thiếu date hoặc time.' });
    }
    const dateNorm = String(date).slice(0, 10);
    const timeNorm = normalizeReminderTimeStr(time);
    const update = {
      $pull: { completion_log: { date: dateNorm, time: timeNorm } },
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
    console.error('Un-complete reminder error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi bỏ đánh dấu hoàn thành.' });
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

// GET /api/blogs/topic-counts - Thống kê số lượng bài viết theo tags (Chuyên đề)
app.get('/api/blogs/topic-counts', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 12), 100);
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);

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

    // Filter logic for unwanted tags
    const excludeMatch = {
      $match: {
        "name": {
          $nin: [
            /khuyến mãi/i,
            /phân loại/i,
            /truyền thông/i
          ],
          $exists: true,
          $ne: ""
        }
      }
    };

    const results = await blogsCol.aggregate([
      { $match: filter },
      { $unwind: "$tags" },
      {
        $group: {
          _id: {
            title: "$tags.title",
            slug: "$tags.slug"
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          name: "$_id.title",
          slug: "$_id.slug",
          count: 1
        }
      },
      excludeMatch,
      { $sort: { count: -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }]
        }
      }
    ]).toArray();

    const counts = results[0]?.data || [];
    const total = results[0]?.metadata[0]?.total || 0;

    res.json({ success: true, counts, total });
  } catch (err) {
    console.error('[GET /api/blogs/topic-counts] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
  }
});

// GET /api/blogs/category-counts - Thống kê số lượng bài viết theo danh mục

// GET /api/blogs - danh sách bài viết sức khỏe (từ MongoDB collection blog/blogs)
app.get('/api/blogs', async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const healthIndicator = String(req.query.healthIndicator || '').trim();
    const category = String(req.query.category || '').trim();
    const subcategory = String(req.query.subcategory || '').trim();
    const tagSlug = String(req.query.tagSlug || '').trim();
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

    if (tagSlug) {
      const cleanSlug = tagSlug.replace(/^chuyen-de\//i, '').replace(/^\/+/, '');
      const possibleSlugs = [cleanSlug, `chuyen-de/${cleanSlug}`];

      // Regular expression for title matching (relaxed for hyphens/spaces)
      const tagRegex = new RegExp('^' + escapeRegExp(cleanSlug).replace(/-/g, '[\\s-]') + '$', 'i');

      filter.$and.push({
        $or: [
          { "tags.slug": { $in: possibleSlugs } },
          { "tags.title": { $regex: tagRegex } },
          // Special case for common tags if the regex isn't enough
          { "tags.title": { $regex: new RegExp('^' + cleanSlug.replace(/-/g, '.*') + '$', 'i') } }
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
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
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
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
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

// GET /api/health-video/:id - Lấy chi tiết 1 video theo ID
app.get('/api/health-video/:id', async (req, res) => {
  try {
    const idParam = String(req.params.id || '').trim();
    if (!idParam) {
      return res.status(400).json({ success: false, message: 'Thiếu videoId.' });
    }

    const col = mongoose.connection.db.collection('vinmec_playlists');
    let video = await col.findOne({ _id: idParam });

    // Fallback: Nếu ID là ObjectId hợp lệ
    if (!video && mongoose.Types.ObjectId.isValid(idParam)) {
      video = await col.findOne({ _id: new mongoose.Types.ObjectId(idParam) });
    }

    if (!video) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy video.' });
    }

    res.json(video);
  } catch (err) {
    console.error('[GET /api/health-video/:id] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy chi tiết video.' });
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
/** SKU trong DB có thể là string hoặc number — dùng chung khi find/update */
function reviewsSkuFilter(skuStr) {
  const s = String(skuStr || '').trim();
  if (!s) return null;
  const num = Number(s);
  if (!isNaN(num) && String(num) === s) {
    return { $or: [{ sku: s }, { sku: num }] };
  }
  return { sku: s };
}

function reviewIdEquals(stored, requestId) {
  const req = String(requestId || '').trim();
  if (!req || stored == null) return false;
  const asStr = stored.toString ? stored.toString() : String(stored);
  if (asStr === req) return true;
  if (mongoose.Types.ObjectId.isValid(req)) {
    try {
      const want = new mongoose.Types.ObjectId(req);
      if (stored && typeof stored.equals === 'function') return want.equals(stored);
      if (mongoose.Types.ObjectId.isValid(asStr)) return want.equals(new mongoose.Types.ObjectId(asStr));
    } catch (_) {}
  }
  return false;
}

/** Đơn đã giao / đã nhận — mới coi là mua thật để gắn nhãn "Mua: ..." */
const REVIEW_PURCHASE_ORDER_STATUSES = new Set([
  'delivered',
  'unreview',
  'reviewed',
  'completed',
  'received',
]);

/**
 * Kiểm tra đơn thuộc customer, đã ở trạng thái cho phép đánh giá, và có SKU trong đơn.
 * Trả về tên sản phẩm theo dòng trong đơn (productName).
 */
async function verifyOrderContainsSkuForReview(orderId, customerId, skuStr) {
  const oid = String(orderId || '').trim();
  const cid = String(customerId || '').trim();
  const skuWant = String(skuStr || '').trim();
  if (!oid || !cid || !skuWant) {
    return { verified: false, purchased_product_name: null };
  }

  const order = await ordersCollection().findOne({ order_id: oid });
  if (!order) {
    return { verified: false, purchased_product_name: null };
  }

  const uid = String(order.user_id || order.userId || '').trim();
  if (!uid || uid !== cid) {
    return { verified: false, purchased_product_name: null };
  }

  const st = String(order.status || '').toLowerCase().trim();
  if (!REVIEW_PURCHASE_ORDER_STATUSES.has(st)) {
    return { verified: false, purchased_product_name: null };
  }

  const items = Array.isArray(order.item)
    ? order.item
    : Array.isArray(order.products)
      ? order.products
      : [];

  const norm = (s) => String(s == null ? '' : s).trim();
  const wantNum = Number(skuWant);
  const wantIsNumeric = !Number.isNaN(wantNum) && String(wantNum) === skuWant;

  const line = items.find((it) => {
    const lineSku = norm(it.sku);
    if (lineSku === skuWant) return true;
    if (wantIsNumeric) {
      const ln = Number(lineSku);
      if (!Number.isNaN(ln) && ln === wantNum) return true;
    }
    return false;
  });

  if (!line) {
    return { verified: false, purchased_product_name: null };
  }

  const pname = String(line.productName || line.name || '').trim();
  return { verified: true, purchased_product_name: pname || null };
}

// GET /api/reviews/:sku - lấy danh sách đánh giá cho 1 SKU
app.get('/api/reviews/:sku', async (req, res) => {
  try {
    const sku = String(req.params.sku || '').trim();
    if (!sku) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }

    const skuFilter = reviewsSkuFilter(sku);
    const doc = skuFilter ? await reviewsCollection().findOne(skuFilter) : null;
    if (!doc) {
      return res.json({ sku, reviews: [] });
    }

    const verifyCache = new Map();
    const cacheKey = (oid, cid) => `${oid}|${cid}|${sku}`;
    const getVerified = async (r) => {
      if (r && r.verified_purchase) return r;
      const oid = r && r.order_id != null ? String(r.order_id).trim() : '';
      const cid = r && r.customer_id != null ? String(r.customer_id).trim() : '';
      if (!oid || !cid) {
        return { ...r, verified_purchase: false, purchased_product_name: null };
      }
      const key = cacheKey(oid, cid);
      let v = verifyCache.get(key);
      if (!v) {
        v = await verifyOrderContainsSkuForReview(oid, cid, sku);
        verifyCache.set(key, v);
      }
      if (v.verified) {
        return {
          ...r,
          verified_purchase: true,
          purchased_product_name: v.purchased_product_name || r.purchased_product_name || null,
        };
      }
      return { ...r, verified_purchase: false, purchased_product_name: null };
    };

    const rawReviews = Array.isArray(doc.reviews) ? doc.reviews : [];
    const reviews = await Promise.all(rawReviews.map((r) => getVerified(r)));
    res.json({ ...doc, reviews });
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
      avatar,
    } = req.body || {};
    console.log('[POST /api/reviews] body:', { sku, customer_id, fullname });
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

    const cid = customer_id ? String(customer_id).trim() : '';
    let orderIdStored = order_id ? String(order_id).trim() : '';
    let verified_purchase = false;
    let purchased_product_name = null;

    if (orderIdStored && cid) {
      const v = await verifyOrderContainsSkuForReview(orderIdStored, cid, skuStr);
      if (v.verified) {
        verified_purchase = true;
        purchased_product_name = v.purchased_product_name;
      } else {
        orderIdStored = '';
      }
    } else {
      orderIdStored = '';
    }

    const entry = {
      _id: new mongoose.Types.ObjectId().toString(),
      customer_id: cid || null,
      fullname: safeName,
      avatar: avatar || '',
      content: content || '',
      rating: safeRating,
      time: time ? new Date(time) : new Date(),
      order_id: orderIdStored || null,
      verified_purchase,
      purchased_product_name: verified_purchase ? purchased_product_name : null,
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

    // Chỉ khi đơn hợp lệ (đã mua SKU này) mới cập nhật trạng thái đơn sang "reviewed"
    if (verified_purchase && orderIdStored) {
      try {
        const ocol = ordersCollection();
        await ocol.updateMany(
          { order_id: orderIdStored },
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

    // Tạo thông báo cho user khi đánh giá thành công
    if (customer_id) {
      try {
        const pcol = mongoose.connection.db.collection('products');
        const product = await pcol.findOne({ sku: skuStr });
        const pName = product?.name || skuStr;
        await noticesCollection().insertOne({
          user_id: String(customer_id),
          type: 'order_updated',
          title: 'Đánh giá đã được gửi',
          message: `Đánh giá của bạn về sản phẩm "${pName}" đã được gửi thành công.`,
          createdAt: new Date().toISOString(),
          read: false,
          link: '/account',
          linkLabel: 'Xem đánh giá',
          meta: skuStr,
          meta_label: pName,
        });
      } catch (e) {
        console.warn('[POST /api/reviews] Cannot create notice:', e.message);
      }
    }

    const updated = await col.findOne({ sku: skuStr });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[POST /api/reviews] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo đánh giá.' });
  }
});

// POST /api/reviews/reply - trả lời 1 đánh giá (ghi vào reviews[].replies + has_replies / last_reply_at)
app.post('/api/reviews/reply', async (req, res) => {
  try {
    const { sku, reviewId, content, fullname, isAdmin, avatar, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const reviewIdStr = String(reviewId || '').trim();
    if (!skuStr || !reviewIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc reviewId.' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung trả lời.' });
    }

    const col = reviewsCollection();
    const skuFilter = reviewsSkuFilter(skuStr);
    if (!skuFilter) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }

    const doc = await col.findOne(skuFilter);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    const reviewsArr = Array.isArray(doc.reviews) ? [...doc.reviews] : [];
    const idx = reviewsArr.findIndex((r) => reviewIdEquals(r._id, reviewIdStr));
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy review.' });
    }

    const review = reviewsArr[idx];

    const reply = {
      _id: new mongoose.Types.ObjectId().toString(),
      user_id: userId ? String(userId).trim() : null,
      fullname: (fullname && String(fullname).trim()) || 'Khách',
      avatar: avatar || '',
      content: String(content).trim(),
      is_admin: !!isAdmin,
      time: new Date(),
      likes: [],
      parent_review_id: String(review._id != null ? review._id : reviewIdStr),
    };

    const prevReplies = Array.isArray(review.replies) ? review.replies : [];
    const updatedReview = {
      ...review,
      replies: [...prevReplies, reply],
      has_replies: true,
      last_reply_at: new Date().toISOString(),
    };
    reviewsArr[idx] = updatedReview;

    await col.updateOne(skuFilter, {
      $set: {
        reviews: reviewsArr,
        updatedAt: new Date(),
      },
    });

    // Thông báo cho chủ đánh giá khi người khác trả lời (không gửi nếu tự trả lời / khách không có customer_id)
    try {
      const reviewAuthorId = review.customer_id ? String(review.customer_id).trim() : '';
      const replierId = userId ? String(userId).trim() : '';
      const replierName = (fullname && String(fullname).trim()) || 'Người dùng';
      if (
        reviewAuthorId &&
        replierId &&
        reviewAuthorId.toLowerCase() !== replierId.toLowerCase()
      ) {
        let productName = skuStr;
        try {
          const numSku = Number(skuStr);
          const pFilter =
            !isNaN(numSku) && String(numSku) === String(skuStr).trim()
              ? { $or: [{ sku: skuStr }, { sku: numSku }] }
              : { sku: skuStr };
          const pdoc = await productsCollection().findOne(pFilter, {
            projection: { name: 1, product_name: 1, productName: 1 },
          });
          if (pdoc) {
            productName = pdoc.name || pdoc.product_name || pdoc.productName || productName;
          }
        } catch (_) {}
        await noticesCollection().insertOne({
          user_id: reviewAuthorId,
          type: 'review_reply',
          title: 'Có phản hồi cho đánh giá của bạn',
          message: `${replierName} đã trả lời đánh giá của bạn về sản phẩm "${productName}".`,
          createdAt: new Date().toISOString(),
          read: false,
          link: `/product/${skuStr}`,
          linkLabel: 'Xem phản hồi',
          meta: skuStr,
          meta_label: productName,
        });
      }
    } catch (e) {
      console.warn('[POST /api/reviews/reply] Cannot create notice:', e.message);
    }

    const updated = await col.findOne(skuFilter);
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/reviews/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi trả lời đánh giá.' });
  }
});

// PATCH /api/reviews/reply - chỉnh sửa 1 phản hồi đánh giá
app.patch('/api/reviews/reply', async (req, res) => {
  try {
    const { sku, reviewId, replyId, content, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const rId = String(reviewId || '').trim();
    const repId = String(replyId || '').trim();
    const uid = String(userId || '').trim();

    if (!skuStr || !rId || !repId || !uid) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc.' });
    }

    const col = reviewsCollection();
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });

    const review = (doc.reviews || []).find(r => r._id === rId);
    if (!review) return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });

    const reply = (review.replies || []).find(rep => rep._id === repId);
    if (!reply) return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });

    // Ownership Check: Check by ID first, then fallback to fullname if ID is missing or null
    let isOwner = false;
    const repUid = String(reply.user_id || '').trim();

    if (repUid && uid && repUid.toLowerCase() === uid.toLowerCase()) {
      isOwner = true;
    } else if (!repUid || repUid === 'null' || repUid === 'undefined') {
      // Fallback: Nếu không có ID trong DB, kiểm tra xem fullname có khớp không
      // Lấy fullname từ request body (cho PATCH) hoặc có thể cần lấy thêm từ DB nếu cần
      // Tuy nhiên, frontend đã gửi fullname trong payload hoặc chúng ta có thể tin tưởng uid nếu nó khớp một cách nào đó.
      // Ở đây, chúng ta sẽ kiểm tra xem reply.fullname có khớp với fullname của user hiện tại không.
      // Nhưng backend PATCH /api/reviews/reply hiện tại không nhận fullname trong body.
      // Ta sẽ nới lỏng: nếu reply.user_id là null VÀ (người dùng đang login có fullname khớp), cho phép.
      // Để làm điều này triệt để, ta cần fetch User từ DB bằng uid.
    }

    // Simplified fallback for now: If IDs don't match, we check if the user exists and has the same name.
    // Given the current structure, let's fetch the user to get their name.
    const userDoc = await usersCollection().findOne({ $or: [{ user_id: uid }, { _id: uid }] });
    const currentName = userDoc ? userDoc.full_name : null;

    if (!isOwner) {
      if ((!repUid || repUid === 'null' || repUid === 'undefined') && reply.fullname && currentName && reply.fullname === currentName) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa phản hồi này.' });
    }

    await col.updateOne(
      { sku: skuStr },
      { $set: { 'reviews.$[r].replies.$[rep].content': content, 'reviews.$[r].replies.$[rep].updatedAt': new Date(), updatedAt: new Date() } },
      { arrayFilters: [{ 'r._id': rId }, { 'rep._id': repId }] }
    );

    const updated = await col.findOne({ sku: skuStr });
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /api/reviews/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật phản hồi.' });
  }
});

// DELETE /api/reviews/reply/:sku/:reviewId/:replyId/:userId - xóa 1 phản hồi đánh giá
app.delete('/api/reviews/reply/:sku/:reviewId/:replyId/:userId', async (req, res) => {
  try {
    const { sku, reviewId, replyId, userId } = req.params;
    const skuStr = String(sku || '').trim();
    const rId = String(reviewId || '').trim();
    const repId = String(replyId || '').trim();
    const uid = String(userId || '').trim();

    if (!skuStr || !rId || !repId || !uid) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc.' });
    }

    const col = reviewsCollection();
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });

    const review = (doc.reviews || []).find(r => r._id === rId);
    if (!review) return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });

    const reply = (review.replies || []).find(rep => rep._id === repId);
    if (!reply) return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });

    // Ownership Check: Check by ID first, then fallback to fullname if ID is missing or null
    let isOwner = false;
    const repUid = String(reply.user_id || '').trim();

    if (repUid && uid && repUid.toLowerCase() === uid.toLowerCase()) {
      isOwner = true;
    } else if (!repUid || repUid === 'null' || repUid === 'undefined') {
      const userDoc = await usersCollection().findOne({ $or: [{ user_id: uid }, { _id: uid }] });
      const currentName = userDoc ? userDoc.full_name : null;
      if (reply.fullname && currentName && reply.fullname === currentName) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa phản hồi này.' });
    }

    await col.updateOne(
      { sku: skuStr, 'reviews._id': rId },
      { $pull: { 'reviews.$.replies': { _id: repId } }, $set: { updatedAt: new Date() } }
    );

    const updated = await col.findOne({ sku: skuStr });
    res.json(updated);
  } catch (err) {
    console.error('[DELETE /api/reviews/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa phản hồi.' });
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
    const skuFilter = reviewsSkuFilter(skuStr);
    if (!skuFilter) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }

    const doc = await col.findOne(skuFilter);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    const reviewsArr = Array.isArray(doc.reviews) ? [...doc.reviews] : [];
    const ridx = reviewsArr.findIndex((r) => reviewIdEquals(r._id, reviewIdStr));
    if (ridx === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy review.' });
    }

    const review = reviewsArr[ridx];
    const likes = Array.isArray(review.likes) ? [...review.likes] : [];
    const likeIdStr = (id) =>
      id && typeof id === 'object' && id.$oid ? String(id.$oid) : String(id || '');
    const idx = likes.findIndex((id) => likeIdStr(id) === userIdStr);
    const addingLike = idx === -1;
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }
    reviewsArr[ridx] = { ...review, likes };

    await col.updateOne(skuFilter, {
      $set: { reviews: reviewsArr, updatedAt: new Date() },
    });

    if (addingLike) {
      try {
        const reviewAuthorId = review.customer_id ? String(review.customer_id).trim() : '';
        if (
          reviewAuthorId &&
          reviewAuthorId.toLowerCase() !== userIdStr.toLowerCase()
        ) {
          let likerName = 'Người dùng';
          try {
            const userDoc = await usersCollection().findOne({ $or: [{ user_id: userIdStr }, { _id: userIdStr }] });
            if (userDoc && (userDoc.full_name || userDoc.fullname)) {
              likerName = String(userDoc.full_name || userDoc.fullname).trim() || likerName;
            }
          } catch (_) {}

          let productName = skuStr;
          try {
            const numSku = Number(skuStr);
            const pFilter =
              !isNaN(numSku) && String(numSku) === String(skuStr).trim()
                ? { $or: [{ sku: skuStr }, { sku: numSku }] }
                : { sku: skuStr };
            const pdoc = await productsCollection().findOne(pFilter, {
              projection: { name: 1, product_name: 1, productName: 1 },
            });
            if (pdoc) {
              productName = pdoc.name || pdoc.product_name || pdoc.productName || productName;
            }
          } catch (_) {}

          await noticesCollection().insertOne({
            user_id: reviewAuthorId,
            type: 'review_reply',
            noticeTag: 'helpful_like',
            title: 'Có phản hồi cho đánh giá của bạn',
            message: `${likerName} đánh dấu đánh giá của bạn là hữu ích về sản phẩm "${productName}".`,
            createdAt: new Date().toISOString(),
            read: false,
            link: `/product/${skuStr}`,
            linkLabel: 'Xem phản hồi',
            meta: skuStr,
            meta_label: productName,
          });
        }
      } catch (e) {
        console.warn('[POST /api/reviews/like] Cannot create notice:', e.message);
      }
    }

    const updated = await col.findOne(skuFilter);
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/reviews/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi like đánh giá.' });
  }
});

// POST /api/reviews/reply/like - like / unlike 1 phản hồi đánh giá
app.post('/api/reviews/reply/like', async (req, res) => {
  try {
    const { sku, reviewId, replyId, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const reviewIdStr = String(reviewId || '').trim();
    const replyIdStr = String(replyId || '').trim();
    const userIdStr = String(userId || '').trim();

    if (!skuStr || !reviewIdStr || !replyIdStr || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc.' });
    }

    const col = reviewsCollection();
    const skuFilter = reviewsSkuFilter(skuStr);
    if (!skuFilter) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }

    const doc = await col.findOne(skuFilter);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    const reviewsArr = Array.isArray(doc.reviews) ? [...doc.reviews] : [];
    const ridx = reviewsArr.findIndex((r) => reviewIdEquals(r._id, reviewIdStr));
    if (ridx === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    const review = reviewsArr[ridx];
    const replies = Array.isArray(review.replies) ? [...review.replies] : [];
    const repIdx = replies.findIndex((rep) => reviewIdEquals(rep._id, replyIdStr));
    if (repIdx === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });
    }

    const reply = replies[repIdx];
    const likes = Array.isArray(reply.likes) ? [...reply.likes] : [];
    const likeIdStr = (id) =>
      id && typeof id === 'object' && id.$oid ? String(id.$oid) : String(id || '');
    const idx = likes.findIndex((id) => likeIdStr(id) === userIdStr);
    const addingLike = idx === -1;
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }
    replies[repIdx] = { ...reply, likes };
    reviewsArr[ridx] = { ...review, replies };

    await col.updateOne(skuFilter, {
      $set: { reviews: reviewsArr, updatedAt: new Date() },
    });

    if (addingLike) {
      try {
        const replyAuthorId = reply.user_id ? String(reply.user_id).trim() : '';
        if (
          replyAuthorId &&
          replyAuthorId.toLowerCase() !== userIdStr.toLowerCase()
        ) {
          let likerName = 'Người dùng';
          try {
            const userDoc = await usersCollection().findOne({ $or: [{ user_id: userIdStr }, { _id: userIdStr }] });
            if (userDoc && (userDoc.full_name || userDoc.fullname)) {
              likerName = String(userDoc.full_name || userDoc.fullname).trim() || likerName;
            }
          } catch (_) {}

          let productName = skuStr;
          try {
            const numSku = Number(skuStr);
            const pFilter =
              !isNaN(numSku) && String(numSku) === String(skuStr).trim()
                ? { $or: [{ sku: skuStr }, { sku: numSku }] }
                : { sku: skuStr };
            const pdoc = await productsCollection().findOne(pFilter, {
              projection: { name: 1, product_name: 1, productName: 1 },
            });
            if (pdoc) {
              productName = pdoc.name || pdoc.product_name || pdoc.productName || productName;
            }
          } catch (_) {}

          await noticesCollection().insertOne({
            user_id: replyAuthorId,
            type: 'review_reply',
            noticeTag: 'helpful_like',
            title: 'Có phản hồi cho đánh giá của bạn',
            message: `${likerName} đánh dấu phản hồi của bạn là hữu ích về sản phẩm "${productName}".`,
            createdAt: new Date().toISOString(),
            read: false,
            link: `/product/${skuStr}`,
            linkLabel: 'Xem phản hồi',
            meta: skuStr,
            meta_label: productName,
          });
        }
      } catch (e) {
        console.warn('[POST /api/reviews/reply/like] Cannot create notice:', e.message);
      }
    }

    const updated = await col.findOne(skuFilter);
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/reviews/reply/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi like phản hồi đánh giá.' });
  }
});

// PATCH /api/reviews - chỉnh sửa 1 đánh giá
app.patch('/api/reviews', async (req, res) => {
  try {
    const { sku, reviewId, content, rating, images } = req.body || {};
    const skuStr = String(sku || '').trim();
    const reviewIdStr = String(reviewId || '').trim();
    if (!skuStr || !reviewIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc reviewId.' });
    }

    const col = reviewsCollection();
    const update = {
      $set: {
        'reviews.$.content': content || '',
        'reviews.$.rating': Math.max(1, Math.min(5, Number(rating) || 5)),
        'reviews.$.updatedAt': new Date(),
        updatedAt: new Date()
      }
    };
    if (images !== undefined) {
      update.$set['reviews.$.images'] = Array.isArray(images) ? images : [];
    }

    const result = await col.updateOne(
      { sku: skuStr, 'reviews._id': reviewIdStr },
      update
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    const updated = await col.findOne({ sku: skuStr });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[PATCH /api/reviews] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật đánh giá.' });
  }
});

// DELETE /api/reviews/:sku/:reviewId - xóa 1 đánh giá
app.delete('/api/reviews/:sku/:reviewId', async (req, res) => {
  try {
    const { sku, reviewId } = req.params;
    const skuStr = String(sku || '').trim();
    const reviewIdStr = String(reviewId || '').trim();
    if (!skuStr || !reviewIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc reviewId.' });
    }

    const col = reviewsCollection();
    const result = await col.updateOne(
      { sku: skuStr },
      { $pull: { reviews: { _id: reviewIdStr } }, $set: { updatedAt: new Date() } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá để xóa.' });
    }

    const updated = await col.findOne({ sku: skuStr });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[DELETE /api/reviews/:sku/:reviewId] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa đánh giá.' });
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
    const { sku, question, full_name, user_id, avatar } = req.body || {};
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
      avatar: avatar || '',
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

    // Lưu thông báo cho admin vào collection admin_notice (chỉ admin nhận chuông).
    try {
      await adminNoticeCollection().insertOne({
        type: 'consultation_product',
        title: 'Câu hỏi tư vấn sản phẩm mới',
        message: `${entry.full_name || 'Khách hàng'} vừa gửi câu hỏi về sản phẩm "${productName}".`,
        createdAt: new Date(),
        link: '/admin/consultation-product',
        meta: {
          sku: skuStr,
          questionId: qId,
          productName,
          fullName: entry.full_name || 'Khách hàng',
          userId: uid || '',
        },
        roles: ['admin'],
        resolved: false,
      });
    } catch (e) {
      console.warn('[POST /api/consultations] Cannot create admin_notice:', e?.message || e);
    }

    // Lưu notice cho user (xác nhận câu hỏi đã được gửi)
    if (uid) {
      try {
        await noticesCollection().insertOne({
          user_id: uid,
          type: 'qa_submitted',
          title: 'Câu hỏi đã được gửi',
          message: `Câu hỏi của bạn về sản phẩm "${productName}" đã được gửi. Dược sĩ sẽ phản hồi sớm nhất có thể.`,
          createdAt: new Date().toISOString(),
          read: false,
          link: `/product/${skuStr}`,
          linkLabel: 'Xem câu hỏi',
          meta: skuStr,
          meta_label: productName,
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
    const { sku, questionId, content, fullname, isAdmin, avatar } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    console.log(`[POST /api/consultations/reply] Received: SKU=${skuStr}, QID=${qId}, fullname=${fullname}`);

    if (!skuStr || !qId) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc questionId.' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung trả lời.' });
    }

    const col = consultationsProductCollection();

    // Tìm doc theo SKU (chấp nhận cả string và number để tránh lệch kiểu dữ liệu)
    const skuNum = !isNaN(Number(skuStr)) ? Number(skuStr) : null;
    const skuFilter = skuNum !== null ? { $or: [{ sku: skuStr }, { sku: skuNum }] } : { sku: skuStr };

    const doc = await col.findOne(skuFilter);
    if (!doc) {
      console.log(`[POST /api/consultations/reply] ERROR: Product not found for SKU: ${skuStr}`);
      return res.status(404).json({ success: false, message: `Không tìm thấy sản phẩm với SKU ${skuStr}` });
    }

    const questionEntry = (doc.questions || []).find((q) => String(q.id || q._id || '') === qId);

    const reply = {
      _id: new mongoose.Types.ObjectId().toString(),
      content: String(content).trim(),
      fullname: (fullname && String(fullname).trim()) || 'Khách',
      user_id: req.body.user_id || null,
      avatar: avatar || '',
      is_admin: !!isAdmin,
      time: new Date()
    };

    // Điều kiện khớp question trong arrayFilters (hỗ trợ cả id string, _id string, _id ObjectId)
    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId)) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });
    }

    const updateResult = await col.updateOne(
      skuFilter,
      { $push: { 'questions.$[q].replies': reply }, $set: { updatedAt: new Date() } },
      { arrayFilters: [{ $or: qCriteria }] }
    );

    console.log(`[POST /api/consultations/reply] Update Result: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`);

    if (updateResult.matchedCount === 0) {
      console.log(`[POST /api/consultations/reply] FAILED: Could not match question ID ${qId} in SKU ${skuStr}`);
      return res.status(404).json({ success: false, message: 'Không thể khớp câu hỏi để thêm phản hồi.' });
    }

    const updated = await col.findOne(skuFilter);

    // Thông báo cho chủ câu hỏi khi người khác trả lời
    try {
      const qRef =
        questionEntry ||
        (updated?.questions || []).find((q) => {
          const id = String(q.id || '');
          const oid = q._id != null ? String(q._id) : '';
          return id === qId || oid === qId;
        });
      const authorId = qRef?.user_id ? String(qRef.user_id).trim() : '';
      const replierId = String(reply.user_id || '').trim();
      const replierName = (fullname && String(fullname).trim()) || 'Người dùng';
      if (authorId && replierId && authorId.toLowerCase() !== replierId.toLowerCase()) {
        let productName = doc.productName || skuStr;
        try {
          const pdoc = await productsCollection().findOne(
            { sku: skuStr },
            { projection: { name: 1, product_name: 1, productName: 1 } }
          );
          if (pdoc) {
            productName = pdoc.name || pdoc.product_name || pdoc.productName || productName;
          }
        } catch (_) {}
        await noticesCollection().insertOne({
          user_id: authorId,
          type: 'qa_reply',
          title: 'Có phản hồi cho câu hỏi của bạn',
          message: `${replierName} đã trả lời câu hỏi của bạn về sản phẩm "${productName}".`,
          createdAt: new Date().toISOString(),
          read: false,
          link: `/product/${skuStr}`,
          linkLabel: 'Xem phản hồi',
          meta: skuStr,
          meta_label: productName,
        });
      }
    } catch (e) {
      console.warn('[POST /api/consultations/reply] Cannot create notice:', e.message);
    }

    res.json(updated);
  } catch (err) {
    console.error('[POST /api/consultations/reply] CRITICAL ERROR:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + err.message });
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
    const skuNum = !isNaN(Number(skuStr)) ? Number(skuStr) : null;
    const skuFilter = skuNum !== null ? { $or: [{ sku: skuStr }, { sku: skuNum }] } : { sku: skuStr };

    const doc = await col.findOne(skuFilter);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const question = (doc.questions || []).find((q) => String(q.id || q._id || '') === qId);
    if (!question) {
      console.log(`[POST /api/consultations/like] Question not found in memory. QID=${qId}`);
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const likes = Array.isArray(question.likes) ? [...question.likes] : [];
    const likeIdStr = (id) =>
      id && typeof id === 'object' && id.$oid ? String(id.$oid) : String(id || '');
    const idx = likes.findIndex((id) => likeIdStr(id) === userIdStr);
    const addingLike = idx === -1;
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }

    // Identify question precisely inside array
    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId)) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });
    }

    const updateResult = await col.updateOne(
      skuFilter,
      { $set: { 'questions.$[q].likes': likes, updatedAt: new Date() } },
      { arrayFilters: [{ $or: qCriteria }] }
    );
    console.log(`[POST /api/consultations/like] Result: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`);

    if (addingLike) {
      try {
        const authorId = question.user_id ? String(question.user_id).trim() : '';
        if (authorId && authorId.toLowerCase() !== userIdStr.toLowerCase()) {
          let likerName = 'Người dùng';
          try {
            const userDoc = await usersCollection().findOne({ $or: [{ user_id: userIdStr }, { _id: userIdStr }] });
            if (userDoc && (userDoc.full_name || userDoc.fullname)) {
              likerName = String(userDoc.full_name || userDoc.fullname).trim() || likerName;
            }
          } catch (_) {}

          let productName = doc.productName || skuStr;
          try {
            const numSku = Number(skuStr);
            const pFilter =
              !isNaN(numSku) && String(numSku) === String(skuStr).trim()
                ? { $or: [{ sku: skuStr }, { sku: numSku }] }
                : { sku: skuStr };
            const pdoc = await productsCollection().findOne(pFilter, {
              projection: { name: 1, product_name: 1, productName: 1 },
            });
            if (pdoc) {
              productName = pdoc.name || pdoc.product_name || pdoc.productName || productName;
            }
          } catch (_) {}

          await noticesCollection().insertOne({
            user_id: authorId,
            type: 'qa_reply',
            noticeTag: 'helpful_like',
            title: 'Có phản hồi cho câu hỏi của bạn',
            message: `${likerName} đánh dấu câu hỏi của bạn là hữu ích về sản phẩm "${productName}".`,
            createdAt: new Date().toISOString(),
            read: false,
            link: `/product/${skuStr}`,
            linkLabel: 'Xem phản hồi',
            meta: skuStr,
            meta_label: productName,
          });
        }
      } catch (e) {
        console.warn('[POST /api/consultations/like] Cannot create notice:', e.message);
      }
    }

    const updated = await col.findOne(skuFilter);
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/consultations/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi like câu hỏi.' });
  }
});

// PATCH /api/consultations - chỉnh sửa 1 câu hỏi
app.patch('/api/consultations', async (req, res) => {
  try {
    const { sku, questionId, question } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    if (!skuStr || !qId) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc questionId.' });
    }
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung câu hỏi.' });
    }

    const col = consultationsProductCollection();
    console.log(`[PATCH /api/consultations] SKU=${skuStr}, QID=${qId}`);

    // Identify document by SKU or directly by nested question ID (robust)
    const findQuery = {
      $or: [
        { sku: skuStr },
        { 'questions.id': qId },
        { 'questions._id': qId }
      ]
    };
    if (mongoose.Types.ObjectId.isValid(qId)) {
      findQuery.$or.push({ 'questions._id': new mongoose.Types.ObjectId(qId) });
    }

    // Identifiers for arrayFilters matching
    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId)) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });
    }

    const result = await col.updateOne(
      findQuery,
      {
        $set: {
          'questions.$[q].question': String(question).trim(),
          'questions.$[q].updatedAt': new Date(),
          updatedAt: new Date()
        }
      },
      {
        arrayFilters: [{ $or: qCriteria }]
      }
    );

    console.log(`[PATCH /api/consultations] Update result: matched=${result.matchedCount}, modified=${result.modifiedCount}`);

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const updated = await col.findOne(findQuery);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[PATCH /api/consultations] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật: ' + err.message });
  }
});

// DELETE /api/consultations/:sku/:questionId - xóa 1 câu hỏi
app.delete('/api/consultations/:sku/:questionId', async (req, res) => {
  try {
    const { sku, questionId } = req.params;
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    if (!skuStr || !qId) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc questionId.' });
    }

    const col = consultationsProductCollection();
    console.log(`[DELETE /api/consultations] Attempting delete for SKU: ${skuStr}, QuestionID: ${qId}`);

    // Build pull criteria
    const pullCriteria = [{ id: qId }, { _id: qId }];
    if (mongoose.Types.ObjectId.isValid(qId)) {
      pullCriteria.push({ _id: new mongoose.Types.ObjectId(qId) });
    }

    const result = await col.updateOne(
      { sku: skuStr },
      { $pull: { questions: { $or: pullCriteria } }, $set: { updatedAt: new Date() } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi để xóa.' });
    }

    // Xóa thông báo admin_notice tương ứng để tab thông báo không còn item mồ côi.
    try {
      const qidConds = [{ 'meta.questionId': qId }, { 'meta.question_id': qId }];
      if (mongoose.Types.ObjectId.isValid(qId)) {
        const oid = new mongoose.Types.ObjectId(qId);
        qidConds.push({ 'meta.questionId': oid });
        qidConds.push({ 'meta.question_id': oid });
      }
      await adminNoticeCollection().deleteMany({
        type: 'consultation_product',
        $or: [
          ...qidConds,
          {
            'meta.sku': skuStr,
            'meta.questionId': { $exists: false },
            'meta.question_id': { $exists: false },
          },
        ],
      });
    } catch (e) {
      console.warn('[DELETE /api/consultations/:sku/:questionId] Cannot cleanup admin_notice:', e?.message || e);
    }

    const updated = await col.findOne({ sku: skuStr });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[DELETE /api/consultations/:sku/:questionId] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa câu hỏi.' });
  }
});

// PATCH /api/consultations/reply - chỉnh sửa 1 phản hồi
app.patch('/api/consultations/reply', async (req, res) => {
  try {
    const { sku, questionId, replyId, content, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const rId = String(replyId || '').trim();
    const userIdStr = String(userId || '').trim();

    if (!skuStr || !qId || !rId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin sku, questionId, replyId hoặc userId.' });
    }

    const col = consultationsProductCollection();
    const skuNum = !isNaN(Number(skuStr)) ? Number(skuStr) : null;
    const skuFilter = skuNum !== null ? { $or: [{ sku: skuStr }, { sku: skuNum }] } : { sku: skuStr };

    const doc = await col.findOne(skuFilter);
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });

    const question = doc.questions.find(q => String(q.id || q._id || '') === qId);
    if (!question) return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });

    const reply = (question.replies || []).find(r => String(r._id) === rId);
    if (!reply) return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });

    // Ownership Check
    if (String(reply.user_id) !== userIdStr) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa phản hồi này.' });
    }

    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId)) qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });

    const rCriteria = [{ 'r._id': rId }];

    const result = await col.updateOne(
      skuFilter,
      {
        $set: {
          'questions.$[q].replies.$[r].content': String(content).trim(),
          'questions.$[q].replies.$[r].updatedAt': new Date()
        }
      },
      { arrayFilters: [{ $or: qCriteria }, { $or: rCriteria }] }
    );

    const updated = await col.findOne(skuFilter);
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /api/consultations/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật phản hồi.' });
  }
});

// DELETE /api/consultations/reply/:sku/:questionId/:replyId/:userId - xóa 1 phản hồi
app.delete('/api/consultations/reply/:sku/:questionId/:replyId/:userId', async (req, res) => {
  try {
    const { sku, questionId, replyId, userId } = req.params;
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const rId = String(replyId || '').trim();
    const userIdStr = String(userId || '').trim();

    if (!skuStr || !qId || !rId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin sku, questionId, replyId hoặc userId.' });
    }

    const col = consultationsProductCollection();
    const skuNum = !isNaN(Number(skuStr)) ? Number(skuStr) : null;
    const skuFilter = skuNum !== null ? { $or: [{ sku: skuStr }, { sku: skuNum }] } : { sku: skuStr };

    const doc = await col.findOne(skuFilter);
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });

    const question = doc.questions.find(q => String(q.id || q._id || '') === qId);
    if (!question) return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });

    const reply = (question.replies || []).find(r => String(r._id) === rId);
    if (!reply) return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });

    // Ownership Check
    if (String(reply.user_id) !== userIdStr) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa phản hồi này.' });
    }

    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId)) qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });

    const result = await col.updateOne(
      skuFilter,
      { $pull: { 'questions.$[q].replies': { _id: rId } } },
      { arrayFilters: [{ $or: qCriteria }] }
    );

    const updated = await col.findOne(skuFilter);
    res.json(updated);
  } catch (err) {
    console.error('[DELETE /api/consultations/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa phản hồi.' });
  }
});

// POST /api/consultations/reply/like - like / unlike 1 phản hồi
app.post('/api/consultations/reply/like', async (req, res) => {
  try {
    const { sku, questionId, replyId, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const rId = String(replyId || '').trim();
    const userIdStr = String(userId || '').trim();

    if (!skuStr || !qId || !rId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId, replyId hoặc userId.' });
    }

    const col = consultationsProductCollection();
    const skuNum = !isNaN(Number(skuStr)) ? Number(skuStr) : null;
    const skuFilter = skuNum !== null ? { $or: [{ sku: skuStr }, { sku: skuNum }] } : { sku: skuStr };

    const doc = await col.findOne(skuFilter);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    // Find question and reply in memory to toggle like
    const question = (doc.questions || []).find(q => String(q.id || q._id || '') === qId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const reply = (question.replies || []).find(r => String(r._id || '') === rId);
    if (!reply) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });
    }

    const likes = Array.isArray(reply.likes) ? [...reply.likes] : [];
    const likeIdStr = (id) =>
      id && typeof id === 'object' && id.$oid ? String(id.$oid) : String(id || '');
    const idx = likes.findIndex((id) => likeIdStr(id) === userIdStr);
    const addingLike = idx === -1;
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }

    // Identifiers for arrayFilters matching
    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId)) qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });

    const rCriteria = [{ 'r._id': rId }];

    const result = await col.updateOne(
      skuFilter,
      { $set: { 'questions.$[q].replies.$[r].likes': likes, updatedAt: new Date() } },
      { arrayFilters: [{ $or: qCriteria }, { $or: rCriteria }] }
    );

    console.log(`[POST /api/consultations/reply/like] Result: matched=${result.matchedCount}, modified=${result.modifiedCount}`);

    if (addingLike) {
      try {
        const replyAuthorId = reply.user_id ? String(reply.user_id).trim() : '';
        if (replyAuthorId && replyAuthorId.toLowerCase() !== userIdStr.toLowerCase()) {
          let likerName = 'Người dùng';
          try {
            const userDoc = await usersCollection().findOne({ $or: [{ user_id: userIdStr }, { _id: userIdStr }] });
            if (userDoc && (userDoc.full_name || userDoc.fullname)) {
              likerName = String(userDoc.full_name || userDoc.fullname).trim() || likerName;
            }
          } catch (_) {}

          let productName = doc.productName || skuStr;
          try {
            const numSku = Number(skuStr);
            const pFilter =
              !isNaN(numSku) && String(numSku) === String(skuStr).trim()
                ? { $or: [{ sku: skuStr }, { sku: numSku }] }
                : { sku: skuStr };
            const pdoc = await productsCollection().findOne(pFilter, {
              projection: { name: 1, product_name: 1, productName: 1 },
            });
            if (pdoc) {
              productName = pdoc.name || pdoc.product_name || pdoc.productName || productName;
            }
          } catch (_) {}

          await noticesCollection().insertOne({
            user_id: replyAuthorId,
            type: 'qa_reply',
            noticeTag: 'helpful_like',
            title: 'Có phản hồi cho câu hỏi của bạn',
            message: `${likerName} đánh dấu phản hồi của bạn là hữu ích về sản phẩm "${productName}".`,
            createdAt: new Date().toISOString(),
            read: false,
            link: `/product/${skuStr}`,
            linkLabel: 'Xem phản hồi',
            meta: skuStr,
            meta_label: productName,
          });
        }
      } catch (e) {
        console.warn('[POST /api/consultations/reply/like] Cannot create notice:', e.message);
      }
    }

    const updated = await col.findOne(skuFilter);
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/consultations/reply/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi like phản hồi.' });
  }
});

// POST /api/consultations/expert-answer/like - like / unlike expert answer (the main answer field)
app.post('/api/consultations/expert-answer/like', async (req, res) => {
  try {
    const { sku, questionId, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const userIdStr = String(userId || '').trim();

    if (!skuStr || !qId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId hoặc userId.' });
    }

    const col = consultationsProductCollection();
    const skuNum = !isNaN(Number(skuStr)) ? Number(skuStr) : null;
    const skuFilter = skuNum !== null ? { $or: [{ sku: skuStr }, { sku: skuNum }] } : { sku: skuStr };

    const doc = await col.findOne(skuFilter);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    const question = (doc.questions || []).find(q => String(q.id || q._id || '') === qId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const likes = Array.isArray(question.answerLikes) ? [...question.answerLikes] : [];
    const idx = likes.indexOf(userIdStr);
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }

    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId)) qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });

    const result = await col.updateOne(
      skuFilter,
      { $set: { 'questions.$[q].answerLikes': likes, updatedAt: new Date() } },
      { arrayFilters: [{ $or: qCriteria }] }
    );

    const updated = await col.findOne(skuFilter);
    res.json(updated);
  } catch (err) {
    console.error('[POST /api/consultations/expert-answer/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi like câu trả lời chuyên gia.' });
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

// ========= USER FAVORITES (Health Handbook) =========
// GET /api/favorites?user_id=...
app.get('/api/favorites', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    // 1. Thử lấy từ users_memory (Vùng nhớ đệm/tạm thời)
    let memoryUser = await usersMemoryCollection().findOne({ user_id });
    let favoritesHistory = memoryUser?.favorites || [];

    // 2. Nếu chưa có trong memory, tìm trong users gốc (Lazy Migration)
    if (!memoryUser) {
      const originalUser = await usersCollection().findOne({ user_id });
      if (originalUser && Array.isArray(originalUser.favorites)) {
        favoritesHistory = originalUser.favorites;
        // Migrate sang memory
        await usersMemoryCollection().updateOne(
          { user_id },
          { $set: { user_id, favorites: favoritesHistory, updatedAt: new Date() } },
          { upsert: true }
        );
      }
    }

    if (favoritesHistory.length === 0) {
      return res.json({ success: true, favorites: [] });
    }

    // 3. Hydration: Lấy thông tin đầy đủ từ vinmec_playlists
    const videoIds = favoritesHistory.map(item => String(item.id || item._id));
    const videos = await mongoose.connection.db.collection('vinmec_playlists').find({
      $or: [
        { id: { $in: videoIds } },
        { _id: { $in: videoIds.map(id => (id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) ? new mongoose.Types.ObjectId(id) : id) } }
      ]
    }).toArray();

    // 4. Map ngược lại để giữ đúng thứ tự và bổ sung các trường đầy đủ (Merge để giữ category từ sản phẩm)
    // LIVE HYDRATION: Nếu dữ liệu lưu cũ thiếu category, cố gắng tìm lại từ sản phẩm
    const hydratedFavorites = await Promise.all(favoritesHistory.map(async item => {
      const fullVideo = videos.find(v => String(v.id || v._id) === String(item.id || item._id));
      if (!fullVideo) return item;

      // Ưu tiên categoryName, category, categorySlug từ item
      let savedCatName = (item.categoryName && item.categoryName !== "") ? item.categoryName : (item.category || "");
      let savedCatSlug = item.categorySlug || "";

      // LIVE HYDRATION: Nếu danh mục trống hoặc là "Sức khỏe chung", thử tìm thông tin tốt hơn từ products
      if (!savedCatName || savedCatName === "Sức khỏe chung" || savedCatName === "SỨC KHỎE CHUNG") {
        try {
          const vidId = String(item.id || item._id);
          // Tìm sản phẩm nào có chứa video này
          const productWithVideo = await mongoose.connection.db.collection('products').findOne({
            $or: [
              { "healthVideos.id": vidId },
              { "healthVideos._id": vidId },
              { "healthVideos._id": vidId.length === 24 ? new mongoose.Types.ObjectId(vidId) : vidId }
            ]
          });

          if (productWithVideo && productWithVideo.categoryId) {
            const catId = productWithVideo.categoryId._id || productWithVideo.categoryId;
            const cat = await mongoose.connection.db.collection('categories').findOne({
              $or: [
                { _id: catId },
                { _id: new mongoose.Types.ObjectId(String(catId)) },
                { _id: String(catId) }
              ]
            });
            if (cat) {
              savedCatName = cat.name;
              savedCatSlug = cat.slug;
            }
          }
        } catch (e) {
          console.error('[Live Hydration Error]:', e);
        }
      }

      return {
        ...fullVideo,
        categoryName: savedCatName || fullVideo.categoryName || fullVideo.classification?.playlist || 'Sức khỏe chung',
        categorySlug: savedCatSlug || item.categorySlug || fullVideo.categorySlug || '',
        id: String(fullVideo.id || fullVideo._id)
      };
    }));

    res.json({ success: true, favorites: hydratedFavorites });
  } catch (err) {
    console.error('[GET /api/favorites] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách yêu thích.' });
  }
});

// POST /api/favorites - Thêm video vào danh sách yêu thích
app.post('/api/favorites', async (req, res) => {
  try {
    const { user_id, video } = req.body || {};
    const uid = String(user_id || '').trim();
    const videoData = video || {};
    const vid = String(videoData.id || videoData._id || (videoData._id && videoData._id.$oid ? videoData._id.$oid : videoData._id));

    if (!uid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    if (!vid || vid === 'undefined') {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin video (id).' });
    }

    // Chỉ lưu các trường thiết yếu để hiển thị UI (giảm tải memory)
    const videoToSave = {
      id: vid,
      title: videoData.title || '',
      thumbnail: videoData.thumbnail || '',
      category: (videoData.categoryName && videoData.categoryName !== "") ? videoData.categoryName : (videoData.category || 'Sức khỏe chung'),
      categoryName: (videoData.categoryName && videoData.categoryName !== "") ? videoData.categoryName : (videoData.category || 'Sức khỏe chung'),
      categorySlug: videoData.categorySlug || 'suc-khoe-chung',
      duration: videoData.duration || '',
      date: videoData.date || new Date().toISOString()
    };

    // Thao tác trực tiếp trên users_memory
    await usersMemoryCollection().updateOne(
      { user_id: uid },
      {
        $pull: { favorites: { id: vid } } // Xoá trước nếu đã tồn tại để tránh trùng
      }
    );

    await usersMemoryCollection().updateOne(
      { user_id: uid },
      {
        $push: { favorites: { $each: [videoToSave], $position: 0 } },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    );

    const updatedUser = await usersMemoryCollection().findOne({ user_id: uid });
    res.json({ success: true, favorites: updatedUser?.favorites || [] });
  } catch (err) {
    console.error('[POST /api/favorites] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thêm vào yêu thích.' });
  }
});

// DELETE /api/favorites - Xóa video khỏi danh sách yêu thích (Lưu vào users_memory)
app.delete('/api/favorites', async (req, res) => {
  try {
    const { user_id, videoId } = req.body || {};
    const uid = String(user_id || '').trim();
    const vid = String(videoId || '').trim();

    if (!uid || !vid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id hoặc videoId.' });
    }

    // Xóa trong users_memory
    await usersMemoryCollection().updateOne(
      { user_id: uid },
      {
        $pull: { favorites: { id: vid } },
        $set: { updatedAt: new Date() }
      }
    );

    const updatedUser = await usersMemoryCollection().findOne({ user_id: uid });
    res.json({ success: true, favorites: (updatedUser && updatedUser.favorites) ? updatedUser.favorites : [] });
  } catch (err) {
    console.error('[DELETE /api/favorites] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa khỏi yêu thích.' });
  }
});

// ========= RECENTLY VIEWED PRODUCTS =========
// POST /api/recently-viewed - Lưu sản phẩm vừa xem vào users_memory
app.post('/api/recently-viewed', async (req, res) => {
  try {
    const { user_id, product } = req.body || {};
    const uid = String(user_id || '').trim();
    if (!uid || !product) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id hoặc thông tin sản phẩm.' });
    }

    const productId = String(product._id?.$oid || product._id || product.id || '');
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Thông tin sản phẩm không hợp lệ (thiếu id).' });
    }

    // Chỉ lưu ID, Name và các trường thiết yếu để hiển thị UI
    const productToSave = {
      id: productId,
      name: product.name || '',
      image: product.image || '',
      price: product.price ?? 0,
      discount: product.discount ?? 0,
      slug: product.slug || '',
      viewedAt: new Date()
    };

    // 1. Lấy dữ liệu hiện tại từ users_memory
    const memoryUser = await usersMemoryCollection().findOne({ user_id: uid });
    let recentlyViewed = Array.isArray(memoryUser?.recentlyViewed) ? memoryUser.recentlyViewed : [];

    // 2. Loại bỏ sản phẩm cũ nếu trùng id
    recentlyViewed = recentlyViewed.filter(p => String(p.id || p._id?.$oid || p._id) !== productId);

    // 3. Thêm vào đầu và giới hạn 20 item
    recentlyViewed.unshift(productToSave);
    recentlyViewed = recentlyViewed.slice(0, 20);

    // 4. Cập nhật lại users_memory
    await usersMemoryCollection().updateOne(
      { user_id: uid },
      {
        $set: {
          user_id: uid,
          recentlyViewed,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    res.json({ success: true, recentlyViewed });
  } catch (err) {
    console.error('[POST /api/recently-viewed] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lưu sản phẩm vừa xem.' });
  }
});

// GET /api/recently-viewed - Lấy danh sách sản phẩm vừa xem từ users_memory + Hydration
app.get('/api/recently-viewed', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    // 1. Lấy history từ memory
    const memoryUser = await usersMemoryCollection().findOne({ user_id });
    const history = memoryUser?.recentlyViewed || [];

    if (history.length === 0) {
      return res.json({ success: true, recentlyViewed: [] });
    }

    // 2. Hydration: Lấy thông tin đầy đủ từ collection products
    const productIds = history.map(item => item.id);

    // Tìm products theo nhiều định dạng ID để đảm bảo match
    const products = await productsCollection().find({
      $or: [
        { _id: { $in: productIds.map(id => id.length === 24 ? new mongoose.Types.ObjectId(id) : id) } },
        { id: { $in: productIds } },
        { "_id.$oid": { $in: productIds } }
      ]
    }).toArray();

    // 3. Map ngược lại để giữ đúng thứ tự "vừa xem" và bổ sung viewedAt
    const hydratedHistory = history.map(item => {
      const fullProduct = products.find(p => {
        const pId = String(p._id?.$oid || p._id || p.id || '');
        return pId === item.id;
      });
      return fullProduct ? { ...fullProduct, viewedAt: item.viewedAt } : null;
    }).filter(p => p !== null);

    res.json({ success: true, recentlyViewed: hydratedHistory });
  } catch (err) {
    console.error('[GET /api/recently-viewed] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách vừa xem.' });
  }
});

// DELETE /api/recently-viewed - Xóa sản phẩm khỏi danh sách vừa xem trong users_memory
app.delete('/api/recently-viewed', async (req, res) => {
  try {
    const { user_id, productId } = req.body || {};
    const uid = String(user_id || '').trim();
    const pid = String(productId || '').trim();

    if (!uid || !pid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id hoặc productId.' });
    }

    // Xóa trong users_memory (hỗ trợ cả p.id và p._id)
    await usersMemoryCollection().updateOne(
      { user_id: uid },
      {
        $pull: {
          recentlyViewed: {
            $or: [
              { id: pid },
              { _id: pid },
              { "_id.$oid": pid }
            ]
          }
        },
        $set: { updatedAt: new Date() }
      }
    );

    const updatedUser = await usersMemoryCollection().findOne({ user_id: uid });
    res.json({ success: true, recentlyViewed: updatedUser?.recentlyViewed || [] });
  } catch (err) {
    console.error('[DELETE /api/recently-viewed] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa sản phẩm vừa xem.' });
  }
});

// DELETE /api/recently-viewed/all - Xóa toàn bộ danh sách vừa xem trong users_memory
app.delete('/api/recently-viewed/all', async (req, res) => {
  try {
    const { user_id } = req.body || {};
    const uid = String(user_id || '').trim();

    if (!uid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    await usersMemoryCollection().updateOne(
      { user_id: uid },
      {
        $set: {
          recentlyViewed: [],
          updatedAt: new Date()
        }
      }
    );

    res.json({ success: true, recentlyViewed: [] });
  } catch (err) {
    console.error('[DELETE /api/recently-viewed/all] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa danh sách vừa xem.' });
  }
});

// ========= USER COINS & STREAKS (Users_memory) =========
/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD (theo lịch, không dùng UTC midnight của Date local — tránh lệch chuỗi xu). */
function addDaysToDateKey(key, deltaDays) {
  const parts = String(key || '').trim().split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (Number(deltaDays) || 0));
  return dt.toISOString().slice(0, 10);
}

// GET /api/users-memory/coins?user_id=...
app.get('/api/users-memory/coins', async (req, res) => {
  try {
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) return res.status(400).json({ success: false, message: 'Thiếu user_id.' });

    const memoryUser = await usersMemoryCollection().findOne({ user_id });
    if (!memoryUser) {
      // Khởi tạo nếu chưa có
      const newData = {
        user_id,
        coins: { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] },
        updatedAt: new Date()
      };
      await usersMemoryCollection().insertOne(newData);
      return res.json({ success: true, coins: newData.coins });
    }

    res.json({ success: true, coins: memoryUser.coins || { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] } });
  } catch (err) {
    console.error('[GET /api/users-memory/coins] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/users-memory/coins/reward
// Body: { user_id, amount, dateKey, reason }
app.post('/api/users-memory/coins/reward', async (req, res) => {
  try {
    const { user_id, amount, dateKey, reason } = req.body || {};
    if (!user_id) return res.status(400).json({ success: false, message: 'Thiếu user_id.' });

    const memoryUser = await usersMemoryCollection().findOne({ user_id });
    let coins = memoryUser?.coins || { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] };

    // Idempotency check: don't apply reward twice for the same date
    if (coins.lastCompletedDate === dateKey) {
      return res.json({ success: true, message: 'Reward already applied for this date.', coins });
    }

    // Streak: so sánh ngày theo dateKey (VN) — KHÔNG dùng toISOString() (UTC) vì lệch ngày so với client.
    let newStreak = 1;
    const prev = coins.lastCompletedDate;
    const cur = String(dateKey || '').trim();
    if (prev && cur && prev === addDaysToDateKey(cur, -1)) {
      newStreak = Math.max(Number(coins.currentStreak) || 0, 1) + 1;
    }

    const amt = Number(amount) || 0;
    const newBalance = (Number(coins.balance) || 0) + amt;
    const newEntry = {
      amount: amt,
      reason: reason || 'Hoàn thành nhắc nhở',
      date: new Date().toISOString(),
      dateKey,
      transactionId: new mongoose.Types.ObjectId().toString()
    };

    coins = {
      balance: newBalance,
      lastCompletedDate: dateKey,
      currentStreak: newStreak,
      history: [newEntry, ...(coins.history || [])]
    };

    await usersMemoryCollection().updateOne(
      { user_id },
      { $set: { user_id, coins, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, coins });
  } catch (err) {
    console.error('[POST /api/users-memory/coins/reward] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xử lý xu.' });
  }
});

// POST /api/users-memory/coins/order-reward
// Body: { user_id, orderCode, amount }
// Thưởng xu cho đơn hàng đã nhận, KHÔNG đụng vào streak/lastCompletedDate.
app.post('/api/users-memory/coins/order-reward', async (req, res) => {
  try {
    const { user_id, orderCode, amount } = req.body || {};
    const uid = String(user_id || '').trim();
    const code = String(orderCode || '').trim();
    const amt = Math.max(0, Math.floor(Number(amount) || 0));

    if (!uid) return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    if (!code) return res.status(400).json({ success: false, message: 'Thiếu orderCode.' });
    if (amt <= 0) return res.status(400).json({ success: false, message: 'amount phải lớn hơn 0.' });

    const dateKey = `order-received-${code}`;
    const memoryUser = await usersMemoryCollection().findOne({ user_id: uid });
    const coins = memoryUser?.coins || { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] };
    const history = Array.isArray(coins.history) ? coins.history : [];

    // Idempotency: mỗi mã đơn chỉ thưởng 1 lần.
    const existed = history.some((h) => String(h?.dateKey || '') === dateKey);
    if (existed) {
      return res.json({ success: true, alreadyApplied: true, coins });
    }

    const newEntry = {
      amount: amt,
      reason: `Nhận hàng đơn ${code}`,
      date: new Date().toISOString(),
      dateKey,
      transactionId: new mongoose.Types.ObjectId().toString()
    };
    const newCoins = {
      ...coins,
      balance: (Number(coins.balance) || 0) + amt,
      history: [newEntry, ...history]
    };

    await usersMemoryCollection().updateOne(
      { user_id: uid },
      { $set: { user_id: uid, coins: newCoins, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, alreadyApplied: false, coins: newCoins });
  } catch (err) {
    console.error('[POST /api/users-memory/coins/order-reward] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thưởng xu đơn hàng.' });
  }
});

// POST /api/users-memory/coins/review-reward
// Body: { user_id, orderCode, amount }
// Thưởng xu cho hành động đánh giá đơn hàng.
// Idempotency: mỗi orderCode chỉ thưởng 1 lần.
app.post('/api/users-memory/coins/review-reward', async (req, res) => {
  try {
    const { user_id, orderCode, amount } = req.body || {};
    const uid = String(user_id || '').trim();
    const code = String(orderCode || '').trim();
    const amt = Math.max(0, Math.floor(Number(amount) || 0));

    if (!uid) return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    if (!code) return res.status(400).json({ success: false, message: 'Thiếu orderCode.' });
    if (amt <= 0) return res.status(400).json({ success: false, message: 'amount phải lớn hơn 0.' });

    const dateKey = `review-reward-${code}`;
    const memoryUser = await usersMemoryCollection().findOne({ user_id: uid });
    let coins = memoryUser?.coins || { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] };
    const history = Array.isArray(coins.history) ? coins.history : [];

    // Idempotency: mỗi orderCode chỉ thưởng 1 lần.
    const existed = history.some((h) => String(h?.dateKey || '') === dateKey);
    if (existed) {
      return res.json({ success: true, alreadyApplied: true, coins });
    }

    const newEntry = {
      amount: amt,
      reason: `Đánh giá đơn hàng ${code}`,
      date: new Date().toISOString(),
      dateKey,
      transactionId: new mongoose.Types.ObjectId().toString()
    };

    const newCoins = {
      ...coins,
      // Chỉ cộng balance + history, không đụng streak
      balance: (Number(coins.balance) || 0) + amt,
      history: [newEntry, ...(coins.history || [])]
    };

    await usersMemoryCollection().updateOne(
      { user_id: uid },
      { $set: { user_id: uid, coins: newCoins, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, alreadyApplied: false, coins: newCoins });
  } catch (err) {
    console.error('[POST /api/users-memory/coins/review-reward] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thưởng xu đánh giá.' });
  }
});

// POST /api/users-memory/coins/quiz-reward
// Body: { user_id, quiz_id, claimToken } — 50 xu/lần, tối đa 2 lần/ngày (100 xu), múi giờ VN; idempotent theo claimToken
app.post('/api/users-memory/coins/quiz-reward', async (req, res) => {
  try {
    const QUIZ_COIN_AMOUNT = 50;
    const QUIZ_DAILY_MAX = 2;
    const QUIZ_REASON = 'Hoàn thành bài kiểm tra sức khỏe';

    const vnDateKey = () =>
      new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 10);

    const isQuizHealthEntry = (h) => String(h?.reason || '').trim() === QUIZ_REASON;

    const countQuizRewardsToday = (history) => {
      const today = vnDateKey();
      return (history || []).filter((h) => {
        if (!isQuizHealthEntry(h)) return false;
        if (!h.date) return false;
        const vn = new Date(h.date)
          .toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
          .slice(0, 10);
        return vn === today;
      }).length;
    };

    const { user_id, quiz_id, claimToken } = req.body || {};
    const uid = String(user_id || '').trim();
    const qid = String(quiz_id || '').trim();
    const tok = String(claimToken || '').trim();

    if (!uid) return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    if (!qid) return res.status(400).json({ success: false, message: 'Thiếu quiz_id.' });
    if (!tok) return res.status(400).json({ success: false, message: 'Thiếu claimToken.' });

    const dateKey = `quiz-health-${tok}`;
    const memoryUser = await usersMemoryCollection().findOne({ user_id: uid });
    let coins = memoryUser?.coins || { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] };
    const history = Array.isArray(coins.history) ? coins.history : [];

    const existed = history.some((h) => String(h?.dateKey || '') === dateKey);
    if (existed) {
      return res.json({ success: true, alreadyApplied: true, coins });
    }

    if (countQuizRewardsToday(history) >= QUIZ_DAILY_MAX) {
      return res.json({
        success: false,
        message: 'Bạn đã nhận đủ 100 xu từ bài test hôm nay (tối đa 2 bài).',
        coins,
      });
    }

    const newEntry = {
      amount: QUIZ_COIN_AMOUNT,
      reason: QUIZ_REASON,
      date: new Date().toISOString(),
      dateKey,
      transactionId: new mongoose.Types.ObjectId().toString(),
      quiz_id: qid,
    };

    const newCoins = {
      ...coins,
      balance: (Number(coins.balance) || 0) + QUIZ_COIN_AMOUNT,
      history: [newEntry, ...history],
    };

    await usersMemoryCollection().updateOne(
      { user_id: uid },
      { $set: { user_id: uid, coins: newCoins, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, alreadyApplied: false, coins: newCoins });
  } catch (err) {
    console.error('[POST /api/users-memory/coins/quiz-reward] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thưởng xu bài test.' });
  }
});

// POST /api/users-memory/coins/reset
app.post('/api/users-memory/coins/reset', async (req, res) => {
  try {
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ success: false, message: 'Thiếu user_id.' });

    await usersMemoryCollection().updateOne(
      { user_id },
      {
        $set: {
          'coins.balance': 0,
          'coins.currentStreak': 0,
          'coins.lastCompletedDate': null,
          'coins.history': [],
          updatedAt: new Date()
        }
      }
    );
    res.json({ success: true, message: 'Đã reset toàn bộ dữ liệu xu.' });
  } catch (err) {
    console.error('[POST /api/users-memory/coins/reset] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi reset xu.' });
  }
});

// POST /api/reminders/reset-today-logs
// Body: { user_id, dateKey } - Xóa completion_log hôm nay để test lại flow tick thưởng xu
app.post('/api/reminders/reset-today-logs', async (req, res) => {
  try {
    const { user_id, dateKey } = req.body || {};
    if (!user_id || !dateKey) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id hoặc dateKey.' });
    }

    // Lấy collection reminders
    const remindersColl = mongoose.connection.db.collection('reminders');

    // Xóa các completion_log entries có date === dateKey cho user này
    const result = await remindersColl.updateMany(
      { user_id },
      { $pull: { completion_log: { date: dateKey } } }
    );

    res.json({
      success: true,
      message: `Đã xóa log hoàn thành ngày ${dateKey} (${result.modifiedCount} nhắc nhở được reset).`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('[POST /api/reminders/reset-today-logs] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi reset log.' });
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

/**
 * Tìm 1 document bệnh trong Mongo (hoặc fallback benh.json) theo slug/id URL.
 * Dùng lại cho GET /api/diseases/:id và khi resolve slug từ consultations_disease.
 */
async function findDiseaseDocByLookupId(col, idRaw) {
  const id = String(idRaw || '').trim();
  if (!id) return null;

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
    allCandidates.add(v);
    if (!v.startsWith('benh/')) {
      allCandidates.add(`benh/${v}`);
      // Slug trong DB thường là `benh/ten-benh-123.html` — bắt buộc có .html đúng chỗ
      if (!/\.html?$/i.test(v)) {
        allCandidates.add(`benh/${v}.html`);
      }
    } else {
      allCandidates.add(v.replace(/^benh\//i, ''));
    }
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
  // `id` trong JSON nguồn có thể là số (vd. 1) trong khi URL truyền chuỗi "1"
  if (/^\d+$/.test(id)) {
    const n = Number(id);
    if (Number.isFinite(n)) or.push({ id: n });
  }
  if (mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id) {
    or.push({ _id: new mongoose.Types.ObjectId(id) });
  }

  let doc = await col.findOne({ $or: or });

  if (!doc) {
    const local = loadLocalDiseases();
    if (Array.isArray(local) && local.length > 0) {
      doc =
        local.find((item) => {
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

  return doc || null;
}

/**
 * Slug URL ngắn (vd. benh-nao-gan) có thể khác slug trong DB (vd. benh-nao-gan-545.html).
 */
async function findDiseaseDocByFuzzySlug(col, idRaw) {
  const id = String(idRaw || '').trim();
  if (!id || id.length < 2) return null;
  const esc = escapeRegExp(id);
  const or = [
    { slug: { $regex: new RegExp(`^${esc}(-[0-9]+)?(\\.html)?$`, 'i') } },
    { slug: { $regex: new RegExp(`[/-]${esc}(-[0-9]+)?(\\.html)?$`, 'i') } },
    { id: { $regex: new RegExp(`^${esc}(-[0-9]+)?$`, 'i') } },
    { slug: { $regex: new RegExp(`^${esc}(-|$|\\.|-)`, 'i') } },
  ];
  try {
    const d = await col.findOne({ $or: or });
    return d || null;
  } catch (e) {
    console.warn('[findDiseaseDocByFuzzySlug]', e?.message || e);
    return null;
  }
}

app.get('/api/diseases/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'Not found' });
    const db = mongoose.connection.db;
    const col = await resolveDiseaseCollection(db);

    let doc = await findDiseaseDocByLookupId(col, id);

    /**
     * Thông báo / link đôi khi chỉ có slug rút gọn (vd. benh-nao-gan) trong khi
     * consultations_disease.sku lưu bản đầy đủ (vd. benh-nao-gan-545 / benh/...html).
     * Lấy đúng sku trong consultations rồi tra lại bài bệnh.
     */
    let cdoc = null;
    if (!doc) {
      try {
        const consultCol = mongoose.connection.db.collection('consultations_disease');
        const cands = getDiseaseSkuLookupCandidates(id);
        cdoc = cands.length ? await consultCol.findOne({ sku: { $in: cands } }) : null;
        if (!cdoc && id.length >= 2) {
          const esc = escapeRegExp(id);
          cdoc = await consultCol.findOne({
            $or: [
              { sku: { $regex: new RegExp(`^${esc}-`, 'i') } },
              { sku: { $regex: new RegExp(`^${esc}(\\.html)?$`, 'i') } },
              { sku: { $regex: new RegExp(`^${esc}/`, 'i') } },
              { sku: { $regex: new RegExp(`${esc}\\.html`, 'i') } },
              { sku: { $regex: new RegExp(`[/-]${esc}(\\.html)?$`, 'i') } },
              { sku: { $regex: new RegExp(`^${esc}`, 'i') } },
            ],
          });
        }
        if (cdoc && cdoc.sku) {
          const resolved = String(cdoc.sku).trim();
          if (resolved) {
            doc = await findDiseaseDocByLookupId(col, resolved);
          }
        }
      } catch (e) {
        console.warn('[GET /api/diseases/:id] consultations_disease resolve:', e?.message || e);
      }
    }

    if (!doc) {
      doc = await findDiseaseDocByFuzzySlug(col, id);
    }

    if (!doc && cdoc && cdoc.productName) {
      try {
        const pn = String(cdoc.productName).trim();
        if (pn.length >= 2) {
          const escN = escapeRegExp(pn);
          doc = await col.findOne({ name: { $regex: new RegExp(`^${escN}$`, 'i') } });
          if (!doc) {
            doc = await col.findOne({ headline: { $regex: new RegExp(`^${escN}$`, 'i') } });
          }
        }
      } catch (e) {
        console.warn('[GET /api/diseases/:id] name resolve:', e?.message || e);
      }
    }

    if (!doc) return res.json({ message: 'Not found' });
    res.json(doc);
  } catch (err) {
    console.error('[GET /api/diseases/:id] Error:', err);
    res.json({ message: 'Not found' });
  }
});

/** Đếm điểm đánh giá độ hữu ích bài bệnh (object userId → điểm 1–5). */
function buildDiseaseArticleRatingPayload(votes, userIdOpt) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const obj = votes && typeof votes === 'object' && !Array.isArray(votes) ? votes : {};
  let total = 0;
  let sum = 0;
  for (const raw of Object.values(obj)) {
    const s = Math.round(Number(raw));
    if (!Number.isFinite(s) || s < 1 || s > 5) continue;
    counts[s] = (counts[s] || 0) + 1;
    total += 1;
    sum += s;
  }
  const userId = String(userIdOpt || '').trim();
  let userScore = null;
  if (userId && Object.prototype.hasOwnProperty.call(obj, userId)) {
    const u = Math.round(Number(obj[userId]));
    if (Number.isFinite(u) && u >= 1 && u <= 5) userScore = u;
  }
  return {
    counts,
    total,
    average: total ? Math.round((sum / total) * 10) / 10 : 0,
    userScore,
  };
}

// GET /api/diseases/article-rating/:sku — thống kê + (tuỳ chọn) điểm của user (?userId=)
app.get('/api/diseases/article-rating/:sku', async (req, res) => {
  try {
    const sku = decodeURIComponent(String(req.params.sku || '').trim());
    const userId = String(req.query.userId || '').trim();
    if (!sku) {
      return res.status(400).json({ success: false, message: 'Thiếu mã bài bệnh.' });
    }
    const doc = await DiseaseArticleRatingModel.findOne({ diseaseKey: sku }).lean();
    const votes = doc?.votes;
    const payload = buildDiseaseArticleRatingPayload(votes, userId);
    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('[GET /api/diseases/article-rating/:sku] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải đánh giá.' });
  }
});

// POST /api/diseases/article-rating — gửi / đổi điểm 1–5 (mỗi user một điểm)
app.post('/api/diseases/article-rating', async (req, res) => {
  try {
    const { sku, score, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const userIdStr = String(userId || '').trim();
    const sc = Math.round(Number(score));
    if (!skuStr || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc userId.' });
    }
    if (!Number.isFinite(sc) || sc < 1 || sc > 5) {
      return res.status(400).json({ success: false, message: 'Điểm đánh giá từ 1 đến 5.' });
    }

    let doc = await DiseaseArticleRatingModel.findOne({ diseaseKey: skuStr });
    if (!doc) {
      doc = new DiseaseArticleRatingModel({ diseaseKey: skuStr, votes: {} });
    }
    if (!doc.votes || typeof doc.votes !== 'object' || Array.isArray(doc.votes)) {
      doc.votes = {};
    }
    doc.votes[userIdStr] = sc;
    doc.markModified('votes');
    await doc.save();

    const payload = buildDiseaseArticleRatingPayload(doc.votes, userIdStr);
    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('[POST /api/diseases/article-rating] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu đánh giá.' });
  }
});

/** Slug trong URL Angular: /benh/:id — chuẩn hoá từ sku CMS (vd benh/bai-nao-tre-em-6.html) */
function diseaseConsultationBenhPath(sku) {
  let s = String(sku || '').trim();
  if (!s) return { href: '/disease', routeId: '' };
  if (s.toLowerCase().startsWith('benh/')) s = s.slice(5);
  s = s.replace(/\.html$/i, '');
  const parts = s.split('/').filter(Boolean);
  const routeId = parts.length ? parts[parts.length - 1] : s;
  return { href: `/benh/${routeId}`, routeId };
}

/**
 * Các biến thể slug/sku để khớp `consultations_disease.sku` với `benh.slug` (cùng logic GET /api/diseases/:id).
 * Tránh POST lưu một khóa, GET tìm khóa khác → câu hỏi “mất” trên UI.
 */
function getDiseaseSkuLookupCandidates(rawInput) {
  const id = String(rawInput || '').trim();
  if (!id) return [];
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
    allCandidates.add(v);
    if (!v.startsWith('benh/')) {
      allCandidates.add(`benh/${v}`);
    } else {
      allCandidates.add(v.replace(/^benh\//i, ''));
    }
    if (!/\.html?$/i.test(v)) {
      allCandidates.add(`${v}.html`);
    } else {
      allCandidates.add(v.replace(/\.html?$/i, ''));
    }
  }
  return [...allCandidates].filter(Boolean);
}

/** Chuỗi id ổn định cho câu hỏi trong consultations_disease (Mixed schema — _id có thể là ObjectId hoặc string). */
function diseaseQuestionIdString(q) {
  if (!q || typeof q !== 'object') return '';
  if (q._id != null) {
    if (typeof q._id === 'object' && q._id.$oid) return String(q._id.$oid);
    return String(q._id);
  }
  if (q.id != null) return String(q.id);
  return '';
}

function diseaseConsultationQuestionMatchesId(q, questionId) {
  const want = String(questionId ?? '').trim();
  if (!want || !q) return false;
  const sid = diseaseQuestionIdString(q);
  if (sid === want) return true;
  if (mongoose.Types.ObjectId.isValid(want) && mongoose.Types.ObjectId.isValid(sid)) {
    try {
      return new mongoose.Types.ObjectId(want).equals(new mongoose.Types.ObjectId(sid));
    } catch (_) {
      return false;
    }
  }
  return false;
}

function findDiseaseQuestionByClientId(questions, questionId) {
  if (!Array.isArray(questions)) return null;
  return questions.find((q) => diseaseConsultationQuestionMatchesId(q, questionId)) || null;
}

/**
 * Bổ sung `consultedByName` cho thông báo tư vấn bệnh khi DB notice thiếu nhưng `consultations_disease` đã có `answeredBy`.
 */
async function enrichPharmacistDiseaseNoticeConsultedBy(doc) {
  if (!doc || String(doc.type || '') !== 'consultation_disease') return doc;
  if (doc.resolved !== true) return doc;
  let existing = String(doc.consultedByName || '').trim();
  if (existing && existing !== 'Dược sĩ' && existing !== 'Admin') return doc;
  const meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
  const sku = String(meta.sku || '').trim();
  const qid = String(meta.questionId || '').trim();
  if (!sku || !qid) return doc;
  try {
    const skuCand = getDiseaseSkuLookupCandidates(sku);
    if (!skuCand.length) return doc;
    const col = mongoose.connection.db.collection('consultations_disease');
    const diseaseDocs = await col.find({ sku: { $in: skuCand } }).toArray();
    for (const diseaseDoc of diseaseDocs) {
      const q = findDiseaseQuestionByClientId(diseaseDoc.questions || [], qid);
      if (!q) continue;
      const ab = String(q.answeredBy || '').trim();
      if (ab && ab !== 'Dược sĩ' && ab !== 'Admin') {
        return { ...doc, consultedByName: ab };
      }
    }
  } catch (_) {
    /* ignore */
  }
  return doc;
}

/** Gộp câu hỏi từ nhiều document consultations_disease (legacy trùng sku khác dạng). */
function mergeDiseaseConsultationQuestionsFromDocs(docs) {
  const seen = new Set();
  const out = [];
  for (const d of docs || []) {
    for (const q of d.questions || []) {
      const qid = diseaseQuestionIdString(q);
      if (!qid || seen.has(qid)) continue;
      seen.add(qid);
      out.push(q);
    }
  }
  out.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  return out;
}

function normalizeDiseaseConsultationQuestion(q) {
  if (!q || typeof q !== 'object') return q;
  const o = { ...q };
  const oid = o._id != null ? String(o._id) : '';
  if (!o.id) o.id = oid;
  if (!Array.isArray(o.likes)) o.likes = [];
  if (!Array.isArray(o.replies)) o.replies = [];
  o.replies = o.replies.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const rr = { ...r };
    if (!Array.isArray(rr.likes)) rr.likes = [];
    return rr;
  });
  return o;
}

function diseaseConsultationResponsePayload(doc) {
  if (!doc) return { sku: '', productName: '', questions: [] };
  const lean = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const questions = (lean.questions || []).map((q) => normalizeDiseaseConsultationQuestion(q));
  return {
    sku: lean.sku,
    productName: lean.productName,
    questions,
  };
}

// GET /api/consultations/disease/:id - Lấy danh sách câu hỏi về bệnh (id có thể là slug hoặc productId)
app.get('/api/consultations/disease/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(String(req.params.id || '').trim());
    const cands = getDiseaseSkuLookupCandidates(id);
    if (!cands.length) {
      return res.json({ success: true, questions: [] });
    }
    const docs = await ConsultationDiseaseModel.find({ sku: { $in: cands } }).lean();
    if (!docs.length) {
      return res.json({ success: true, questions: [] });
    }
    const merged = mergeDiseaseConsultationQuestionsFromDocs(docs);
    const questions = merged.map((q) => normalizeDiseaseConsultationQuestion(q));
    res.json({ success: true, questions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/consultations/disease - Gửi câu hỏi mới về bệnh
// Dùng driver MongoDB $push / insertOne (giống POST /api/consultations). Mongoose genericSchema
// không markModified → .push() + .save() thường không ghi `questions` dù API vẫn 201.
app.post('/api/consultations/disease', async (req, res) => {
  try {
    const { sku, productName, question, user_id, full_name } = req.body;

    if (!sku || !question) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin sku hoặc câu hỏi.' });
    }

    const skuIn = String(sku).trim();
    const skuCandidates = getDiseaseSkuLookupCandidates(skuIn);
    const col = mongoose.connection.db.collection('consultations_disease');

    const qId = new mongoose.Types.ObjectId().toString();
    const newQuestion = {
      _id: qId,
      id: qId,
      question: String(question).trim(),
      user_id: user_id ? String(user_id) : '',
      full_name: full_name ? String(full_name).trim() : 'Khách vãng lai',
      status: 'pending',
      createdAt: new Date().toISOString(),
      answer: null,
      replies: [],
      likes: [],
    };

    const existing = await col.findOne({ sku: { $in: skuCandidates } });
    let storedSku;

    if (!existing) {
      storedSku = skuIn;
      await col.insertOne({
        sku: skuIn,
        productName: String(productName || '').trim() || skuIn,
        questions: [newQuestion],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      storedSku = String(existing.sku ?? skuIn).trim();
      await col.updateOne(
        { _id: existing._id },
        { $push: { questions: newQuestion }, $set: { updatedAt: new Date() } }
      );
    }

    try {
      const displayName = String(productName || '').trim() || String(storedSku);
      const fn = String(full_name || '').trim() || 'Khách vãng lai';
      // Broadcast: không gán pharmacistId — GET /api/admin/notifications?role=pharmacist trả về cho mọi dược sĩ.
      await pharmacistNoticeCollection().insertOne({
        type: 'consultation_disease',
        title: 'Câu hỏi tư vấn bệnh mới',
        message: `${fn} vừa hỏi về bệnh ${displayName}`.trim(),
        createdAt: new Date(),
        link: '/admin/consultation-disease',
        roles: ['pharmacist'],
        resolved: false,
        meta: {
          sku: storedSku,
          questionId: String(newQuestion._id),
          productName: displayName,
          full_name: fn,
        },
      });
    } catch (e) {
      console.warn('[POST /api/consultations/disease] pharmacist_notice:', e?.message || e);
    }

    // Tạo thông báo cho user khi gửi câu hỏi về bệnh thành công
    if (user_id) {
      try {
        const { href, routeId } = diseaseConsultationBenhPath(storedSku);
        const displayName = String(productName || '').trim() || routeId || storedSku;
        await noticesCollection().insertOne({
          user_id: String(user_id),
          type: 'qa_submitted',
          title: 'Câu hỏi đã được gửi',
          message: `Câu hỏi của bạn về "${productName || storedSku}" đã được gửi. Chúng tôi sẽ phản hồi sớm nhất có thể.`,
          createdAt: new Date().toISOString(),
          read: false,
          link: href,
          linkLabel: 'Xem câu hỏi',
          meta: routeId || storedSku,
          meta_label: displayName,
        });
      } catch (e) {
        console.warn('[POST /api/consultations/disease] Cannot create notice:', e.message);
      }
    }

    res.status(201).json({ success: true, data: newQuestion });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/consultations/disease/reply — người dùng / dược sĩ trả lời câu hỏi về bệnh (lưu consultations_disease)
// Dùng driver MongoDB $push + arrayFilters (giống /api/consultations/reply). Mongoose .save() trên mảng lồng
// questions[].replies thường không markModified → không ghi DB dù API vẫn 200.
app.post('/api/consultations/disease/reply', async (req, res) => {
  try {
    const { sku, questionId, content, fullname, isAdmin, avatar, user_id } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    if (!skuStr || !qId) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc questionId.' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung trả lời.' });
    }

    const col = mongoose.connection.db.collection('consultations_disease');
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hỏi đáp bệnh.' });
    }

    const questions = doc.questions || [];
    const questionMatchesId = (q) => {
      if (!q || typeof q !== 'object') return false;
      const id = q.id != null ? String(q.id) : '';
      let oid = '';
      if (q._id != null) {
        if (typeof q._id === 'object' && q._id.$oid) oid = String(q._id.$oid);
        else oid = String(q._id);
      }
      return id === qId || oid === qId;
    };
    const questionEntry = questions.find(questionMatchesId);
    if (!questionEntry) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const reply = {
      _id: new mongoose.Types.ObjectId().toString(),
      content: String(content).trim(),
      fullname: (fullname && String(fullname).trim()) || 'Khách',
      user_id: user_id ? String(user_id).trim() : null,
      avatar: avatar || '',
      is_admin: !!isAdmin,
      time: new Date(),
      likes: [],
    };

    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId) && String(new mongoose.Types.ObjectId(qId)) === qId) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });
    }

    const updateResult = await col.updateOne(
      { sku: skuStr },
      { $push: { 'questions.$[q].replies': reply }, $set: { updatedAt: new Date() } },
      { arrayFilters: [{ $or: qCriteria }] }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hỏi đáp bệnh.' });
    }

    const freshAfter = await col.findOne({ sku: skuStr });
    const qAfter = (freshAfter?.questions || []).find(questionMatchesId);
    const hasNew =
      Array.isArray(qAfter?.replies) && qAfter.replies.some((r) => r && String(r._id) === reply._id);
    if (!hasNew) {
      console.error('[POST /api/consultations/disease/reply] Reply missing after update', {
        sku: skuStr,
        qId,
        modifiedCount: updateResult.modifiedCount,
      });
      return res.status(500).json({
        success: false,
        message: 'Không ghi được phản hồi (lỗi khớp dữ liệu). Vui lòng thử lại.',
      });
    }

    try {
      const authorId = questionEntry.user_id ? String(questionEntry.user_id).trim() : '';
      const replierId = user_id ? String(user_id).trim() : '';
      const replierName = (fullname && String(fullname).trim()) || 'Người dùng';
      if (
        authorId &&
        replierId &&
        authorId.toLowerCase() !== replierId.toLowerCase()
      ) {
        const diseaseName = doc.productName || skuStr;
        const { href, routeId } = diseaseConsultationBenhPath(skuStr);
        await noticesCollection().insertOne({
          user_id: authorId,
          type: 'qa_reply',
          title: 'Có phản hồi cho câu hỏi của bạn',
          message: `${replierName} đã trả lời câu hỏi của bạn về bệnh "${diseaseName}".`,
          createdAt: new Date().toISOString(),
          read: false,
          link: href,
          linkLabel: 'Xem phản hồi',
          meta: routeId || skuStr,
          meta_label: diseaseName,
        });
      }
    } catch (e) {
      console.warn('[POST /api/consultations/disease/reply] Cannot create notice:', e.message);
    }

    res.json(diseaseConsultationResponsePayload(freshAfter));
  } catch (err) {
    console.error('[POST /api/consultations/disease/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi gửi phản hồi.' });
  }
});

// PATCH /api/consultations/disease/reply — chỉnh sửa phản hồi (chỉ đúng user_id)
app.patch('/api/consultations/disease/reply', async (req, res) => {
  try {
    const { sku, questionId, replyId, content, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const rId = String(replyId || '').trim();
    const userIdStr = String(userId || '').trim();

    if (!skuStr || !qId || !rId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId, replyId hoặc userId.' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung phản hồi.' });
    }

    const col = mongoose.connection.db.collection('consultations_disease');
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy hỏi đáp bệnh.' });

    const question = (doc.questions || []).find((q) => {
      const id = q?.id != null ? String(q.id) : '';
      let oid = '';
      if (q?._id != null) {
        oid = typeof q._id === 'object' && q._id.$oid ? String(q._id.$oid) : String(q._id);
      }
      return id === qId || oid === qId;
    });
    if (!question) return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });

    const reply = (question.replies || []).find((r) => String(r?._id || '') === rId);
    if (!reply) return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });

    if (String(reply.user_id || '') !== userIdStr) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa phản hồi này.' });
    }

    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId) && String(new mongoose.Types.ObjectId(qId)) === qId) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });
    }
    const rCriteria = [{ 'r._id': rId }];
    if (mongoose.Types.ObjectId.isValid(rId) && String(new mongoose.Types.ObjectId(rId)) === rId) {
      rCriteria.push({ 'r._id': new mongoose.Types.ObjectId(rId) });
    }

    await col.updateOne(
      { sku: skuStr },
      {
        $set: {
          'questions.$[q].replies.$[r].content': String(content).trim(),
          'questions.$[q].replies.$[r].updatedAt': new Date(),
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ $or: qCriteria }, { $or: rCriteria }] }
    );

    const fresh = await col.findOne({ sku: skuStr });
    res.json(diseaseConsultationResponsePayload(fresh));
  } catch (err) {
    console.error('[PATCH /api/consultations/disease/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật phản hồi.' });
  }
});

// DELETE /api/consultations/disease/reply?sku=&questionId=&replyId=&userId=
app.delete('/api/consultations/disease/reply', async (req, res) => {
  try {
    const skuStr = String(req.query.sku || '').trim();
    const qId = String(req.query.questionId || '').trim();
    const rId = String(req.query.replyId || '').trim();
    const userIdStr = String(req.query.userId || '').trim();

    if (!skuStr || !qId || !rId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId, replyId hoặc userId.' });
    }

    const col = mongoose.connection.db.collection('consultations_disease');
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy hỏi đáp bệnh.' });

    const question = (doc.questions || []).find((q) => {
      const id = q?.id != null ? String(q.id) : '';
      let oid = '';
      if (q?._id != null) {
        oid = typeof q._id === 'object' && q._id.$oid ? String(q._id.$oid) : String(q._id);
      }
      return id === qId || oid === qId;
    });
    if (!question) return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });

    const reply = (question.replies || []).find((r) => String(r?._id || '') === rId);
    if (!reply) return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });

    if (String(reply.user_id || '') !== userIdStr) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa phản hồi này.' });
    }

    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId) && String(new mongoose.Types.ObjectId(qId)) === qId) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });
    }

    await col.updateOne(
      { sku: skuStr },
      { $pull: { 'questions.$[q].replies': { _id: rId } }, $set: { updatedAt: new Date() } },
      { arrayFilters: [{ $or: qCriteria }] }
    );

    const fresh = await col.findOne({ sku: skuStr });
    res.json(diseaseConsultationResponsePayload(fresh));
  } catch (err) {
    console.error('[DELETE /api/consultations/disease/reply] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa phản hồi.' });
  }
});

// POST /api/consultations/disease/reply/like — hữu ích 1 phản hồi trong hỏi đáp bệnh
app.post('/api/consultations/disease/reply/like', async (req, res) => {
  try {
    const { sku, questionId, replyId, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const rId = String(replyId || '').trim();
    const userIdStr = String(userId || '').trim();

    if (!skuStr || !qId || !rId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId, replyId hoặc userId.' });
    }

    const col = mongoose.connection.db.collection('consultations_disease');
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hỏi đáp bệnh.' });
    }

    const questionMatchesId = (q) => {
      if (!q || typeof q !== 'object') return false;
      const id = q.id != null ? String(q.id) : '';
      let oid = '';
      if (q._id != null) {
        oid = typeof q._id === 'object' && q._id.$oid ? String(q._id.$oid) : String(q._id);
      }
      return id === qId || oid === qId;
    };

    const question = (doc.questions || []).find(questionMatchesId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const reply = (question.replies || []).find((r) => String(r?._id || '') === rId);
    if (!reply) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi.' });
    }

    const likes = Array.isArray(reply.likes) ? [...reply.likes] : [];
    const likeIdStr = (id) =>
      id && typeof id === 'object' && id.$oid ? String(id.$oid) : String(id || '');
    const idx = likes.findIndex((id) => likeIdStr(id) === userIdStr);
    const addingLike = idx === -1;
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }

    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId) && String(new mongoose.Types.ObjectId(qId)) === qId) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });
    }
    const rCriteria = [{ 'r._id': rId }];
    if (mongoose.Types.ObjectId.isValid(rId) && String(new mongoose.Types.ObjectId(rId)) === rId) {
      rCriteria.push({ 'r._id': new mongoose.Types.ObjectId(rId) });
    }

    await col.updateOne(
      { sku: skuStr },
      { $set: { 'questions.$[q].replies.$[r].likes': likes, updatedAt: new Date() } },
      { arrayFilters: [{ $or: qCriteria }, { $or: rCriteria }] }
    );

    if (addingLike) {
      try {
        const replyAuthorId = reply.user_id ? String(reply.user_id).trim() : '';
        if (replyAuthorId && replyAuthorId.toLowerCase() !== userIdStr.toLowerCase()) {
          let likerName = 'Người dùng';
          try {
            const userDoc = await usersCollection().findOne({ $or: [{ user_id: userIdStr }, { _id: userIdStr }] });
            if (userDoc && (userDoc.full_name || userDoc.fullname)) {
              likerName = String(userDoc.full_name || userDoc.fullname).trim() || likerName;
            }
          } catch (_) {}

          const diseaseName = doc.productName || skuStr;
          const { href, routeId } = diseaseConsultationBenhPath(skuStr);
          await noticesCollection().insertOne({
            user_id: replyAuthorId,
            type: 'qa_reply',
            noticeTag: 'helpful_like',
            title: 'Có phản hồi cho câu hỏi của bạn',
            message: `${likerName} đánh dấu phản hồi của bạn là hữu ích về bệnh "${diseaseName}".`,
            createdAt: new Date().toISOString(),
            read: false,
            link: href,
            linkLabel: 'Xem phản hồi',
            meta: routeId || skuStr,
            meta_label: diseaseName,
          });
        }
      } catch (e) {
        console.warn('[POST /api/consultations/disease/reply/like] Cannot create notice:', e.message);
      }
    }

    const fresh = await col.findOne({ sku: skuStr });
    res.json(diseaseConsultationResponsePayload(fresh));
  } catch (err) {
    console.error('[POST /api/consultations/disease/reply/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thích phản hồi.' });
  }
});

// POST /api/consultations/disease/like — hữu ích câu hỏi về bệnh
app.post('/api/consultations/disease/like', async (req, res) => {
  try {
    const { sku, questionId, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const userIdStr = String(userId || '').trim();
    if (!skuStr || !qId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId hoặc userId.' });
    }

    const disease = await ConsultationDiseaseModel.findOne({ sku: skuStr });
    if (!disease) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hỏi đáp bệnh.' });
    }

    const questions = disease.questions || [];
    const qIdx = questions.findIndex((q) => String(q._id || q.id || '') === qId);
    if (qIdx === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const question = disease.questions[qIdx];
    const likes = Array.isArray(question.likes) ? [...question.likes] : [];
    const likeIdStr = (id) =>
      id && typeof id === 'object' && id.$oid ? String(id.$oid) : String(id || '');
    const idx = likes.findIndex((id) => likeIdStr(id) === userIdStr);
    const addingLike = idx === -1;
    if (idx > -1) {
      likes.splice(idx, 1);
    } else {
      likes.push(userIdStr);
    }

    disease.questions[qIdx].likes = likes;
    disease.updatedAt = new Date();
    disease.markModified('questions');
    await disease.save();

    if (addingLike) {
      try {
        const authorId = question.user_id ? String(question.user_id).trim() : '';
        if (authorId && authorId.toLowerCase() !== userIdStr.toLowerCase()) {
          let likerName = 'Người dùng';
          try {
            const userDoc = await usersCollection().findOne({ $or: [{ user_id: userIdStr }, { _id: userIdStr }] });
            if (userDoc && (userDoc.full_name || userDoc.fullname)) {
              likerName = String(userDoc.full_name || userDoc.fullname).trim() || likerName;
            }
          } catch (_) {}

          const diseaseName = disease.productName || skuStr;
          const { href, routeId } = diseaseConsultationBenhPath(skuStr);
          await noticesCollection().insertOne({
            user_id: authorId,
            type: 'qa_reply',
            noticeTag: 'helpful_like',
            title: 'Có phản hồi cho câu hỏi của bạn',
            message: `${likerName} đánh dấu câu hỏi của bạn là hữu ích về bệnh "${diseaseName}".`,
            createdAt: new Date().toISOString(),
            read: false,
            link: href,
            linkLabel: 'Xem phản hồi',
            meta: routeId || skuStr,
            meta_label: diseaseName,
          });
        }
      } catch (e) {
        console.warn('[POST /api/consultations/disease/like] Cannot create notice:', e.message);
      }
    }

    const fresh = await ConsultationDiseaseModel.findOne({ sku: skuStr });
    res.json(diseaseConsultationResponsePayload(fresh));
  } catch (err) {
    console.error('[POST /api/consultations/disease/like] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật thích.' });
  }
});

// PATCH /api/consultations/disease/question — sửa nội dung câu hỏi (chỉ chủ user_id)
app.patch('/api/consultations/disease/question', async (req, res) => {
  try {
    const { sku, questionId, question, userId } = req.body || {};
    const skuStr = String(sku || '').trim();
    const qId = String(questionId || '').trim();
    const userIdStr = String(userId || '').trim();

    if (!skuStr || !qId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId hoặc userId.' });
    }
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung câu hỏi.' });
    }

    const col = mongoose.connection.db.collection('consultations_disease');
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy hỏi đáp bệnh.' });

    const questionEntry = (doc.questions || []).find((q) => {
      const id = q?.id != null ? String(q.id) : '';
      let oid = '';
      if (q?._id != null) {
        oid = typeof q._id === 'object' && q._id.$oid ? String(q._id.$oid) : String(q._id);
      }
      return id === qId || oid === qId;
    });
    if (!questionEntry) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }
    if (String(questionEntry.user_id || '') !== userIdStr) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa câu hỏi này.' });
    }

    const qCriteria = [{ 'q.id': qId }, { 'q._id': qId }];
    if (mongoose.Types.ObjectId.isValid(qId) && String(new mongoose.Types.ObjectId(qId)) === qId) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qId) });
    }

    const r = await col.updateOne(
      { sku: skuStr },
      {
        $set: {
          'questions.$[q].question': String(question).trim(),
          'questions.$[q].updatedAt': new Date(),
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ $or: qCriteria }] }
    );
    if (r.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không cập nhật được câu hỏi.' });
    }

    const fresh = await col.findOne({ sku: skuStr });
    res.json(diseaseConsultationResponsePayload(fresh));
  } catch (err) {
    console.error('[PATCH /api/consultations/disease/question] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi sửa câu hỏi.' });
  }
});

// DELETE /api/consultations/disease/question?sku=&questionId=&userId=
app.delete('/api/consultations/disease/question', async (req, res) => {
  try {
    const skuStr = String(req.query.sku || '').trim();
    const qId = String(req.query.questionId || '').trim();
    const userIdStr = String(req.query.userId || '').trim();

    if (!skuStr || !qId || !userIdStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku, questionId hoặc userId.' });
    }

    const col = mongoose.connection.db.collection('consultations_disease');
    const doc = await col.findOne({ sku: skuStr });
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy hỏi đáp bệnh.' });

    const questionEntry = (doc.questions || []).find((q) => {
      const id = q?.id != null ? String(q.id) : '';
      let oid = '';
      if (q?._id != null) {
        oid = typeof q._id === 'object' && q._id.$oid ? String(q._id.$oid) : String(q._id);
      }
      return id === qId || oid === qId;
    });
    if (!questionEntry) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }
    if (String(questionEntry.user_id || '') !== userIdStr) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa câu hỏi này.' });
    }

    const pullCriteria = [{ id: qId }, { _id: qId }];
    if (mongoose.Types.ObjectId.isValid(qId) && String(new mongoose.Types.ObjectId(qId)) === qId) {
      pullCriteria.push({ _id: new mongoose.Types.ObjectId(qId) });
    }

    const r = await col.updateOne(
      { sku: skuStr },
      { $pull: { questions: { $or: pullCriteria } }, $set: { updatedAt: new Date() } }
    );
    if (r.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không xóa được câu hỏi.' });
    }

    await markPharmacistDiseaseNoticesResolved(skuStr, qId);

    const fresh = await col.findOne({ sku: skuStr });
    res.json(diseaseConsultationResponsePayload(fresh));
  } catch (err) {
    console.error('[DELETE /api/consultations/disease/question] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa câu hỏi.' });
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

    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Số điện thoại hoặc mật khẩu không đúng.' });
    }

    // Hỗ trợ cả mật khẩu đã mã hóa (bcrypt) và mật khẩu cũ dạng plain-text để tránh lỗi với dữ liệu cũ.
    let isMatch = false;
    if (typeof user.password === 'string' && user.password.startsWith('$2')) {
      // bcrypt hash
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Dữ liệu cũ chưa hash
      isMatch = user.password === password;
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Số điện thoại hoặc mật khẩu không đúng.' });
    }

    const { password: _, ...safe } = user;
    res.json({ success: true, user: safe });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

const registerOAuthRoutes = require('./oauth-social');
registerOAuthRoutes(app, { usersCollection, cartsCollection, bcrypt, crypto });

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

// POST /api/auth/check-phone-exists - Kiểm tra SĐT đã tồn tại trong database user chưa
app.post('/api/auth/check-phone-exists', async (req, res) => {
  try {
    const { phone } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || p.length < 9 || p.length > 11) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });
    }

    const existing = await usersCollection().findOne({ phone: p });
    return res.json({ success: true, exists: !!existing });
  } catch (err) {
    console.error('Check phone exists error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
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

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = {
      user_id,
      avatar: null,
      full_name: '',
      email: '',
      password: passwordHash,
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

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const result = await usersCollection().updateOne(
      { $or: [{ phone: p }, { phone: phone }] },
      { $set: { password: passwordHash } }
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
    if (avatar !== undefined) {
      if (avatar === null) {
        update.avatar = null;
      } else if (avatar === '') {
        update.avatar = '';
      } else {
        const trimmed = String(avatar).trim();
        const normalized = await normalizePromotionImagesToShortLinks([trimmed]);
        update.avatar = normalized[0] ?? trimmed;
      }
    }

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

// GET /api/users/me?user_id=... - Lấy snapshot user mới nhất (không gồm mật khẩu)
app.get('/api/users/me', async (req, res) => {
  try {
    const user_id = String(req.query?.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }

    const query = [{ user_id }, { _id: user_id }];
    if (mongoose.Types.ObjectId.isValid(user_id)) {
      query.push({ _id: new mongoose.Types.ObjectId(user_id) });
    }

    const user = await usersCollection().findOne(
      { $or: query },
      { projection: { password: 0 } }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/users/me/upload-avatar — multipart giống KM: lưu Mongo + URL ngắn, tránh gửi base64 qua JSON
app.post('/api/users/me/upload-avatar', uploadPromoBannerImage, async (req, res) => {
  try {
    const user_id = String(req.body?.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Missing file' });
    }

    const token = crypto.randomBytes(6).toString('base64url');
    await promoBannerImagesCollection().insertOne({
      token,
      mimeType: file.mimetype || 'image/jpeg',
      data: file.buffer,
      size: file.size,
      originalName: file.originalname || '',
      createdAt: new Date().toISOString()
    });
    const imageUrl = `/api/promo-images/${token}`;

    const result = await usersCollection().updateOne({ user_id }, { $set: { avatar: imageUrl } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
    }
    const user = await usersCollection().findOne({ user_id }, { projection: { password: 0 } });
    res.json({ success: true, imageUrl, user });
  } catch (err) {
    console.error('[POST /api/users/me/upload-avatar] Error:', err);
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

// POST /api/chat — VitaBot: ngữ cảnh MongoDB + Replicate (ưu tiên) hoặc Gemini (dự phòng)
const vitabot = require('./vitabot-chat');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || 'qwen/qwen3-235b-a22b-instruct-2507';

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung tin nhắn.' });
    }

    const explicitProduct = vitabot.userExplicitlyWantsProductCatalog(text);
    /** Chỉ đưa catalogue vào prompt sau vài lượt hoặc khi khách hỏi mua/gợi ý rõ — tránh gợi ý SP sau 1 câu */
    const includeProductCatalog = explicitProduct || history.length >= 4;

    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
    const systemPrompt =
      vitabot.getVitabotSystemPrompt(frontendBase) +
      vitabot.getTriageInstructionSuffix({
        historyLength: history.length,
        catalogIncluded: includeProductCatalog,
        explicitProductRequest: explicitProduct,
      });

    let productContext = '';
    let storeContext = '';
    let blogContext = '';
    if (includeProductCatalog) {
      try {
        productContext = await vitabot.getProductContextForChat(
          { productsCollection, categoriesCollection },
          text,
          25
        );
      } catch (e) {
        console.warn('[POST /api/chat] getProductContextForChat error:', e.message);
      }
    }
    try {
      storeContext = await vitabot.getStoreContextForChat(storeSystemCollection, 40);
    } catch (e) {
      console.warn('[POST /api/chat] getStoreContextForChat error:', e.message);
    }
    try {
      blogContext = await vitabot.getVitaCareKnowledgeContext({
        db: mongoose.connection?.db || null,
        baseUrl: frontendBase,
        maxBlogItems: 20,
      });
    } catch (e) {
      console.warn('[POST /api/chat] getVitaCareKnowledgeContext error:', e.message);
    }

    const sendChatSuccess = async (replyText) => {
      const replyAbsolutized = vitabot.absolutizeVitabotLinks(replyText, frontendBase);
      let products = [];
      try {
        products = await vitabot.enrichProductCardsFromReply(replyAbsolutized, productsCollection);
      } catch (e) {
        console.warn('[POST /api/chat] enrichProductCardsFromReply:', e.message);
      }
      res.json({ success: true, reply: replyAbsolutized, products });
    };

    if (REPLICATE_API_TOKEN) {
      try {
        const reply = await vitabot.runReplicateChat({
          token: REPLICATE_API_TOKEN,
          model: REPLICATE_MODEL,
          history,
          message: text,
          productContext,
          storeContext,
          blogContext,
          systemPrompt,
        });
        await sendChatSuccess(reply);
        return;
      } catch (repErr) {
        const detail = String(repErr?.message || repErr || 'unknown').slice(0, 500);
        console.error('[POST /api/chat] Replicate error:', detail);
        if (!GEMINI_API_KEY) {
          return res.status(502).json({
            success: false,
            message: `Replicate: ${detail}`,
          });
        }
        console.warn('[POST /api/chat] Fallback sang Gemini sau lỗi Replicate.');
      }
    }

    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        success: false,
        message:
          'Chatbot chưa cấu hình. Thêm REPLICATE_API_TOKEN (Replicate) hoặc GEMINI_API_KEY (Google AI) trong backend/.env.',
      });
    }

    const contents = vitabot.buildGeminiContents(
      history,
      text,
      productContext,
      storeContext,
      blogContext,
      systemPrompt
    );
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
        userMsg = errMsg;
      }
      return res.status(response.status >= 500 ? 502 : 400).json({
        success: false,
        message: userMsg,
      });
    }
    const candidate = data?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const replyText = part?.text?.trim() || 'Xin lỗi, tôi chưa trả lời được. Bạn thử hỏi lại nhé.';
    await sendChatSuccess(replyText);
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
    if (!db) {
      console.warn('ensureBlogSlugIndex: Database not ready yet');
      return;
    }
    for (const name of ['blog', 'blogs']) {
      try {
        await db.collection(name).createIndex({ slug: 1 }, { background: true });
        await db.collection(name).createIndex({ publishedAt: -1 }, { background: true });
        await db.collection(name).createIndex({ 'category.name': 1 }, { background: true });
      } catch (e) {
        if (!e.message?.includes('already exists')) console.warn(`Index ${name}.slug:`, e.message);
      }
    }
    try {
      await db.collection('benh').createIndex({ created_at: -1 }, { background: true });
      await db.collection('benh').createIndex({ 'categories.fullPathSlug': 1 }, { background: true });
    } catch (e) {
      if (!e.message?.includes('already exists')) console.warn('Index benh:', e.message);
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

    // Wait for the connection to be fully "open" to ensure .db is available
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }

    // Run seeding/indexing in background
    (async () => {
      try {
        await cleanupLegacyPrescriptionNotificationsForPharmacist();
        await backfillPrescriptionConsultAdminNoticesIfMissing();
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
        await backfillPrescriptionNoticeAssignmentMetaFromDB();
        await deleteAllOrphanPrescriptionAdminNoticesGlobally();
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
    { model: PromotionTarget, file: 'promotion_promotion_target.json' },
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

    const [products, users, orders, promos, blogs, pharmacists, consults_p, consults_pr, consults_d, revenue30dAgg, totalRevenueAgg, doctors, admins] = await Promise.all([
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
      ]),
      doctorsCollection().countDocuments({}),
      AdminModel.countDocuments()
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
        doctors,
        admins,
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
    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      categoryIds,
      minPrice,
      maxPrice,
      units,
      stockStatus,
      expiryStatus,
      needConsultation,
    } = req.query;
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

    const catIdParam = categoryIds || categoryId;
    if (catIdParam) {
      const cats = await CategoryModel.find().lean();
      const getIdStr = (id) => id ? String(id._id || id) : '';
      const getChildIds = (pid) => {
        const pIdStr = getIdStr(pid);
        const children = cats.filter(c => getIdStr(c.parentId) === pIdStr);
        let ids = [pIdStr];
        children.forEach(c => { ids = [...ids, ...getChildIds(c._id)]; });
        return ids;
      };
      const inputIds = String(catIdParam).split(',').map(s => s.trim()).filter(Boolean);
      const allCatIdsSet = new Set();
      inputIds.forEach(cid => getChildIds(cid).forEach(id => allCatIdsSet.add(id)));
      const allCatIdsStrings = [...allCatIdsSet];
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
      if (statusArray.includes('low_stock')) stockQueries.push({ stock: { $gt: 0, $lt: 20 } });
      if (statusArray.includes('in_stock')) stockQueries.push({ stock: { $gte: 20 } });
      if (stockQueries.length > 0) andFilters.push({ $or: stockQueries });
    }

    if (expiryStatus) {
      const expiryArr = Array.isArray(expiryStatus) ? expiryStatus : String(expiryStatus).split(',');
      const flags = expiryArr.map((s) => String(s).trim()).filter(Boolean);
      /** Mốc “đầu ngày hôm nay” để so HSD: mặc định theo lịch Asia/Ho_Chi_Minh (UTC+7). TZ khác → nửa đêm theo máy chủ. */
      const hsdTz = process.env.ADMIN_PRODUCT_HSD_TZ || 'Asia/Ho_Chi_Minh';
      const MS_DAY = 86400000;
      let startOfToday;
      if (hsdTz === 'Asia/Ho_Chi_Minh') {
        const ymd = new Date().toLocaleDateString('sv-SE', { timeZone: hsdTz });
        const [y, mo, da] = ymd.split('-').map((n) => parseInt(n, 10));
        const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
        startOfToday = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0, 0) - VN_OFFSET_MS);
      } else {
        startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
      }
      const endSoonWindow = new Date(startOfToday.getTime() + 11 * MS_DAY - 1);

      const effectiveExpiry = {
        $convert: {
          input: { $ifNull: ['$expiryDate', '$expiredDate'] },
          to: 'date',
          onError: null,
          onNull: null,
        },
      };

      const orBranches = [];
      for (const flag of flags) {
        if (flag === 'expired') {
          orBranches.push({
            $expr: {
              $and: [{ $ne: [effectiveExpiry, null] }, { $lt: [effectiveExpiry, { $literal: startOfToday }] }],
            },
          });
        }
        if (flag === 'expiring_soon') {
          orBranches.push({
            $expr: {
              $and: [
                { $ne: [effectiveExpiry, null] },
                { $gte: [effectiveExpiry, { $literal: startOfToday }] },
                { $lte: [effectiveExpiry, { $literal: endSoonWindow }] },
              ],
            },
          });
        }
        if (flag === 'valid_long') {
          orBranches.push({
            $expr: {
              $and: [{ $ne: [effectiveExpiry, null] }, { $gte: [effectiveExpiry, { $literal: startOfToday }] }],
            },
          });
        }
      }
      if (orBranches.length > 0) {
        andFilters.push({ $or: orBranches });
      }
    }

    const needConsult = ['true', '1', 'yes'].includes(String(needConsultation || '').toLowerCase());
    if (needConsult) {
      andFilters.push({
        $or: [
          { prescriptionRequired: { $regex: 'có', $options: 'i' } },
          { prescription: true },
        ],
      });
    }

    if (andFilters.length > 0) {
      query.$and = andFilters;
    }

    const totalItems = await ProductModel.countDocuments(query);

    const sortObj = {};
    const dirMult = req.query.sortDirection === 'desc' ? -1 : 1;
    const allowedSortCols = new Set(['updatedAt', 'created_at', 'createDate', 'price', 'name', 'stock', 'sold', 'expiryDate']);
    const colRaw = String(req.query.sortColumn || '').trim();
    if (colRaw && allowedSortCols.has(colRaw)) {
      if (colRaw === 'updatedAt') {
        sortObj.updatedAt = dirMult;
        sortObj.created_at = dirMult;
        sortObj.createDate = dirMult;
      } else {
        sortObj[colRaw] = dirMult;
      }
    } else {
      sortObj.updatedAt = -1;
      sortObj.created_at = -1;
      sortObj.createDate = -1;
    }

    let data = await ProductModel.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    data = await enrichAdminProductsCategoryPaths(data);

    res.json({
      success: true,
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / limitNum),
      currentPage: pageNum
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

/** Danh sách xuất xứ distinct từ sản phẩm (country + origin) — dùng select admin */
app.get('/api/admin/product-countries', async (req, res) => {
  try {
    const [fromCountry, fromOrigin] = await Promise.all([
      ProductModel.distinct('country'),
      ProductModel.distinct('origin'),
    ]);
    const set = new Set();
    for (const arr of [fromCountry, fromOrigin]) {
      for (const v of arr || []) {
        const s = v != null ? String(v).trim() : '';
        if (s) set.add(s);
      }
    }
    const data = [...set].sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
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
    const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    delete body.restockBy;
    const item = new ProductModel(body);
    const data = await item.save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/admin/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Khớp GET /api/admin/products/:id — một số bản ghi có _id lưu string (import JSON), findByIdAndUpdate chỉ cast ObjectId nên trả 404.
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    const payload = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    delete payload._id;
    const rawRestock = payload.restockBy;
    delete payload.restockBy;
    const restockN = Number(rawRestock);
    const restockInt = Number.isFinite(restockN) && restockN > 0 ? Math.floor(restockN) : 0;
    const hasRestock = restockInt > 0;

    let update;
    if (hasRestock) {
      delete payload.stock;
      update = { $set: payload, $inc: { stock: restockInt } };
    } else {
      update = payload;
    }

    const data = await ProductModel.findOneAndUpdate({ $or: query }, update, { new: true });
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

/** Gán cùng một danh mục (categoryId) cho nhiều sản phẩm — dùng popup "Nhóm sản phẩm" admin. */
app.patch('/api/admin/products/bulk-category', async (req, res) => {
  try {
    const { productIds, categoryId } = req.body || {};
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Cần mảng productIds' });
    }
    const catStr = String(categoryId || '').trim();
    if (!catStr) {
      return res.status(400).json({ success: false, message: 'Thiếu categoryId' });
    }

    const catQuery = [{ _id: catStr }];
    if (mongoose.Types.ObjectId.isValid(catStr)) {
      catQuery.push({ _id: new mongoose.Types.ObjectId(catStr) });
    }
    const cat = await CategoryModel.findOne({ $or: catQuery }).lean();
    if (!cat) {
      return res.status(400).json({ success: false, message: 'Danh mục không tồn tại' });
    }

    const idOr = [];
    for (const raw of productIds) {
      const id = String(raw || '').trim();
      if (!id) continue;
      idOr.push({ _id: id });
      if (mongoose.Types.ObjectId.isValid(id)) {
        idOr.push({ _id: new mongoose.Types.ObjectId(id) });
      }
    }
    if (!idOr.length) {
      return res.status(400).json({ success: false, message: 'Không có productId hợp lệ' });
    }

    const catIdSet = mongoose.Types.ObjectId.isValid(catStr)
      ? new mongoose.Types.ObjectId(catStr)
      : catStr;

    const result = await ProductModel.updateMany({ $or: idOr }, { $set: { categoryId: catIdSet } });
    res.json({ success: true, modifiedCount: result.modifiedCount, matchedCount: result.matchedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/** Gán sản phẩm vào nhóm khuyến mãi (product_groups.productIds + product.groupId) — dùng popup "Nhóm sản phẩm" admin. */
app.patch('/api/admin/products/bulk-group', async (req, res) => {
  try {
    const { productIds, groupId } = req.body || {};
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Cần mảng productIds' });
    }
    const gidRaw = String(groupId || '').trim();
    if (!gidRaw) {
      return res.status(400).json({ success: false, message: 'Thiếu groupId' });
    }

    const groupQuery = [{ _id: gidRaw }];
    if (mongoose.Types.ObjectId.isValid(gidRaw)) {
      groupQuery.push({ _id: new mongoose.Types.ObjectId(gidRaw) });
    }
    const groupDoc = await ProductGroup.findOne({ $or: groupQuery }).lean();
    if (!groupDoc) {
      return res.status(400).json({ success: false, message: 'Nhóm sản phẩm không tồn tại' });
    }

    const normalizedProductIds = [];
    for (const raw of productIds) {
      const id = String(raw || '').trim();
      if (id) normalizedProductIds.push(id);
    }
    if (!normalizedProductIds.length) {
      return res.status(400).json({ success: false, message: 'Không có productId hợp lệ' });
    }

    const groupOid = mongoose.Types.ObjectId.isValid(gidRaw)
      ? new mongoose.Types.ObjectId(gidRaw)
      : gidRaw;

    const idOr = [];
    for (const id of normalizedProductIds) {
      idOr.push({ _id: id });
      if (mongoose.Types.ObjectId.isValid(id)) {
        idOr.push({ _id: new mongoose.Types.ObjectId(id) });
      }
    }
    if (!idOr.length) {
      return res.status(400).json({ success: false, message: 'Không có productId hợp lệ' });
    }

    await ProductGroup.updateMany({}, { $pull: { productIds: { $in: normalizedProductIds } } });
    await ProductGroup.findOneAndUpdate(
      { $or: groupQuery },
      { $addToSet: { productIds: { $each: normalizedProductIds } } }
    );
    const pResult = await ProductModel.updateMany({ $or: idOr }, { $set: { groupId: groupOid } });

    res.json({
      success: true,
      groupId: String(groupOid),
      modifiedCount: pResult.modifiedCount,
      matchedCount: pResult.matchedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
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

    // Lấy doc cũ trước để so sánh trạng thái + hoàn kho khi huỷ/hoàn đơn
    const oldDoc = await OrderModel.findOne({ $or: query }).lean();
    if (!oldDoc) return res.status(404).json({ success: false, message: 'Order not found' });

    const newStatus = req.body?.status;
    const releaseStatuses = ['cancelled', 'returned', 'refunded'];
    const body = { ...req.body };
    if (
      newStatus &&
      releaseStatuses.includes(String(newStatus)) &&
      String(newStatus) !== String(oldDoc.status || '') &&
      !oldDoc.inventoryReleased
    ) {
      try {
        await restoreInventoryForOrderLineItems(oldDoc.item || []);
      } catch (e) {
        console.warn('[PUT /api/admin/orders/:id] restore inventory:', e.message);
      }
      body.inventoryReleased = true;
    }

    const data = await OrderModel.findOneAndUpdate({ $or: query }, body, { new: true });
    if (!data) return res.status(404).json({ success: false, message: 'Order not found' });

    // Nếu trạng thái thay đổi, đồng bộ lại totalspent/tiering của khách hàng tương ứng.
    if (newStatus && oldDoc && newStatus !== oldDoc.status) {
      try {
        const userId = data.user_id || oldDoc.user_id;
        if (userId) {
          await recomputeUserTotalSpentAndTier(userId);
        }
      } catch (e) {
        console.warn('[PUT /api/admin/orders/:id] Cannot recompute customer spending:', e.message);
      }
    }

    // Lưu notice cho user khi admin thay đổi trạng thái đơn hàng
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

// POST /api/admin/promotions/upload-banner-image - upload ảnh banner khuyến mãi vào MongoDB
app.post('/api/admin/promotions/upload-banner-image', uploadPromoBannerImage, async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'Missing file' });

    // Token base64url ~8-10 chars, dùng làm "link ngắn"
    const token = crypto.randomBytes(6).toString('base64url');

    await promoBannerImagesCollection().insertOne({
      token,
      mimeType: file.mimetype || 'image/jpeg',
      data: file.buffer,
      size: file.size,
      originalName: file.originalname || '',
      createdAt: new Date().toISOString()
    });

    const imageUrl = `/api/promo-images/${token}`;
    res.status(201).json({ success: true, token, imageUrl });
  } catch (err) {
    console.error('[POST /api/admin/promotions/upload-banner-image] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
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

      const clean = { ...p };
      delete clean.id;
      delete clean.selected;
      delete clean.status;
      delete clean.statusClass;
      delete clean.statusTitle;
      delete clean.usages;
      delete clean.targets;
      delete clean.usage_count;

      return { ...clean, usages: usageData, targets: targetData };
    });
    const sortedData = data.sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
    res.json({ success: true, data: sortedData });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

const sanitizePromotion = (p) => {
  const clean = { ...p };
  delete clean.id;
  delete clean.selected;
  delete clean.status;
  delete clean.statusClass;
  delete clean.statusTitle;
  delete clean.usages;
  delete clean.targets;
  delete clean.usage_count;
  return clean;
};

app.post('/api/admin/promotions', async (req, res) => {
  try {
    const cleanBody = sanitizePromotion(req.body);
    if (Array.isArray(cleanBody.images)) {
      cleanBody.images = await normalizePromotionImagesToShortLinks(cleanBody.images);
    }
    const item = new PromotionModel(cleanBody);
    const data = await item.save();

    let targetRef = '';
    const type = data.type || 'customer';
    if (type === 'category') targetRef = data.target_category_id;
    else if (type === 'product') targetRef = data.product_group_id;
    else if (type === 'customer') targetRef = data.customer_group_id;

    const targetData = {
      promotion_oid: data._id.toString(),
      promotion_id: data.promotion_id || '',
      target_type: [type],
      target_ref: targetRef || '',
      code: data.code || '',
      name: data.name || '',
      status: data.status || 'active'
    };

    await PromotionTarget.create(targetData);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/promotions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const targetId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

    const updateData = sanitizePromotion(req.body);
    delete updateData._id;
    if (Array.isArray(updateData.images)) {
      updateData.images = await normalizePromotionImagesToShortLinks(updateData.images);
    }

    const unsetFields = {
      id: 1,
      selected: 1,
      status: 1,
      statusClass: 1,
      statusTitle: 1,
      usages: 1,
      targets: 1,
      usage_count: 1
    };

    const data = await PromotionModel.findOneAndUpdate(
      { _id: targetId },
      { $set: updateData, $unset: unsetFields },
      { new: true }
    );

    if (data) {
      const rawType = (data.type || 'customer').toString().toLowerCase();
      let targetType = 'Customer';
      let targetRefs = [];

      if (rawType === 'category' && data.target_category_id) {
        targetType = 'Category';
        targetRefs = Array.isArray(data.target_category_id)
          ? data.target_category_id
          : [data.target_category_id];
      } else if (rawType === 'product' && data.product_group_id) {
        targetType = 'ProductGroup';
        targetRefs = Array.isArray(data.product_group_id)
          ? data.product_group_id
          : [data.product_group_id];
      } else if (rawType === 'customer') {
        const mode = data.customer_target_mode || 'all';
        if (mode === 'group' && data.customer_group_id) {
          targetType = 'CustomerGroup';
          targetRefs = Array.isArray(data.customer_group_id)
            ? data.customer_group_id
            : [data.customer_group_id];
        } else if (mode === 'tier' && data.customer_tiers) {
          targetType = 'CustomerTier';
          targetRefs = Array.isArray(data.customer_tiers)
            ? data.customer_tiers
            : [data.customer_tiers];
        }
      }

      if (targetRefs.length > 0) {
        const targetUpdate = {
          promotion_oid: data._id.toString(),
          promotion_id: data.promotion_id || '',
          target_type: targetType,
          target_ref: targetRefs,
        };

        await PromotionTarget.findOneAndUpdate(
          { promotion_oid: id },
          { $set: targetUpdate },
          { upsert: true }
        );
      } else {
        // Không còn target cụ thể nào => xoá mọi bản ghi target, coi như áp dụng cho tất cả
        await PromotionTarget.deleteMany({ promotion_oid: id });
      }
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/promotions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const targetId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

    await PromotionModel.deleteOne({ _id: targetId });
    await PromotionTarget.deleteMany({ promotion_oid: id });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
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
    const role = String(req.query.role || '').toLowerCase();
    const pharmacistId = String(req.query.pharmacistId || '').trim();
    const pharmacistEmail = String(req.query.pharmacistEmail || '').trim().toLowerCase();
    const pharmacistName = String(req.query.pharmacistName || '').trim();
    const focusPrescriptionId = String(req.query.prescriptionId || '').trim();
    let data = await ConsultationPrescriptionModel.find().sort({ createdAt: -1 }).lean();

    // Dược sĩ: chỉ đơn đã được phân công — không gửi đủ id/email/tên thì không trả đơn nào (tránh lộ toàn bộ).
    if (role === 'pharmacist') {
      const hasIdentity = !!(pharmacistId || pharmacistEmail || pharmacistName);
      if (!hasIdentity) {
        data = [];
      } else {
        data = data.filter((item) =>
          prescriptionConsultVisibleForPharmacistQuery(item, pharmacistId, pharmacistEmail, pharmacistName)
        );
      }
      if (focusPrescriptionId) {
        data = data.filter((item) => {
          const pid = String(item.prescriptionId || '').trim();
          return pid === focusPrescriptionId;
        });
      }
    }
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.patch('/api/admin/consultations_prescription/:id', async (req, res) => {
  try {
    const { status, pharmacist_id, pharmacistId, pharmacistName, pharmacistPhone, current_status, status_history } = req.body;
    const id = String(req.params.id);
    const normalizedPharmacistId = String(pharmacist_id || pharmacistId || '').trim();

    // Hỗ trợ cả ObjectId lẫn chuỗi/id đơn thuốc
    const query = [{ _id: id }, { prescriptionId: id }, { id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    const beforeAssign = await ConsultationPrescriptionModel.findOne({ $or: query }).lean();
    const prevPharmacistAssign = String(beforeAssign?.pharmacist_id ?? beforeAssign?.pharmacistId ?? '').trim();

    const updated = await ConsultationPrescriptionModel.findOneAndUpdate(
      { $or: query },
      {
        status,
        pharmacist_id: normalizedPharmacistId,
        pharmacistId: normalizedPharmacistId,
        pharmacistName,
        pharmacistPhone,
        current_status,
        status_history,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Prescription not found' });

    const prescriptionCodeForNotice = String(updated.prescriptionId || id || '').trim();
    if (status && String(status).toLowerCase() !== 'pending' && prescriptionCodeForNotice) {
      await markPrescriptionConsultAdminNoticesResolved(prescriptionCodeForNotice);
    }

    if (prescriptionCodeForNotice) {
      if (normalizedPharmacistId) {
        await syncPrescriptionAdminNoticePharmacistAssignment(
          prescriptionCodeForNotice,
          normalizedPharmacistId,
          pharmacistName
        );
      } else {
        await clearPrescriptionAdminNoticePharmacistAssignmentMeta(prescriptionCodeForNotice);
      }
    }

    if (prescriptionCodeForNotice && status != null && String(status).trim() !== '') {
      await syncPharmacistPrescriptionAssignedNoticeStatus(prescriptionCodeForNotice, status);
    }

    const assignJustChanged =
      Boolean(normalizedPharmacistId) && normalizedPharmacistId !== prevPharmacistAssign;
    if (assignJustChanged && normalizedPharmacistId) {
      (async () => {
        try {
          const pq = [{ _id: String(normalizedPharmacistId) }];
          if (mongoose.Types.ObjectId.isValid(String(normalizedPharmacistId))) {
            pq.push({ _id: new mongoose.Types.ObjectId(String(normalizedPharmacistId)) });
          }
          const phLean = await Pharmacist.findOne({ $or: pq }).lean();
          const phEmail = String(phLean?.pharmacistEmail || phLean?.email || '').trim().toLowerCase();
          const phName = String(phLean?.pharmacistName || '').trim();
          const code = prescriptionCodeForNotice || id;
          const assignText = `Bạn vừa được phân công tư vấn đơn thuốc ${code}`;
          await pharmacistNoticeCollection().insertOne({
            type: 'consultation_prescription_assigned',
            title: assignText,
            message: '',
            createdAt: new Date(),
            link: `/admin/consultation-prescription?prescriptionId=${encodeURIComponent(code)}`,
            roles: ['pharmacist'],
            meta: {
              pharmacistId: normalizedPharmacistId,
              prescriptionId: code,
              pharmacistEmail: phEmail,
              pharmacistName: phName,
              prescriptionStatus: String(updated.status || 'waiting').trim().toLowerCase(),
            },
          });
        } catch (e) {
          console.warn('[PATCH consultations_prescription] pharmacist_notice assign:', e?.message || e);
        }
      })();
    }

    // Lưu notice cho user khi admin thay đổi trạng thái đơn thuốc
    if (status) {
      const userId = updated.user_id; // Original line
      console.log('[PATCH /api/admin/consultations_prescription/:id] userId:', userId); // Added for debugging
      if (userId) {
        const prescriptionCode = updated.prescriptionId || id;
        const pharmacistInfo = pharmacistName ? ` bởi dược sĩ ${pharmacistName}` : '';
        const prescriptionStatusNoticeMap = {
          waiting: { title: 'Đơn thuốc đang được tư vấn', message: `Đơn thuốc ${prescriptionCode} đang được tư vấn${pharmacistInfo}. Dược sĩ sẽ liên hệ sớm nhất.` },
          advised: { title: 'Đơn thuốc đã được tư vấn', message: `Đơn thuốc ${prescriptionCode} đã được tư vấn xong${pharmacistInfo}.` },
          unreachable: { title: 'Dược sĩ chưa thể liên hệ', message: `Dược sĩ chưa thể liên hệ được với bạn về đơn thuốc ${prescriptionCode}. Vui lòng kiểm tra lại số điện thoại.` },
          cancelled: { title: 'Đơn thuốc tư vấn đã bị huỷ', message: `Đơn thuốc tư vấn ${prescriptionCode} đã bị huỷ.` },
          consultation_failed: {
            title: 'Tư vấn đơn thuốc không thành công',
            message: `Sau nhiều lần liên hệ, dược sĩ không thể tư vấn đơn thuốc ${prescriptionCode}. Bạn có thể gửi yêu cầu tư vấn lại.`,
          },
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

    // Chỉ gửi email khi thực sự đổi người được phân công, tránh gửi lại khi chỉ cập nhật trạng thái.
    if (assignJustChanged && normalizedPharmacistId) {
      (async () => {
        try {
          const pharmacistQuery = [{ _id: String(normalizedPharmacistId) }];
          if (mongoose.Types.ObjectId.isValid(String(normalizedPharmacistId))) {
            pharmacistQuery.push({ _id: new mongoose.Types.ObjectId(String(normalizedPharmacistId)) });
          }
          const pharmacist = await Pharmacist.findOne({ $or: pharmacistQuery });
          const recipientEmail = pharmacist?.pharmacistEmail || pharmacist?.email || '';
          if (pharmacist && recipientEmail) {
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
              to: recipientEmail,
              subject: `[VitaCare] Phân công tư vấn MỚI: ${prescriptionCode}`,
              html
            };

            transporter.sendMail(mailOptions).catch((mailErr) => {
              console.warn('[consultations_prescription] sendMail error:', mailErr?.message || mailErr);
            });
          }
        } catch (mailErr) {
          console.warn('[consultations_prescription] sendMail error:', mailErr?.message || mailErr);
        }
      })();
    }

    res.json({ success: true, data: updated });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

/** Admin: gửi nhắc nhở tới dược sĩ đã được phân công — đơn còn ở trạng thái waiting. */
app.post('/api/admin/consultations_prescription/:id/remind-pharmacist', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, message: 'Thiếu mã đơn.' });

    const query = [{ _id: id }, { prescriptionId: id }, { id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    const doc = await ConsultationPrescriptionModel.findOne({ $or: query }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn thuốc.' });

    const st = String(doc.status || '').trim().toLowerCase();
    if (st !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ nhắc nhở khi đơn đang ở trạng thái «Đang tư vấn» (chưa cập nhật kết quả).',
      });
    }

    const normalizedPharmacistId = String(doc.pharmacist_id ?? doc.pharmacistId ?? '').trim();
    if (!normalizedPharmacistId) {
      return res.status(400).json({
        success: false,
        message: 'Đơn chưa được phân công dược sĩ, không thể gửi nhắc nhở.',
      });
    }

    const waitingSince = getPrescriptionWaitingSinceDateFromDoc(doc);
    if (!waitingSince) {
      return res.status(400).json({
        success: false,
        message: 'Không xác định được thời điểm chuyển sang đang tư vấn.',
      });
    }
    const remindMinMs = 2 * 60 * 60 * 1000;
    if (Date.now() - waitingSince.getTime() < remindMinMs) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ gửi nhắc nhở sau ít nhất 2 giờ kể từ lúc phân công / chuyển sang đang tư vấn.',
      });
    }

    const pq = [{ _id: String(normalizedPharmacistId) }];
    if (mongoose.Types.ObjectId.isValid(String(normalizedPharmacistId))) {
      pq.push({ _id: new mongoose.Types.ObjectId(String(normalizedPharmacistId)) });
    }
    const phLean = await Pharmacist.findOne({ $or: pq }).lean();
    const phEmail = String(phLean?.pharmacistEmail || phLean?.email || '').trim().toLowerCase();
    const phName = String(phLean?.pharmacistName || doc.pharmacistName || '').trim();
    const code = String(doc.prescriptionId || doc.id || id).trim();

    const title = code
      ? `Nhắc nhở: đơn thuốc ${code} chưa được cập nhật trạng thái tư vấn`
      : 'Bạn có nhắc nhở: đơn thuốc đã phân công chưa được cập nhật trạng thái tư vấn';
    const message =
      'Quản trị viên nhắc bạn xử lý đơn tư vấn thuốc đã phân công. Vui lòng liên hệ khách và cập nhật trạng thái.';

    await pharmacistNoticeCollection().insertOne({
      type: 'consultation_prescription_reminder',
      title,
      message,
      createdAt: new Date(),
      link: `/admin/consultation-prescription?prescriptionId=${encodeURIComponent(code || id)}`,
      roles: ['pharmacist'],
      meta: {
        pharmacistId: normalizedPharmacistId,
        prescriptionId: code || id,
        pharmacistEmail: phEmail,
        pharmacistName: phName,
        prescriptionStatus: st,
      },
    });

    res.json({ success: true, message: 'Đã gửi nhắc nhở tới dược sĩ.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/consultations_product', async (req, res) => {
  try {
    const role = String(req.query.role || '').toLowerCase();
    const pharmacistId = String(req.query.pharmacistId || '').trim();
    const pharmacistEmail = String(req.query.pharmacistEmail || '').trim().toLowerCase();
    const pharmacistName = String(req.query.pharmacistName || '').trim().toLowerCase();
    const data = await ConsultationProductModel.find().sort({ updatedAt: -1 }).lean();

    if (role === 'pharmacist' && pharmacistId) {
      const filtered = data
        .map((product) => {
          const questions = (product.questions || []).filter(
            (q) => {
              const assignedId = String(q.assignedPharmacistId || q.pharmacist_id || q.pharmacistId || '').trim();
              const assignedEmail = String(q.assignedPharmacistEmail || '').trim().toLowerCase();
              const assignedName = String(q.assignedPharmacistName || '').trim().toLowerCase();
              return assignedId === pharmacistId
                || (!!pharmacistEmail && assignedEmail === pharmacistEmail)
                || (!!pharmacistName && assignedName === pharmacistName);
            }
          );
          return { ...product, questions };
        })
        .filter((product) => (product.questions || []).length > 0);
      return res.json({ success: true, data: filtered });
    }

    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/consultations_product/stats', async (req, res) => {
  try {
    const role = String(req.query.role || '').toLowerCase();
    const pharmacistId = String(req.query.pharmacistId || '').trim();
    const pharmacistEmail = String(req.query.pharmacistEmail || '').trim().toLowerCase();
    const pharmacistName = String(req.query.pharmacistName || '').trim().toLowerCase();
    const products = await ConsultationProductModel.find().lean();

    const skuKeys = [...new Set(products.map((p) => String(p.sku ?? '').trim()).filter(Boolean))];
    const imageBySku = {};
    if (skuKeys.length) {
      const skuOr = [{ sku: { $in: skuKeys } }];
      const asNum = skuKeys.map((s) => Number(s)).filter((n) => !Number.isNaN(n));
      if (asNum.length) skuOr.push({ sku: { $in: asNum } });
      const prodDocs = await productsCollection()
        .find({ $or: skuOr }, { projection: { sku: 1, image: 1, images: 1, gallery: 1, imageUrl: 1 } })
        .toArray();
      for (const d of prodDocs) {
        const primary =
          d.image ||
          (Array.isArray(d.images) && d.images.length ? d.images[0] : '') ||
          (Array.isArray(d.gallery) && d.gallery.length ? d.gallery[0] : '') ||
          d.imageUrl ||
          '';
        imageBySku[String(d.sku)] = primary;
      }
    }

    const stats = products.map(p => {
      const scopedQuestions = (role === 'pharmacist' && (pharmacistId || pharmacistEmail || pharmacistName))
        ? (p.questions || []).filter(q => {
          const assignedId = String(q.assignedPharmacistId || q.pharmacist_id || q.pharmacistId || '').trim();
          const assignedEmail = String(q.assignedPharmacistEmail || '').trim().toLowerCase();
          const assignedName = String(q.assignedPharmacistName || '').trim().toLowerCase();
          return assignedId === pharmacistId
            || (!!pharmacistEmail && assignedEmail === pharmacistEmail)
            || (!!pharmacistName && assignedName === pharmacistName);
        })
        : (p.questions || []);
      const assigned = scopedQuestions.filter((q) => q.status === 'assigned' && !q.answer).length;
      const pending = scopedQuestions.filter((q) => {
        if (q.status === 'assigned') return false;
        if (q.status === 'answered') return false;
        return q.status === 'pending' || q.status === 'unreviewed' || !q.answer;
      }).length;
      const parseTimeMs = (value) => {
        const t = new Date(value || 0).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      const latestQuestionAtMs = scopedQuestions.reduce((max, q) => {
        const t = parseTimeMs(q?.createdAt);
        return t > max ? t : max;
      }, 0);
      const latestPendingQuestionAtMs = scopedQuestions.reduce((max, q) => {
        const isPendingLike =
          (q?.status === 'assigned' && !q?.answer)
          || ((q?.status === 'pending' || q?.status === 'unreviewed' || !q?.answer) && q?.status !== 'answered');
        if (!isPendingLike) return max;
        const t = parseTimeMs(q?.createdAt);
        return t > max ? t : max;
      }, 0);
      const unanswered = pending + assigned;
      const skuStr = String(p.sku ?? '');
      return {
        sku: p.sku,
        productName: p.productName,
        image: imageBySku[skuStr] || imageBySku[String(Number(skuStr))] || '',
        unansweredCount: unanswered,
        pendingCount: pending,
        assignedCount: assigned,
        totalQuestions: scopedQuestions.length,
        latestQuestionAt: latestQuestionAtMs ? new Date(latestQuestionAtMs).toISOString() : null,
        latestPendingQuestionAt: latestPendingQuestionAtMs ? new Date(latestPendingQuestionAtMs).toISOString() : null,
        _id: p._id
      };
    }).filter((p) => p.totalQuestions > 0);
    res.json({ success: true, data: stats });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.patch('/api/admin/consultations_product/reply', async (req, res) => {
  try {
    const {
      sku,
      questionId,
      answer,
      answeredBy,
      assignedPharmacistId,
      assignedBy,
      actorRole
    } = req.body;
    const product = await ConsultationProductModel.findOne({ sku });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    const question = product.questions?.id ? product.questions.id(questionId) : product.questions.find(q => q.id === questionId || q._id === questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const userId = question.user_id || null;
    const productName = product.productName || sku;
    const normalizedRole = String(actorRole || '').toLowerCase();

    // Admin phân công cho dược sĩ (không trả lời)
    if (normalizedRole === 'admin' && !String(answer || '').trim()) {
      if (!assignedPharmacistId) {
        return res.status(400).json({ success: false, message: 'Thiếu dược sĩ được phân công.' });
      }
      const pharmacistQuery = [{ _id: String(assignedPharmacistId) }];
      if (mongoose.Types.ObjectId.isValid(String(assignedPharmacistId))) {
        pharmacistQuery.push({ _id: new mongoose.Types.ObjectId(String(assignedPharmacistId)) });
      }
      const pharmacist = await Pharmacist.findOne({ $or: pharmacistQuery });
      if (!pharmacist) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy dược sĩ được phân công.' });
      }

      question.assignedPharmacistId = String(pharmacist._id);
      question.pharmacist_id = String(pharmacist._id);
      question.pharmacistId = String(pharmacist._id);
      question.assignedPharmacistName = pharmacist.pharmacistName || '';
      question.assignedPharmacistEmail = pharmacist.pharmacistEmail || pharmacist.email || '';
      question.assignedPharmacistPhone = pharmacist.pharmacistPhone || '';
      question.status = 'assigned';
      question.assignedAt = new Date();
      question.assignedBy = assignedBy || 'Admin';
      question.answeredBy = '';
      question.answer = '';
      question.answeredAt = null;
      product.updatedAt = new Date();
      product.markModified('questions');
      await product.save();

      const skuStrForNotice = String(sku || '').trim();
      const qidStrForNotice = String(question.id || question._id || questionId || '').trim();
      const pharmacistIdStr = String(pharmacist._id);
      const recipientEmail = pharmacist.pharmacistEmail || pharmacist.email || '';

      // (1) Cập nhật admin_notice để admin thấy trạng thái "Đã phân công" (giữ nguyên bản ghi).
      try {
        if (qidStrForNotice || skuStrForNotice) {
          await adminNoticeCollection().updateMany(
            {
              type: 'consultation_product',
              $or: [
                qidStrForNotice ? { 'meta.questionId': qidStrForNotice } : { 'meta.questionId': { $exists: false } },
                skuStrForNotice ? { 'meta.sku': skuStrForNotice } : { 'meta.sku': { $exists: false } },
              ],
            },
            {
              $set: {
                'meta.assignedPharmacistId': pharmacistIdStr,
                'meta.assignedPharmacistName': pharmacist.pharmacistName || '',
                'meta.assignedPharmacistEmail': recipientEmail,
                'meta.assignedAt': new Date(),
                'meta.assignedBy': assignedBy || 'Admin',
              },
            }
          );
        }
      } catch (e) {
        console.warn('[PATCH /api/admin/consultations_product/reply] Cannot sync admin_notice product assignment:', e?.message || e);
      }

      // (2) Gửi thông báo riêng cho dược sĩ (chỉ người được phân công mới thấy).
      try {
        const now = new Date();
        await pharmacistNoticeCollection().insertOne({
          type: 'consultation_product_assigned',
          title: skuStrForNotice
            ? `Bạn vừa được phân công tư vấn sản phẩm (${skuStrForNotice})`
            : 'Bạn vừa được phân công tư vấn sản phẩm',
          message: '',
          createdAt: now,
          link: skuStrForNotice
            ? `/admin/consultation-product?sku=${encodeURIComponent(skuStrForNotice)}`
            : '/admin/consultation-product',
          roles: ['pharmacist'],
          meta: {
            pharmacistId: pharmacistIdStr,
            pharmacistEmail: recipientEmail,
            pharmacistName: pharmacist.pharmacistName || '',
            sku: skuStrForNotice,
            questionId: qidStrForNotice,
            questionStatus: 'assigned',
            productName,
            assignedAt: now,
            assignedBy: assignedBy || 'Admin',
          },
        });
      } catch (e) {
        console.warn('[PATCH /api/admin/consultations_product/reply] Cannot create pharmacist_notice product assignment:', e?.message || e);
      }

      if (recipientEmail) {
        const customerName = question.full_name || 'Khách vãng lai';
        const html = `
          <div style="font-family: system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f4f6fb; padding:24px;">
            <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:16px; padding:24px 28px; box-shadow:0 12px 30px rgba(15,23,42,0.18);">
              <h2 style="font-size:18px; margin:0 0 12px; color:#0f172a;">
                Bạn vừa được phân công câu hỏi tư vấn sản phẩm
              </h2>
              <p style="font-size:14px; color:#334155; line-height:1.6;">
                Xin chào <strong>${pharmacist.pharmacistName || 'Dược sĩ'}</strong>, hệ thống vừa giao cho bạn một câu hỏi mới cần tư vấn.
              </p>
              <div style="border-radius:12px; border:1px solid #e2e8f0; padding:14px 16px; background:#f8fafc;">
                <p style="margin:0 0 8px; font-size:14px;"><strong>Sản phẩm:</strong> ${productName} (${sku})</p>
                <p style="margin:0 0 8px; font-size:14px;"><strong>Khách hàng:</strong> ${customerName}</p>
                <p style="margin:0; font-size:14px; white-space:pre-line;"><strong>Nội dung:</strong> ${question.question || ''}</p>
              </div>
              <p style="margin-top:16px; font-size:13px; color:#64748b;">
                Vui lòng đăng nhập trang quản trị và vào mục "Tư vấn sản phẩm" để phản hồi khách hàng.
              </p>
            </div>
          </div>
        `;
        transporter.sendMail({
          from: 'vitacarehotro@gmail.com',
          to: recipientEmail,
          subject: `[VitaCare] Phân công tư vấn sản phẩm: ${sku}`,
          html
        }).catch((mailErr) => {
          console.warn('[consultations_product] sendMail error:', mailErr?.message || mailErr);
        });
      } else {
        console.warn('[consultations_product] Missing pharmacist email for:', pharmacist._id);
      }

      return res.json({ success: true, data: product, mode: 'assigned' });
    }

    // Trả lời câu hỏi (admin hoặc pharmacist)
    question.answer = answer;
    question.answeredBy = answeredBy;
    question.status = 'answered';
    question.answeredAt = new Date();
    product.updatedAt = new Date();
    product.markModified('questions');

    await product.save();

    // Câu hỏi đã được trả lời => đánh dấu thông báo admin_notice tương ứng là resolved.
    try {
      const qidStr = String(question.id || question._id || questionId || '').trim();
      if (qidStr) {
        await adminNoticeCollection().updateMany(
          {
            type: 'consultation_product',
            $or: [
              { 'meta.questionId': qidStr },
              { 'meta.sku': String(sku || '').trim() },
            ],
          },
          { $set: { resolved: true, resolvedAt: new Date() } }
        );
      }
    } catch (e) {
      console.warn('[PATCH /api/admin/consultations_product/reply] Cannot resolve admin_notice:', e?.message || e);
    }

    // Đồng bộ trạng thái thông báo phân công cho dược sĩ:
    // vẫn giữ item trong bell đến khi trạng thái câu hỏi chuyển sang hoàn thành.
    try {
      const qidStr = String(question.id || question._id || questionId || '').trim();
      const skuStr = String(sku || '').trim();
      if (qidStr || skuStr) {
        await pharmacistNoticeCollection().updateMany(
          {
            type: 'consultation_product_assigned',
            $or: [
              qidStr ? { 'meta.questionId': qidStr } : { 'meta.questionId': { $exists: false } },
              skuStr ? { 'meta.sku': skuStr } : { 'meta.sku': { $exists: false } },
            ],
          },
          {
            $set: {
              'meta.questionStatus': 'answered',
              updatedAt: new Date(),
            },
          }
        );
      }
    } catch (e) {
      console.warn('[PATCH /api/admin/consultations_product/reply] Cannot sync pharmacist_notice product status:', e?.message || e);
    }

    // Lưu notice cho user khi có phản hồi
    if (userId) {
      try {
        await noticesCollection().insertOne({
          user_id: String(userId),
          type: 'qa_reply',
          title: 'Câu hỏi sản phẩm đã có phản hồi',
          message: `Câu hỏi của bạn về sản phẩm "${productName}" đã được ${answeredBy || 'dược sĩ'} giải đáp.`,
          createdAt: new Date().toISOString(),
          read: false,
          link: `/product/${sku}`,
          linkLabel: 'Xem phản hồi',
          meta: sku,
        });
      } catch (e) {
        console.warn('[PATCH /api/admin/consultations_product/reply] Cannot create notice:', e.message);
      }
    }

    res.json({ success: true, data: product, mode: 'answered' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/consultations_disease', async (req, res) => {
  try {
    if (!assertConsultationDiseasePharmacistOnly(req, res)) return;
    const data = await ConsultationDiseaseModel.find().sort({ updatedAt: -1 });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/consultations_disease/stats', async (req, res) => {
  try {
    if (!assertConsultationDiseasePharmacistOnly(req, res)) return;
    const diseases = await ConsultationDiseaseModel.find().lean();
    const skuList = diseases.map((d) => String(d?.sku || '').trim()).filter(Boolean);

    const slugCandidates = new Set();
    for (const sku of skuList) {
      const normalized = sku.replace(/^benh\//i, '').replace(/\.html$/i, '');
      slugCandidates.add(sku);
      slugCandidates.add(`benh/${normalized}.html`);
      slugCandidates.add(`${normalized}.html`);
      slugCandidates.add(`benh/${normalized}`);
      slugCandidates.add(normalized);
    }

    const diseaseDocs = await DiseaseModel.find(
      { slug: { $in: Array.from(slugCandidates) } },
      { slug: 1, name: 1, categories: 1 }
    ).lean();

    const diseaseByKey = new Map();
    const toKey = (value) => String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^benh\//i, '')
      .replace(/\.html$/i, '');
    for (const doc of diseaseDocs) {
      const key = toKey(doc?.slug);
      if (key && !diseaseByKey.has(key)) diseaseByKey.set(key, doc);
    }

    const stats = diseases.map(d => {
      const match = diseaseByKey.get(toKey(d?.sku));
      const unanswered = (d.questions || []).filter(
        (q) => q.status === 'pending' || q.status === 'unreviewed' || !q.answer
      ).length;
      return {
        sku: d.sku,
        productName: match?.name || d.productName,
        categories: Array.isArray(match?.categories) ? match.categories : [],
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
    if (!assertConsultationDiseasePharmacistOnly(req, res)) return;
    const { sku, questionId, answer, answeredBy, pharmacistId, answeredByPharmacistId } = req.body || {};
    const skuStr = String(sku ?? '').trim();
    const qIdRaw = String(questionId ?? '').trim();
    if (!skuStr || !qIdRaw) {
      return res.status(400).json({ success: false, message: 'Thiếu sku hoặc questionId.' });
    }

    const skuCandidates = getDiseaseSkuLookupCandidates(skuStr);
    const col = mongoose.connection.db.collection('consultations_disease');
    const diseaseDoc = await col.findOne({ sku: { $in: skuCandidates } });
    if (!diseaseDoc) return res.status(404).json({ success: false, message: 'Disease not found' });

    const question = findDiseaseQuestionByClientId(diseaseDoc.questions || [], qIdRaw);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const userId = question.user_id || null;
    const storedSku = String(diseaseDoc.sku ?? skuStr).trim();
    const diseaseName = diseaseDoc.productName || storedSku;
    const canonicalQuestionId = diseaseQuestionIdString(question) || qIdRaw;
    const hadOfficialAnswerBefore =
      question.answer != null && String(question.answer).trim() !== '';

    const pidRaw = String(pharmacistId ?? answeredByPharmacistId ?? '').trim();
    let requesterNameFromDb = '';
    if (pidRaw) {
      try {
        const or = [{ _id: pidRaw }];
        if (mongoose.Types.ObjectId.isValid(pidRaw)) {
          try {
            or.push({ _id: new mongoose.Types.ObjectId(pidRaw) });
          } catch (_) {
            /* ignore */
          }
        }
        const ph = await Pharmacist.findOne({ $or: or }).lean();
        requesterNameFromDb = String(ph?.pharmacistName ?? ph?.name ?? '').trim();
      } catch (_) {
        /* ignore */
      }
    }
    let resolvedAnsweredBy = String(answeredBy ?? '').trim();
    if ((!resolvedAnsweredBy || resolvedAnsweredBy === 'Admin') && requesterNameFromDb) {
      resolvedAnsweredBy = requesterNameFromDb;
    }
    if (!resolvedAnsweredBy || resolvedAnsweredBy === 'Admin') {
      resolvedAnsweredBy = 'Dược sĩ';
    }

    if (
      hadOfficialAnswerBefore &&
      !diseaseQuestionEditableByRequestingPharmacist(question, pidRaw, requesterNameFromDb)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Chỉ dược sĩ đã trả lời câu hỏi này mới được sửa nội dung.',
      });
    }

    const answerStr = answer != null ? String(answer) : '';
    const qCriteria = [{ 'q.id': qIdRaw }, { 'q._id': qIdRaw }];
    if (mongoose.Types.ObjectId.isValid(qIdRaw) && String(new mongoose.Types.ObjectId(qIdRaw)) === qIdRaw) {
      qCriteria.push({ 'q._id': new mongoose.Types.ObjectId(qIdRaw) });
    }

    const answeredAt = new Date();
    const qSet = {
      'questions.$[q].answer': answerStr,
      'questions.$[q].answeredBy': resolvedAnsweredBy,
      'questions.$[q].status': 'answered',
      'questions.$[q].answeredAt': answeredAt,
      updatedAt: answeredAt,
    };
    if (!hadOfficialAnswerBefore) {
      qSet['questions.$[q].answeredByPharmacistId'] = pidRaw || null;
    }
    await col.updateOne(
      { _id: diseaseDoc._id },
      { $set: qSet },
      { arrayFilters: [{ $or: qCriteria }] }
    );

    const fresh = await col.findOne({ _id: diseaseDoc._id });
    const qAfter = findDiseaseQuestionByClientId(fresh?.questions || [], qIdRaw);
    if (!qAfter || String(qAfter.status || '').toLowerCase() !== 'answered') {
      return res.status(500).json({
        success: false,
        message: 'Không cập nhật được câu hỏi (lỗi khớp id trong DB).',
      });
    }

    const abStored = String(qAfter.answeredBy || '').trim();
    const nameForNotice =
      abStored && abStored !== 'Dược sĩ' && abStored !== 'Admin'
        ? abStored
        : resolvedAnsweredBy !== 'Dược sĩ' && resolvedAnsweredBy !== 'Admin'
          ? String(resolvedAnsweredBy).trim()
          : '';

    await markPharmacistDiseaseNoticesResolved(
      storedSku,
      canonicalQuestionId,
      nameForNotice || resolvedAnsweredBy
    );
    await syncPharmacistDiseaseNoticeConsultedByName(storedSku, canonicalQuestionId, nameForNotice);

    // Thông báo user (chỉ lần trả lời đầu — tránh gửi lặp khi dược sĩ sửa nội dung).
    if (userId && !hadOfficialAnswerBefore) {
      try {
        const { href, routeId } = diseaseConsultationBenhPath(storedSku);
        const isGenericResponder =
          !resolvedAnsweredBy ||
          resolvedAnsweredBy === 'Dược sĩ' ||
          resolvedAnsweredBy === 'Admin';
        const replyMessage = isGenericResponder
          ? 'Câu hỏi về bệnh của bạn vừa được dược sĩ trả lời.'
          : `Câu hỏi về bệnh của bạn vừa được Dược sĩ "${resolvedAnsweredBy}" trả lời.`;
        await noticesCollection().insertOne({
          user_id: String(userId),
          type: 'qa_reply',
          title: 'Dược sĩ vừa trả lời câu hỏi của bạn',
          message: replyMessage,
          createdAt: new Date().toISOString(),
          read: false,
          link: href,
          linkLabel: 'Xem phản hồi',
          meta: routeId || storedSku,
          meta_label: diseaseName,
        });
      } catch (e) {
        console.warn('[PATCH /api/admin/consultations_disease/reply] Cannot create notice:', e.message);
      }
    }

    res.json({ success: true, data: fresh });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Phải khai báo trước route :sku/:questionId (tránh khớp sku=document).
// DELETE /api/admin/consultations_disease/document/:id — xóa vĩnh viễn cả bản ghi consultations_disease (Mongo _id).
app.delete('/api/admin/consultations_disease/document/:id', async (req, res) => {
  try {
    if (!assertConsultationDiseasePharmacistOnly(req, res)) return;
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, message: 'Thiếu id.' });
    const or = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      try {
        or.push({ _id: new mongoose.Types.ObjectId(id) });
      } catch (_) {
        /* ignore */
      }
    }
    const result = await ConsultationDiseaseModel.findOneAndDelete({ $or: or });
    if (!result) return res.status(404).json({ success: false, message: 'Không tìm thấy.' });
    const delSku = result.sku != null ? String(result.sku) : '';
    if (delSku) {
      try {
        await pharmacistNoticeCollection().deleteMany({
          type: 'consultation_disease',
          'meta.sku': delSku,
        });
      } catch (e) {
        console.warn('[DELETE consultations_disease document] pharmacist_notice:', e?.message || e);
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/consultations_disease/:sku/:questionId', async (req, res) => {
  try {
    if (!assertConsultationDiseasePharmacistOnly(req, res)) return;
    const sku = String(req.params.sku ?? '').trim();
    const questionId = decodeURIComponent(String(req.params.questionId ?? '').trim());
    const disease = await ConsultationDiseaseModel.findOne({ sku });
    if (!disease) return res.status(404).json({ success: false, message: 'Disease not found' });

    disease.questions = (disease.questions || []).filter((q) => !diseaseConsultationQuestionMatchesId(q, questionId));
    await disease.save();
    await markPharmacistDiseaseNoticesResolved(sku, questionId);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    // 1. Lấy danh sách user
    const users = await UserModel.find().sort({ registerdate: -1 }).lean();

    // 2. Aggregate tổng chi tiêu theo user_id chỉ với đơn đã giao thành công
    const spendingAgg = await OrderModel.aggregate([
      {
        $addFields: {
          status_norm: {
            $trim: { input: { $toLower: { $toString: { $ifNull: ['$status', ''] } } } }
          },
          user_id_norm: {
            $trim: { input: { $toString: { $ifNull: ['$user_id', ''] } } }
          }
        }
      },
      { $match: { status_norm: { $in: SUCCESS_ORDER_STATUSES_FOR_SPENDING } } },
      { $match: { user_id_norm: { $ne: '' } } },
      {
        $group: {
          _id: '$user_id_norm',
          totalspent: {
            $sum: {
              $toDouble: {
                $ifNull: [
                  '$totalAmount',
                  { $ifNull: ['$total', { $ifNull: ['$amount', 0] }] }
                ]
              }
            }
          }
        }
      }
    ]);

    const spendingMap = {};
    spendingAgg.forEach((row) => {
      if (!row || !row._id) return;
      spendingMap[String(row._id)] = Number(row.totalspent) || 0;
    });

    const ordersAgg = await OrderModel.aggregate([
      { $match: { user_id: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: '$user_id', total_orders: { $sum: 1 } } }
    ]);
    const ordersMap = {};
    ordersAgg.forEach((row) => {
      if (!row || row._id == null) return;
      ordersMap[String(row._id)] = Number(row.total_orders) || 0;
    });

    const userIds = users
      .map((u) => String(u.user_id || u._id || '').trim())
      .filter(Boolean);

    const addressMap = {};
    if (userIds.length > 0) {
      const addressDocs = await addressesCollection()
        .find({
          $or: [
            { user_id: { $in: userIds } },
            { userId: { $in: userIds } }
          ]
        })
        .sort({ isDefault: -1, createdAt: 1 })
        .toArray();

      for (const addr of addressDocs) {
        const key = String(addr.user_id || addr.userId || '').trim();
        if (!key || addressMap[key]) continue;
        const fullAddress = String(
          addr.fullAddress ||
          [addr.detail, addr.ward, addr.district, addr.province].filter(Boolean).join(', ')
        ).trim();
        if (!fullAddress) continue;
        addressMap[key] = fullAddress;
      }
    }

    // 3. Gán lại totalspent + tiering cho từng user (và đồng bộ vào DB)
    const bulkOps = [];
    const data = users.map((u) => {
      const uid = String(u.user_id || u._id || '');
      const aggSpent = spendingMap[uid] ?? 0;
      const finalTotal = aggSpent;
      const tiering = getTierFromTotalSpent(finalTotal);
      const total_orders = ordersMap[uid] ?? 0;

      // Chuẩn bị bulk update để lưu lại
      if (uid) {
        bulkOps.push({
          updateOne: {
            filter: { user_id: uid },
            update: { $set: { totalspent: finalTotal, tiering } }
          }
        });
      }

      return {
        ...u,
        totalspent: finalTotal,
        tiering,
        total_orders,
        defaultAddress: addressMap[uid] || ''
      };
    });

    if (bulkOps.length) {
      await UserModel.bulkWrite(bulkOps, { ordered: false }).catch(() => { });
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/users/:id/profile', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    const userQueries = [{ user_id: rawId }, { _id: rawId }];
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      userQueries.push({ _id: new mongoose.Types.ObjectId(rawId) });
    }

    const customer = await UserModel.findOne({ $or: userQueries }).lean();
    if (!customer) return res.status(404).json({ success: false, message: 'User not found' });

    const userId = String(customer.user_id || customer._id || rawId);
    const [orders, addresses] = await Promise.all([
      OrderModel.find({ user_id: userId }).lean(),
      addressesCollection().find({ user_id: userId }).toArray()
    ]);

    res.json({ success: true, data: { customer, orders, addresses } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/users/:id', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    const query = [{ _id: rawId }, { user_id: rawId }];
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      query.push({ _id: new mongoose.Types.ObjectId(rawId) });
    }
    const data = await UserModel.findOne({ $or: query });
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
    const { favorites, ...userData } = req.body || {};
    const item = new UserModel(userData);
    const data = await item.save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

/** Mã khách hàng tiếp theo (CUS + 6 số), đồng bộ với POST tạo khách. */
async function computeNextCustomerUserId() {
  const lastUser = await usersCollection().find().sort({ user_id: -1 }).limit(1).toArray();
  let nextNum = 1;
  if (lastUser.length > 0) {
    const m = (lastUser[0].user_id || '').match(/CUS0*(\d+)/i);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  return 'CUS' + String(nextNum).padStart(6, '0');
}

app.get('/api/admin/customers/next-user-id', async (req, res) => {
  try {
    const user_id = await computeNextCustomerUserId();
    res.json({ success: true, user_id });
  } catch (error) {
    console.error('[GET /api/admin/customers/next-user-id]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/** Tạo khách hàng từ admin: mã CUS tự tăng, mật khẩu tạm nếu không gửi (đủ rule). */
app.post('/api/admin/customers', async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      gender,
      birthday,
      dob,
      tiering,
      password,
    } = req.body || {};

    const nameStr = String(full_name || '').trim();
    if (!nameStr) {
      return res.status(400).json({ success: false, message: 'Thiếu họ tên.' });
    }

    const p = normalizePhone(phone);
    if (!p || p.length < 9 || p.length > 11) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });
    }

    const existing = await usersCollection().findOne({
      $or: [{ phone: p }, { phone: String(phone || '').trim() }],
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Số điện thoại đã tồn tại.' });
    }

    const user_id = await computeNextCustomerUserId();

    const pwdRaw = password != null && String(password).trim() !== '' ? String(password).trim() : 'VitaCare#Admin1';
    if (!isValidPassword(pwdRaw)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE_MSG });
    }
    const passwordHash = await bcrypt.hash(pwdRaw, 10);

    let genderVal = 'Other';
    if (gender === 'Nam' || gender === 'Male') genderVal = 'Male';
    else if (gender === 'Nữ' || gender === 'Female') genderVal = 'Female';

    const tier = ['Đồng', 'Bạc', 'Vàng'].includes(String(tiering || '').trim())
      ? String(tiering).trim()
      : 'Đồng';

    const bday = birthday || dob || null;

    const newUser = {
      user_id,
      avatar: null,
      full_name: nameStr,
      email: String(email || '').trim(),
      password: passwordHash,
      phone: p,
      birthday: bday,
      gender: genderVal,
      address: [],
      registerdate: new Date().toISOString(),
      totalspent: 0,
      tiering: tier,
    };

    const ins = await usersCollection().insertOne(newUser);
    await cartsCollection().insertOne({ user_id, items: [] }).catch(() => { });

    const { password: _pw, ...safe } = newUser;
    const data = { ...safe, _id: ins.insertedId };
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('[POST /api/admin/customers]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const { favorites, ...updateData } = req.body || {};
    const data = await UserModel.findByIdAndUpdate(req.params.id, updateData, { new: true });
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
    const includeContent = req.query.includeContent === 'true';

    const [totalItems, data] = await Promise.all([
      BlogModel.countDocuments(),
      BlogModel.find()
        .select(includeContent ? {} : { descriptionHtml: 0, content: 0, body: 0 })
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

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

app.get('/api/admin/blogs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    const data = await BlogModel.findOne({ $or: query }).lean();
    if (!data) return res.status(404).json({ success: false, message: 'Blog not found' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Danh sách chuyên mục blog (trích từ collection blog/blogs trong Mongo)
app.get('/api/admin/blog-categories', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const colls = await db.listCollections({ name: { $in: ['blog', 'blogs'] } }).toArray();
    const collName = colls.some((c) => c.name === 'blog') ? 'blog' : 'blogs';
    const blogsCol = db.collection(collName);

    const catsMap = new Map();

    // Strategy 1: category.name (single category object)
    const catDocs = await blogsCol.find(
      { 'category.name': { $exists: true, $ne: '' } },
      { projection: { 'category.name': 1, 'category.slug': 1, 'category._id': 1, 'category.id': 1 } }
    ).limit(5000).toArray().catch(() => []);
    for (const doc of catDocs) {
      const c = doc.category;
      if (c && c.name) {
        const key = String(c.name).trim();
        if (key && !catsMap.has(key)) {
          catsMap.set(key, { id: String(c.id || c._id || c.slug || key), name: key, slug: String(c.slug || '') });
        }
      }
    }

    // Strategy 2: categories array (nested objects)
    const catArrDocs = await blogsCol.find(
      { categories: { $exists: true, $type: 'array' } },
      { projection: { categories: 1 } }
    ).limit(5000).toArray().catch(() => []);
    for (const doc of catArrDocs) {
      if (!Array.isArray(doc.categories)) continue;
      for (const item of doc.categories) {
        if (!item) continue;
        const name = String(item.name || item?.category?.name || '').trim();
        if (name && !catsMap.has(name)) {
          const slug = String(item.slug || item?.category?.slug || '');
          const id = String(item.id || item._id || item?.category?.id || slug || name);
          catsMap.set(name, { id, name, slug });
        }
      }
    }

    // Strategy 3: categoryName (plain string field)
    if (catsMap.size === 0) {
      const names = await blogsCol.distinct('categoryName').catch(() => []);
      for (const n of (names || [])) {
        const name = String(n || '').trim();
        if (name && !catsMap.has(name)) {
          catsMap.set(name, { id: name, name, slug: '' });
        }
      }
    }

    const data = Array.from(catsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data });
  } catch (error) {
    console.error('[GET /api/admin/blog-categories] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload ảnh cho blog (primary image / editor images)
app.post('/api/admin/blogs/upload-image', (req, res) => {
  uploadBlogImage(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const relUrl = `/uploads/blogs/${req.file.filename}`;
    const API_BASE = process.env.API_URL || `http://localhost:${PORT}`;
    return res.json({ success: true, url: relUrl, fullUrl: `${API_BASE}${relUrl}` });
  });
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

app.get('/api/admin/check-benh', async (req, res) => {
  try {
    const data = await DiseaseModel.find().limit(5).lean();
    res.json({ success: true, count: data.length, sample: data });
  } catch (error) { res.status(500).send(error.message); }
});

app.get('/api/admin/diseases', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const sortColumn = String(req.query.sortColumn || 'created_at').trim();
    const sortDirection = String(req.query.sortDirection || 'desc').trim() === 'asc' ? 1 : -1;
    const groupIds = String(req.query.groupIds || '').split(',').map(s => s.trim()).filter(Boolean);

    const query = {};
    const andFilters = [];

    if (search) {
      andFilters.push({
        $or: [
          { name: { $regex: escapeRegExp(search), $options: 'i' } },
          { headline: { $regex: escapeRegExp(search), $options: 'i' } },
          { slug: { $regex: escapeRegExp(search), $options: 'i' } }
        ]
      });
    }

    if (status === 'approved' || status === 'pending') {
      andFilters.push({ is_approved: status === 'approved' });
    }

    if (groupIds.length > 0) {
      const groupDocs = await DiseaseGroupModel.find().lean();
      const selectedGroups = groupDocs.filter((g) => groupIds.includes(String(g?._id || g?.id || '').trim()));
      const selectedSlugs = selectedGroups.map((g) => String(g?.slug || '').trim()).filter(Boolean);

      const groupMixedIds = [];
      groupIds.forEach((id) => {
        groupMixedIds.push(id);
        try { groupMixedIds.push(new mongoose.Types.ObjectId(id)); } catch (e) { }
      });

      const slugConditions = selectedSlugs.flatMap((slug) => ([
        { 'categories.fullPathSlug': { $regex: `benh\\/(nhom-benh|benh-thuong-gap)\\/${escapeRegExp(slug)}`, $options: 'i' } },
        { 'categories.full_path_slug': { $regex: `benh\\/(nhom-benh|benh-thuong-gap)\\/${escapeRegExp(slug)}`, $options: 'i' } }
      ]));

      andFilters.push({
        $or: [
          { groupId: { $in: groupMixedIds } },
          { 'group._id': { $in: groupMixedIds } },
          { 'group.id': { $in: groupMixedIds } },
          ...slugConditions
        ]
      });
    }

    if (andFilters.length > 0) query.$and = andFilters;

    const allowedSort = ['created_at', 'updated_at', 'name', 'headline', 'published_at'];
    const effectiveSortColumn = allowedSort.includes(sortColumn) ? sortColumn : 'created_at';
    const sortObj = { [effectiveSortColumn]: sortDirection };

    const [totalItems, data] = await Promise.all([
      DiseaseModel.countDocuments(query),
      DiseaseModel.find(query)
        .select({ descriptionHtml: 0, content: 0, body: 0 })
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean()
    ]);
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

app.get('/api/admin/diseases/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    if (!isNaN(id)) {
      query.push({ id: parseInt(id) });
    }
    const data = await DiseaseModel.findOne({ $or: query }).lean();
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy bệnh' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/admin/diseases', async (req, res) => {
  try {
    const item = new DiseaseModel(req.body);
    const data = await item.save();
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/admin/diseases/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    const data = await DiseaseModel.findOneAndUpdate({ $or: query }, req.body, { new: true });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/admin/diseases/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = [{ _id: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.push({ _id: new mongoose.Types.ObjectId(id) });
    }
    await DiseaseModel.findOneAndDelete({ $or: query });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/admin/disease-groups', async (req, res) => {
  try {
    const data = await DiseaseGroupModel.find().lean();
    res.json({ success: true, data });
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
    const removed = await ProductGroup.findOneAndDelete({ $or: query });
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm' });
    }
    const groupIdUnset = mongoose.Types.ObjectId.isValid(id)
      ? [id, new mongoose.Types.ObjectId(id)]
      : [id];
    await ProductModel.updateMany({ groupId: { $in: groupIdUnset } }, { $unset: { groupId: 1 } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

const ADMIN_ROLES = {
  admin: {
    model: AdminModel,
    emailFields: ['adminemail', 'email'],
    passwordField: 'password',
    roleLabel: 'Admin'
  },
  pharmacist: {
    model: Pharmacist,
    emailFields: ['pharmacistEmail', 'email'],
    passwordField: 'password',
    roleLabel: 'Pharmacist'
  }
};

function getRoleConfig(roleRaw) {
  const role = String(roleRaw || 'admin').toLowerCase();
  return ADMIN_ROLES[role] || null;
}

function getEmailQuery(email, emailFields) {
  return {
    $or: emailFields.map((field) => ({ [field]: email }))
  };
}

app.post('/api/admin/check-role-email', async (req, res) => {
  const { email, role } = req.body || {};
  const normalizedEmail = String(email || '').trim();
  const roleConfig = getRoleConfig(role);

  if (!roleConfig) {
    return res.status(400).json({ success: false, valid: false, message: 'Vai trò không hợp lệ.' });
  }
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, valid: false, message: 'Email là bắt buộc.' });
  }

  try {
    const user = await roleConfig.model.findOne(getEmailQuery(normalizedEmail, roleConfig.emailFields));
    if (!user) {
      return res.json({
        success: false,
        valid: false,
        message: `Email này không thuộc vai trò ${roleConfig.roleLabel}.`
      });
    }
    return res.json({ success: true, valid: true });
  } catch (error) {
    return res.status(500).json({ success: false, valid: false, message: error.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const { email, password, role } = req.body || {};
  const roleConfig = getRoleConfig(role);
  if (!roleConfig) {
    return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ.' });
  }

  try {
    const user = await roleConfig.model.findOne(getEmailQuery(email, roleConfig.emailFields));
    if (!user) {
      return res.status(401).json({ success: false, message: 'Email không thuộc vai trò đã chọn.' });
    }
    const storedPassword = user?.[roleConfig.passwordField];
    if (storedPassword !== password) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác.' });
    }
    const responseUser = user.toObject ? user.toObject() : user;
    responseUser.accountRole = String(role).toLowerCase();
    res.json({ success: true, message: 'Login success', admin: responseUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/forgot-password', async (req, res) => {
  const { email, role } = req.body || {};
  const roleConfig = getRoleConfig(role);
  if (!roleConfig) {
    return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ.' });
  }

  try {
    const user = await roleConfig.model.findOne(getEmailQuery(email, roleConfig.emailFields));
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email không tồn tại trong vai trò đã chọn.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi kiểm tra email' });
  }

  const roleKey = String(role).toLowerCase();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  resetCodes[`${roleKey}:${email}`] = code;

  const mailOptions = {
    from: 'vitacarehotro@gmail.com',
    to: email,
    subject: `Yêu cầu đặt lại mật khẩu - VitaCare ${roleConfig.roleLabel}`,
    html: `
        <div style="background-color: #e8f0fe; padding: 50px 20px; font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
                <div style="background: linear-gradient(to right, #0056b3, #a594f9); padding: 40px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 38px; font-weight: bold; letter-spacing: 1px;">VitaCare</h1>
                </div>
                <div style="padding: 50px 40px; text-align: center;">
                    <h2 style="color: #004695; margin: 0 0 25px 0; font-size: 26px; font-weight: bold;">Yêu cầu đặt lại mật khẩu</h2>
                    <p style="color: #777; font-size: 18px; margin: 0;">Xin chào,</p>
                    <p style="color: #777; font-size: 17px; line-height: 1.6; margin: 10px 0 40px 0;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ${roleConfig.roleLabel} của bạn. Sử dụng mã OTP bên dưới để xác thực:</p>
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
  const { email, code, role } = req.body || {};
  const roleKey = String(role || 'admin').toLowerCase();
  if (resetCodes[`${roleKey}:${email}`] && resetCodes[`${roleKey}:${email}`] === code) {
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, message: 'Mã xác thực không chính xác' });
  }
});

app.post('/api/admin/reset-password', async (req, res) => {
  const { email, newPassword, role } = req.body || {};
  const roleConfig = getRoleConfig(role);
  if (!roleConfig) {
    return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ.' });
  }

  try {
    const updated = await roleConfig.model.findOneAndUpdate(
      getEmailQuery(email, roleConfig.emailFields),
      { [roleConfig.passwordField]: newPassword },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: `Không tìm thấy tài khoản ${roleConfig.roleLabel}` });
    }
    delete resetCodes[`${String(role).toLowerCase()}:${email}`];
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/change-password', async (req, res) => {
  const { email, oldPassword, newPassword, role } = req.body || {};
  const roleConfig = getRoleConfig(role);
  if (!roleConfig) {
    return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ.' });
  }

  try {
    const user = await roleConfig.model.findOne(getEmailQuery(email, roleConfig.emailFields));
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    if (user?.[roleConfig.passwordField] !== oldPassword) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác' });
    }
    const updated = await roleConfig.model.findOneAndUpdate(
      getEmailQuery(email, roleConfig.emailFields),
      { [roleConfig.passwordField]: newPassword },
      { new: true }
    );
    const responseUser = updated?.toObject ? updated.toObject() : updated;
    if (responseUser) responseUser.accountRole = String(role).toLowerCase();
    res.json({ success: true, message: 'Đổi mật khẩu thành công', admin: responseUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


