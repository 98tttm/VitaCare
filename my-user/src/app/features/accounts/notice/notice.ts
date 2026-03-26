import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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
  | 'qa_submitted'
  | 'review_reply';

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
  /** Tên hiển thị (sản phẩm / bệnh / bài) thay cho slug–SKU trong UI. */
  meta_label?: string;
  /** Phân loại hiển thị: ví dụ `helpful_like` = đánh dấu hữu ích (icon/tag riêng). */
  noticeTag?: string;
}

/** Thông báo do người khác bấm "Hữu ích" (đánh giá / hỏi đáp). Có `noticeTag` hoặc nhận diện theo nội dung (dữ liệu cũ). */
export function isHelpfulLikeNotice(item: Pick<NoticeItem, 'noticeTag' | 'message'>): boolean {
  if (item.noticeTag === 'helpful_like') return true;
  const m = String(item.message || '');
  return m.includes('đánh dấu') && m.includes('hữu ích');
}

export type NoticeTabId = 'all' | 'orders' | 'prescriptions' | 'reminders' | 'qa';

@Component({
  selector: 'app-notice',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notice.html',
  styleUrl: './notice.css',
})
export class Notice implements OnInit, AfterViewInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private reminderService = inject(ReminderService);
  private noticeService = inject(NoticeService);
  private cdr = inject(ChangeDetectorRef);

  /** Dùng trong template (tag + icon). */
  readonly isHelpfulLikeNotice = isHelpfulLikeNotice;

  @ViewChild('noticeStickySentinel', { read: ElementRef }) noticeStickySentinelRef?: ElementRef<HTMLElement>;

  /** Bật lớp nền + gradient khi khối neo đã dính (sentinel ra khỏi viewport). */
  stickyTabBackdrop = false;

  private noticeStickyIntersectionObserver?: IntersectionObserver;

  private resizeBackdropListener?: () => void;

  private resizeBackdropTimer?: ReturnType<typeof setTimeout>;

  list: NoticeItem[] = [];
  activeTab: NoticeTabId = 'all';
  loading = false;
  loadError: string | null = null;
  showDeleteConfirm = false;
  deleteConfirmItem: NoticeItem | null = null;

  private highlightId: string | null = null;

  private scrollToNoticeById(id: string): void {
    const domId = `notice-item-${id}`;
    const el = document.getElementById(domId);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {
      el.scrollIntoView();
    }
    // chỉ scroll một lần cho highlight hiện tại
    this.highlightId = null;
  }

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
    review_reply: {
      icon: 'bi-chat-dots-fill',
      iconClass: 'notice-icon-qa',
      label: 'Hỏi đáp',
    },
  };

  ngOnInit(): void {
    // highlightId từ bell dropdown
    this.route.queryParamMap.subscribe((params) => {
      const id = params.get('highlightId');
      if (id) {
        this.highlightId = id;
        this.activeTab = 'all';
        // đảm bảo phần tử nằm trong slice DOM
        this.visibleCount = 999;
        this.cdr.markForCheck();
      }
    });

    this.loadNotifications(false);
    this.startPolling();
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.setupNoticeStickyBackdropObserver();
      this.resizeBackdropListener = () => {
        if (this.resizeBackdropTimer) clearTimeout(this.resizeBackdropTimer);
        this.resizeBackdropTimer = setTimeout(() => this.setupNoticeStickyBackdropObserver(), 180);
      };
      window.addEventListener('resize', this.resizeBackdropListener, { passive: true });
    });
  }

  ngOnDestroy(): void {
    if (this.resizeBackdropListener) {
      window.removeEventListener('resize', this.resizeBackdropListener);
      this.resizeBackdropListener = undefined;
    }
    if (this.resizeBackdropTimer) {
      clearTimeout(this.resizeBackdropTimer);
      this.resizeBackdropTimer = undefined;
    }
    this.noticeStickyIntersectionObserver?.disconnect();
    this.noticeStickyIntersectionObserver = undefined;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  /** Giống Đơn hàng: sentinel trước khối neo — khi không còn intersect → bật backdrop + gradient. */
  private setupNoticeStickyBackdropObserver(): void {
    const el = this.noticeStickySentinelRef?.nativeElement;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const accountHost = el.closest('app-account');
    const raw = accountHost
      ? getComputedStyle(accountHost).getPropertyValue('--vc-account-sidebar-sticky-top').trim()
      : '';
    const parsed = parseInt(raw.replace('px', ''), 10);
    const insetPx = Number.isFinite(parsed) && parsed > 0 ? parsed : 164;

    this.noticeStickyIntersectionObserver?.disconnect();
    this.noticeStickyIntersectionObserver = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        this.stickyTabBackdrop = !e?.isIntersecting;
        this.cdr.markForCheck();
      },
      { root: null, rootMargin: `-${insetPx}px 0px 0px 0px`, threshold: 0 },
    );
    this.noticeStickyIntersectionObserver.observe(el);
  }

  private startPolling(): void {
    // Refresh định kỳ để khi admin duyệt đơn hàng xong,
    // thông báo mới sẽ tự xuất hiện lên đầu list.
    this.pollHandle = setInterval(() => this.loadNotifications(true), 8000);
  }

  getConfig(type: NoticeType) {
    return this.typeConfig[type] ?? this.typeConfig.order_created;
  }

  /**
   * Dòng phụ trên thẻ thông báo: ưu tiên tên hiển thị, không dùng slug/đường dẫn CMS.
   * Bản ghi cũ không có `meta_label` thì cố parse từ `message` (nội dung trong ngoặc kép).
   */
  noticeMetaDisplay(item: NoticeItem): string {
    const fromLabel = String(item.meta_label || '').trim();
    if (fromLabel) return fromLabel;

    const msg = String(item.message || '');
    const patterns = [
      /đánh giá của bạn về sản phẩm "([^"]+)"/i,
      /về sản phẩm "([^"]+)"/i,
      /về bệnh "([^"]+)"/i,
      /về "([^"]+)"/i,
    ];
    for (const re of patterns) {
      const m = msg.match(re);
      if (m?.[1]) return m[1].trim();
    }

    const rawMeta = String(item.meta || '').trim();
    if (this.isQaNotice(item) && (rawMeta.includes('benh/') || /\.html$/i.test(rawMeta))) {
      return '';
    }

    return rawMeta;
  }

  /**
   * Icon/ màu cho từng item (đặc biệt: order_updated cần phân loại theo trạng thái).
   * Tránh việc dùng chung 1 icon cho mọi order_updated.
   */
  getItemConfig(item: NoticeItem) {
    if (isHelpfulLikeNotice(item)) {
      return {
        icon: 'bi-hand-thumbs-up-fill',
        iconClass: 'notice-icon-helpful',
        label: 'Hữu ích',
      };
    }

    const titleLc = String(item.title || '').toLowerCase();
    const msgLc = String(item.message || '').toLowerCase();

    if (item.type === 'order_created') {
      return {
        icon: 'bi-box-seam-fill',
        iconClass: 'notice-icon-order-created',
        label: 'Đơn hàng',
      };
    }

    if (item.type === 'order_updated') {
      // 1) Đang giao (shipping)
      if (
        titleLc.includes('đang được giao') ||
        msgLc.includes('đang trên đường')
      ) {
        return {
          icon: 'bi-truck',
          iconClass: 'notice-icon-order-delivering',
          label: 'Đơn hàng đang giao',
        };
      }

      // 2) Đã giao thành công (admin xác nhận giao thành công)
      if (
        titleLc.includes('đã được giao') ||
        msgLc.includes('đã được giao thành công') ||
        msgLc.includes('vui lòng xác nhận nhận hàng')
      ) {
        return {
          icon: 'bi-check-circle-fill',
          iconClass: 'notice-icon-order-delivered',
          label: 'Đã giao thành công',
        };
      }

      // 3) Người dùng đã bấm "Đã nhận hàng"
      if (titleLc.includes('bạn đã nhận hàng') || msgLc.includes('xác nhận giao thành công')) {
        return {
          icon: 'bi-person-check-fill',
          iconClass: 'notice-icon-order-received',
          label: 'Đã nhận hàng',
        };
      }

      // 4) Q&A (backward): title chứa "Câu hỏi" nhưng type = order_updated
      if (titleLc.includes('câu hỏi') || msgLc.includes('câu hỏi')) {
        return {
          icon: 'bi-question-circle-fill',
          iconClass: 'notice-icon-qa',
          label: 'Hỏi đáp',
        };
      }

      // 5) Đánh giá (được tạo từ /api/reviews nhưng type = order_updated) => dùng icon thùng hàng
      if (titleLc.includes('đánh giá') || msgLc.includes('đánh giá')) {
        return {
          icon: 'bi-chat-dots',
          iconClass: 'notice-icon-evaluation',
          label: 'Đánh giá',
        };
      }

      // Fallback: đơn hàng cập nhật chung
      return this.typeConfig.order_updated;
    }

    // Các loại còn lại dùng mapping theo type
    return this.getConfig(item.type);
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

            // Scroll tới item vừa bấm trong bell dropdown
            if (this.highlightId) {
              const targetId = this.highlightId;
              // đợi template render
              setTimeout(() => this.scrollToNoticeById(targetId), 80);
            }
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
    // Phản hồi đánh giá / hữu ích: cùng tab lọc "Hỏi đáp" với QA sản phẩm
    if (item.type === 'review_reply') return true;
    if (item.type === 'qa_reply' || item.type === 'qa_submitted') return true;
    // Backend backward-compat: một số notice dùng type `order_updated` nhưng nội dung chứa "Câu hỏi"/"Đánh giá"
    if (item.type === 'order_updated') {
      const titleLc = String(item.title || '').toLowerCase();
      const msgLc = String(item.message || '').toLowerCase();

      // Q&A
      if (
        titleLc.includes('câu hỏi') ||
        msgLc.includes('câu hỏi') ||
        item.linkLabel === 'Xem phản hồi'
      ) {
        return true;
      }

      // Evaluation (xếp chung vào tab "Hỏi đáp" theo yêu cầu)
      if (
        // Chỉ gom các notice đánh giá "đã được gửi" (tránh gom nhầm đơn hàng "chờ bạn đánh giá")
        item.linkLabel === 'Xem đánh giá' ||
        titleLc.includes('đánh giá đã được gửi')
      ) {
        return true;
      }
    }

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

  /**
   * Hỏi đáp trên trang chi tiết bệnh: link dạng /benh/:id hoặc meta CMS (benh/...html).
   * Phải xử lý trước nhánh /product vì meta bệnh không phải SKU sản phẩm.
   */
  private extractDiseaseSlugFromConsultationMeta(meta: string): string | null {
    const raw = String(meta || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (!lower.includes('benh/') && !lower.endsWith('.html')) return null;
    let clean = raw;
    if (lower.startsWith('benh/')) clean = clean.slice(5);
    clean = clean.replace(/\.html$/i, '');
    const parts = clean.split('/').filter(Boolean);
    const seg = parts.length ? parts[parts.length - 1] : clean;
    return seg || null;
  }

  /**
   * Slug bệnh lưu trong notice.meta khi backend chỉ gửi segment (vd. benh-nao-gan-xxx),
   * không có prefix benh/ — khác với SKU sản phẩm: thông báo sản phẩm luôn có chữ "về sản phẩm" trong message.
   */
  private maybePlainDiseaseSlug(meta: string): string | null {
    const raw = String(meta || '').trim();
    if (!raw || raw.length < 2) return null;
    if (/[\s/]/.test(raw)) return null;
    if (!/^[a-zA-Z0-9._\-]+$/.test(raw)) return null;
    return raw;
  }

  /** meta từ API có thể là string hoặc object (dữ liệu cũ). */
  private resolveDiseaseMetaSlug(item: NoticeItem): string | null {
    const m = item.meta as unknown;
    if (m != null && typeof m === 'object') {
      const o = m as Record<string, unknown>;
      const nested = [o['sku'], o['slug'], o['routeId'], o['id']]
        .map((x) => (x != null ? String(x).trim() : ''))
        .find(Boolean);
      if (nested) {
        return (
          this.extractDiseaseSlugFromConsultationMeta(nested) || this.maybePlainDiseaseSlug(nested)
        );
      }
    }
    const raw = String(item.meta ?? '').trim();
    if (!raw || raw === '[object Object]') return null;
    return this.extractDiseaseSlugFromConsultationMeta(raw) || this.maybePlainDiseaseSlug(raw);
  }

  private noticeLinkPathOnly(link: string | undefined): string {
    const raw = String(link || '').trim().split(/[?#]/)[0];
    if (/^https?:\/\//i.test(raw)) {
      try {
        return new URL(raw).pathname || '';
      } catch {
        return raw;
      }
    }
    return raw;
  }

  private isDiseaseQaNotice(item: NoticeItem): boolean {
    const msg = String(item.message || '');
    if (msg.includes('về sản phẩm')) return false;
    if (msg.includes('về bệnh') || msg.includes(' về bệnh')) return true;
    if (String(item.title || '').toLowerCase().includes('bệnh')) return true;
    if (item.type === 'qa_submitted' && !msg.includes('về sản phẩm')) {
      return true;
    }
    return false;
  }

  private navigateDiseaseConsultationNotice(item: NoticeItem): boolean {
    if (!this.isQaNotice(item)) return false;

    const pathOnly = this.noticeLinkPathOnly(item.link);
    const pathMatch = pathOnly.match(/^\/(benh|disease)\/(.+)$/);
    if (pathMatch) {
      const base = pathMatch[1];
      const id = decodeURIComponent(pathMatch[2]);
      this.router.navigate([`/${base}`, id], { queryParams: { scrollTo: 'consultation' } });
      return true;
    }

    /**
     * Backend đôi khi ghi link `/disease` (chỉ trang danh sách) khi thiếu slug — không phải bài chi tiết.
     * Hoặc link nhóm `/category/tra-cuu-benh/:group` — user cần vào đúng bài `/benh/:slug` (meta).
     */
    if (
      pathOnly === '/disease' ||
      pathOnly === '/disease/' ||
      pathOnly.startsWith('/category/tra-cuu-benh')
    ) {
      const slug = this.resolveDiseaseMetaSlug(item);
      if (slug && this.isDiseaseQaNotice(item)) {
        this.router.navigate(['/benh', slug], { queryParams: { scrollTo: 'consultation' } });
        return true;
      }
    }

    let slug = this.resolveDiseaseMetaSlug(item);
    if (!slug) return false;

    const legacyAccount =
      pathOnly === '/account' || item.linkLabel === 'Xem thông báo';
    const looksDiseaseCopy =
      legacyAccount ||
      String(item.message || '').includes(' về bệnh') ||
      String(item.title || '').toLowerCase().includes('bệnh') ||
      this.isDiseaseQaNotice(item);

    if (looksDiseaseCopy) {
      this.router.navigate(['/benh', slug], { queryParams: { scrollTo: 'consultation' } });
      return true;
    }

    return false;
  }

  goToLink(item: NoticeItem): void {
    this.markAsRead(item);

    if (this.navigateDiseaseConsultationNotice(item)) {
      return;
    }

    // Phản hồi trên đánh giá của người khác → mở tab đánh giá sản phẩm
    if (item.type === 'review_reply' && item.meta) {
      this.router.navigate(['/product', item.meta], { queryParams: { scrollTo: 'reviews' } });
      return;
    }

    // 1) Đánh giá: điều hướng sang trang chi tiết sản phẩm + scroll tới phần review
    if (
      (item.linkLabel === 'Xem đánh giá' || String(item.title || '').includes('Đánh giá')) &&
      item.meta
    ) {
      const skuOrSlug = item.meta;
      this.router.navigate(['/product', skuOrSlug], { queryParams: { scrollTo: 'reviews' } });
      return;
    }

    // 2) Hỏi đáp bệnh: tránh nhầm sang /product — dùng slug bài bệnh
    if (this.isQaNotice(item) && this.isDiseaseQaNotice(item)) {
      const diseaseSlug = this.resolveDiseaseMetaSlug(item);
      if (diseaseSlug) {
        this.router.navigate(['/benh', diseaseSlug], { queryParams: { scrollTo: 'consultation' } });
        return;
      }
    }

    // 3) Hỏi đáp (QA) sản phẩm: điều hướng sang trang chi tiết sản phẩm + scroll tới phần questions
    if (this.isQaNotice(item)) {
      const skuOrSlug =
        typeof item.meta === 'string' || typeof item.meta === 'number'
          ? String(item.meta).trim()
          : '';
      const linkSku =
        item.link && item.link.startsWith('/product/')
          ? item.link.replace('/product/', '').split(/[?#]/)[0]
          : '';

      const target = skuOrSlug || linkSku;
      if (target) {
        this.router.navigate(['/product', target], { queryParams: { scrollTo: 'questions' } });
        return;
      }
    }

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
    // QA còn lại: nếu chưa match được case ở trên thì fallback theo link hiện có
    if (this.isQaNotice(item) && item.link) {
      const pOnly = this.noticeLinkPathOnly(item.link);
      if (
        pOnly === '/disease' ||
        pOnly === '/disease/' ||
        pOnly.startsWith('/category/tra-cuu-benh')
      ) {
        const ds = this.resolveDiseaseMetaSlug(item);
        if (ds && this.isDiseaseQaNotice(item)) {
          this.router.navigate(['/benh', ds], { queryParams: { scrollTo: 'consultation' } });
          return;
        }
      }
      if (item.link.startsWith('/product/')) {
        const targetSku = item.link.replace('/product/', '').split(/[?#]/)[0];
        this.router.navigate(['/product', targetSku], { queryParams: { scrollTo: 'questions' } });
      } else if (item.link.startsWith('/')) {
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
