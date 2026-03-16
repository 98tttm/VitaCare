/**
 * disease-icon.ts
 * Tập trung tất cả đường dẫn icon của trang tra cứu bệnh.
 * Chỉnh sửa file này để thay đổi icon — không cần vào disease.ts.
 *
 * Tất cả icon nằm trong: my-user/src/assets/icon/disease/
 */

const BASE = 'assets/icon/disease';

// ==================== ICON BỘ PHẬN CƠ THỂ ====================
export const BODY_PART_ICONS: { name: string; slug: string; icon: string }[] = [
    { name: 'Đầu', slug: 'dau', icon: `${BASE}/dau.png` },
    { name: 'Cổ', slug: 'co', icon: `${BASE}/co.png` },
    { name: 'Ngực', slug: 'nguc', icon: `${BASE}/nguc.png` },
    { name: 'Bụng', slug: 'bung', icon: `${BASE}/bung.png` },
    { name: 'Sinh dục', slug: 'sinh-duc', icon: `${BASE}/sinhduc.png` },
    { name: 'Tứ chi', slug: 'tu-chi', icon: `${BASE}/tuchi.png` },
    { name: 'Da', slug: 'da', icon: `${BASE}/da.png` },
];

// ==================== ICON NHÓM BỆNH ====================
// Key = slug từ backend (benh/nhom-benh/{slug})
// Value = tên file ảnh trong assets/icon/disease/
export const GROUP_ICON_MAP: Record<string, string> = {
    'co-xuong-khop': `${BASE}/coxuongkhop.png`,
    'tieu-hoa': `${BASE}/tieuhoa.png`,
    'than-kinh-tinh-than': `${BASE}/thankinhtinhthan.png`,
    'truyen-nhiem': `${BASE}/truyennhiem.png`,
    'ung-thu': `${BASE}/ungthu.png`,
    'suc-khoe-sinh-san': `${BASE}/suckhoesinhsan.png`,
    'tim-mach': `${BASE}/timmach.png`,
    'da-toc-mong': `${BASE}/datocmong.png`,
    'tai-mui-hong': `${BASE}/taimuihong.png`,
    'mat': `${BASE}/mat.png`,
    'than-tiet-nieu': `${BASE}/thantietnieu.png`,
    'ho-hap': `${BASE}/hohap.png`,
    'di-ung': `${BASE}/diung.png`,
    'rang-ham-mat': `${BASE}/ranghammat.png`,
    'suc-khoe-gioi-tinh': `${BASE}/suckhoegioitinh.png`,
    'tam-than': `${BASE}/tamthan.png`,
    'mau': `${BASE}/mau.png`,
    'noi-tiet-chuyen-hoa': `${BASE}/noitiet.png`,
};

// ==================== BANNER NHÓM BỆNH (GROUP PAGE) ====================
export const GROUP_BANNER_MAP: Record<string, string> = {
    'co-xuong-khop': `${BASE}/groupcoxuongkhop.png`,
    'da-toc-mong': `${BASE}/groupdatocmong.png`,
    'di-ung': `${BASE}/groupdiung.png`,
    'ho-hap': `${BASE}/grouphohap.png`,
    'mat': `${BASE}/groupmat.png`,
    'mau': `${BASE}/groupmau.png`,
    'noi-tiet-chuyen-hoa': `${BASE}/groupnoitietchuyenhoa.png`,
    'rang-ham-mat': `${BASE}/groupranghammat.png`,
    'suc-khoe-gioi-tinh': `${BASE}/groupsuckhoegioitinh.png`,
    'suc-khoe-sinh-san': `${BASE}/groupsuckhoesinhsan.png`,
    'tai-mui-hong': `${BASE}/grouptaimuihong.png`,
    'tam-than': `${BASE}/grouptamthan.png`,
    'than-kinh-tinh-than': `${BASE}/groupthamkinhtinhthan.png`,
    'than-tiet-nieu': `${BASE}/groupthantietnieu.png`,
    'tieu-hoa': `${BASE}/grouptieuhoa.png`,
    'tim-mach': `${BASE}/grouptimmach.png`,
    'truyen-nhiem': `${BASE}/grouptruyennhiem.png`,
    'ung-thu': `${BASE}/groupungthu.png`,
    // Bìa cho danh sách Bệnh theo đối tượng (map sang banner nhóm chuyên khoa gần nhất)
    'benh-nam-gioi': `${BASE}/groupsuckhoegioitinh.png`,
    'benh-nu-gioi': `${BASE}/groupsuckhoesinhsan.png`,
    'benh-nguoi-gia': `${BASE}/groupnoitietchuyenhoa.png`,
    'benh-tre-em': `${BASE}/grouphohap.png`,
}

// Ảnh fallback khi không tìm thấy icon nhóm bệnh
export const GROUP_ICON_DEFAULT = `${BASE}/nhom-default.png`;

// ==================== ICON KHÁC ====================
export const BODY_IMAGE = 'assets/icon/body.png';        // Ảnh cơ thể người (cột trái)
export const ICON_NOT_FOUND = 'assets/icon/vincat-notfound.png';
export const ICON_FALLBACK = 'assets/icon/medical_16660084.png';
