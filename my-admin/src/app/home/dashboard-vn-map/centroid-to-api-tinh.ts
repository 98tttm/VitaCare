/**
 * Map tên tỉnh trên centroid (Highcharts) → giá trị `dia_chi.tinh_thanh` trong DB cửa hàng.
 */
const CENTROID_TO_API: Record<string, string> = {
  'Ha Noi': 'Hà Nội',
  'Hồ Chí Minh city': 'Hồ Chí Minh',
  'Hung Yen': 'Hưng Yên',
  'Da Nang': 'Đà Nẵng',
  'Can Tho': 'Cần Thơ',
  Haiphong: 'Hải Phòng',
  'Ha Tinh': 'Hà Tĩnh',
  'Son La': 'Sơn La',
  'Lai Chau': 'Lai Châu',
  'Dak Lak': 'Đắk Lắk',
  'Đăk Nông': 'Đắk Nông',
  'Bà Rịa-Vũng Tàu': 'Bà Rịa - Vũng Tàu',
  'Bắc Liêu': 'Bạc Liêu',
  'Hau Giang': 'Hậu Giang',
  'Gia Lai': 'Gia Lai'
};

/** Thử lần lượt nếu không có kết quả (Huế / Thừa Thiên Huế, Nha Trang / Khánh Hòa, …) */
const TRY_ALTERNATES: Record<string, string[]> = {
  Huế: ['Huế', 'Thừa Thiên Huế'],
  'Thừa Thiên Huế': ['Thừa Thiên Huế', 'Huế'],
  'Khánh Hòa': ['Khánh Hòa', 'Nha Trang'],
  'Nha Trang': ['Nha Trang', 'Khánh Hòa'],
  Vinh: ['Vinh', 'Nghệ An'],
  'Nghệ An': ['Nghệ An', 'Vinh'],
  'Vũng Tàu': ['Vũng Tàu', 'Bà Rịa - Vũng Tàu'],
  'Biên Hòa': ['Biên Hòa', 'Đồng Nai'],
  'Đồng Nai': ['Đồng Nai', 'Biên Hòa'],
  'Hà Tĩnh': ['Hà Tĩnh', 'Ha Tinh'],
  'Ha Tinh': ['Hà Tĩnh', 'Ha Tinh'],
  'Bà Rịa - Vũng Tàu': ['Bà Rịa - Vũng Tàu', 'Vũng Tàu'],
  'Bà Rịa-Vũng Tàu': ['Bà Rịa - Vũng Tàu', 'Vũng Tàu'],
  'Hồ Chí Minh': [
    'Hồ Chí Minh',
    'TP Hồ Chí Minh',
    'TP. Hồ Chí Minh',
    'TP HCM',
    'TP.HCM',
    'Thành phố Hồ Chí Minh',
    'HCM'
  ],
  'TP.HCM': ['TP.HCM', 'TP HCM', 'HCM', 'Hồ Chí Minh', 'TP Hồ Chí Minh'],
  'TP HCM': ['TP HCM', 'TP.HCM', 'HCM', 'Hồ Chí Minh', 'TP Hồ Chí Minh'],
  HCM: ['HCM', 'TP.HCM', 'TP HCM', 'Hồ Chí Minh']
};

export function primaryApiTinhFromCentroid(centroidName: string): string {
  return CENTROID_TO_API[centroidName] ?? centroidName;
}

export function apiTinhQueryVariants(centroidName: string): string[] {
  const primary = primaryApiTinhFromCentroid(centroidName);
  const extra = TRY_ALTERNATES[primary] || TRY_ALTERNATES[centroidName];
  if (extra?.length) {
    const set = new Set<string>(extra);
    set.add(primary);
    return [...set];
  }
  return [primary];
}

/** Chuẩn hóa để khớp tên tỉnh linh hoạt (dấu, viết tắt, ký tự đặc biệt). */
function normalizeProvinceName(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(tp|tp\.|thanh pho|tinh|city|province)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Alias phục vụ khớp mềm khi tên địa giới mới/cũ khác nhau giữa map và DB.
 * Key là tên chuẩn hóa.
 */
const SOFT_EQUIVALENTS: Record<string, string[]> = {
  'thua thien hue': ['hue'],
  hue: ['thua thien hue'],
  'khanh hoa': ['nha trang'],
  'nha trang': ['khanh hoa'],
  'nghe an': ['vinh'],
  vinh: ['nghe an'],
  'dong nai': ['bien hoa'],
  'bien hoa': ['dong nai'],
  'ba ria vung tau': ['vung tau'],
  'vung tau': ['ba ria vung tau'],
  'ho chi minh': ['tp hcm', 'tphcm', 'hcm'],
  tphcm: ['ho chi minh', 'hcm'],
  hcm: ['ho chi minh', 'tphcm']
};

/**
 * Trả về tất cả alias phục vụ lọc mềm phía frontend (khi query API cứng không khớp DB).
 */
export function provinceSoftAliasesFromCentroid(centroidName: string): string[] {
  const base = apiTinhQueryVariants(centroidName);
  const out = new Set<string>(base);

  for (const raw of base) {
    const n = normalizeProvinceName(raw);
    const extra = SOFT_EQUIVALENTS[n] || [];
    for (const e of extra) out.add(e);
  }

  return [...out];
}
