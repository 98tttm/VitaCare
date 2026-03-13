# Module Tra cứu Bệnh lý (Disease Module) - VitaCare

Tài liệu này cung cấp cái nhìn chi tiết về cấu trúc, logic và hướng dẫn tích hợp cho module Tra cứu Bệnh lý, phục vụ quá trình merge code và phát triển sau này.

## 1. Cấu trúc Module
Module nằm tại thư mục `src/app/disease/` và bao gồm 3 component chính:

| Component | Route | Chức năng |
|-----------|-------|-----------|
| `Disease` | `/disease` | Trang chủ Tra cứu bệnh. Chế độ xem theo "Bộ phận cơ thể" (Body Map) và "Nhóm bệnh chuyên khoa". |
| `DiseaseGroupDetails` | `/category/tra-cuu-benh/:groupSlug` | Danh sách bài viết bệnh lý thuộc một chuyên khoa cụ thể. |
| `DiseaseDetails` | `/benh/:id` hoặc `/benh/:slug` | Nội dung chi tiết bài viết bệnh lý, bao gồm FAQ, Hỏi đáp và Multimedia. |

## 2. Các điểm kỹ thuật quan trọng

### 🖼️ Quản lý Tài nguyên (`disease-icon.ts`)
Tất cả icon (bộ phận cơ thể, nhóm bệnh) và banner được tập trung quản lý tại file này. 
- **Quy tắc Map**: Key trong `GROUP_ICON_MAP` và `GROUP_BANNER_MAP` phải khớp chính xác với `slug` của danh mục từ backend.
- **Dễ dàng bảo trì**: Thay đổi giao diện chỉ cần cập nhật đường dẫn ảnh trong file này mà không cần sửa Logic Component.

### 📜 Logic Nội dung Thông minh (`DiseaseDetails`)
- **TOC (Table of Contents)**: Sidebar bên trái tự động theo dõi vị trí cuộn trang (Scroll Spy) bằng `IntersectionObserver`. Khi người dùng cuộn đến đâu, mục lục tương ứng sẽ được highlight.
- **Xử lý HTML (`getSafeHtml`)**: 
    - Loại bỏ whitespace thừa và thẻ rỗng.
    - **Nội bộ hóa link**: Tự động nhận diện các link dẫn sang Long Châu và chuyển hướng về route nội bộ của VitaCare để giữ chân người dùng.
- **Cơ chế "Xem thêm / Thu gọn"**: Sử dụng kỹ thuật cuộn bù trừ (Scroll offset recovery) để đảm bảo khi người dùng nhấn "Thu gọn", trình duyệt không bị nhảy mất vị trí đang đọc.

### 🎥 Đa phương tiện (Multimedia)
- **Audio**: Player tùy chỉnh (custom UI) tương tác với `ElementRef` của thẻ `<audio>`.
- **Video**: Tự động chuyển đổi các loại link YouTube (watch, short link) sang dạng `embed` để hiển thị trong Modal Popup.

### 💬 Hệ thống Hỏi đáp & Review
- Kết nối với `ProductService` để quản lý bình luận. 
- Hỗ trợ **Guest Like**: Định danh khách vãng lai qua `guest_user_id` trong LocalStorage.
- Phân biệt Admin/Pharmacist trong các câu trả lời tư vấn.

## 3. Quy trình Dữ liệu (Data Flow)

1. **Routing**: Ưu tiên sử dụng `slug` để thân thiện SEO.
2. **Breadcrumb**: Logic tự động xác định nhóm bệnh cha dựa trên `fullPathSlug` (ví dụ: `benh/nhom-benh/tim-mach`).
3. **Sắp xếp Section**: Code tự động hoán đổi vị trí "Phương pháp chẩn đoán & điều trị" lên trên "Chế độ sinh hoạt & phòng ngừa" để tối ưu trải nghiệm đọc tin y khoa.

## 4. Lưu ý khi Merge Code
- **CORS & Assets**: Đảm bảo các icon trong `assets/icon/disease/` đã được đồng bộ đầy đủ lên server/hosting.
- **Change Detection**: Module sử dụng `ChangeDetectorRef.detectChanges()` và `NgZone.run()` tại các hàm xử lý dữ liệu bất đồng bộ để tránh lỗi UI không cập nhật trên một số môi trường sản phẩm.
- **Dependencies**: Yêu cầu cài đặt `bootstrap-icons` để hiển thị đầy đủ các biểu tượng UI.

---
*Tài liệu được soạn thảo bởi Antigravity (Assistant AI)*
