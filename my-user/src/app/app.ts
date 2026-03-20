import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth } from './features/accounts/auth/auth';
import { HeaderComponent } from './shared/header/header';
import { Footer } from './shared/footer/footer';
import { Cart } from './features/accounts/cart/cart';
import { FloatingActionsComponent } from './shared/floating-actions/floating-actions';
import { ProductQuickView } from './features/products/product-quick-view/product-quick-view';
import { BlogQuickView } from './features/blogs/blog-quick-view/blog-quick-view';
import { AuthService } from './core/services/auth.service';
import { ToastService } from './core/services/toast.service';
import { ConfirmService } from './core/services/confirm.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, Auth, HeaderComponent, Footer, Cart, FloatingActionsComponent, ProductQuickView, BlogQuickView],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly authService = inject(AuthService);
  readonly toastService = inject(ToastService);
  readonly confirmService = inject(ConfirmService);
}
