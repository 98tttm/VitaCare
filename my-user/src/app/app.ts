import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth } from './features/accounts/auth/auth';
import { HeaderComponent } from './shared/header/header';
import { Footer } from './shared/footer/footer';
import { Cart } from './features/accounts/cart/cart';
import { FloatingActionsComponent } from './shared/floating-actions/floating-actions';
import { ProductQuickView } from './features/products/product-quick-view/product-quick-view';
import { BlogQuickView } from './features/blogs/blog-quick-view/blog-quick-view';
import { AuthService, type LoggedUser } from './core/services/auth.service';
import { AuthApiService } from './core/services/auth-api.service';
import { ToastService } from './core/services/toast.service';
import { ConfirmService } from './core/services/confirm.service';
import { HOME_URL } from './core/constants/navigation.constants';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, Auth, HeaderComponent, Footer, Cart, FloatingActionsComponent, ProductQuickView, BlogQuickView],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  readonly authService = inject(AuthService);
  readonly toastService = inject(ToastService);
  readonly confirmService = inject(ConfirmService);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get('oauth_code');
    const oauthErr = params.get('oauth_error');

    const stripOAuthQuery = (): void => {
      const url = new URL(window.location.href);
      url.searchParams.delete('oauth_code');
      url.searchParams.delete('oauth_error');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    };

    if (oauthErr) {
      const messages: Record<string, string> = {
        google_not_configured: 'Đăng nhập Google chưa được cấu hình trên máy chủ.',
        facebook_not_configured: 'Đăng nhập Facebook chưa được cấu hình trên máy chủ.',
        google_denied: 'Đăng nhập Google bị hủy.',
        facebook_denied: 'Đăng nhập Facebook bị hủy.',
        invalid_state: 'Phiên đăng nhập không hợp lệ. Vui lòng thử lại.',
        google_invalid: 'Thông tin đăng nhập Google không hợp lệ.',
        facebook_invalid: 'Thông tin đăng nhập Facebook không hợp lệ.',
        google_token: 'Không lấy được token từ Google.',
        facebook_token: 'Không lấy được token từ Facebook.',
        google_profile: 'Không đọc được thông tin tài khoản Google.',
        facebook_profile: 'Không đọc được thông tin tài khoản Facebook.',
        google_user: 'Không tạo được tài khoản từ Google.',
        facebook_user: 'Không tạo được tài khoản từ Facebook.',
        server: 'Lỗi máy chủ khi đăng nhập.',
      };
      this.toastService.showError(messages[oauthErr] || 'Đăng nhập thất bại.');
      stripOAuthQuery();
      return;
    }

    if (oauthCode) {
      stripOAuthQuery();
      this.authApi.exchangeOAuthCode(oauthCode).subscribe({
        next: (res) => {
          if (res.success && res.user) {
            this.authService.setUser(res.user as LoggedUser);
            this.authService.showHeaderSuccess('Bạn đã đăng nhập thành công');
            void this.router.navigate([HOME_URL]);
          } else {
            this.toastService.showError(res.message || 'Không thể hoàn tất đăng nhập.');
          }
        },
        error: (err) => {
          const msg =
            err?.error?.message ||
            (err?.status === 0
              ? 'Không kết nối được máy chủ. Chạy backend: cd backend && npm start'
              : 'Không thể hoàn tất đăng nhập.');
          this.toastService.showError(msg);
        },
      });
    }
  }
}
