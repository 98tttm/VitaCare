import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/pages/home/home').then(m => m.Home) },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  {
    // Route chuyên cho Nhóm bệnh (Tra cứu bệnh)
    // Đặt TRƯỚC các route category chung để không bị match nhầm vào Product
    path: 'category/tra-cuu-benh/:groupSlug',
    loadComponent: () => import('./features/healthcare/disease-group-details/disease-group-details').then(m => m.DiseaseGroupDetails),
  },
  {
    path: 'category/:slug/:subslug/:seg3',
    loadComponent: () => import('./features/products/product/product').then(m => m.Product)
  },
  {
    path: 'category/:slug/:subslug',
    loadComponent: () => import('./features/products/product/product').then(m => m.Product)
  },
  {
    path: 'category/:slug',
    loadComponent: () => import('./features/products/product/product').then(m => m.Product)
  },
  {
    path: 'products',
    loadComponent: () => import('./features/products/product/product').then(m => m.Product)
  },
  {
    path: 'product/:slug',
    loadComponent: () => import('./features/products/product-detail/product-detail').then(m => m.ProductDetail)
  },
  {
    path: 'account',
    loadComponent: () => import('./features/accounts/account/account').then(m => m.Account),
    canActivate: [authGuard],
  },
  {
    path: 'order',
    loadComponent: () => import('./features/accounts/order/order').then(m => m.Order),
  },
  {
    path: 'addresses',
    loadComponent: () => import('./features/accounts/addresses/addresses').then(m => m.Addresses),
  },
  {
    path: 'info',
    loadComponent: () => import('./features/accounts/info/info').then(m => m.Info),
  },
  {
    path: 'reviews',
    loadComponent: () => import('./features/accounts/reviews/reviews').then(m => m.ReviewsComponent),
  },
  {
    path: 'return',
    loadComponent: () => import('./features/accounts/return/return').then(m => m.ReturnManagementComponent),
  },
  {
    path: 'prescriptions',
    loadComponent: () => import('./features/accounts/prescriptions/prescriptions').then(m => m.Prescriptions),
  },
  {
    path: 'auth',
    loadComponent: () => import('./features/accounts/auth/auth').then(m => m.Auth),
  },
  {
    path: 'consultation',
    loadComponent: () => import('./features/healthcare/consultation/consultation').then(m => m.Consultation),
  },
  {
    path: 'health',
    loadComponent: () => import('./features/accounts/account/account').then(m => m.Account),
    canActivate: [authGuard],
  },
  {
    path: 'health/bmi',
    loadComponent: () => import('./features/healthcare/bmi-calculator/bmi-calculator').then(m => m.BmiCalculator),
  },
  {
    path: 'health/nhac-lich-uong-thuoc',
    loadComponent: () => import('./features/accounts/account/account').then(m => m.Account),
    canActivate: [authGuard],
  },
  {
    path: 'health/:key',
    loadComponent: () => import('./features/healthcare/health-detail/health-detail').then(m => m.HealthDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'health-test',
    loadComponent: () => import('./features/healthcare/health-test/health-test').then(m => m.HealthTestComponent),
  },
  {
    path: 'store-system',
    loadComponent: () => import('./features/pages/store-system/store-system').then(m => m.StoreSystemComponent),
  },
  {
    path: 'chinh-sach/gioi-thieu',
    loadComponent: () => import('./features/policies/policy/policy').then(m => m.Policy),
  },
  {
    path: 'chinh-sach/giay-phep-kinh-doanh',
    loadComponent: () => import('./features/policies/business-license/business-license').then(m => m.BusinessLicense),
  },
  {
    path: 'chinh-sach/quy-che-hoat-dong',
    loadComponent: () => import('./features/policies/regulation/regulation').then(m => m.Regulation),
  },
  {
    path: 'chinh-sach/chinh-sach-dat-coc',
    loadComponent: () => import('./features/policies/deposit-policy/deposit-policy').then(m => m.DepositPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-noi-dung',
    loadComponent: () => import('./features/policies/content-policy/content-policy').then(m => m.ContentPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-doi-tra',
    loadComponent: () => import('./features/policies/return-policy/return-policy').then(m => m.ReturnPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-giao-hang',
    loadComponent: () => import('./features/policies/delivery-policy/delivery-policy').then(m => m.DeliveryPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-bao-mat',
    loadComponent: () => import('./features/policies/privacy-policy/privacy-policy').then(m => m.PrivacyPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-thanh-toan',
    loadComponent: () => import('./features/policies/payment-policy/payment-policy').then(m => m.PaymentPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-bao-mat-du-lieu',
    loadComponent: () => import('./features/policies/data-privacy-policy/data-privacy-policy').then(m => m.DataPrivacyPolicy),
  },
  {
    path: 'chinh-sach/thong-tin-trung-tam-bao-hanh',
    loadComponent: () => import('./features/policies/warranty-centers/warranty-centers').then(m => m.WarrantyCenters),
  },
  {
    path: 'chinh-sach/dieu-khoan-su-dung',
    loadComponent: () => import('./features/policies/terms-of-use/terms-of-use').then(m => m.TermsOfUse),
  },
  {
    path: 'about',
    loadComponent: () => import('./features/pages/about/about').then(m => m.About),
  },
  {
    path: 'bai-viet/danh-muc/:categorySlug/:subcategorySlug',
    loadComponent: () => import('./features/blogs/blog-sub-category/blog-sub-category').then(m => m.BlogSubCategory),
  },
  {
    path: 'bai-viet/topic/:specialtySlug',
    loadComponent: () => import('./features/blogs/blog-category/blog-category').then(m => m.BlogCategory),
  },
  {
    path: 'bai-viet/danh-muc/:categorySlug',
    loadComponent: () => import('./features/blogs/blog-category/blog-category').then(m => m.BlogCategory),
  },
  {
    path: 'topic',
    loadComponent: () => import('./features/blogs/topic/topic').then(m => m.Topic),
  },
  {
    path: 'bai-viet/:slug',
    loadComponent: () => import('./features/blogs/blog-detail/blog-detail').then(m => m.BlogDetail),
  },
  {
    path: 'bai-viet',
    loadComponent: () => import('./features/blogs/blog/blog').then(m => m.Blog),
  },
  {
    path: 'disease',
    loadComponent: () => import('./features/healthcare/disease/disease').then(m => m.Disease),
  },
  {
    // Chi tiết bệnh: nhận cả id hoặc slug (backend hỗ trợ cả hai)
    path: 'benh/:id',
    loadComponent: () => import('./features/healthcare/disease-details/disease-details').then(m => m.DiseaseDetails),
  },
  { path: '**', redirectTo: '' },
];
