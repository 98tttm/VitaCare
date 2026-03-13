# SIÊU BLUEPRINT KỸ THUẬT: KHẮC PHỤC LỖI VITACARE (UPDATE 08/03)

Đây là tài liệu chi tiết nhất, mô tả chính xác từng dòng code, vị trí và logic chuyên môn để ngày mai chúng ta dứt điểm 3 vấn đề lớn.

---

## 🛠 VẤN ĐỀ 1: Lỗ hổng Logic Lọc Danh mục Đa cấp (Recursion Bug)

### 1. Hiện trạng (CODE SAI/THIẾU)
- **Vị trí**: `backend/server.js` -> Route `app.get('/api/products', ...)` (Dòng ~257).
- **Đoạn code hiện tại**:
  ```javascript
  const descendants = allCats.filter((c) => {
      const pid = c.parentId ? getId(c.parentId) : null;
      return pid === catId; // SAI: Chỉ lấy con trực tiếp (Cấp 1)
  });
  ```
- **Hậu quả**: Khi chọn "Thực phẩm chức năng", nó không bao giờ tìm thấy sản phẩm của danh mục "Men vi sinh" (vốn là con của "Hỗ trợ tiêu hóa").

### 2. Giải pháp Chuyên môn (CODE ĐÚNG)
- **Vị trí**: Chèn hàm đệ quy vào trước Logic xử lý `categorySlug`.
- **Logic mới**:
  1. **Xây dựng Map**: `const catMap = {}; allCats.forEach(c => { ... });` để tối ưu tốc độ tìm kiếm.
  2. **Hàm Đệ Quy**: 
     ```javascript
     const getIdsRecursive = (id) => {
         let ids = [id];
         const children = catMap[id] || [];
         children.forEach(cid => { ids = ids.concat(getIdsRecursive(cid)); });
         return ids;
     };
     ```
  3. **Mixed-Type Matching**: Đưa toàn bộ ID về mảng chứa cả `String` và `ObjectId` (`$in: mixedIds`) để khớp 100% với dữ liệu MongoDB.

---

## 🔥 VẤN ĐỀ 2: Lỗi Giao diện "Ưu đãi hot hôm nay" (Header Search Dropdown)

### 1. Hiện trạng (CODE LỎNG LẺO)
- **Vị trí**: `backend/server.js` -> Logic `sort === 'discount'`.
- **Vấn đề**: Bản hiện tại chỉ `sort({ discount: -1 })` mà không có `match`. Nếu Database có SP rác có trường `discount: "vô giá trị"`, nó vẫn hiện lên Header. Giao diện Frontend (`header.html`) đang thiếu fallback cho ảnh và giá.

### 2. Giải pháp Chuyên môn (CODE CHUẨN)
- **Backend (`server.js`)**: Phải thêm điều kiện lọc nghiêm ngặt (Strict Filtering).
  ```javascript
  if (sort === 'discount') {
      // Chỉ lấy sản phẩm có discount thực sự (là số và > 0)
      filter.$expr = { $gt: [{ $convert: { input: "$discount", to: "double", onError: 0, onNull: 0 } }, 0] };
      sortOption = { discount: -1 };
  }
  ```
- **Frontend (`header.ts`)**: Sửa hàm `fetchHotDeals` để mapping dữ liệu sạch hơn:
  ```typescript
  // Thêm ảnh mặc định ngay từ lúc map dữ liệu
  image: p.image || 'assets/icon/medical_16660084.png',
  price: p.price || 0 // Tránh hiện chữ 'đ' khi giá bằng 0
  ```

---

## 🧹 VẤN ĐỀ 3: Làm sạch Dữ liệu Rác (Data Purge - Sản phẩm "Có")

### 1. Hiện trạng
- Có ít nhất 2 sản phẩm trong `data/products.json` có `name: "Có"`, không ảnh, không mô tả.
- Các sản phẩm này đang đứng đầu danh sách "Ưu đãi hot" vì logic sort hiện tại đang bị lỗi.

### 2. Quy trình xử lý Chuyên môn
1. **Truy quét**: Chạy lệnh `grep -r "Có" data/products.json` để xác định chính xác vị trí.
2. **Loại bỏ**:
   - Xóa trực tiếp khỏi file JSON.
   - Nếu đã import vào MongoDB: Chạy lệnh `db.products.deleteMany({ name: "Có" })`.
3. **Kiểm soát**: Thêm logic `filter.name = { $ne: "Có" }` vào các API công khai để đảm bảo sản phẩm rác không bao giờ "lọt lưới".

---

## 📋 THỨ TỰ THỰC HIỆN NGÀY MAI
1.  **Mở `backend/server.js`**: Copy hàm đệ quy từ bản cũ sang (đã note ở Bước 1).
2.  **Cập nhật Route Products**: Áp dụng `mixedIds` cho cả `categorySlug` và `categoryId`.
3.  **Sửa logic Sort Discount**: Thêm `$expr` và `$convert` để lọc sản phẩm khuyến mãi thực sự.
4.  **Mở `my-user/src/app/header/header.ts`**: Cập nhật hàm `fetchHotDeals` và thêm fallback ảnh.
5.  **Clean Data**: Xóa sạch các sản phẩm tên "Có".

---
**Tài liệu này là "Kim chỉ nam" cho buổi làm việc sáng mai. Chúc bạn ngủ ngon!**
