/**
 * Ánh xạ icon danh mục (assets/icon/{nhóm L1}/{file}.png) cho mega-menu Quản lý sản phẩm.
 * Khóa tra cứu: `${thưMụcL1}/${compactSlug(tênDanhMục)}` — compactSlug giống cách ghép tên file (bỏ dấu, ký tự đặc biệt).
 */

/** Tên danh mục cấp 1 (hiển thị từ API) → thư mục con trong assets/icon */
export const PRODUCT_L1_FOLDER_BY_NORMALIZED_NAME: Record<string, string> = {
  chamsoccanhan: 'chamsoccanhan',
  duocmypham: 'duocmypham',
  thietbiyte: 'thietbiyte',
  thuoc: 'thuoc',
  thucphamchucnang: 'thucphamchucnang',
};

export function normalizeL1NameKey(name: string): string {
  return compactAsciiSlug(name);
}

export function compactAsciiSlug(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Gợi ý thư mục L1 từ tên hiển thị (VD: "Dược mỹ phẩm" → duocmypham) */
export function resolveL1IconFolder(l1DisplayName: string | undefined | null): string | null {
  if (!l1DisplayName?.trim()) return null;
  const key = normalizeL1NameKey(l1DisplayName);
  return PRODUCT_L1_FOLDER_BY_NORMALIZED_NAME[key] ?? null;
}

function encodeIconAssetPath(folder: string, file: string): string {
  const seg = encodeURIComponent(file);
  return `assets/icon/${folder}/${seg}`;
}

/** Danh sách [thưMụcL1, tênFile.png] — đồng bộ với my-admin/src/assets/icon */
const CATEGORY_ICON_FILES: ReadonlyArray<readonly [string, string]> = [
  ['chamsoccanhan', 'chamsocrangmieng.png'],
  ['chamsoccanhan', 'dodunggiadinh.png'],
  ['chamsoccanhan', 'hangtonghop.png'],
  ['chamsoccanhan', 'hotrotinhduc.png'],
  ['chamsoccanhan', 'thietbilamdep.png'],
  ['chamsoccanhan', 'thucphamdouong.png'],
  ['chamsoccanhan', 'tinhdaucacloai.png'],
  ['chamsoccanhan', 'vesinhcanha.png'],
  ['duocmypham', 'chamsoctocdadau.png'],
  ['duocmypham', 'chamsocdamat.png'],
  ['duocmypham', 'chamsocdavungmat.png'],
  ['duocmypham', 'chamsoccothe.png'],
  ['duocmypham', 'giaiphaplanda.png'],
  ['duocmypham', 'myphamtrangdiem.png'],
  ['duocmypham', 'sanphamtuthiennhien.png'],
  ['thietbiyte', 'dungcusocuu.png'],
  ['thietbiyte', 'dungcutheodoi.png'],
  ['thietbiyte', 'dungcuyte.png'],
  ['thietbiyte', 'khautrang.png'],
  ['thuoc', 'coxuongkhop.png'],
  ['thuoc', 'hehohap.png'],
  ['thuoc', 'hethankinhtrunguong.png'],
  ['thuoc', 'hetieuhoa-ganmat.png'],
  ['thuoc', 'hetietnieusinhduc.png'],
  ['thuoc', 'mat.png'],
  ['thuoc', 'miengdancaoxoa.png'],
  ['thuoc', 'thuocbovavitamin.png'],
  ['thuoc', 'thuocchongungthu.png'],
  ['thuoc', 'thuockhangsinh_khangnam.png'],
  ['thuoc', 'thuocdalieu.png'],
  ['thuoc', 'thuocdiung.png'],
  ['thuoc', 'thuocgiaidoc_khudoc_hotrocainghien.png'],
  ['thuoc', 'thuocgiamdau_hasot_khangviem.png'],
  ['thuoc', 'thuochohap.png'],
  ['thuoc', 'thuochethankinh.png'],
  ['thuoc', 'thuocmat_tai_muihong.png'],
  ['thuoc', 'thuocteboi.png'],
  ['thuoc', 'thuoctiemchichvadichtruyen.png'],
  ['thuoc', 'thuoctimmachmau.png'],
  ['thuoc', 'thuoctietnieuvasinhduc.png'],
  ['thuoc', 'thuoctieuhoaganmat.png'],
  ['thuoc', 'thuoctritieuduong.png'],
  ['thuoc', 'thuocungthu.png'],
  ['thucphamchucnang', 'dekhang.png'],
  ['thucphamchucnang', 'dinhduong.png'],
  ['thucphamchucnang', 'hotrodieutri.png'],
  ['thucphamchucnang', 'lamdep.png'],
  ['thucphamchucnang', 'sinhly.png'],
  ['thucphamchucnang', 'thankinhnao.png'],
  ['thucphamchucnang', 'tieuhoa.png'],
  ['thucphamchucnang', 'timmach.png'],
  ['thucphamchucnang', 'vtm&khoangchat.png'],
];

/**
 * Khóa `${folder}/${compactSlug(fileBase)}` → đường dẫn dùng cho [src] (đã encode tên file nếu cần).
 */
export const PRODUCT_CATEGORY_ICON_BY_KEY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [folder, file] of CATEGORY_ICON_FILES) {
    const base = file.replace(/\.png$/i, '');
    const key = `${folder}/${compactAsciiSlug(base)}`;
    out[key] = encodeIconAssetPath(folder, file);
  }
  return out;
})();

/**
 * Bổ sung khi tên trên API slug ra khác khóa suy ra từ tên file.
 * Khóa / giá trị: `${folder}/${compactSlug}` như trong PRODUCT_CATEGORY_ICON_BY_KEY
 */
export const PRODUCT_CATEGORY_ICON_ALIASES: Record<string, string> = {
  'thucphamchucnang/vitaminkhoangchat': 'thucphamchucnang/vtmkhoangchat',
  /** Cấp 3 "Chăm sóc răng" — cùng nhóm với răng miệng */
  'chamsoccanhan/chamsocrang': 'chamsoccanhan/chamsocrangmieng',
};

/**
 * Trả về URL icon cho danh mục (L2/L3) trong nhánh L1 hiện tại, hoặc null nếu không có file.
 */
export function getProductCategoryIconSrc(
  l1DisplayName: string | undefined | null,
  categoryDisplayName: string | undefined | null
): string | null {
  const folder = resolveL1IconFolder(l1DisplayName);
  if (!folder || !categoryDisplayName?.trim()) return null;

  const slug = compactAsciiSlug(categoryDisplayName);
  if (!slug) return null;

  let key = `${folder}/${slug}`;
  key = PRODUCT_CATEGORY_ICON_ALIASES[key] ?? key;

  return PRODUCT_CATEGORY_ICON_BY_KEY[key] ?? null;
}
