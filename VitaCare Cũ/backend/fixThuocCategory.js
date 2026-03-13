/**
 * Script chuẩn đoán & fix: Gán categoryId thuộc nhánh "Thuốc" cho sản phẩm phù hợp
 * 
 * Cách chạy: node fixThuocCategory.js
 */

const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://localhost:27019/VitaCare';

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Kết nối MongoDB thành công!\n');

    const db = mongoose.connection.db;
    const categoriesCol = db.collection('categories');
    const productsCol = db.collection('products');

    // ==================== BƯỚC 1: CHẨN ĐOÁN ====================
    const totalProducts = await productsCol.countDocuments();
    const totalCategories = await categoriesCol.countDocuments();
    console.log(`📊 Tổng sản phẩm: ${totalProducts} | Tổng danh mục: ${totalCategories}`);

    // Tìm category Thuốc (root)
    const thuocRoot = await categoriesCol.findOne({ name: 'Thuốc' });
    if (!thuocRoot) {
        console.error('❌ Không tìm thấy category "Thuốc" trong DB!');
        process.exit(1);
    }
    console.log(`\n🔍 Root "Thuốc": _id = ${thuocRoot._id}`);

    // Lấy tất cả category con của Thuốc (đệ quy)
    const allCats = await categoriesCol.find({}).toArray();

    function getChildIds(parentId) {
        const pidStr = parentId.toString();
        const results = [parentId]; // ObjectId
        const children = allCats.filter(c => c.parentId && c.parentId.toString() === pidStr);
        for (const child of children) {
            results.push(...getChildIds(child._id));
        }
        return results;
    }

    const thuocIds = getChildIds(thuocRoot._id);
    const thuocIdStrs = thuocIds.map(id => id.toString());
    console.log(`📂 Tổng số category thuộc nhánh "Thuốc": ${thuocIds.length}`);

    // Đếm sản phẩm hiện tại thuộc Thuốc
    const thuocProducts = await productsCol.countDocuments({ categoryId: { $in: thuocIds } });
    console.log(`💊 Sản phẩm hiện tại có categoryId thuộc Thuốc: ${thuocProducts}`);

    if (thuocProducts > 0) {
        console.log('\n✅ Đã có sản phẩm trong nhánh Thuốc! Không cần fix data.');
        console.log('Vấn đề có thể nằm ở routing hoặc query params.\n');

        // Show sample products
        const samples = await productsCol.find({ categoryId: { $in: thuocIds } }).limit(5).toArray();
        console.log('Mẫu sản phẩm thuộc Thuốc:');
        samples.forEach(p => console.log(`  - [${p.categoryId}] ${p.name}`));
        await mongoose.disconnect();
        return;
    }

    console.log('\n⚠️  KHÔNG có sản phẩm nào thuộc nhánh Thuốc. Tiến hành fix...\n');

    // ==================== BƯỚC 2: LẤY L2/L3 CATEGORIES ====================
    const thuocL2 = allCats.filter(c => c.parentId && c.parentId.toString() === thuocRoot._id.toString());
    console.log('L2 Categories thuộc Thuốc:');
    thuocL2.forEach(c => console.log(`  [${c._id}] ${c.name} (slug: ${c.slug})`));

    // Map tên L2 → ObjectId để dùng khi gán sản phẩm
    const catMap = {};
    for (const cat of allCats) {
        if (thuocIdStrs.includes(cat._id.toString())) {
            catMap[cat.name] = cat._id;
        }
    }

    // ==================== BƯỚC 3: MAP SẢN PHẨM THEO TỪ KHOÁ ====================
    // Các keyword trong tên/description sản phẩm → tên L2 category phù hợp
    const KEYWORD_RULES = [
        // Hệ hô hấp / Ho, cảm
        { keywords: ['siro', 'ho cảm', 'ho cam', 'trị ho', 'tri ho', 'viêm phế quản', 'viêm họng', 'sổ mũi', 'so mui', 'cảm cúm', 'cam cum', 'hen suyễn', 'hen suyen', 'phế quản'], catNames: ['Hệ hô hấp', 'Thuốc hô hấp'] },
        // Mắt tai mũi họng
        { keywords: ['nhỏ mắt', 'nho mat', 'xịt mũi', 'xit mui', 'rửa mũi', 'rua mui', 'nhỏ tai', 'nho tai', 'viêm mũi', 'viem mui'], catNames: ['Mắt', 'Thuốc mắt tai mũi họng'] },
        // Kháng sinh
        { keywords: ['kháng sinh', 'khang sinh', 'amoxicillin', 'azithromycin', 'ciprofloxacin', 'kháng nấm', 'khang nam'], catNames: ['Thuốc kháng sinh, kháng nấm', 'Thuốc kháng sinh & kháng nấm'] },
        // Giảm đau hạ sốt
        { keywords: ['giảm đau', 'giam dau', 'hạ sốt', 'ha sot', 'paracetamol', 'ibuprofen', 'diclofenac', 'kháng viêm', 'khang viem', 'acetaminophen'], catNames: ['Thuốc giảm đau, hạ sốt, kháng viêm', 'Thuốc giảm đau - hạ sốt'] },
        // Dầu gió / miếng dán
        { keywords: ['dầu gió', 'dau gio', 'dầu nóng', 'dau nong', 'cao xoa', 'miếng dán', 'mieng dan', 'say tàu', 'say xe', 'trầu tiêu', 'bạc hà'], catNames: ['Miếng dán, cao xoa, dầu', 'Miếng dán cao xoa dầu'] },
        // Sát khuẩn / da liễu
        { keywords: ['sát khuẩn', 'sat khuan', 'cồn y tế', 'povidone', 'betadine', 'oxy già', 'oxy gia', 'bôi ngoài da', 'boi ngoai da', 'trị mụn', 'tri mun'], catNames: ['Thuốc da liễu', 'Thuốc bôi ngoài da'] },
        // Tiêu hóa
        { keywords: ['tiêu chảy', 'tieu chay', 'chống nôn', 'chong non', 'buồn nôn', 'oresol', 'smecta', 'men vi sinh thuốc', 'viêm loét dạ dày', 'viem loet da day', 'trào ngược', 'trao nguoc', 'nhuận tràng', 'nhuan trang'], catNames: ['Hệ tiêu hóa & gan mật', 'Hệ tiêu hóa'] },
        // Xương khớp
        { keywords: ['xương khớp', 'xuong khop', 'glucosamine', 'chondroitin', 'giãn cơ', 'gian co', 'thoái hóa', 'thoai hoa', 'khớp gối', 'khop goi', 'viêm khớp', 'viem khop'], catNames: ['Cơ - xương - khớp', 'Cơ xương khớp'] },
        // Tim mạch, huyết áp
        { keywords: ['huyết áp', 'huyet ap', 'tim mạch', 'tim mach', 'cholesterol', 'anticoagulant', 'chống đông', 'chong dong'], catNames: ['Hệ tim mạch', 'Sức khoẻ tim mạch'] },
        // Thần kinh, an thần
        { keywords: ['an thần', 'an than', 'mất ngủ', 'mat ngu', 'melatonin', 'trầm cảm', 'tram cam', 'động kinh', 'dong kinh'], catNames: ['Hệ thần kinh trung ương', 'Thuốc hệ thần kinh'] },
        // Dị ứng
        { keywords: ['dị ứng', 'di ung', 'antihistamin', 'loratadin', 'cetirizin', 'chống dị ứng', 'chong di ung', 'ngứa'], catNames: ['Thuốc dị ứng', 'Thuốc chống dị ứng'] },
        // Thuốc bổ
        { keywords: ['bổ gan', 'bo gan', 'bổ thận', 'bo than', 'hoạt huyết', 'hoat huyet', 'bổ huyết', 'bo huyet', 'tăng lực', 'tang luc'], catNames: ['Thuốc bổ & vitamin', 'Thuốc bổ'] },
        // Kháng ung thư
        { keywords: ['ung thư', 'ung thu', 'hóa trị', 'hoa tri', 'xạ trị', 'xa tri'], catNames: ['Thuốc chống ung thư', 'Thuốc ung thư'] },
        // Tiết niệu
        { keywords: ['tiết niệu', 'tiet nieu', 'thận', 'than', 'bàng quang', 'bang quang', 'lợi tiểu', 'loi tieu'], catNames: ['Hệ tiết niệu - sinh dục', 'Hệ tiết niệu'] },
    ];

    function normStr(text) {
        if (!text) return '';
        return text.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }

    // Tìm L2 category ID phù hợp từ catNames
    function findCatId(catNames) {
        for (const name of catNames) {
            if (catMap[name]) return catMap[name];
        }
        // Tìm theo partial match
        for (const name of catNames) {
            const normName = normStr(name);
            for (const [catName, catId] of Object.entries(catMap)) {
                if (normStr(catName).includes(normName) || normName.includes(normStr(catName))) {
                    return catId;
                }
            }
        }
        return null;
    }

    // ==================== BƯỚC 4: UPDATE SẢN PHẨM ====================
    let totalUpdated = 0;
    const allProducts = await productsCol.find({}).toArray();
    console.log(`\n🔄 Scanning ${allProducts.length} sản phẩm để tìm thuốc phù hợp...\n`);

    for (const p of allProducts) {
        const norm = normStr((p.name || '') + ' ' + (p.description || ''));

        for (const rule of KEYWORD_RULES) {
            const matched = rule.keywords.some(kw => norm.includes(normStr(kw)));
            if (matched) {
                const catId = findCatId(rule.catNames);
                if (catId) {
                    const catName = Object.entries(catMap).find(([n, id]) => id.toString() === catId.toString())?.[0];
                    await productsCol.updateOne(
                        { _id: p._id },
                        { $set: { categoryId: catId } }
                    );
                    console.log(`  ✓ → [${catName}] "${(p.name || '').substring(0, 55)}"`);
                    totalUpdated++;
                    break; // Chỉ gán một category cho mỗi sản phẩm
                }
            }
        }
    }

    console.log(`\n🎉 Hoàn thành! Đã cập nhật ${totalUpdated} sản phẩm sang danh mục Thuốc.`);

    // Verify
    const newCount = await productsCol.countDocuments({ categoryId: { $in: thuocIds } });
    console.log(`✅ Xác nhận: ${newCount} sản phẩm thuộc nhánh Thuốc trong DB.`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
});
