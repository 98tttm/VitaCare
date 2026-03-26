import { Component, OnInit, signal, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly router = inject(Router);
  protected readonly title = signal('my-admin');

  private readonly titleByRoute: Array<{ matcher: RegExp; title: string }> = [
    { matcher: /^\/login(\/|$)/, title: 'VitaCare Admin - Đăng nhập' },
    { matcher: /^\/admin\/(dashboard|home)?(\/|$)/, title: 'VitaCare Admin - Tổng quan' },
    { matcher: /^\/admin\/orders(\/|$)/, title: 'VitaCare Admin - Quản lý đơn hàng' },
    { matcher: /^\/admin\/products(\/|$)/, title: 'VitaCare Admin - Quản lý sản phẩm' },
    { matcher: /^\/admin\/customers(\/|$)/, title: 'VitaCare Admin - Quản lý khách hàng' },
    { matcher: /^\/admin\/blogs(\/|$)/, title: 'VitaCare Admin - Quản lý blog' },
    { matcher: /^\/admin\/diseases(\/|$)/, title: 'VitaCare Admin - Quản lý bệnh' },
    { matcher: /^\/admin\/promotions(\/|$)/, title: 'VitaCare Admin - Quản lý khuyến mãi' },
    { matcher: /^\/admin\/consultation-prescription(\/|$)/, title: 'VitaCare Admin - Tư vấn đơn thuốc' },
    { matcher: /^\/admin\/consultation-product(\/|$)/, title: 'VitaCare Admin - Tư vấn sản phẩm' },
    { matcher: /^\/admin\/consultation-disease(\/|$)/, title: 'VitaCare Admin - Tư vấn bệnh' },
  ];

  ngOnInit(): void {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.applyPageTitle(this.router.url));
    this.applyPageTitle(this.router.url);
  }

  private applyPageTitle(rawUrl: string): void {
    const path = (rawUrl || '/').split('?')[0];
    const matched = this.titleByRoute.find(item => item.matcher.test(path));
    document.title = matched?.title ?? 'VitaCare Admin';
  }
}
