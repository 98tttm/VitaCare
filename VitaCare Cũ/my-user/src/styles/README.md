# VitaCare Design System

Hệ thống thiết kế thống nhất cho toàn bộ ứng dụng VitaCare (User & Admin)

## 📂 Cấu trúc files

```
src/styles/
├── variables.css    # CSS Variables - Định nghĩa tất cả design tokens
├── utilities.css    # Utility Classes - Các class tiện ích
└── theme.ts         # TypeScript Constants - Sử dụng trong components
```

## 🎨 Color Palette

### Primary Colors (Màu chủ đạo)
- **Main**: `#00589F` - Xanh dương đậm
- **Hover**: `#2B3E66` - Xanh đậm hơn khi hover
- **Light**: `#43A2E6` - Xanh nhạt
- **Lighter**: `#AACEF2` - Xanh rất nhạt
- **Background**: `#DAECFF` - Background xanh nhạt

### Status Colors
- **Success**: `#00589F` (Xanh - Primary)
- **Warning**: `#F59E0B` (Cam)
- **Danger**: `#C42326` (Đỏ)
- **Info**: `#5A5BDC` (Tím xanh)

### Neutral Colors
- **100**: `#0A0A0A` (Đen đậm nhất)
- **90-10**: Gradient từ đen → trắng
- **10**: `#FFFFFF` (Trắng)

## 🔤 Typography

### Font Families
- **Title/Heading**: `Inter` - Dùng cho tiêu đề (h1-h6)
- **Content/Body**: `Arimo` - Dùng cho nội dung

### Font Sizes
```
xs:  12px
sm:  14px
base: 16px (default)
lg:  18px
xl:  20px
2xl: 24px
3xl: 30px
4xl: 36px
5xl: 48px
6xl: 60px
```

### Font Weights
```
light:     300
normal:    400 (default)
medium:    500
semibold:  600
bold:      700
extrabold: 800
```

## 📏 Spacing System

Spacing tăng theo bội số của 4px:
```
0:  0px
1:  4px
2:  8px
3:  12px
4:  16px
5:  20px
6:  24px
8:  32px
10: 40px
12: 48px
16: 64px
20: 80px
24: 96px
```

## 🎯 Cách sử dụng

### 1. Sử dụng CSS Variables

```css
.my-component {
  color: var(--color-primary);
  font-family: var(--font-family-title);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
}
```

### 2. Sử dụng Utility Classes

```html
<!-- Text -->
<h1 class="text-primary font-bold text-3xl">VitaCare</h1>
<p class="text-secondary text-base">Chăm sóc sức khỏe toàn diện</p>

<!-- Buttons -->
<button class="btn btn-primary">Đăng nhập</button>
<button class="btn btn-outline-primary">Đăng ký</button>

<!-- Spacing -->
<div class="p-6 m-4">
  <div class="px-4 py-2">Content</div>
</div>

<!-- Flex -->
<div class="flex items-center justify-between gap-4">
  <span>Left</span>
  <span>Right</span>
</div>

<!-- Card -->
<div class="card">
  <h3>Card Title</h3>
  <p>Card content</p>
</div>
```

### 3. Sử dụng trong TypeScript

```typescript
import { VitaCareTheme, Colors, Typography } from '@/styles/theme';

// Sử dụng colors
const primaryColor = Colors.primary.main; // '#00589F'

// Sử dụng typography
const headingFont = Typography.fontFamily.title; // 'Inter'

// Sử dụng toàn bộ theme
console.log(VitaCareTheme.spacing[4]); // '16px'
```

## 🧩 Component Classes

### Buttons
```html
<!-- Sizes -->
<button class="btn btn-sm">Small</button>
<button class="btn">Normal</button>
<button class="btn btn-lg">Large</button>

<!-- Variants -->
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-success">Success</button>
<button class="btn btn-warning">Warning</button>
<button class="btn btn-danger">Danger</button>
<button class="btn btn-outline-primary">Outline</button>

<!-- Disabled -->
<button class="btn btn-primary" disabled>Disabled</button>
```

### Inputs
```html
<input type="text" class="input" placeholder="Nhập tên...">
```

### Cards
```html
<div class="card">
  <h3 class="font-bold text-xl mb-3">Card Title</h3>
  <p class="text-secondary">Card description goes here.</p>
</div>
```

## 📱 Responsive Breakpoints

```javascript
breakpoints: {
  xs: '0',
  sm: '576px',
  md: '768px',
  lg: '992px',
  xl: '1200px',
  xxl: '1400px'
}
```

## 🎨 Design Tokens Reference

### Border Radius
```
none: 0
sm:   4px
base: 6px
md:   8px (buttons, inputs)
lg:   12px (cards)
xl:   16px
2xl:  24px
full: 9999px (rounded)
```

### Shadows
```
sm:   Subtle shadow
base: Default shadow
md:   Medium shadow
lg:   Large shadow (card hover)
xl:   Extra large
2xl:  Very prominent
```

### Transitions
```
fast: 150ms
base: 250ms (default)
slow: 350ms
```

## 📚 Best Practices

### 1. Ưu tiên sử dụng CSS Variables
```css
/* ✅ Good */
.button {
  color: var(--color-primary);
  padding: var(--spacing-4);
}

/* ❌ Bad */
.button {
  color: #00589F;
  padding: 16px;
}
```

### 2. Sử dụng Utility Classes cho styling nhanh
```html
<!-- ✅ Good -->
<div class="flex items-center gap-4 p-6">

<!-- ❌ Bad -->
<div style="display: flex; align-items: center; gap: 16px; padding: 24px;">
```

### 3. Tái sử dụng component classes
```html
<!-- ✅ Good -->
<button class="btn btn-primary">Submit</button>

<!-- ❌ Bad -->
<button style="background: #00589F; padding: 12px 24px; border-radius: 8px;">
```

### 4. Consistent spacing
Luôn sử dụng spacing system (bội số của 4px)
```css
/* ✅ Good */
margin: var(--spacing-4);  /* 16px */
padding: var(--spacing-6); /* 24px */

/* ❌ Bad */
margin: 15px;
padding: 25px;
```

## 🔄 Updating Theme

Khi cần thay đổi theme, chỉ cần cập nhật file `variables.css`:

```css
:root {
  /* Thay đổi primary color */
  --color-primary: #NEW_COLOR;
  
  /* Theme sẽ tự động cập nhật toàn bộ app */
}
```

## 📖 Examples

### Example 1: Product Card
```html
<div class="card hover:shadow-lg transition">
  <img src="product.jpg" class="rounded-lg mb-4">
  <h3 class="font-bold text-xl mb-2">Product Name</h3>
  <p class="text-secondary mb-4">Product description</p>
  <div class="flex items-center justify-between">
    <span class="text-primary font-bold text-lg">99.000đ</span>
    <button class="btn btn-primary btn-sm">Mua ngay</button>
  </div>
</div>
```

### Example 2: Form
```html
<form class="p-6 bg-white rounded-lg shadow">
  <h2 class="font-bold text-2xl mb-6">Đăng nhập</h2>
  
  <div class="mb-4">
    <label class="block text-sm font-medium mb-2">Email</label>
    <input type="email" class="input" placeholder="email@example.com">
  </div>
  
  <div class="mb-6">
    <label class="block text-sm font-medium mb-2">Mật khẩu</label>
    <input type="password" class="input" placeholder="••••••••">
  </div>
  
  <button class="btn btn-primary w-full">Đăng nhập</button>
</form>
```

## 🎯 Theme được sử dụng ở

- ✅ **my-user** - User interface
- ✅ **my-admin** - Admin interface
- ✅ Tất cả components trong project

Điều này đảm bảo **sự thống nhất hoàn toàn** trong toàn bộ ứng dụng VitaCare! 🎨
