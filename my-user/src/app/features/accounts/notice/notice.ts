import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { ReminderService } from '../../../core/services/reminder.service';
import { NoticeService } from '../../../core/services/notice.service';

export type NoticeType =
  | 'order_created'
  | 'order_updated'
  | 'prescription_created'
  | 'prescription_updated'
  | 'health_check'
  | 'medication_reminder'
  | 'qa_reply'
  | 'qa_submitted';

export interface NoticeItem {
  id: string;
  type: NoticeType;
  title: string;
  message: string;
  time: string;
  /** ISO timestamp gốc (dùng để sort). */
  timeIso?: string;
  /** epoch ms của `timeIso` (dùng để sort). */
  timeMs?: number;
  read: boolean;
  link?: string;
  linkLabel?: string;
  meta?: string;
}

export type NoticeTabId = 'all' | 'orders' | 'prescriptions' | 'reminders' | 'qa';

@Component({
  selector: 'app-notice',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notice.html',
  styleUrl: './notice.css',
})
export class Notice implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);
  private reminderService = inject(ReminderService);
  private noticeService = inject(NoticeService);
  private cdr = inject(ChangeDetectorRef);

  list: NoticeItem[] = [];
  activeTab: NoticeTabId = 'all';
  loading = false;
  loadError: string | null = null;
  showDeleteConfirm = false;
  deleteConfirmItem: NoticeItem | null = null;

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  // Pagination for list (hiển thị 8, bấm Xem thêm thì +4)
  private readonly initialVisibleCount = 8;
  private readonly loadStep = 4;
  visibleCount = this.initialVisibleCount;

  readonly tabs: { id: NoticeTabId; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'orders', label: 'Đơn hàng' },
    { id: 'prescriptions', label: 'Đơn thuốc' },
    { id: 'reminders', label: 'Lịch uống thuốc' },
    { id: 'qa', label: 'Hỏi đáp' },
  ];

  readonly typeConfig: Record<NoticeType, { icon: string; iconClass: string; label: string }> = {
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
    qa_reply: {
      icon: 'bi-chat-left-quote-fill',
      iconClass: 'notice-icon-qa',
      label: 'Hỏi đáp',
    },
    qa_submitted: {
      icon: 'bi-chat-left-text-fill',
      iconClass: 'notice-icon-qa',
      label: 'Hỏi đáp',
    },
  };

  ngOnInit(): void {
    this.loadNotifications(false);
    this.startPolling();
  }

  ngOnDestroy(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private startPolling(): void {
    // Refresh định kỳ để khi admin duyệt đơn hàng xong,
    // thông báo mới sẽ tự xuất hiện lên đầu list.
    this.pollHandle = setInterval(() => this.loadNotifications(true), 8000);
  }

  getConfig(type: NoticeType) {
    return this.typeConfig[type] ?? this.typeConfig.order_created;
  }

  requestDeleteNotice(item: NoticeItem): void {
    this.deleteConfirmItem = item;
    this.showDeleteConfirm = true;
  }

  cancelDeleteNoticeConfirm(): void {
    this.showDeleteConfirm = false;
    this.deleteConfirmItem = null;
  }

  confirmDeleteNoticeConfirm(): void {
    const item = this.deleteConfirmItem;
    if (!item) return;
    this.cancelDeleteNoticeConfirm();
    this.deleteNotice(item);
  }

  getDeleteConfirmHint(item: NoticeItem): string {
    const label = this.isReminderNotice(item)
      ? 'thông báo lịch nhắc'
      : this.isOrderNotice(item)
        ? 'thông báo đơn hàng'
        : this.isPrescriptionNotice(item)
          ? 'thông báo đơn thuốc'
          : this.isQaNotice(item)
            ? 'thông báo hỏi đáp'
            : 'thông báo';
    return `Bạn có muốn xoá ${label} này không?`;
  }

  deleteNotice(item: NoticeItem): void {
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    if (!userId) return;

    const id = String(item.id || '');

    // "Nhắc uống thuốc" được generate từ completion_log,
    // bấm thùng rác sẽ coi như "đã làm xong" để nó biến mất khỏi danh sách.
    if (item.type === 'medication_reminder' || id.startsWith('reminder-due-')) {
      const m = id.match(/^reminder-due-([^-]+)-(\d{4}-\d{2}-\d{2})-(\d{4})$/);
      if (m) {
        const reminderId = m[1];
        const dateKey = m[2];
        const timeNoColon = m[3];
        const time = `${timeNoColon.slice(0, 2)}:${timeNoColon.slice(2)}`;

        this.reminderService.markComplete(reminderId, dateKey, time).subscribe({
          next: () => this.loadNotifications(true),
          error: () => this.loadNotifications(true),
        });
      }
      return;
    }

    this.noticeService.deleteNotice(id, userId).subscribe({
      next: () => {
        this.list = this.list.filter((n) => n.id !== id);
      },
      error: () => this.loadNotifications(true),
    });
  }

  loadNotifications(silent = false): void {
    const user = this.authService.currentUser();
    const userId = (user as { user_id?: string })?.user_id;
    if (!userId) {
      this.list = [];
      if (!silent) this.loadError = 'Vui lòng đăng nhập để xem thông báo.';
      return;
    }
    if (!silent) this.loading = true;
    if (!silent) this.loadError = null;
    this.noticeService
      .getNotices(userId)
      .pipe(
        finalize(() => {
          if (!silent) this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => {
          if (res.success && Array.isArray(res.items)) {
            this.list = res.items
              .map((n: any) => {
                const timeIso = n.time ? String(n.time) : '';
                const rawTimeMs = timeIso ? new Date(timeIso).getTime() : 0;
                const timeMs = Number.isFinite(rawTimeMs) ? rawTimeMs : 0;
                return {
              ...n,
              type: n.type || 'order_created',
              timeIso,
                  timeMs,
                  time: timeMs ? this.formatRelativeTime(new Date(timeMs)) : '',
                };
              })
              .sort((a: NoticeItem, b: NoticeItem) => (b.timeMs || 0) - (a.timeMs || 0));
          } else {
            this.list = [];
          }
        },
        error: () => {
          if (!silent) this.loadError = 'Không tải được thông báo.';
          this.list = [];
        },
      });
  }

  formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    // Reminder có thể hiển thị từ sớm (trước giờ uống 1h) nên `date` đôi khi nằm tương lai.
    // Khi đó không nên trả "Vừa xong" (vì diffMs âm).
    const absMs = Math.abs(diffMs);
    const diffM = Math.floor(absMs / 60000);
    const diffH = Math.floor(absMs / 3600000);
    const diffD = Math.floor(absMs / 86400000);
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

  /** Phân loại thông báo theo nhóm */
  isOrderNotice(item: NoticeItem): boolean {
    if (this.isQaNotice(item)) return false;
    return item.type === 'order_created' || item.type === 'order_updated';
  }

  isPrescriptionNotice(item: NoticeItem): boolean {
    return item.type === 'prescription_created' || item.type === 'prescription_updated';
  }

  isReminderNotice(item: NoticeItem): boolean {
    return item.type === 'medication_reminder' || String(item.id || '').startsWith('reminder-due-');
  }

  isQaNotice(item: NoticeItem): boolean {
    if (item.type === 'qa_reply' || item.type === 'qa_submitted') return true;
    // Backward compat: old Q&A notices used type order_updated
    if (
      item.type === 'order_updated' &&
      (item.title?.includes('Câu hỏi') || item.linkLabel === 'Xem phản hồi')
    )
      return true;
    return false;
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
      error: () => {
        item.read = false;
      },
    });
  }

  goToLink(item: NoticeItem): void {
    this.markAsRead(item);

    if (this.isOrderNotice(item) && item.meta) {
      this.router.navigate(['/account'], { queryParams: { menu: 'orders', orderId: item.meta } });
      return;
    }
    if (this.isPrescriptionNotice(item) && item.meta) {
      this.router.navigate(['/account'], {
        queryParams: { menu: 'prescriptions', prescriptionId: item.meta },
      });
      return;
    }
    if (this.isReminderNotice(item)) {
      this.router.navigate(['/account'], { queryParams: { menu: 'remind' } });
      return;
    }
    if (this.isQaNotice(item) && item.link) {
      if (item.link.startsWith('/')) {
        this.router.navigateByUrl(item.link);
      } else {
        this.router.navigate(['/account'], { queryParams: { menu: 'notifications' } });
      }
      return;
    }
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
    }
  }

  /** Số thông báo chưa đọc trong tất cả */
  get unreadCount(): number {
    return this.list.filter((n) => !n.read).length;
  }

  /** Số thông báo chưa đọc trong Đơn hàng */
  get orderUnreadCount(): number {
    return this.list.filter((n) => this.isOrderNotice(n) && !n.read).length;
  }

  /** Số thông báo chưa đọc trong Đơn thuốc */
  get prescriptionUnreadCount(): number {
    return this.list.filter((n) => this.isPrescriptionNotice(n) && !n.read).length;
  }

  /** Số lịch nhắc chưa hoàn thành trong ngày hôm nay */
  get reminderUncompletedTodayCount(): number {
    return this.list.filter((n) => this.isReminderNotice(n)).length;
  }

  /** Số thông báo chưa đọc trong Hỏi đáp */
  get qaUnreadCount(): number {
    return this.list.filter((n) => this.isQaNotice(n) && !n.read).length;
  }

  setActiveTab(tab: NoticeTabId): void {
    this.activeTab = tab;
    this.visibleCount = this.initialVisibleCount;
  }

  private getFilteredListBase(): NoticeItem[] {
    if (this.activeTab === 'all') return this.list;
    if (this.activeTab === 'orders') return this.list.filter((n) => this.isOrderNotice(n));
    if (this.activeTab === 'prescriptions') return this.list.filter((n) => this.isPrescriptionNotice(n));
    if (this.activeTab === 'reminders') return this.list.filter((n) => this.isReminderNotice(n));
    if (this.activeTab === 'qa') return this.list.filter((n) => this.isQaNotice(n));
    return this.list;
  }

  getFilteredList(): NoticeItem[] {
    return this.getFilteredListBase().slice(0, this.visibleCount);
  }

  getFilteredTotal(): number {
    return this.getFilteredListBase().length;
  }

  loadMore(): void {
    const total = this.getFilteredTotal();
    if (this.visibleCount >= total) return;
    this.visibleCount = Math.min(total, this.visibleCount + this.loadStep);
  }

  getTabCount(tabId: NoticeTabId): number {
    if (tabId === 'all') return this.unreadCount;
    if (tabId === 'orders') return this.orderUnreadCount;
    if (tabId === 'prescriptions') return this.prescriptionUnreadCount;
    if (tabId === 'reminders') return this.reminderUncompletedTodayCount;
    if (tabId === 'qa') return this.qaUnreadCount;
    return 0;
  }

  /** Đánh dấu tất cả thông báo chưa đọc thành đã đọc */
  markAllAsRead(): void {
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    if (!userId) return;
    this.noticeService.markAllAsRead(userId).subscribe({
      next: () => {
        this.list.forEach((n) => {
          n.read = true;
        });
      },
      error: () => {},
    });
  }
}
