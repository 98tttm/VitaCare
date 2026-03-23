/**
 * VitaBot: ngữ cảnh MongoDB + gọi Replicate (LLM) hoặc dùng build nội dung cho Gemini.
 *
 * Biến môi trường:
 *   REPLICATE_API_TOKEN=r8_...
 *   REPLICATE_MODEL=qwen/qwen3-235b-a22b-instruct-2507   (owner/model trên Replicate)
 *   FRONTEND_URL=https://...   (URL gốc website my-user — dùng cho link đầy đủ trong prompt)
 *   VITABOT_EXTRA_CONTEXT=...   (tuỳ chọn: vài dòng trong .env)
 *   VITABOT_CONTEXT_FILE=/đường/dẫn/file.md   (tuỳ chọn: file Markdown dài — chính sách tóm tắt, FAQ; mặc định backend/data/vitabot-knowledge.md)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function escapeRegExp(string) {
  if (!string) return '';
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function truncate(s, max) {
  if (!s || typeof s !== 'string') return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n...[đã rút gọn]`;
}

/**
 * Chuẩn hóa link Markdown trong câu trả lời: policy/blog/cửa hàng → URL tuyệt đối (copy/mở ngoài SPA).
 * Giữ nguyên /product/... để frontend vẫn parse thẻ sản phẩm.
 */
function absolutizeVitabotLinks(reply, baseUrl) {
  const b = String(baseUrl || '').replace(/\/$/, '');
  if (!b || typeof reply !== 'string') return reply;
  return reply.replace(/\]\((\/[^)\s]+)\)/g, (match, path) => {
    if (path.startsWith('//')) return match;
    if (/^\/product(\/|$)/i.test(path)) return match;
    return `](${b}${path})`;
  });
}

/** @param {string} [frontendBaseUrl] — FRONTEND_URL (không dấu / cuối); dùng cho quy tắc link đầy đủ */
function getVitabotSystemPrompt(frontendBaseUrl) {
  const extra = (process.env.VITABOT_EXTRA_CONTEXT || '').trim();
  const site = String(frontendBaseUrl || process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
  const base = `Bạn là VitaBot của VitaCare — trợ lý chăm sóc khách hàng 24/7 trên website nhà thuốc / chăm sóc sức khỏe.

Nhiệm vụ chung:
- Thông tin cửa hàng, địa chỉ, chi nhánh: chỉ dựa trên danh sách cửa hàng trong ngữ cảnh. Nếu không có, nói rõ và gợi ý URL đầy đủ tới hệ thống cửa hàng: ${site}/store-system (hoặc trích đúng dòng trong khối [Các trang chính & chính sách VitaCare]).
- Chính sách / điều khoản / blog: chỉ dùng tóm tắt trong ngữ cảnh. Không bịa điều khoản chi tiết. Khi đưa link cho khách, LUÔN dùng URL đầy đủ dạng Markdown: [mô tả](${site}/policy/...) hoặc [mô tả](${site}/blog/...) — tuyệt đối KHÔNG viết [mô tả](/policy/...) hay [mô tả](/blog/...) (đường dẫn tương đối khó mở khi copy từ chat).
- Sức khỏe: thông tin tham khảo, không chẩn đoán, không kê đơn; nhắc đến cơ sở y tế khi triệu chứng nặng, kéo dài, trẻ nhỏ, có sốt/mất nước/máu phân.

Tư vấn triệu chứng & sản phẩm (quan trọng):
- Không vội gợi ý sản phẩm sau một câu mô tả chung (vd chỉ nói "tiêu chảy", "đau bụng"). Hãy hỏi thêm 1–3 ý ngắn: đối tượng (trẻ em/người lớn), thời gian, mức độ, kèm sốt/nôn/máu phân/bỏ ăn, đang uống thuốc gì.
- Chỉ liệt kê sản phẩm khi (1) người dùng yêu cầu rõ kiểu mua/gợi ý sản phẩm/thuốc loại nào, HOẶC (2) bạn đã hỏi xong và họ trả lời đủ để gợi ý an toàn hơn, HOẶC (3) hệ thống đã bật danh sách sản phẩm trong ngữ cảnh và bạn được phép gợi ý (xem mục [Phiên hiện tại] bên dưới nếu có).
- Khi được phép gợi ý sản phẩm: CHỈ dùng sản phẩm có trong danh sách [Danh sách sản phẩm từ kho VitaCare] được gửi kèm. Mỗi sản phẩm viết 1–2 dòng:
  - Dòng 1: **Tên sản phẩm** — một câu mô tả ngắn (hỗ trợ gì, không hứa chữa khỏi).
  - Dòng 2: CHỈ với sản phẩm, giữ đúng định dạng tương đối [Xem chi tiết](/product/<slug>) (slug CHÍNH XÁC từ danh sách) để website hiển thị thẻ sản phẩm — không đổi thành URL tuyệt đối cho /product/.
- Không dùng bullet dài lặp lại; có thể thêm đoạn "Lưu ý" ngắn về khi cần đi khám.

Định dạng: tiếng Việt, thân thiện, có thể dùng **in đậm** cho tên sản phẩm, xuống dòng rõ ràng.`;

  if (extra) {
    return `${base}\n\n[Bổ sung từ cửa hàng / chính sách do admin cấu hình]\n${extra}`;
  }
  return base;
}

/** Khách nói rõ muốn xem hàng / gợi ý mua */
function userExplicitlyWantsProductCatalog(userMessage) {
  const t = String(userMessage || '').toLowerCase();
  return /gợi ý|đề xuất|mua|bán|sản phẩm|thuốc gì|loại nào|hàng nào|danh sách|giá bao nhiêu|sp nào|men vi sinh|TPCN/i.test(t);
}

/**
 * Hậu tố inject theo từng lượt: có/không catalogue, có được liệt kê SP hay chưa.
 */
function getTriageInstructionSuffix({ historyLength, catalogIncluded, explicitProductRequest }) {
  if (!catalogIncluded) {
    return `\n\n[Phiên hiện tại — CHƯA có danh sách sản phẩm trong ngữ cảnh]
Bạn KHÔNG được liệt kê tên sản phẩm cụ thể hay bất kỳ link /product/... nào (vì không có dữ liệu để đối chiếu). Chỉ hỏi thêm, tư vấn sinh hoạt, khi nào cần khám, và gợi ý khách nói rõ nếu muốn gợi ý sản phẩm tại VitaCare.`;
  }
  if (!explicitProductRequest && historyLength < 4) {
    return `\n\n[Phiên hiện tại — có danh sách sản phẩm nhưng ưu tiên hỏi thêm]
Hội thoại còn ít lượt. Nếu người dùng chỉ mô tả triệu chứng chung mà chưa nói rõ muốn "mua/gợi ý sản phẩm", đừng liệt kê sản phẩm ngay; hỏi thêm trước (tuổi, thời gian, triệu chứng kèm theo). Chỉ gắn link /product/<slug> khi đã đủ ngữ cảnh hoặc họ yêu cầu gợi ý mua.`;
  }
  return `\n\n[Phiên hiện tại — được phép gợi ý sản phẩm từ danh sách]
Dùng đúng slug trong [Danh sách sản phẩm từ kho VitaCare]. Mỗi SP: **Tên** + mô tả ngắn + dòng [Xem chi tiết](/product/<slug>).`;
}

/**
 * Trích /product/... từ reply, tra DB → thẻ cho frontend (ảnh, tên, giá).
 */
async function enrichProductCardsFromReply(reply, productsCollection) {
  if (!reply || typeof reply !== 'string') return [];
  const re = /\/product\/([^\s\)\]\>\"\'\,\#\?]+)/gi;
  const seen = new Set();
  const rawIds = [];
  let m;
  while ((m = re.exec(reply)) !== null) {
    const id = m[1].trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      rawIds.push(id);
    }
  }
  if (!rawIds.length) return [];
  const col = productsCollection();
  const cards = [];
  for (const raw of rawIds.slice(0, 10)) {
    let p = await col.findOne({ slug: raw });
    if (!p && mongoose.Types.ObjectId.isValid(raw)) {
      try {
        p = await col.findOne({ _id: new mongoose.Types.ObjectId(raw) });
      } catch (_) {
        /* ignore */
      }
    }
    if (!p) {
      p = await col.findOne({ _id: raw });
    }
    if (!p) continue;
    const slugOut = p.slug ? String(p.slug) : String(p._id);
    const img =
      (typeof p.image === 'string' && p.image) ||
      (Array.isArray(p.gallery) && p.gallery[0] ? String(p.gallery[0]) : '') ||
      (typeof p.imageUrl === 'string' && p.imageUrl) ||
      '';
    const priceNum = p.price != null ? Number(p.price) : NaN;
    cards.push({
      slug: slugOut,
      name: String(p.name || 'Sản phẩm'),
      price: Number.isFinite(priceNum) ? priceNum : null,
      image: img,
    });
  }
  return cards;
}

/** Danh sách sản phẩm (giữ tương thích logic cũ trong server.js) */
async function getProductContextForChat(
  { productsCollection, categoriesCollection },
  userMessage,
  maxProducts = 25
) {
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
  const block = `[Danh sách sản phẩm từ kho VitaCare (tên | giá | link | danh mục)]:\n${lines.join('\n')}`;
  return truncate(block, 12000);
}

/** Cửa hàng từ collection storesystem_full */
async function getStoreContextForChat(storeSystemCollection, maxStores = 40) {
  try {
    const col = storeSystemCollection();
    const items = await col
      .find({})
      .limit(maxStores)
      .project({ ten_cua_hang: 1, dia_chi: 1, thong_tin_lien_he: 1, so_dien_thoai: 1 })
      .toArray();
    if (!items.length) return '';
    const lines = items.map((s) => {
      const name = s.ten_cua_hang || 'Cửa hàng';
      let addr = '';
      if (s.dia_chi && typeof s.dia_chi === 'object') {
        addr =
          s.dia_chi.dia_chi_day_du ||
          [s.dia_chi.phuong_xa, s.dia_chi.quan_huyen, s.dia_chi.tinh_thanh].filter(Boolean).join(', ') ||
          '';
      } else {
        addr = typeof s.dia_chi === 'string' ? s.dia_chi : '';
      }
      const phone =
        (s.thong_tin_lien_he && s.thong_tin_lien_he.so_dien_thoai) ||
        s.so_dien_thoai ||
        (Array.isArray(s.so_dien_thoai) ? s.so_dien_thoai.join(', ') : '');
      return `- ${name} | ${addr || '—'} | ${phone || '—'}`;
    });
    const block = `[Hệ thống cửa hàng VitaCare (tên | địa chỉ | điện thoại)]:\n${lines.join('\n')}`;
    return truncate(block, 8000);
  } catch (e) {
    console.warn('[VitaBot] getStoreContextForChat:', e.message);
    return '';
  }
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Danh sách cửa hàng / chính sách tĩnh trên website (link đầy đủ cho bot). */
function getStaticVitaCarePagesContext(baseUrl) {
  const b = String(baseUrl || '').replace(/\/$/, '') || 'http://localhost:4200';
  return `[Các trang chính & chính sách VitaCare — URL đầy đủ (dùng khi hướng dẫn khách)]
- Trang chủ: ${b}/
- Hệ thống cửa hàng / chi nhánh: ${b}/store-system
- Giới thiệu: ${b}/policy/gioi-thieu
- Giấy phép kinh doanh: ${b}/policy/giay-phep-kinh-doanh
- Quy chế hoạt động: ${b}/policy/quy-che-hoat-dong
- Chính sách đặt cọc: ${b}/policy/chinh-sach-dat-coc
- Chính sách nội dung: ${b}/policy/chinh-sach-noi-dung
- Chính sách đổi trả: ${b}/policy/chinh-sach-doi-tra
- Chính sách giao hàng: ${b}/policy/chinh-sach-giao-hang
- Chính sách bảo mật: ${b}/policy/chinh-sach-bao-mat
- Chính sách thanh toán: ${b}/policy/chinh-sach-thanh-toan
- Chính sách bảo mật dữ liệu: ${b}/policy/chinh-sach-bao-mat-du-lieu
- Điều khoản sử dụng: ${b}/policy/dieu-khoan-su-dung
- Trung tâm bảo hành (thông tin): ${b}/policy/thong-tin-trung-tam-bao-hanh
- Blog sức khỏe: ${b}/blog
- Về chúng tôi: ${b}/about`;
}

/** File Markdown tại backend/data/vitabot-knowledge.md hoặc VITABOT_CONTEXT_FILE — admin tóm tắt chính sách, FAQ. */
function loadVitabotKnowledgeFile() {
  const custom = (process.env.VITABOT_CONTEXT_FILE || '').trim();
  const defaultPath = path.join(__dirname, 'data', 'vitabot-knowledge.md');
  const filePath = custom ? path.resolve(custom) : defaultPath;
  try {
    if (!fs.existsSync(filePath)) return '';
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return '';
    return truncate(
      `[Kiến thức bổ sung do VitaCare cấu hình (file: ${path.basename(filePath)}) — ưu tiên khi trả lời về chính sách / vận hành]\n${raw}`,
      12000
    );
  } catch (e) {
    console.warn('[VitaBot] loadVitabotKnowledgeFile:', e.message);
    return '';
  }
}

async function pickBlogCollectionName(db) {
  if (!db) return null;
  try {
    const nb = await db.collection('blog').countDocuments();
    if (nb > 0) return 'blog';
    const nbs = await db.collection('blogs').countDocuments();
    if (nbs > 0) return 'blogs';
  } catch (e) {
    /* ignore */
  }
  return null;
}

/** Blog: tiêu đề + đường dẫn + đoạn tóm tắt ngắn (excerpt/content). */
async function getBlogExcerptsContext(db, maxItems = 20, excerptMax = 400) {
  try {
    const coll = await pickBlogCollectionName(db);
    if (!coll) return '';
    const items = await db
      .collection(coll)
      .find({})
      .sort({ _id: -1 })
      .limit(maxItems)
      .project({ title: 1, slug: 1, excerpt: 1, content: 1, summary: 1 })
      .toArray();
    if (!items.length) return '';
    const lines = items.map((b) => {
      const title = (b.title || 'Bài viết').trim();
      const slug = String(b.slug || '').trim();
      let ex = '';
      if (typeof b.excerpt === 'string' && b.excerpt.trim()) ex = stripHtml(b.excerpt);
      else if (typeof b.summary === 'string' && b.summary.trim()) ex = stripHtml(b.summary);
      else if (typeof b.content === 'string' && b.content.trim()) ex = stripHtml(b.content);
      ex = ex.replace(/\s+/g, ' ').trim().slice(0, excerptMax);
      const pathPart = slug ? `/blog/${slug}` : '/blog';
      return `- ${title} | ${pathPart}${ex ? ` | Tóm tắt: ${ex}` : ''}`;
    });
    return truncate(
      `[Bài viết blog VitaCare (tiêu đề | đường dẫn tương đối | tóm tắt — chỉ tư vấn, không sao chép dài)]:\n${lines.join('\n')}`,
      8000
    );
  } catch (e) {
    console.warn('[VitaBot] getBlogExcerptsContext:', e.message);
    return '';
  }
}

/**
 * Gói đầy đủ: trang & chính sách cố định + file Markdown + blog có excerpt.
 * Gọi mỗi lượt chat (không phụ thuộc catalogue sản phẩm).
 */
async function getVitaCareKnowledgeContext({ db, baseUrl, maxBlogItems = 20, excerptMax = 400 } = {}) {
  const b = String(baseUrl || process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
  const parts = [
    getStaticVitaCarePagesContext(b),
    loadVitabotKnowledgeFile(),
    db ? await getBlogExcerptsContext(db, maxBlogItems, excerptMax) : '',
  ].filter(Boolean);
  if (!parts.length) return '';
  return truncate(parts.join('\n\n'), 16000);
}

/** @deprecated Dùng getVitaCareKnowledgeContext — giữ tương thích cũ */
async function getBlogTitlesContext(db, maxItems = 25) {
  return getVitaCareKnowledgeContext({
    db,
    baseUrl: (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, ''),
    maxBlogItems: maxItems,
  });
}

function formatHistoryForPrompt(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const lines = [];
  for (const turn of history) {
    const role = turn.role === 'model' ? 'Trợ lý' : 'Người dùng';
    const text = turn.parts?.find((p) => p.text)?.text || turn.text || '';
    if (text) lines.push(`${role}: ${text}`);
  }
  if (!lines.length) return '';
  return `[Hội thoại trước]\n${lines.join('\n')}`;
}

function buildSinglePrompt(systemPrompt, storeContext, blogContext, productContext, history, newMessage) {
  const parts = [
    systemPrompt,
    storeContext,
    blogContext,
    productContext,
    formatHistoryForPrompt(history),
    `[Câu hỏi hiện tại]\nNgười dùng: ${newMessage}`,
  ].filter(Boolean);
  return parts.join('\n\n');
}

function replicateOutputToText(output) {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output.map((x) => replicateOutputToText(x)).join('');
  if (typeof output === 'object' && output != null) {
    if (typeof output.text === 'string') return output.text;
    if (typeof output.join === 'function') return output.join('');
  }
  return String(output);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sau POST, nếu model chậm (> Prefer: wait) Replicate trả status processing — cần poll urls.get.
 */
async function ensurePredictionComplete(initial, token) {
  let p = initial;
  if (!p.urls?.get) {
    return p;
  }
  const deadline = Date.now() + (parseInt(process.env.REPLICATE_POLL_TIMEOUT_MS || '300000', 10) || 300000);
  while (p.status === 'starting' || p.status === 'processing') {
    if (Date.now() > deadline) {
      throw new Error('Replicate: hết thời gian chờ kết quả (model quá chậm hoặc queue). Thử REPLICATE_MODEL nhỏ hơn hoặc tăng REPLICATE_POLL_TIMEOUT_MS.');
    }
    await sleep(2000);
    const r = await fetch(p.urls.get, {
      headers: { Authorization: `Token ${token}` },
    });
    try {
      p = await r.json();
    } catch (e) {
      throw new Error(`Replicate poll: ${e.message}`);
    }
    if (!r.ok) {
      throw new Error(typeof p?.detail === 'string' ? p.detail : `Poll HTTP ${r.status}`);
    }
  }
  if (p.status === 'failed') {
    throw new Error(p.error || 'Replicate prediction failed');
  }
  if (p.status === 'canceled') {
    throw new Error('Replicate prediction canceled');
  }
  return p;
}

/**
 * Gọi Replicate: POST .../models/{owner}/{name}/predictions + Prefer: wait
 */
async function runReplicateChat({
  token,
  model,
  history,
  message,
  productContext,
  storeContext,
  blogContext,
  systemPrompt,
}) {
  const modelStr = (model || 'qwen/qwen3-235b-a22b-instruct-2507').trim();
  const slash = modelStr.indexOf('/');
  if (slash < 0) {
    throw new Error('REPLICATE_MODEL phải có dạng owner/model (ví dụ qwen/qwen3-235b-a22b-instruct-2507).');
  }
  const owner = modelStr.slice(0, slash);
  const name = modelStr.slice(slash + 1);
  const url = `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`;

  let fullPrompt = buildSinglePrompt(systemPrompt, storeContext, blogContext, productContext, history, message);
  const maxPromptChars = parseInt(process.env.REPLICATE_MAX_PROMPT_CHARS || '100000', 10) || 100000;
  if (fullPrompt.length > maxPromptChars) {
    fullPrompt = truncate(fullPrompt, maxPromptChars);
  }

  const maxTokens = Math.min(8192, parseInt(process.env.REPLICATE_MAX_TOKENS || '2048', 10) || 2048);
  const temperature = Math.min(2, Math.max(0, parseFloat(process.env.REPLICATE_TEMPERATURE || '0.7') || 0.7));
  const topP = Math.min(1, Math.max(0, parseFloat(process.env.REPLICATE_TOP_P || '0.8') || 0.8));
  /** Replicate chỉ cho phép Prefer: wait trong khoảng 1–60 giây (xem lỗi "must specify a value between 1 and 60") */
  const waitSec = Math.min(60, Math.max(1, parseInt(process.env.REPLICATE_WAIT_SECONDS || '60', 10) || 60));
  const preferWait = `wait=${waitSec}`;

  const isQwen = /qwen/i.test(modelStr);

  /** Qwen / HF-style thường dùng max_new_tokens + top_p; Llama-style dùng max_tokens */
  const qwenStyleBodies = [
    {
      input: {
        prompt: fullPrompt,
        max_new_tokens: maxTokens,
        temperature,
        top_p: topP,
      },
    },
    {
      input: {
        system_prompt: systemPrompt,
        prompt: buildSinglePrompt('', storeContext, blogContext, productContext, history, message),
        max_new_tokens: maxTokens,
        temperature,
        top_p: topP,
      },
    },
  ];

  const llamaStyleBodies = [
    {
      input: {
        prompt: fullPrompt,
        max_tokens: maxTokens,
        temperature,
      },
    },
    {
      input: {
        system_prompt: systemPrompt,
        prompt: buildSinglePrompt('', storeContext, blogContext, productContext, history, message),
        max_tokens: maxTokens,
        temperature,
      },
    },
  ];

  /** Một số model chỉ nhận prompt (Replicate tự thêm default) */
  const minimalBodies = [{ input: { prompt: fullPrompt } }];

  const tryBodies = isQwen
    ? [...qwenStyleBodies, ...llamaStyleBodies, ...minimalBodies]
    : [...llamaStyleBodies, ...qwenStyleBodies, ...minimalBodies];

  let lastErr = null;
  for (const body of tryBodies) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
        Prefer: preferWait,
      },
      body: JSON.stringify(body),
    });
    let data;
    try {
      data = await res.json();
    } catch (e) {
      lastErr = e;
      continue;
    }
    if (!res.ok) {
      const detail =
        typeof data?.detail === 'string'
          ? data.detail
          : Array.isArray(data?.detail)
            ? data.detail.map((d) => d.msg || d).join('; ')
            : JSON.stringify(data?.detail || data?.error || `HTTP ${res.status}`);
      lastErr = new Error(detail);
      if (res.status === 422) continue;
      throw lastErr;
    }
    try {
      data = await ensurePredictionComplete(data, token);
    } catch (pollErr) {
      lastErr = pollErr;
      continue;
    }
    if (data.status === 'failed') {
      lastErr = new Error(data.error || 'Replicate prediction failed');
      continue;
    }
    const text = replicateOutputToText(data.output).trim();
    if (text) return text;
    lastErr = new Error('Replicate trả về output rỗng');
  }
  if (lastErr) throw lastErr;
  return 'Xin lỗi, tôi chưa tạo được câu trả lời. Bạn thử lại sau.';
}

function buildGeminiContents(history, newMessage, productContext, storeContext, blogContext, systemPrompt) {
  const contents = [];
  const contextBlock = [systemPrompt, storeContext, blogContext, productContext].filter(Boolean).join('\n\n');

  if (history && Array.isArray(history)) {
    for (const turn of history) {
      const role = turn.role === 'model' ? 'model' : 'user';
      const text = turn.parts?.find((p) => p.text)?.text || turn.text || '';
      if (text) contents.push({ role, parts: [{ text }] });
    }
  }
  let userText = newMessage;
  if (contents.length === 0) {
    userText = `${contextBlock ? contextBlock + '\n\n' : ''}[Người dùng]: ${newMessage}`;
  } else if (contextBlock) {
    userText = `[Cập nhật ngữ cảnh VitaCare]\n${contextBlock}\n\n[Người dùng]: ${newMessage}`;
  }
  contents.push({ role: 'user', parts: [{ text: userText }] });
  return contents;
}

module.exports = {
  getVitabotSystemPrompt,
  absolutizeVitabotLinks,
  getTriageInstructionSuffix,
  userExplicitlyWantsProductCatalog,
  getProductContextForChat,
  getStoreContextForChat,
  getBlogTitlesContext,
  getVitaCareKnowledgeContext,
  enrichProductCardsFromReply,
  buildGeminiContents,
  runReplicateChat,
  truncate,
};
