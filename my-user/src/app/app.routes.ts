import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  {
    // Route chuyên cho Nhóm bệnh (Tra cứu bệnh)
    // Đặt TRƯỚC các route category chung để không bị match nhầm vào Product
    path: 'category/tra-cuu-benh/:groupSlug',
    loadComponent: () => import('./disease/disease-group-details/disease-group-details').then(m => m.DiseaseGroupDetails),
  },
  {
    path: 'category/:slug/:subslug/:seg3',
    loadComponent: () => import('./product/product').then(m => m.Product)
  },
  {
    path: 'category/:slug/:subslug',
    loadComponent: () => import('./product/product').then(m => m.Product)
  },
  {
    path: 'category/:slug',
    loadComponent: () => import('./product/product').then(m => m.Product)
  },
  {
    path: 'products',
    loadComponent: () => import('./product/product').then(m => m.Product)
  },
  {
    path: 'product/:slug',
    loadComponent: () => import('./product-detail/product-detail').then(m => m.ProductDetail)
  },
  {
    path: 'account',
    loadComponent: () => import('./account/account').then(m => m.Account),
    canActivate: [authGuard],
  },
  {
    path: 'order',
    loadComponent: () => import('./order/order').then(m => m.Order),
  },
  {
    path: 'consultation',
    loadComponent: () => import('./consultation/consultation').then(m => m.Consultation),
  },
  {
    path: 'health',
    loadComponent: () => import('./account/account').then(m => m.Account),
    canActivate: [authGuard],
  },
  {
    path: 'health/bmi',
    loadComponent: () => import('./bmi-calculator/bmi-calculator').then(m => m.BmiCalculator),
  },
  {
    path: 'health/nhac-lich-uong-thuoc',
    loadComponent: () => import('./account/account').then(m => m.Account),
    canActivate: [authGuard],
  },
  {
    path: 'health/:key',
    loadComponent: () => import('./health-detail/health-detail').then(m => m.HealthDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'health-test',
    loadComponent: () => import('./health-test/health-test').then(m => m.HealthTestComponent),
  },
  {
    path: 'store-system',
    loadComponent: () => import('./store-system/store-system').then(m => m.StoreSystemComponent),
  },
  {
    path: 'chinh-sach/gioi-thieu',
    loadComponent: () => import('./chinh-sach/policy/policy').then(m => m.Policy),
  },
  {
    path: 'chinh-sach/giay-phep-kinh-doanh',
    loadComponent: () => import('./chinh-sach/business-license/business-license').then(m => m.BusinessLicense),
  },
  {
    path: 'chinh-sach/quy-che-hoat-dong',
    loadComponent: () => import('./chinh-sach/regulation/regulation').then(m => m.Regulation),
  },
  {
    path: 'chinh-sach/chinh-sach-dat-coc',
    loadComponent: () => import('./chinh-sach/deposit-policy/deposit-policy').then(m => m.DepositPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-noi-dung',
    loadComponent: () => import('./chinh-sach/content-policy/content-policy').then(m => m.ContentPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-doi-tra',
    loadComponent: () => import('./chinh-sach/return-policy/return-policy').then(m => m.ReturnPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-giao-hang',
    loadComponent: () => import('./chinh-sach/delivery-policy/delivery-policy').then(m => m.DeliveryPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-bao-mat',
    loadComponent: () => import('./chinh-sach/privacy-policy/privacy-policy').then(m => m.PrivacyPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-thanh-toan',
    loadComponent: () => import('./chinh-sach/payment-policy/payment-policy').then(m => m.PaymentPolicy),
  },
  {
    path: 'chinh-sach/chinh-sach-bao-mat-du-lieu',
    loadComponent: () => import('./chinh-sach/data-privacy-policy/data-privacy-policy').then(m => m.DataPrivacyPolicy),
  },
  {
    path: 'chinh-sach/thong-tin-trung-tam-bao-hanh',
    loadComponent: () => import('./chinh-sach/warranty-centers/warranty-centers').then(m => m.WarrantyCenters),
  },
  {
    path: 'chinh-sach/dieu-khoan-su-dung',
    loadComponent: () => import('./chinh-sach/terms-of-use/terms-of-use').then(m => m.TermsOfUse),
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about').then(m => m.About),
  },
  {
    path: 'bai-viet/danh-muc/:categorySlug/:subcategorySlug',
    loadComponent: () => import('./bai-viet/blog-category/blog-category').then(m => m.BlogCategory),
  },
  {
    path: 'bai-viet/danh-muc/:categorySlug',
    loadComponent: () => import('./bai-viet/blog-category/blog-category').then(m => m.BlogCategory),
  },
  {
    path: 'bai-viet/:slug',
    loadComponent: () => import('./bai-viet/blog-detail/blog-detail').then(m => m.BlogDetail),
  },
  {
    path: 'bai-viet',
    loadComponent: () => import('./bai-viet/blog/blog').then(m => m.Blog),
  },
  {
    path: 'disease',
    loadComponent: () => import('./disease/disease').then(m => m.Disease),
  },
  {
    // Chi tiết bệnh: nhận cả id hoặc slug (backend hỗ trợ cả hai)
    path: 'benh/:id',
    loadComponent: () => import('./disease/disease-details/disease-details').then(m => m.DiseaseDetails),
  },
  { path: '**', redirectTo: '' },
];
