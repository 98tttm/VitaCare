import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { NoticeService } from '../services/notice.service';

export type NoticeType =
  | 'order_created'
  | 'order_updated'
  | 'prescription_created'
  | 'prescription_updated'
  | 'health_check'
  | 'medication_reminder';

export interface NoticeItem {
  id: string;
  type: NoticeType;
  title: string;
  message: string;
  time: string;
  read: boolean;
  /** Route hoặc link (vd: /account?menu=orders, order_id) */
  link?: string;
  linkLabel?: string;
  /** Dữ liệu bổ sung (mã đơn, mã đơn thuốc, v.v.) */
  meta?: string;
}

@Component({
  selector: 'app-notice',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notice.html',
  styleUrl: './notice.css',
})
export class Notice implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private noticeService = inject(NoticeService);
  private cdr = inject(ChangeDetectorRef);

  list: NoticeItem[] = [];
  /** Tab: all | unread */
  activeTab: 'all' | 'unread' = 'all';
  loading = false;
  loadError: string | null = null;

  readonly tabs: { id: 'all' | 'unread'; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'unread', label: 'Chưa đọc' },
  ];

  readonly typeConfig: Record<
    NoticeType,
    { icon: string; iconClass: string; label: string }
  > = {
    order_created: {
      icon: 'bi-box-seam-fill',
      iconClass: 'notice-icon-order',
      label: 'Đơn hàng',
    },
    order_updated: {
      icon: 'bi-truck',
      iconClass: 'notice-icon-order',
      label: 'Đơn hàng',
    },
    prescription_created: {
      icon: 'bi-capsule-pill',
      iconClass: 'notice-icon-prescription',
      label: 'Đơn thuốc',
    },
    prescription_updated: {
      icon: 'bi-file-earmark-medical',
      iconClass: 'notice-icon-prescription',
      label: 'Đơn thuốc',
    },
    health_check: {
      icon: 'bi-heart-pulse-fill',
      iconClass: 'notice-icon-health',
      label: 'Sổ sức khỏe',
    },
    medication_reminder: {
      icon: 'bi-alarm-fill',
      iconClass: 'notice-icon-prescription',
      label: 'Nhắc uống thuốc',
    },
  };

  ngOnInit(): void {
    this.loadNotifications();
  }

  getConfig(type: NoticeType) {
    return this.typeConfig[type] ?? this.typeConfig.order_created;
  }

  loadNotifications(): void {
    const user = this.authService.currentUser();
    const userId = (user as { user_id?: string })?.user_id;
    if (!userId) {
      this.list = [];
      this.loadError = 'Vui lòng đăng nhập để xem thông báo.';
      return;
    }
    this.loading = true;
    this.loadError = null;
    this.noticeService
      .getNotices(userId)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          if (res.success && Array.isArray(res.items)) {
            this.list = res.items.map((n) => ({
              ...n,
              time: n.time ? this.formatRelativeTime(new Date(n.time)) : '',
            }));
          } else {
            this.list = [];
          }
        },
        error: () => {
          this.loadError = 'Không tải được thông báo.';
          this.list = [];
        },
      });
  }

  formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffM = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffM < 1) return 'Vừa xong';
    if (diffM < 60) return `${diffM} phút trước`;
    if (diffH < 24) return `${diffH} giờ trước`;
    if (diffD < 7) return `${diffD} ngày trước`;
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  markAsRead(item: NoticeItem): void {
    if (String(item.id || '').startsWith('reminder-due-')) {
      item.read = true;
      return;
    }
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    if (!userId) return;
    item.read = true;
    this.noticeService.markAsRead(item.id, userId).subscribe({
      error: () => { item.read = false; },
    });
  }

  goToLink(item: NoticeItem): void {
    if (item.link) {
      if (item.link === '/account') {
        const menu =
          item.type === 'medication_reminder'
            ? 'remind'
            : item.type === 'health_check'
              ? 'health'
              : item.type?.startsWith('prescription')
                ? 'prescriptions'
                : 'orders';
        this.router.navigate(['/account'], { queryParams: { menu } });
      } else {
        this.router.navigateByUrl(item.link);
      }
      this.markAsRead(item);
    }
  }

  get unreadCount(): number {
    return this.list.filter((n) => !n.read).length;
  }

  setActiveTab(tab: 'all' | 'unread'): void {
    this.activeTab = tab;
  }

  getFilteredList(): NoticeItem[] {
    if (this.activeTab === 'unread') return this.list.filter((n) => !n.read);
    return this.list;
  }

  getTabCount(tabId: 'all' | 'unread'): number {
    if (tabId === 'all') return this.list.length;
    return this.unreadCount;
  }

  /** Đánh dấu tất cả thông báo chưa đọc thành đã đọc */
  markAllAsRead(): void {
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    if (!userId) return;
    this.noticeService.markAllAsRead(userId).subscribe({
      next: () => { this.list.forEach((n) => { n.read = true; }); },
      error: () => {},
    });
  }
}
