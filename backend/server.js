require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { connectDB, mongoose } = require('./db');
const multer = require('multer');

// Mongoose models (được định nghĩa trong my-user/src/app/models)
const Product = require('../my-user/src/app/models/Product');
const Category = require('../my-user/src/app/models/Category');
const Blog = require('../my-user/src/app/models/Blog');
const HealthVideo = require('../my-user/src/app/models/HealthVideo');
const Consultation = require('../my-user/src/app/models/Consultation');
const Review = require('../my-user/src/app/models/Review');
const User = require('../my-user/src/app/models/User');
const Order = require('../my-user/src/app/models/Order');
const Cart = require('../my-user/src/app/models/Cart');
const HealthProfile = require('../my-user/src/app/models/HealthProfile');
const Prescription = require('../my-user/src/app/models/Prescription');
// const ProductFAQ = require('../my-user/src/app/models/ProductFAQ');
// const Quiz = require('../my-user/src/app/models/quiz');
// const Result = require('../my-user/src/app/models/result');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: ['http://localhost:4200', 'http://localhost:54083'] }));
app.use(express.json());

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
const cartsCollection = () => mongoose.connection.db.collection('carts');
const otpCodesCollection = () => mongoose.connection.db.collection('otp_codes');
const addressesCollection = () => mongoose.connection.db.collection('addresses');
const healthprofilesCollection = () => mongoose.connection.db.collection('healthprofiles');
const healthProfilesCollection = () => mongoose.connection.db.collection('healthProfiles'); // New, camelCase version
const quizCollection = () => mongoose.connection.db.collection('quiz'); // New
const resultsCollection = () => mongoose.connection.db.collection('results'); // New
const locationsCollection = () => mongoose.connection.db.collection('tree_complete');
const ordersCollection = () => mongoose.connection.db.collection('orders');
const productsCollection = () => mongoose.connection.db.collection('products');
const categoriesCollection = () => mongoose.connection.db.collection('categories');
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
    if (keyword) {
      filter.name = { $regex: keyword, $options: 'i' };
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
          return { name: { $regex: kw, $options: 'i' } };
        });
        advancedConditions.push({ $or: flavorOr });
      }
    }

    if (audience) {
      const audiences = audience.split(',').map(a => a.trim()).filter(a => a && a !== 'Tất cả');
      if (audiences.length > 0) {
        const audienceOr = audiences.map(a => ({
          $or: [
            { name: { $regex: a, $options: 'i' } },
            { description: { $regex: a, $options: 'i' } }
          ]
        }));
        advancedConditions.push({ $or: audienceOr });
      }
    }

    if (indication) {
      const indications = indication.split(',').map(i => i.trim()).filter(i => i && i !== 'Tất cả');
      if (indications.length > 0) {
        const indicationOr = indications.map(ind => ({
          $or: [
            { name: { $regex: ind, $options: 'i' } },
            { description: { $regex: ind, $options: 'i' } },
            { usage: { $regex: ind, $options: 'i' } }
          ]
        }));
        advancedConditions.push({ $or: indicationOr });
      }
    }

    if (origin) {
      const origins = origin.split(',').map(o => o.trim()).filter(o => o && o !== 'Tất cả');
      if (origins.length > 0) {
        filter.country = { $in: origins };
      }
    }

    if (brandOrigin) {
      const bOrigins = brandOrigin.split(',').map(o => o.trim()).filter(o => o && o !== 'Tất cả');
      if (bOrigins.length > 0) {
        const bOriginOr = bOrigins.map(o => ({
          $or: [
            { country: { $regex: o, $options: 'i' } },
            { description: { $regex: o, $options: 'i' } }
          ]
        }));
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

    if (categorySlug) {
      const cat = await categoriesCollection().findOne({ slug: categorySlug });
      if (cat) {
        const catId = getId(cat);
        const allCats = await categoriesCollection().find({}).toArray();
        const descendants = allCats.filter((c) => {
          const pid = c.parentId ? getId(c.parentId) : null;
          return pid === catId;
        });
        const allIds = [catId, ...descendants.map((c) => getId(c)).filter(Boolean)];
        const objIds = allIds
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));
        // Seed data stores categoryId as string; DB may also use ObjectId - match both
        const inValues = [...new Set([...allIds, ...objIds])];
        if (inValues.length > 0) {
          filter.categoryId = { $in: inValues };
        }
      }
    }
    // Filter theo categoryId (dùng cho mega menu "Bán chạy nhất" ở header).
    // Thay vì chỉ match đúng 1 id, ta cần bao luôn các danh mục con (giống logic categorySlug).
    if (categoryIdParam && !filter.categoryId) {
      const idStr = categoryIdParam;

      // Thu thập toàn bộ categoryId: chính nó + các con trực tiếp
      const allCats = await categoriesCollection().find({}).toArray();
      const directMatches = allCats.filter((c) => getId(c) === idStr);

      const allIds = [];
      directMatches.forEach((root) => {
        const rootId = getId(root);
        if (rootId) {
          allIds.push(rootId);
          const children = allCats.filter((c) => {
            const pid = c.parentId ? getId(c.parentId) : null;
            return pid === rootId;
          });
          children.forEach((ch) => {
            const cid = getId(ch);
            if (cid) allIds.push(cid);
          });
        }
      });

      // Nếu không tìm được trong bảng category (ví dụ id là leaf đã biết),
      // fallback về id đơn lẻ như cũ để không phá case hiện tại.
      if (allIds.length === 0) {
        allIds.push(idStr);
      }

      const objIds = allIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      const inValues = [...new Set([...allIds, ...objIds])];
      filter.categoryId = { $in: inValues };
    }
    if (brand) {
      filter.brand = brand;
    }
    if (hasDiscount) {
      // Chỉ lấy sản phẩm có giảm giá (discount > 0)
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

    const col = productsCollection();
    const skip = (page - 1) * limit;
    let sortOption = { _id: -1 };
    if (sort === 'price_asc') sortOption = { price: 1 };
    if (sort === 'price_desc') sortOption = { price: -1 };
    if (sort === 'newest') sortOption = { _id: -1 };
    if (sort === 'discount') sortOption = { discount: -1 };

    const [items, total] = await Promise.all([
      col.find(filter).sort(sortOption).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);

    const products = items.map((p) => {
      const id = getId(p);
      const categoryId = p.categoryId ? getId(p.categoryId) : null;
      return {
        _id: id,
        name: p.name,
        productName: p.name,
        price: p.price,
        discount: p.discount,
        unit: p.unit || 'Hộp',
        image: p.image,
        categoryId,
        slug: p.slug || id,
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

    // Ưu tiên tìm theo slug
    let product = await productsCollection().findOne({ slug });

    // Nếu không có, thử tìm theo _id (string hoặc ObjectId)
    if (!product) {
      product = await productsCollection().findOne({ _id: slug });
    }
    if (!product && mongoose.Types.ObjectId.isValid(slug)) {
      product = await productsCollection().findOne({ _id: new mongoose.Types.ObjectId(slug) });
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
      };
    });

    res.json(related);
  } catch (err) {
    console.error('[GET /api/products/related/:id] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy sản phẩm liên quan.' });
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
      statusPayment: statusPayment || 'unpaid',
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
    res.json({ success: true, items });
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
    if (!['pending', 'confirmed'].includes(doc.status)) {
      return res.status(400).json({ success: false, message: 'Chỉ có thể huỷ đơn đang chờ xác nhận.' });
    }
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

    res.json({ success: true, message: 'Đã xác nhận nhận hàng.' });
  } catch (err) {
    console.error('Confirm received error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
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
    const totalQuantity = itemsArray.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalPrice = itemsArray.reduce(
      (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0
    );

    const cart = {
      ...cartDoc,
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

    const existIdx = items.findIndex(i =>
      String(i._id || i.sku || '') === itemId || String(i.sku || '') === String(item.sku || '_')
    );

    if (existIdx > -1) {
      items[existIdx].quantity = (Number(items[existIdx].quantity) || 0) + qty;
      items[existIdx].updatedAt = now;
    } else {
      items.unshift({
        _id: itemId,
        sku: item.sku || '',
        productName: item.productName || item.name || '',
        quantity: qty,
        discount: Number(item.discount) || 0,
        price: Number(item.price) || 0,
        hasPromotion: Boolean(item.hasPromotion),
        image: item.image || '',
        unit: item.unit || 'Hộp',
        category: item.category || '',
        addedAt: now,
        updatedAt: now,
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

// PATCH /api/carts - cập nhật giỏ hàng (items: mảng item, mỗi item có _id, sku, productName, quantity, price, ...)
app.patch('/api/carts', async (req, res) => {
  try {
    const { user_id, items } = req.body || {};
    const uid = String(user_id || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const itemsArray = Array.isArray(items) ? items : [];
    const totalQuantity = itemsArray.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalPrice = itemsArray.reduce(
      (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0
    );

    // Dùng raw collection thay Mongoose model
    await cartsCollection().updateOne(
      { user_id: uid },
      {
        $set: {
          user_id: uid,
          items: itemsArray,
          itemCount: itemsArray.length,
          totalQuantity,
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
      filter.$or = [
        { ten_cua_hang: { $regex: keyword, $options: 'i' } },
        { 'dia_chi.dia_chi_day_du': { $regex: keyword, $options: 'i' } },
        { 'thong_tin_lien_he.so_dien_thoai': { $regex: keyword, $options: 'i' } }
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
    const user_id = String(req.query.user_id || '').trim();
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id.' });
    }
    const list = await remindersCollection()
      .find({ user_id })
      .sort({ start_date: 1 })
      .toArray();
    const reminders = list.map((r) => ({
      ...r,
      _id: getId(r),
      completion_log: r.completion_log || [],
    }));
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
    if (!result || !result.value) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lời nhắc.' });
    }
    const reminder = { ...result.value, _id: getId(result.value) };
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
    const id = req.params.id;
    const { date, time } = req.body || {};
    if (!date || !time) {
      return res.status(400).json({ success: false, message: 'Thiếu date hoặc time.' });
    }
    const oid = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
    const result = await remindersCollection().findOneAndUpdate(
      { _id: oid },
      {
        $set: { last_completed_date: new Date().toISOString() },
        $addToSet: { completion_log: { date: String(date), time: String(time) } },
      },
      { returnDocument: 'after' }
    );
    if (!result || !result.value) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lời nhắc.' });
    }
    const reminder = { ...result.value, _id: getId(result.value) };
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

// GET /api/blogs - danh sách bài viết sức khỏe (từ MongoDB collection blog/blogs)
app.get('/api/blogs', async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const healthIndicator = String(req.query.healthIndicator || '').trim();
    const category = String(req.query.category || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 10), 100);
    const hasSkip = req.query.skip !== undefined;
    const skipParam = hasSkip ? parseInt(req.query.skip, 10) || 0 : (page - 1) * limit;
    const skip = Math.max(0, skipParam);

    const orConds = [];
    if (keyword) {
      orConds.push(
        { title: { $regex: keyword, $options: 'i' } },
        { shortDescription: { $regex: keyword, $options: 'i' } }
      );
    }
    if (healthIndicator && HEALTH_INDICATOR_KEYWORDS[healthIndicator]) {
      const terms = HEALTH_INDICATOR_KEYWORDS[healthIndicator];
      terms.forEach((term) => {
        orConds.push(
          { title: { $regex: term, $options: 'i' } },
          { shortDescription: { $regex: term, $options: 'i' } }
        );
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

    // Collection: thử 'blog' (Atlas) trước, fallback 'blogs' (local)
    const db = mongoose.connection.db;
    const colls = await db.listCollections({ name: { $in: ['blog', 'blogs'] } }).toArray();
    const collName = colls.some((c) => c.name === 'blog') ? 'blog' : 'blogs';
    const blogsCol = db.collection(collName);
    const [items, total] = await Promise.all([
      blogsCol
        .find(filter)
        .sort({ publishedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      blogsCol.countDocuments(filter),
    ]);

    const API_BASE = process.env.API_URL || `http://localhost:${PORT}`;
    const normImg = (url) => {
      if (!url || typeof url !== 'string') return url;
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      const path = url.startsWith('/') ? url : `/${url}`;
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
      const imgUrl = b.primaryImage?.url || b.image || b.imageUrl;
      const normalized = {
        ...b,
        categoryName: catName || 'Bài viết',
        primaryImage: b.primaryImage ? { ...b.primaryImage, url: normImg(b.primaryImage.url) || b.primaryImage.url } : b.primaryImage,
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
    const colls = await db.listCollections({ name: { $in: ['blog', 'blogs'] } }).toArray();
    const collName = colls.some((c) => c.name === 'blog') ? 'blog' : 'blogs';
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
    const result = {
      ...doc,
      categoryName: catName || 'Bài viết',
      primaryImage: doc.primaryImage ? { ...doc.primaryImage, url: normImg(doc.primaryImage.url) || doc.primaryImage.url } : doc.primaryImage,
      image: normImg(doc.image) || doc.image,
      imageUrl: normImg(doc.imageUrl) || doc.imageUrl,
    };
    res.json(result);
  } catch (err) {
    console.error('[GET /api/blogs/:slug] Error:', err);
    res.json({ message: 'Not found' });
  }
});

// ========= HEALTH VIDEOS =========
// GET /api/health-videos - danh sách video sức khỏe Vinmec
app.get('/api/health-videos', async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 50);
    const category = String(req.query.category || '').trim();
    const keyword = String(req.query.keyword || '').trim();
    const productName = String(req.query.productName || '').trim();
    const col = mongoose.connection.db.collection('vinmec_playlists');

    // Map danh mục sản phẩm VitaCare → playlist Vinmec
    const CATEGORY_PLAYLIST_MAP = {
      'thực phẩm chức năng': ['DINH DƯỠNG', 'BÁC SĨ TƯ VẤN', 'CÁC BỆNH THƯỜNG GẶP'],
      'dược mỹ phẩm': ['THẨM MỸ', 'BÁC SĨ TƯ VẤN'],
      'thuốc': ['THÔNG TIN DƯỢC', 'NỘI KHOA', 'BÁC SĨ TƯ VẤN'],
      'chăm sóc cá nhân': ['THẨM MỸ', 'NHI KHOA', 'BÁC SĨ TƯ VẤN'],
      'thiết bị y tế': ['KHÁM SỨC KHỎE TỔNG QUÁT', 'BÁC SĨ TƯ VẤN'],
      'bệnh': ['CÁC BỆNH THƯỜNG GẶP', 'BÁC SĨ TƯ VẤN'],
      'dinh dưỡng': ['DINH DƯỠNG', 'NHI KHOA'],
      'nha khoa': ['NHA KHOA'],
      'tim mạch': ['TIM MẠCH'],
      'tiêu hóa': ['TIÊU HÓA - GAN MẬT'],
      'thần kinh': ['THẦN KINH'],
      'cơ xương khớp': ['CƠ XƯƠNG KHỚP'],
      'ung bướu': ['UNG BƯỚU'],
    };

    // Tìm playlists phù hợp với category của sản phẩm
    const catLower = category.toLowerCase();
    let mappedPlaylists = [];
    for (const [key, playlists] of Object.entries(CATEGORY_PLAYLIST_MAP)) {
      if (catLower.includes(key) || key.includes(catLower.split(' ')[0])) {
        mappedPlaylists = [...new Set([...mappedPlaylists, ...playlists])];
      }
    }

    // Tách search terms từ keyword + productName
    const searchText = [keyword, productName].filter(Boolean).join(' ').trim();
    const terms = searchText
      ? [...new Set(searchText.split(/\s+/).filter(t => t.length > 1))]
      : [];

    let videos = [];

    // Bước 1: Tìm theo keywords array (chính xác nhất)
    if (terms.length > 0) {
      const keywordOrConds = terms.map(term => ({
        keywords: { $elemMatch: { $regex: term, $options: 'i' } }
      }));
      videos = await col.find({ $or: keywordOrConds }).limit(limit).toArray();
    }

    // Bước 2: Bổ sung bằng title search nếu chưa đủ
    if (videos.length < limit && terms.length > 0) {
      const existingIds = new Set(videos.map(v => String(v._id)));
      const titleOrConds = terms.map(term => ({
        title: { $regex: term, $options: 'i' }
      }));
      const byTitle = await col
        .find({ $or: titleOrConds })
        .limit(limit - videos.length + 10)
        .toArray();
      for (const v of byTitle) {
        if (!existingIds.has(String(v._id)) && videos.length < limit) {
          videos.push(v);
          existingIds.add(String(v._id));
        }
      }
    }

    // Bước 3: Bổ sung bằng playlist phù hợp với danh mục sản phẩm
    if (videos.length < limit && mappedPlaylists.length > 0) {
      const existingIds = new Set(videos.map(v => String(v._id)));
      const byPlaylist = await col.aggregate([
        { $match: { 'classification.playlist': { $in: mappedPlaylists } } },
        { $sample: { size: limit - videos.length + 5 } }
      ]).toArray();
      for (const v of byPlaylist) {
        if (!existingIds.has(String(v._id)) && videos.length < limit) {
          videos.push(v);
          existingIds.add(String(v._id));
        }
      }
    }

    // Bước 4: Fallback ngẫu nhiên nếu vẫn chưa đủ
    if (videos.length < 4) {
      const existingIds = videos.map(v => String(v._id));
      const fallback = await col.aggregate([
        { $match: { _id: { $nin: existingIds } } },
        { $sample: { size: limit } }
      ]).toArray();
      videos = [...videos, ...fallback].slice(0, limit);
    }

    res.json(videos);
  } catch (err) {
    console.error('[GET /api/health-videos] Error:', err);
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
    const { sku, question, full_name } = req.body || {};
    const skuStr = String(sku || '').trim();
    if (!skuStr) {
      return res.status(400).json({ success: false, message: 'Thiếu sku.' });
    }
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung câu hỏi.' });
    }

    const qId = new mongoose.Types.ObjectId().toString();
    const entry = {
      _id: qId,
      id: qId,
      question: String(question).trim(),
      user_id: null,
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
    const existing = await col.findOne({ sku: skuStr });
    if (!existing) {
      await col.insertOne({ sku: skuStr, questions: [entry], createdAt: new Date(), updatedAt: new Date() });
    } else {
      await col.updateOne({ sku: skuStr }, { $push: { questions: entry }, $set: { updatedAt: new Date() } });
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

    // Không có dữ liệu disease_groups: tự suy ra nhóm bệnh từ trường categories của collection benh
    const groupsMap = new Map();
    const cursor = diseasesCol.find(
      { 'categories.fullPathSlug': { $regex: 'benh/nhom-benh/', $options: 'i' } },
      { projection: { categories: 1 } }
    );

    // Duyệt qua tất cả bệnh, gom nhóm theo slug trong fullPathSlug (benh/nhom-benh/{slug})
    // và đếm số lượng bệnh thuộc mỗi nhóm.
    // Structure của một category (trong benh.json):
    // { name: 'Thần kinh - Tinh thần', fullPathSlug: 'benh/nhom-benh/than-kinh-tinh-than' }
    // → slug = 'than-kinh-tinh-than'
    // → name lấy từ category.name
    for await (const doc of cursor) {
      const categories = Array.isArray(doc.categories) ? doc.categories : [];
      for (const c of categories) {
        if (!c || !c.fullPathSlug) continue;
        const full = String(c.fullPathSlug);
        const m = full.toLowerCase().match(/benh\/nhom-benh\/([^/?#]+)/);
        if (!m || !m[1]) continue;
        let slug = m[1];
        // Bỏ đuôi .html nếu có
        slug = slug.replace(/\.html?$/i, '');
        if (!slug) continue;

        const key = slug;
        const displayName =
          (c.name && String(c.name).trim()) || slug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

        if (groupsMap.has(key)) {
          const item = groupsMap.get(key);
          item.count += 1;
          if (!item.name && displayName) item.name = displayName;
        } else {
          groupsMap.set(key, {
            slug: key,
            name: displayName,
            icon: null,
            count: 1,
          });
        }
      }
    }

    // Bổ sung nhóm "bệnh thường gặp" (theo đối tượng) và "bệnh theo mùa" từ categories
    const thuongGapMuaCursor = diseasesCol.find(
      {
        $or: [
          { 'categories.fullPathSlug': { $regex: 'benh/benh-thuong-gap/', $options: 'i' } },
          { 'categories.fullPathSlug': { $regex: 'benh/benh-theo-mua', $options: 'i' } },
        ],
      },
      { projection: { categories: 1 } }
    );
    const THUONG_GAP_NAMES = {
      'benh-nam-gioi': 'Bệnh nam giới',
      'benh-nu-gioi': 'Bệnh nữ giới',
      'benh-nguoi-gia': 'Bệnh người già',
      'benh-tre-em': 'Bệnh trẻ em',
    };
    for await (const doc of thuongGapMuaCursor) {
      const categories = Array.isArray(doc.categories) ? doc.categories : [];
      for (const c of categories) {
        if (!c || !c.fullPathSlug) continue;
        const full = String(c.fullPathSlug).toLowerCase();
        let slug = null;
        let displayName = (c.name && String(c.name).trim()) || '';
        if (full.includes('benh/benh-thuong-gap/')) {
          const m = full.match(/benh\/benh-thuong-gap\/([^/?#]+)/);
          if (m && m[1]) {
            slug = m[1].replace(/\.html?$/i, '').trim();
            if (!displayName && THUONG_GAP_NAMES[slug]) displayName = THUONG_GAP_NAMES[slug];
          }
        } else if (full.includes('benh/benh-theo-mua')) {
          slug = 'benh-theo-mua';
          if (!displayName) displayName = 'Bệnh theo mùa';
        }
        if (!slug) continue;
        const key = slug;
        if (!displayName) displayName = slug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
        if (groupsMap.has(key)) {
          const item = groupsMap.get(key);
          item.count += 1;
          if (!item.name && displayName) item.name = displayName;
        } else {
          groupsMap.set(key, { slug: key, name: displayName, icon: null, count: 1 });
        }
      }
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'vi')
    );

    res.json(groups);
  } catch (err) {
    console.error('[GET /api/disease-groups] Error:', err);
    res.json([]);
  }
});

// Mapping từ slug nhóm bệnh (nhom-benh) -> tên bộ phận trên body map
// Mapping này dựa trên quy tắc y khoa + file README, KHÔNG dùng data/benh.json lúc runtime.
// Mapping trực tiếp từ tên bộ phận trên body map -> các slug nhóm bệnh liên quan
// Cấu trúc này giúp 1 nhóm có thể nằm ở nhiều bộ phận và loại bỏ các bệnh toàn thân khỏi body map (vd: Ung thư -> Đầu)
const BODY_PART_TO_GROUPS = {
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

function getGroupSlugsForBodyPart(bodyPartLabel) {
  return BODY_PART_TO_GROUPS[bodyPartLabel] || [];
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
      const groupSlugs = getGroupSlugsForBodyPart(bodyPart);
      if (groupSlugs.length > 0) {
        filter.$or = [
          // Nếu sau này DB có trường bodyPart thì vẫn tận dụng
          { bodyPart },
          // Hoặc thuộc một trong các nhóm bệnh đã map cho bộ phận này
          ...groupSlugs.map((slug) => ({
            'categories.fullPathSlug': { $regex: `benh/nhom-benh/${slug}`, $options: 'i' },
          })),
        ];
      } else {
        // Fallback an toàn: chỉ dùng field bodyPart nếu có
        filter.bodyPart = bodyPart;
      }
    }
    if (groupSlug) {
      const slugLower = groupSlug.toLowerCase();
      const thuongGapSlugs = ['benh-nam-gioi', 'benh-nu-gioi', 'benh-nguoi-gia', 'benh-tre-em'];
      if (thuongGapSlugs.includes(slugLower)) {
        filter['categories.fullPathSlug'] = { $regex: `benh/benh-thuong-gap/${slugLower}`, $options: 'i' };
      } else if (slugLower === 'benh-theo-mua') {
        filter['categories.fullPathSlug'] = { $regex: 'benh/benh-theo-mua', $options: 'i' };
      } else {
        filter['categories.fullPathSlug'] = { $regex: `benh/nhom-benh/${groupSlug}`, $options: 'i' };
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

// POST /api/auth/login - Đăng nhập: kiểm tra SĐT + mật khẩu với MongoDB collection "users" (dữ liệu từ userd.json/users.json)
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
    filter.$or = words.slice(0, 5).map((w) => ({ name: { $regex: w, $options: 'i' } }));
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
        console.log(`✅ Index slug cho collection ${name}`);
      } catch (e) {
        if (!e.message?.includes('already exists')) console.warn(`Index ${name}.slug:`, e.message);
      }
    }
  } catch (e) {
    console.warn('ensureBlogSlugIndex:', e.message);
  }
}

const start = async () => {
  await connectDB();
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
  app.listen(PORT, () => {
    console.log(`🚀 VitaCare API: http://localhost:${PORT}`);
  });
};

start().catch((err) => {
  console.error('Start failed:', err);
  process.exit(1);
});
