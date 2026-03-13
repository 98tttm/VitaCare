import { Routes } from '@angular/router';
import { Product } from './product/product';
import { Account } from './account/account';
import { Home } from './home/home';
import { ProductDetail } from './product/product-detail/product-detail';
import { InfoPage } from './info-page/info-page';
import { Disease } from './disease/disease';
import { DiseaseDetails } from './disease/disease-details/disease-details';
import { DiseaseGroupDetails } from './disease/disease-group-details/disease-group-details';

export const routes: Routes = [
    { path: '', component: Home },
    { path: 'category/san-pham', redirectTo: '', pathMatch: 'full' },
    { path: 'category/goc-suc-khoe', component: InfoPage },
    { path: 'category/chuyen-trang-ung-thu', component: InfoPage },
    { path: 'category/tra-cuu-benh', component: Disease },
    { path: 'category/tra-cuu-benh/:groupSlug', component: DiseaseGroupDetails }, // Chuyên trang nhóm bệnh
    { path: 'disease', component: Disease },
    { path: 'benh/:id', component: DiseaseDetails },   // Chi tiết bệnh
    { path: 'category/tim-nha-thuoc', component: InfoPage },
    { path: 'category/hop-tac-nhuong-quyen', component: InfoPage },
    { path: 'category/:slug', component: Product },           // single-segment slug
    { path: 'category/:seg1/:seg2', component: Product },     // 2-segment slug (e.g. thuoc/he-ho-hap)
    { path: 'category/:seg1/:seg2/:seg3', component: Product }, // 3-segment slug
    { path: 'products', component: Product },
    { path: 'product/:slug', component: ProductDetail },
    { path: 'account', component: Account },
];
