import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  {
    path: 'admin',
    loadComponent: () => import('./layout/layout').then((m) => m.Layout),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./home/home').then((m) => m.Home)
      },
      {
        path: 'orders',
        loadComponent: () => import('./ordermanage/ordermanage').then((m) => m.Ordermanage)
      },
      {
        path: 'orders/detail/:id',
        loadComponent: () => import('./orderdetail/orderdetail').then((m) => m.Orderdetail)
      },
      {
        path: 'orders/create',
        loadComponent: () => import('./orderdetail/orderdetail').then((m) => m.Orderdetail)
      },
      {
        path: 'orders/edit/:id',
        loadComponent: () => import('./orderdetail/orderdetail').then((m) => m.Orderdetail)
      },
      {
        path: 'customers',
        loadComponent: () => import('./customermanage/customermanage').then((m) => m.Customermanage)
      },
      {
        path: 'customers/detail/:id',
        loadComponent: () => import('./customerdetail/customerdetail').then((m) => m.Customerdetail)
      },
      {
        path: 'products',
        loadComponent: () => import('./productmanage/productmanage').then((m) => m.Productmanage)
      },
      {
        path: 'blogs',
        loadComponent: () => import('./blogmanage/blogmanage').then((m) => m.Blogmanage)
      },
      {
        path: 'blogs/detail',
        loadComponent: () => import('./blogdetail/blogdetail').then((m) => m.Blogdetail)
      },
      {
        path: 'blogs/create',
        loadComponent: () => import('./blogdetail/blogdetail').then((m) => m.Blogdetail)
      },
      {
        path: 'promotions',
        loadComponent: () => import('./promotionmanage/promotionmanage').then((m) => m.Promotionmanage)
      },
      {
        path: 'consultation-prescription',
        loadComponent: () => import('./consultationprescription/consultationprescription').then((m) => m.Consultationprescription)
      },
      {
        path: 'consultation-product',
        loadComponent: () => import('./consultationproduct/consultationproduct').then((m) => m.Consultationproduct)
      },
      {
        path: 'consultation-disease',
        loadComponent: () => import('./consultationdisease/consultationdisease').then((m) => m.Consultationdisease)
      }
    ]
  }
];
