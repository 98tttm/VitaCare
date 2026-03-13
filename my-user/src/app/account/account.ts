import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Info } from '../info/info';
import { Orders } from '../orders/orders';
import { Prescriptions } from '../prescriptions/prescriptions';
import { Addresses } from '../addresses/addresses';
import { ReviewsComponent } from '../reviews/reviews';
import { ReturnManagementComponent } from '../return/return';
import { Notice } from '../notice/notice';
import { Health } from '../health/health';
import { Remind } from '../remind/remind';
import { AuthService } from '../services/auth.service';
import { NoticeService } from '../services/notice.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, RouterLink, Info, Orders, Prescriptions, Addresses, Health, Remind, ReviewsComponent, ReturnManagementComponent, Notice],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account implements OnInit {
  readonly authService = inject(AuthService);
  private noticeService = inject(NoticeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  userName = '';
  userPhone = '';
  activeMenu = 'info';
  notificationCount = 0;
  avatarError = false;
  reviewsReloadTrigger = 0;

  /** Avatar lấy từ currentUser để sidebar cập nhật ngay khi đổi ảnh ở info */
  get userAvatar(): string {
    return (this.authService.currentUser()?.avatar as string) || '/assets/images/avt.png';
  }

  /** Nhãn breadcrumb theo menu (theo mẫu: Trang chủ / Cá nhân / Thông tin cá nhân) */
  readonly menuLabels: Record<string, string> = {
    info: 'Thông tin cá nhân',
    orders: 'Đơn hàng của tôi',
    prescriptions: 'Đơn thuốc của tôi',
    addresses: 'Quản lý số địa chỉ',
    health: 'Quản lý sổ sức khỏe',
    remind: 'Nhắc lịch uống thuốc',
    reviews: 'Quản lý đánh giá',
    returns: 'Quản lý đổi trả',
    notifications: 'Thông báo',
  };

  get breadcrumbLabel(): string {
    return this.menuLabels[this.activeMenu] ?? 'Thông tin cá nhân';
  }

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.userName = user.full_name ?? '';
      this.userPhone = user.phone ?? '';
      if (user.user_id) {
        this.loadNotificationCount(user.user_id);
      }
    }
    const initial = this.route.snapshot.queryParams['menu'];
    if (initial) {
      this.activeMenu = initial;
    } else {
      // Fallback: check if the path itself is 'health' or 'health/nhac-lich-uong-thuoc' (mapped to health/remind)
      const path = this.route.snapshot.url.map(s => s.path).join('/');
      if (path === 'health') this.activeMenu = 'health';
      else if (path.includes('nhac-lich-uong-thuoc')) this.activeMenu = 'remind';
    }

    this.route.queryParams.subscribe((qp) => {
      const menu = qp['menu'];
      if (menu) {
        this.activeMenu = menu;
        if (menu === 'reviews') {
          this.reviewsReloadTrigger++;
        }
      }
    });
  }

  private loadNotificationCount(userId: string): void {
    this.noticeService.getNotices(userId).subscribe({
      next: (res) => {
        setTimeout(() => {
          if (res.success && Array.isArray(res.items)) {
            this.notificationCount = res.items.filter((n) => !n.read).length;
          } else {
            this.notificationCount = 0;
          }
        }, 0);
      },
      error: () => {
        this.notificationCount = 0;
      },
    });
  }

  setActiveMenu(menu: string, event: Event): void {
    event.preventDefault();
    this.activeMenu = menu;
    if (menu === 'reviews') {
      this.reviewsReloadTrigger++;
    }
    // Cập nhật URL theo menu đang chọn (vd: ?menu=addresses) để refresh/share đúng trang
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { menu },
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  logout(): void {
    this.authService.openLogoutConfirm();
  }
}
