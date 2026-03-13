# VitaCare Icons Guide

Hướng dẫn sử dụng Icons trong VitaCare - bao gồm Bootstrap Icons và Custom Icons

## 📦 Có sẵn trong project

### 1. Bootstrap Icons (CDN)
Đã được import trong `index.html`:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
```

**Xem tất cả icons**: https://icons.getbootstrap.com/

### 2. Custom Icons
77+ custom icons trong `/assets/icon/`

## 🚀 Cách sử dụng

### Bootstrap Icons (Font Icons)

#### Basic Usage
```html
<!-- Icon đơn giản -->
<i class="bi bi-house-door"></i>
<i class="bi bi-cart"></i>
<i class="bi bi-heart"></i>

<!-- Icon với size -->
<i class="bi bi-heart bi-lg"></i>
<i class="bi bi-star bi-xl"></i>

<!-- Icon với color -->
<i class="bi bi-check-circle icon-success"></i>
<i class="bi bi-exclamation-triangle icon-warning"></i>
<i class="bi bi-x-circle icon-danger"></i>
```

#### Icon Sizes
```html
<i class="bi bi-heart bi-xs"></i>  <!-- 12px -->
<i class="bi bi-heart bi-sm"></i>  <!-- 16px -->
<i class="bi bi-heart bi-md"></i>  <!-- 20px -->
<i class="bi bi-heart bi-lg"></i>  <!-- 24px -->
<i class="bi bi-heart bi-xl"></i>  <!-- 32px -->
<i class="bi bi-heart bi-2xl"></i> <!-- 48px -->
```

#### Icon Colors
```html
<i class="bi bi-heart icon-primary"></i>
<i class="bi bi-heart icon-success"></i>
<i class="bi bi-heart icon-warning"></i>
<i class="bi bi-heart icon-danger"></i>
<i class="bi bi-heart icon-info"></i>
```

#### Icons in Buttons
```html
<!-- Icon bên trái -->
<button class="btn btn-primary">
  <i class="bi bi-cart"></i>
  Thêm vào giỏ
</button>

<!-- Icon bên phải -->
<button class="btn btn-primary">
  Tiếp tục
  <i class="bi bi-arrow-right"></i>
</button>

<!-- Chỉ có icon -->
<button class="icon-btn">
  <i class="bi bi-heart"></i>
</button>

<button class="icon-btn icon-btn-primary">
  <i class="bi bi-cart"></i>
</button>
```

#### Icon with Badge
```html
<span class="icon-badge" data-badge="5">
  <i class="bi bi-bell bi-lg"></i>
</span>

<span class="icon-badge" data-badge="99+">
  <i class="bi bi-cart bi-lg icon-primary"></i>
</span>
```

#### Animated Icons
```html
<!-- Spinning icon (loading) -->
<i class="bi bi-arrow-repeat icon-spin"></i>

<!-- Pulsing icon -->
<i class="bi bi-heart icon-pulse icon-danger"></i>
```

#### Icon with Tooltip
```html
<i class="bi bi-info-circle icon-tooltip" data-tooltip="Thông tin thêm"></i>
```

### Custom Icons (Image Icons)

#### TypeScript Usage
```typescript
import { VitaCareIcons, getCustomIcon } from '@/interface/icons';

// Direct access
const vnpayIcon = VitaCareIcons.payment.vnpay;
const cartIcon = VitaCareIcons.commerce.delivery;

// Using helper function
const icon = getCustomIcon('health', 'blood');
```

#### HTML Usage
```html
<!-- Basic -->
<img src="/assets/icon/VNPAY.png" alt="VNPAY" class="icon-img icon-img-md">

<!-- Với size classes -->
<img src="/assets/icon/delivery.png" class="icon-img icon-img-sm">  <!-- 16px -->
<img src="/assets/icon/cart.png" class="icon-img icon-img-md">      <!-- 20px -->
<img src="/assets/icon/sale.png" class="icon-img icon-img-lg">      <!-- 24px -->
<img src="/assets/icon/vip.png" class="icon-img icon-img-xl">       <!-- 32px -->

<!-- Icon with text -->
<div class="icon-text">
  <img src="/assets/icon/delivery.png" class="icon-img icon-img-md">
  <span>Giao hàng nhanh</span>
</div>

<!-- Icon in button -->
<button class="btn btn-primary">
  <img src="/assets/icon/flash_sale.png" class="icon-img icon-img-sm">
  Flash Sale
</button>
```

## 📋 Available Custom Icons

### Payment Icons
- `VNPAY.png` - Logo VNPAY
- `vnpay.webp` - VNPAY (WebP format)
- `ThanhToanquocte.png` - Thanh toán quốc tế

### Navigation Icons
- `arrowdown.png`
- `arrowleft.png`
- `arrowleft_circle.png`
- `arrowleft_circle_fill.png`
- `arrowright_circle.png`
- `arrowright_circle_fill.png`
- `arrowup_circle.png`

### Health & Medical Icons
- `blood.png`
- `blood-pressure_3389235.png`
- `fracture_18353001.png`
- `medical_16660084.png`
- `pregnant_1382776.png`
- `water-energy_3274977.png`
- `weight-device.png`

### Food & Nutrition Icons
- `chef.png`
- `coffee.png`
- `fruit.png`
- `grain.png`
- `leaf.png`
- `nutrition.png`
- `oil_7849400.png`
- `seaweed.png`
- `vegetable.png`
- `kcal_7246702.png`

### E-commerce Icons
- `delivery.png`
- `warehouse.png`
- `logistic.png`
- `price.png`
- `sale.png`
- `sale_outline.png`
- `flash_sale.png`
- `flash_sale2.png`
- `promotion.png`
- `no-order.png`

### User Icons
- `customer.png`
- `androgyne_6343181.png`
- `transgender_10894616.png`
- `name.png`
- `vip.png`

### Action Icons
- `edit.png`
- `filter.png`
- `menu_447096.png`
- `exchange.png`
- `return.png`
- `share_link.png`

### Time Icons
- `clock_16472429.png`
- `time.png`
- `time-left.png`
- `history.png`

### Notification Icons
- `notification-bell.png`
- `info.png`
- `note.png`
- `notebook_702903.png`
- `writing_2097728.png`

### Social Media Icons
- `google.png`
- `tiktok.png`
- `zalo.png`

### Badge Icons
- `gold-medal.png`
- `silver-medal.png`
- `bronze-medal.png`

### Misc Icons
- `loading.png`
- `logout.png`
- `vitabot.png`
- `no_heart.png`
- `quote.png`

## 🎨 Commonly Used Bootstrap Icons

### Navigation
- `bi-house-door` - Home
- `bi-list` - Menu
- `bi-search` - Search
- `bi-arrow-left/right/up/down` - Arrows
- `bi-chevron-left/right/up/down` - Chevrons

### E-commerce
- `bi-cart` / `bi-cart-fill` - Shopping cart
- `bi-bag` / `bi-bag-fill` - Shopping bag
- `bi-heart` / `bi-heart-fill` - Favorite
- `bi-star` / `bi-star-fill` - Rating

### User
- `bi-person` / `bi-person-fill` - User
- `bi-person-circle` - User avatar
- `bi-people` - Users/Team

### Communication
- `bi-chat` / `bi-chat-dots` - Chat
- `bi-telephone` - Phone
- `bi-envelope` - Email

### Actions
- `bi-pencil` - Edit
- `bi-trash` - Delete
- `bi-plus` / `bi-plus-circle` - Add
- `bi-check` / `bi-check-circle` - Confirm
- `bi-x` / `bi-x-circle` - Close/Cancel

### Status
- `bi-info-circle` - Info
- `bi-exclamation-triangle` - Warning
- `bi-check-circle` - Success
- `bi-x-circle` - Error

### Others
- `bi-eye` / `bi-eye-slash` - Show/Hide
- `bi-filter` - Filter
- `bi-calendar` - Calendar
- `bi-clock` - Time
- `bi-bell` / `bi-bell-fill` - Notification
- `bi-gear` - Settings
- `bi-download` / `bi-upload` - Download/Upload
- `bi-share` - Share

## 💡 Examples

### Product Card with Icons
```html
<div class="card">
  <img src="product.jpg" class="rounded-lg mb-4">
  
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-2">
      <i class="bi bi-star-fill icon-warning"></i>
      <span>4.5</span>
    </div>
    <button class="icon-btn">
      <i class="bi bi-heart"></i>
    </button>
  </div>
  
  <h3 class="font-bold text-lg mb-2">Vitamin C 1000mg</h3>
  
  <div class="icon-text text-sm text-secondary mb-4">
    <img src="/assets/icon/delivery.png" class="icon-img icon-img-sm">
    <span>Giao hàng miễn phí</span>
  </div>
  
  <button class="btn btn-primary w-full">
    <i class="bi bi-cart"></i>
    Thêm vào giỏ
  </button>
</div>
```

### Header with Icons
```html
<header class="flex items-center justify-between p-4 bg-white shadow">
  <button class="icon-btn">
    <i class="bi bi-list bi-lg"></i>
  </button>
  
  <div class="flex items-center gap-4">
    <button class="icon-btn">
      <i class="bi bi-search bi-lg"></i>
    </button>
    
    <span class="icon-badge" data-badge="3">
      <button class="icon-btn">
        <i class="bi bi-bell bi-lg"></i>
      </button>
    </span>
    
    <span class="icon-badge" data-badge="5">
      <button class="icon-btn icon-btn-primary">
        <i class="bi bi-cart bi-lg"></i>
      </button>
    </span>
  </div>
</header>
```

### Status Messages with Icons
```html
<!-- Success -->
<div class="flex items-center gap-3 p-4 bg-success-bg rounded-lg">
  <i class="bi bi-check-circle-fill icon-success bi-lg"></i>
  <span>Đặt hàng thành công!</span>
</div>

<!-- Warning -->
<div class="flex items-center gap-3 p-4 bg-warning-bg rounded-lg">
  <i class="bi bi-exclamation-triangle-fill icon-warning bi-lg"></i>
  <span>Vui lòng kiểm tra lại thông tin</span>
</div>

<!-- Danger -->
<div class="flex items-center gap-3 p-4 bg-danger-bg rounded-lg">
  <i class="bi bi-x-circle-fill icon-danger bi-lg"></i>
  <span>Có lỗi xảy ra, vui lòng thử lại</span>
</div>
```

### Feature List with Icons
```html
<div class="grid grid-cols-2 gap-4">
  <div class="icon-text">
    <img src="/assets/icon/delivery.png" class="icon-img icon-img-lg">
    <div>
      <div class="font-semibold">Giao hàng nhanh</div>
      <div class="text-sm text-secondary">Trong 2 giờ</div>
    </div>
  </div>
  
  <div class="icon-text">
    <img src="/assets/icon/exchange.png" class="icon-img icon-img-lg">
    <div>
      <div class="font-semibold">Đổi trả dễ dàng</div>
      <div class="text-sm text-secondary">Trong 7 ngày</div>
    </div>
  </div>
  
  <div class="icon-text">
    <img src="/assets/icon/VNPAY.png" class="icon-img icon-img-lg">
    <div>
      <div class="font-semibold">Thanh toán an toàn</div>
      <div class="text-sm text-secondary">VNPAY</div>
    </div>
  </div>
  
  <div class="icon-text">
    <i class="bi bi-headset bi-2xl icon-primary"></i>
    <div>
      <div class="font-semibold">Hỗ trợ 24/7</div>
      <div class="text-sm text-secondary">Luôn sẵn sàng</div>
    </div>
  </div>
</div>
```

## 📝 Best Practices

✅ **DO**:
- Sử dụng Bootstrap Icons cho icons phổ biến (cart, heart, user...)
- Sử dụng Custom Icons cho branding và icons đặc thù
- Luôn thêm `alt` text cho icons dạng `<img>`
- Sử dụng size classes để đồng bộ kích thước
- Sử dụng color classes từ theme

❌ **DON'T**:
- Hard-code size và color
- Quên accessibility (aria-label, alt text)
- Mix quá nhiều icon styles trong 1 component
- Sử dụng icons quá lớn hoặc quá nhỏ

## 📚 References

- Bootstrap Icons: https://icons.getbootstrap.com/
- Custom Icons: `/assets/icon/`
- Icon CSS: `src/interface/icons.css`
- Icon Constants: `src/interface/icons.ts`
