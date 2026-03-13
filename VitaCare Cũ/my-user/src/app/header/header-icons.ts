/**
 * Local Icon Mapping for Mega Menu (Long Chau Style)
 * This file allows you to map category names to local asset paths.
 */

export const CATEGORY_ICONS: { [key: string]: string } = {
    // --- LEVEL 2 CATEGORIES (Sidebar) ---
    //1. Thực phẩm chức năng
    'Vitamin & Khoáng chất': 'assets/icon/thucphamchucnang/vtm&khoangchat.png',
    'Sinh lý - Nội tiết tố': 'assets/icon/thucphamchucnang/sinhly.png',
    'Tăng cường chức năng': 'assets/icon/thucphamchucnang/dekhang.png',
    'Hỗ trợ điều trị': 'assets/icon/thucphamchucnang/hotrodieutri.png',
    'Hỗ trợ tiêu hóa': 'assets/icon/thucphamchucnang/tieuhoa.png',
    'Thần kinh não': 'assets/icon/thucphamchucnang/thankinhnao.png',
    'Hỗ trợ làm đẹp': 'assets/icon/thucphamchucnang/lamdep.png',
    'Sức khoẻ tim mạch': 'assets/icon/thucphamchucnang/timmach.png',
    'Dinh dưỡng': 'assets/icon/thucphamchucnang/dinhduong.png',

    //2. Dược mỹ phẩm
    'Chăm sóc cơ thể': 'assets/icon/duocmypham/chamsoccothe.png',
    'Chăm sóc da mặt': 'assets/icon/duocmypham/chamsocdamat.png',
    'Chăm sóc da vùng mắt': 'assets/icon/duocmypham/chamsocdavungmat.png',
    'Chăm sóc tóc - da đầu': 'assets/icon/duocmypham/chamsoctocdadau.png',
    'Giải pháp làn da': 'assets/icon/duocmypham/giaiphaplanda.png',
    'Mỹ phẩm trang điểm': 'assets/icon/duocmypham/myphamtrangdiem.png',
    'Sản phẩm từ thiên nhiên': 'assets/icon/duocmypham/sanphamtuthiennhien.png',

    //3. Thuốc
    'Cơ - xương - khớp': 'assets/icon/thuoc/coxuongkhop.png',
    'Hệ hô hấp': 'assets/icon/thuoc/hehohap.png',
    'Hệ thần kinh trung ương': 'assets/icon/thuoc/hethankinhtrunguong.png',
    'Hệ tiết niệu-sinh dục': 'assets/icon/thuoc/hetietnieusinhduc.png',
    'Hệ tiêu hóa & gan mật': 'assets/icon/thuoc/hetieuhoa-ganmat.png',
    'Mắt': 'assets/icon/thuoc/mat.png',
    'Miếng dán, cao xoa, dầu': 'assets/icon/thuoc/miengdancaoxoa.png',
    'Thuốc bổ & vitamin': 'assets/icon/thuoc/thuocbovavitamin.png',
    'Thuốc chống ung thư': 'assets/icon/thuoc/thuocchongungthu.png',
    'Thuốc da liễu': 'assets/icon/thuoc/thuocdalieu.png',
    'Thuốc dị ứng': 'assets/icon/thuoc/thuocdiung.png',
    'Thuốc ung thư': 'assets/icon/thuoc/thuocungthu.png',
    'Thuốc giải độc, khử độc và hỗ trợ cai nghiện': 'assets/icon/thuoc/thuocgiaidoc_khudoc_hotrocainghien.png',
    'Thuốc giảm đau, hạ sốt, kháng viêm': 'assets/icon/thuoc/thuocgiamdau_hasot_khangviem.png',
    'Thuốc hô hấp': 'assets/icon/thuoc/thuochohap.png',
    'Thuốc kháng sinh, kháng nấm': 'assets/icon/thuoc/thuockhangsinh_khangnam.png',
    'Thuốc Mắt, Tai, Mũi, Họng': 'assets/icon/thuoc/thuocmat_tai_muihong.png',
    'Thuốc tê bôi': 'assets/icon/thuoc/thuocteboi.png',
    'Thuốc hệ thần kinh': 'assets/icon/thuoc/thuochethankinh.png',
    'Thuốc tiêm chích & dịch truyền': 'assets/icon/thuoc/thuoctiemchichvadichtruyen.png',
    'Thuốc tiết niệu - sinh dục': 'assets/icon/thuoc/thuoctietnieuvasinhduc.png',
    'Thuốc tiêu hoá & gan mật': 'assets/icon/thuoc/thuoctieuhoaganmat.png',
    'Thuốc tim mạch & máu': 'assets/icon/thuoc/thuoctimmachmau.png',
    'Thuốc trị tiểu đường': 'assets/icon/thuoc/thuoctritieuduong.png',

    //4. Chăm sóc cá nhân
    'Chăm sóc răng miệng': 'assets/icon/chamsoccanhan/chamsocrangmieng.png',
    'Đồ dùng gia đình': 'assets/icon/chamsoccanhan/dodunggiadinh.png',
    'Hàng tổng hợp': 'assets/icon/chamsoccanhan/hangtonghop.png',
    'Hỗ trợ tình dục': 'assets/icon/chamsoccanhan/hotrotinhduc.png',
    'Thiết bị làm đẹp': 'assets/icon/chamsoccanhan/thietbilamdep.png',
    'Thực phẩm - Đồ uống': 'assets/icon/chamsoccanhan/thucphamdouong.png',
    'Tinh dầu các loại': 'assets/icon/chamsoccanhan/tinhdaucacloai.png',
    'Vệ sinh cá nhân': 'assets/icon/chamsoccanhan/vesinhcanhan.png',

    //5. Thiết bị y tế
    'Dụng cụ sơ cứu': 'assets/icon/thietbiyte/dungcusocuu.png',
    'Dụng cụ theo dõi': 'assets/icon/thietbiyte/dungcutheodoi.png',
    'Dụng cụ y tế': 'assets/icon/thietbiyte/dungcuyte.png',
    'Khẩu trang': 'assets/icon/thietbiyte/khautrang.png'

};

/**
 * Returns the local icon path if defined, otherwise returns the default icon.
 */
export function getLocalIcon(name: string, defaultIcon: string = '/assets/images/placeholder.png'): string {
    if (CATEGORY_ICONS[name]) {
        return CATEGORY_ICONS[name];
    }
    return defaultIcon || '/assets/images/placeholder.png';
}
