# Nhật ký Thay đổi - VitaCare Project (08/03/2026)

Tài liệu này tổng hợp toàn bộ các thay đổi và sửa lỗi đã thực hiện trong phiên làm việc hôm nay để tối ưu hóa giao diện và hệ thống.

---

## 1. Sửa lỗi Backend (Thiếu thư viện)
- **Vấn đề**: Khi chạy `npm start` trong thư mục `backend`, server bị lỗi do không tìm thấy module `dotenv`.
- **Giải pháp**: Đã hướng dẫn thực hiện lệnh `npm install` tại thư mục `backend` để cài đặt đầy đủ các dependencies có trong `package.json`.

---

## 2. Triển khai Bộ lọc "Neo" (Sticky Filter)
Mục tiêu là giúp bộ lọc "Bộ lọc nâng cao" luôn đứng yên ở bên trái khi người dùng cuộn xem danh sách sản phẩm.

### A. Sửa lỗi chặn Sticky trong `my-user/src/app/app.css`
- **Thay đổi**: Loại bỏ thuộc tính `overflow-x: hidden` khỏi class `.app-main`.
- **Lý do**: Trong CSS, nếu thẻ cha có thuộc tính `overflow` khác `visible`, nó sẽ làm vô hiệu hóa thuộc tính `position: sticky` của các thẻ con bên trong.

### B. Cấu hình Sticky trong `my-user/src/app/product/product.css`
- **Thay đổi**: 
    - Thiết lập `.product-filter-column` thành `position: sticky`.
    - Điều chỉnh `top` qua nhiều lần thử nghiệm (`210px` -> `155px` -> `148px` -> `145px`) và cuối cùng chốt ở **`142px`** để sát rạt dưới thanh Menu nhất có thể theo yêu cầu.
- **Dọn dẹp**: Xoá các rules CSS trống như `.product-two-columns` và `.product-main-column` để file code gọn gàng hơn.

### C. Tối ưu chiều cao bộ lọc trong `my-user/src/app/filter/filter.css`
- **Thay đổi**: Cấu chỉnh lại `max-height` của `.filter-card` thành `calc(100vh - 159px)`.
- **Lý do**: Để đảm bảo bộ lọc luôn nằm gọn trong khung nhìn (viewport), không bị tràn xuống dưới khi đã được neo ở vị trí `top: 142px`.

---

## 3. Tổng kết Cấu trúc Component Sản phẩm
Đã tìm hiểu và phân tích kỹ cơ chế hoạt động của:
- **`ProductComponent`**: Điều phối trang, quản lý URL và Filters.
- **`ProductList`**: Hiển thị lưới sản phẩm và xử lý giỏ hàng.
- **`FilterComponent`**: Chứa toàn bộ logic các nhóm lọc (Brand, Price, Audience...).
- **`FeatureCategories`**: Các icon danh mục con phía trên danh sách.

---

## 4. Sửa lỗi logic Bộ lọc (Filtering Logic)
- **Vấn đề**: Các bộ lọc như "Mùi vị", "Đối tượng", "Chỉ định" không hoạt động vì Backend chưa xử lý các tham số này và dữ liệu sản phẩm không có các trường dữ liệu tương ứng.
- **Giải pháp**:
    - Cập nhật `backend/server.js` để tiếp nhận các tham số: `flavor`, `audience`, `indication`, `origin`, `brandOrigin`.
    - Triển khai cơ chế **Khớp từ khóa (Keyword Matching)**:
        - **Mùi vị**: Tự động bóc tách từ khóa (vd: "Vị Cam" -> "Cam") và tìm kiếm trong tên sản phẩm.
        - **Đối tượng & Công dụng**: Tìm kiếm đồng thời trong cả `name` và `description` của sản phẩm.
        - **Xuất xứ**: Hỗ trợ lọc theo trường `country` có sẵn trong dữ liệu.
    - Sử dụng toán tử `$and` và `$or` của MongoDB để kết hợp nhiều bộ lọc cùng lúc (vd: Vừa lọc theo Thương hiệu vừa lọc theo Mùi vị).

---
**Người thực hiện**: Antigravity (AI Assistant)
**Ngày**: 08/03/2026
