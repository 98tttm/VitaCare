import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
  HostListener,
  inject,
  DestroyRef,
  Renderer2,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { NoticeService, AdminNotification } from '../services/notice.service';
import { AuthService } from '../services/auth.service';
import { filter } from 'rxjs/operators';

export type NoticeDrawerTab =
  | 'all'
  | 'urgent'
  | 'product'
  | 'order'
  | 'prescription'
  | 'disease';

export interface NoticeDrawerTabItem {
  id: NoticeDrawerTab;
  label: string;
  /** Số thông báo còn cần xử lý trong tab (chưa giải quyết; không phụ thuộc đã xem/chưa xem). */
  count: number;
}

@Component({
  selector: 'app-notice',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './notice.html',
  styleUrl: './notice.css',
})
export class Notice implements OnInit {
  notifications: AdminNotification[] = [];
  isDropdownOpen = false;
  unreadCount = 0;

  /** Hiệu ứng lắc chuông khi vừa có thông báo chưa đọc mới. */
  bellShaking = false;

  /** Dược sĩ: bộ tab khác admin (không có Đơn hàng, có Tư vấn bệnh). */
  isPharmacist = false;

  drawerOpen = false;
  drawerLoading = false;
  drawerNotifications: AdminNotification[] = [];
  drawerTab: NoticeDrawerTab = 'all';

  private readIds = new Set<string>();
  private resolvedIds = new Set<string>();

  /** So sánh lần sync trước (focus tab / đổi trang) để phát hiện thông báo mới → lắc chuông. */
  private notificationsSyncPrimed = false;
  private lastUnreadIdSnapshot = new Set<string>();
  private prevUnreadCountFromPoll = 0;

  private readonly readIdsKey = 'admin_notice_read_ids';
  private readonly resolvedIdsKey = 'admin_notice_resolved_ids';

  private readonly noticeService = inject(NoticeService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('drawerPortal') set drawerPortalRef(ref: ElementRef<HTMLElement> | undefined) {
    if (!ref) return;
    queueMicrotask(() => {
      const el = ref.nativeElement;
      const body = this.document.body;
      if (body && el.parentElement !== body) {
        this.renderer.appendChild(body, el);
      }
    });
  }

  ngOnInit(): void {
    this.isPharmacist = this.authService.isPharmacistAccount();
    this.readIds = this.loadIdSet(this.readIdsKey);
    this.resolvedIds = this.loadIdSet(this.resolvedIdsKey);
    this.loadNotifications();

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.loadNotifications();
        if (this.drawerOpen) {
          this.loadDrawerNotifications();
        }
      });
  }

  private loadIdSet(key: string): Set<string> {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.map(String));
    } catch {
      return new Set();
    }
  }

  private persistIdSet(key: string, set: Set<string>): void {
    localStorage.setItem(key, JSON.stringify([...set]));
  }

  /**
   * Dropdown: chỉ thông báo chưa giải quyết; đã xử lý / autoResolved / tư vấn bệnh xong thì ẩn.
   * Sắp xếp: chưa đọc trước, mới nhất trước.
   */
  get dropdownNotifications(): AdminNotification[] {
    const list = (this.notifications || []).filter((n) => this.isPendingBellNotification(n));
    return [...list]
      .sort((a, b) => {
        const ar = this.isRead(a._id);
        const br = this.isRead(b._id);
        if (ar !== br) return ar ? 1 : -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 20);
  }

  loadNotifications(): void {
    this.noticeService.getNotifications(20).subscribe({
      next: (res) => {
        if (!res.success) return;
        const raw = res.data || [];
        // Dược sĩ: không bao giờ thấy "đơn mới từ khách" (consultation_prescription / admin_notice).
        this.notifications = this.isPharmacist
          ? raw.filter((n) => n.type !== 'consultation_prescription')
          : raw.filter((n) => n.type !== 'consultation_disease');
        this.applyUnreadAndMaybeRingBell();
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  private computeUnread(): void {
    this.unreadCount = (this.notifications || []).filter(
      (n) => this.isPendingBellNotification(n) && !this.readIds.has(String(n._id))
    ).length;
  }

  /** Cập nhật số badge ngay; nếu có thông báo chưa đọc mới (so với lần poll trước) thì chạy hiệu ứng chuông. */
  private applyUnreadAndMaybeRingBell(): void {
    const list = this.notifications || [];
    const unreadIds = new Set(
      list
        .filter((n) => this.isPendingBellNotification(n) && !this.readIds.has(String(n._id)))
        .map((n) => String(n._id))
    );
    const prevSnap = this.lastUnreadIdSnapshot;

    this.computeUnread();

    if (this.notificationsSyncPrimed) {
      const newIdAppeared = [...unreadIds].some((id) => !prevSnap.has(id));
      const countWentUp = this.unreadCount > this.prevUnreadCountFromPoll;
      if (newIdAppeared || countWentUp) {
        this.triggerBellShake();
      }
    } else {
      this.notificationsSyncPrimed = true;
    }

    this.prevUnreadCountFromPoll = this.unreadCount;
    this.lastUnreadIdSnapshot = unreadIds;
  }

  private triggerBellShake(): void {
    this.bellShaking = false;
    queueMicrotask(() => {
      this.bellShaking = true;
      window.setTimeout(() => {
        this.bellShaking = false;
      }, 850);
    });
  }

  /** Sau khi đánh dấu đã đọc cục bộ, đồng bộ snapshot để lần poll sau không báo nhầm “mới”. */
  private syncUnreadSnapshotAfterLocalChange(): void {
    const list = this.notifications || [];
    this.lastUnreadIdSnapshot = new Set(
      list
        .filter((n) => this.isPendingBellNotification(n) && !this.readIds.has(String(n._id)))
        .map((n) => String(n._id))
    );
    this.prevUnreadCountFromPoll = this.unreadCount;
  }

  isRead(id: string): boolean {
    return this.readIds.has(String(id));
  }

  isResolved(id: string): boolean {
    return this.resolvedIds.has(String(id));
  }

  /** Đã xử lý thủ công hoặc server (đơn đã giao / kết thúc / tư vấn bệnh đã trả lời). */
  isEffectivelyResolved(n: AdminNotification): boolean {
    if (n.type === 'consultation_disease' && n.consultationDiseaseResolved) return true;
    if (n.type === 'consultation_prescription_reminder') return this.isRead(n._id);
    if (this.isPharmacistProductAssignedNotice(n)) {
      const s = String(n.productConsultStatus || '').toLowerCase();
      if (s === 'answered' || s === 'reviewed' || s === 'completed' || s === 'resolved') return true;
    }
    if (this.isPrescriptionTrackingNotice(n)) {
      const s = String(n.prescriptionConsultStatus || '').toLowerCase();
      if (s === 'advised' || s === 'consultation_failed' || s === 'cancelled') return true;
    }
    return this.isResolved(n._id) || !!n.autoResolved;
  }

  /** Chuông chỉ hiển thị item còn cần giải quyết. */
  private isPendingBellNotification(n: AdminNotification): boolean {
    return !this.isEffectivelyResolved(n);
  }

  /** Thông báo phân công tư vấn đơn thuốc (dược sĩ). */
  isPharmacistPrescriptionAssignedRow(n: AdminNotification): boolean {
    return n.type === 'consultation_prescription_assigned';
  }

  /** Thông báo phân công tư vấn sản phẩm (admin/pharmacist). */
  isProductPharmacistAssignedRow(n: AdminNotification): boolean {
    return n.type === 'consultation_product_assigned'
      || !!n.productPharmacistAssigned
      || (!!n.assignedPharmacistId && n.type === 'consultation_product');
  }

  isPharmacistProductAssignedNotice(n: AdminNotification): boolean {
    return this.isPharmacist && n.type === 'consultation_product_assigned';
  }

  isPharmacistProductOutcomeGreen(n: AdminNotification): boolean {
    if (!this.isPharmacistProductAssignedNotice(n)) return false;
    const s = String(n.productConsultStatus || '').toLowerCase();
    return s === 'answered' || s === 'reviewed' || s === 'completed' || s === 'resolved';
  }

  isPharmacistProductAssignedPendingBlue(n: AdminNotification): boolean {
    return this.isPharmacistProductAssignedNotice(n) && !this.isPharmacistProductOutcomeGreen(n);
  }

  pharmacistProductOutcomeTagLabel(n: AdminNotification): string {
    if (!this.isPharmacistProductOutcomeGreen(n)) return '';
    return 'Đã hoàn thành';
  }

  /** Tư vấn sản phẩm: tên dược sĩ được phân công (admin view). */
  productAssignedPharmacistLabel(n: AdminNotification): string {
    const name = String(n.assignedPharmacistName || '').trim();
    if (name) return `Đã phân công dược sĩ ${name}`;
    if (String(n.assignedPharmacistId || '').trim()) return 'Đã phân công dược sĩ';
    return '';
  }

  /** Dòng đơn thuốc cần theo dõi tiến trình tư vấn (admin + dược sĩ). */
  isPrescriptionTrackingNotice(n: AdminNotification): boolean {
    if (this.isPharmacistPrescriptionAssignedRow(n)) return true;
    return n.type === 'consultation_prescription' && !!n.prescriptionPharmacistAssigned;
  }

  /** Đã tư vấn xong hoặc đã huỷ — nền xanh lá + tag. */
  isPharmacistPrescriptionOutcomeGreen(n: AdminNotification): boolean {
    if (!this.isPrescriptionTrackingNotice(n)) return false;
    const s = String(n.prescriptionConsultStatus || '').toLowerCase();
    return s === 'advised' || s === 'cancelled';
  }

  /** Chưa liên lạc được — nền vàng + tag. */
  isPharmacistPrescriptionOutcomeYellow(n: AdminNotification): boolean {
    if (!this.isPrescriptionTrackingNotice(n)) return false;
    return String(n.prescriptionConsultStatus || '').toLowerCase() === 'unreachable';
  }

  /** Tư vấn thất bại — nền đỏ + tag đỏ. */
  isPharmacistPrescriptionOutcomeRed(n: AdminNotification): boolean {
    if (!this.isPrescriptionTrackingNotice(n)) return false;
    return String(n.prescriptionConsultStatus || '').toLowerCase() === 'consultation_failed';
  }

  /** Phân công nhưng chưa tới trạng thái kết quả (xanh/vàng) — nền xanh dương nhạt như pending. */
  isPharmacistPrescriptionAssignedPendingBlue(n: AdminNotification): boolean {
    return (
      this.isPrescriptionTrackingNotice(n) &&
      !this.isPharmacistPrescriptionOutcomeGreen(n) &&
      !this.isPharmacistPrescriptionOutcomeYellow(n) &&
      !this.isPharmacistPrescriptionOutcomeRed(n)
    );
  }

  showPharmacistPrescriptionOutcomeTags(n: AdminNotification): boolean {
    return this.isPharmacistPrescriptionOutcomeGreen(n)
      || this.isPharmacistPrescriptionOutcomeYellow(n)
      || this.isPharmacistPrescriptionOutcomeRed(n);
  }

  pharmacistPrescriptionOutcomeTagLabel(n: AdminNotification): string {
    const s = String(n.prescriptionConsultStatus || '').toLowerCase();
    if (s === 'advised') return 'Đã tư vấn';
    if (s === 'consultation_failed') return 'Tư vấn thất bại';
    if (s === 'unreachable') return 'Chưa liên lạc được';
    if (s === 'cancelled') return 'Đã huỷ';
    return '';
  }

  /** Tư vấn bệnh đã có phản hồi chính thức — dùng nền xanh lá + nhãn riêng. */
  isConsultationDiseaseDone(n: AdminNotification): boolean {
    return n.type === 'consultation_disease' && !!n.consultationDiseaseResolved;
  }

  /** Đơn tư vấn thuốc: admin đã phân công dược sĩ (đồng bộ từ consultations_prescription). */
  isPrescriptionPharmacistAssigned(n: AdminNotification): boolean {
    return n.type === 'consultation_prescription' && !!n.prescriptionPharmacistAssigned;
  }

  /** Tag xanh cố định (tên dược sĩ hiển thị riêng tag đỏ bên dưới). */
  diseaseConsultedStatusLabel(): string {
    return 'Đã tư vấn bởi dược sĩ';
  }

  /**
   * Tên dược sĩ trả lời — hiển thị tag đỏ dưới tag trạng thái; rỗng nếu DB chưa có tên cụ thể.
   */
  diseaseConsultPharmacistName(n: AdminNotification): string {
    const name = String(n.consultedByPharmacistName || '').trim();
    if (!name || name === 'Dược sĩ' || name === 'Admin') return '';
    return name;
  }

  /**
   * Giao diện hàng thông báo: pending | đã xác nhận (confirmed/shipping) | đã xử lý xong (đã giao, huỷ, …).
   * Luồng phổ biến: pending → shipping một bước → coi như “đã xác nhận”.
   */
  noticeRowPhase(n: AdminNotification): 'pending' | 'confirmed' | 'done' {
    if (!this.isEffectivelyResolved(n)) return 'pending';
    if (n.type !== 'order_pending') return 'done';
    const s = String(n.orderStatus || '').trim().toLowerCase();
    if (s === 'confirmed' || s === 'shipping') return 'confirmed';
    return 'done';
  }

  resolvedTagLabel(n: AdminNotification): string {
    if (this.isConsultationDiseaseDone(n)) return this.diseaseConsultedStatusLabel();
    if (this.showPharmacistPrescriptionOutcomeTags(n)) return this.pharmacistPrescriptionOutcomeTagLabel(n);
    // Admin - product consultation flow: keep pair "Đã phân công" + "Đã hoàn thành".
    if (!this.isPharmacist && this.isProductPharmacistAssignedRow(n) && this.isEffectivelyResolved(n)) {
      return 'Đã hoàn thành';
    }
    return this.noticeRowPhase(n) === 'confirmed' ? 'Đã xác nhận' : 'Đã xử lý';
  }

  /** Đơn đã giao (hoặc khách đã nhận / hoàn tất) — hiện 2 tag: Đã xác nhận + Đã giao. */
  showOrderDeliveredTagStack(n: AdminNotification): boolean {
    if (n.type !== 'order_pending' || !this.isEffectivelyResolved(n)) return false;
    const s = String(n.orderStatus || '').trim().toLowerCase();
    return Notice.DELIVERED_ORDER_STATUSES.has(s);
  }

  private static readonly DELIVERED_ORDER_STATUSES = new Set([
    'delivered',
    'unreview',
    'reviewed',
    'completed',
    'received',
  ]);

  private markRead(id: string): void {
    const sid = String(id);
    if (this.readIds.has(sid)) return;
    this.readIds = new Set(this.readIds).add(sid);
    this.persistIdSet(this.readIdsKey, this.readIds);
    this.computeUnread();
    this.syncUnreadSnapshotAfterLocalChange();
    this.cdr.detectChanges();
  }

  get drawerTabs(): NoticeDrawerTabItem[] {
    const head: Omit<NoticeDrawerTabItem, 'count'>[] = [
      { id: 'all', label: 'Tất cả' },
      { id: 'urgent', label: 'Cần giải quyết' },
      { id: 'product', label: 'Sản phẩm' },
    ];
    // Đơn mới từ user chỉ admin_notice; dược sĩ chỉ thấy tab Đơn thuốc khi có thông báo phân công (consultation_prescription_assigned).
    const defs: Omit<NoticeDrawerTabItem, 'count'>[] = this.isPharmacist
      ? [...head, { id: 'disease', label: 'Tư vấn bệnh' }, { id: 'prescription', label: 'Đơn thuốc' }]
      : [...head, { id: 'order', label: 'Đơn hàng' }, { id: 'prescription', label: 'Đơn thuốc' }];
    return defs.map((d) => ({
      ...d,
      count: this.drawerNotificationCountForTab(d.id),
    }));
  }

  get drawerEmptyMessage(): string {
    const map: Record<NoticeDrawerTab, string> = {
      all: 'Không có thông báo.',
      urgent: 'Không có thông báo cần giải quyết.',
      product: 'Không có thông báo nhóm Sản phẩm.',
      order: 'Không có thông báo Đơn hàng.',
      prescription: 'Không có thông báo Đơn thuốc.',
      disease: 'Không có thông báo Tư vấn bệnh.',
    };
    return map[this.drawerTab] ?? 'Không có dữ liệu.';
  }

  get filteredDrawerItems(): AdminNotification[] {
    const all = this.drawerNotifications || [];
    return all.filter((n) => this.notificationMatchesDrawerTab(n, this.drawerTab));
  }

  /**
   * Đếm trên tab: chỉ thông báo còn cần xử lý (chưa “Đã xử lý” / chưa autoResolved).
   * Không dùng trạng thái đã đọc: chỉ xem danh sách hoặc đã bấm qua trước đó sẽ không kéo số tab về 0 nhầm.
   * Số chưa đọc vẫn nằm ở badge chuông (`unreadCount`).
   */
  drawerNotificationCountForTab(tab: NoticeDrawerTab): number {
    const all = this.drawerNotifications || [];
    return all.filter(
      (n) =>
        this.notificationMatchesDrawerTab(n, tab) && !this.isEffectivelyResolved(n)
    ).length;
  }

  private notificationMatchesDrawerTab(n: AdminNotification, tab: NoticeDrawerTab): boolean {
    const t = String(n.type || '').trim().toLowerCase();
    const isProduct =
      t === 'consultation_product' ||
      t === 'consultation_product_assigned' ||
      t === 'product_consultation';
    const isOrder =
      t === 'order_pending' || t === 'order_return' || t === 'order_processing_return';
    const isPrescriptionAdmin =
      t === 'consultation_prescription' || t === 'prescription_consultation' || t === 'prescription_pending';
    const isPrescriptionPharmacist =
      t === 'consultation_prescription_assigned' || t === 'consultation_prescription_reminder';
    const isDisease =
      t === 'consultation_disease' || t === 'disease_consultation';
    switch (tab) {
      case 'all':
        return true;
      case 'urgent':
        // Đã phân công tư vấn sản phẩm thì chuyển hẳn sang nhóm "Sản phẩm", không nằm trong "Cần giải quyết".
        if (this.isProductPharmacistAssignedRow(n)) return false;
        return !this.isEffectivelyResolved(n);
      case 'product':
        return isProduct;
      case 'order':
        return isOrder;
      case 'prescription':
        return this.isPharmacist
          ? isPrescriptionPharmacist
          : isPrescriptionAdmin;
      case 'disease':
        return isDisease;
      default:
        return true;
    }
  }

  /** Phản hồi sau khi admin gán/phân công từ trang con — cập nhật drawer ngay nếu đang mở. */
  @HostListener('window:notice-refresh')
  onNoticeRefresh(): void {
    this.loadNotifications();
    if (this.drawerOpen) {
      this.loadDrawerNotifications();
    }
  }

  setDrawerTab(tab: NoticeDrawerTab): void {
    if (!this.drawerTabs.some((x) => x.id === tab)) return;
    this.drawerTab = tab;
    this.cdr.detectChanges();
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  viewAll(event?: Event): void {
    event?.stopPropagation();
    this.isDropdownOpen = false;
    this.drawerOpen = true;
    this.drawerTab = 'all';
    this.loadDrawerNotifications();
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    this.loadNotifications();
  }

  private loadDrawerNotifications(): void {
    this.drawerLoading = true;
    this.noticeService.getNotifications(50).subscribe({
      next: (res) => {
        this.drawerLoading = false;
        if (!res.success) return;
        const raw = res.data || [];
        this.drawerNotifications = this.isPharmacist
          ? raw.filter((n) => n.type !== 'consultation_prescription')
          : raw.filter((n) => n.type !== 'consultation_disease');
        this.cdr.detectChanges();
      },
      error: () => {
        this.drawerLoading = false;
      },
    });
  }

  openItem(item: AdminNotification, fromDrawer = false): void {
    this.markRead(item._id);
    if (fromDrawer) {
      this.closeDrawer();
    }
    this.isDropdownOpen = false;
    if (item.link) {
      // Force refresh-able navigation for routes that can stay on same component instance.
      if (item.link.startsWith('/admin/consultation-product')) {
        const url = new URL(item.link, window.location.origin);
        url.searchParams.set('refresh', String(Date.now()));
        this.router.navigateByUrl(`${url.pathname}${url.search}`);
        return;
      }
      this.router.navigateByUrl(item.link);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen) {
      this.closeDrawer();
    }
  }

  /** Tab admin được bật lại (chuyển từ tab khác về). */
  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.loadNotifications();
    }
  }

  /** Cửa sổ trình duyệt được focus lại (alt-tab về Chrome, bấm vào cửa sổ admin). */
  @HostListener('window:focus')
  onWindowFocus(): void {
    this.loadNotifications();
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.notice-wrapper')) {
      this.isDropdownOpen = false;
    }
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = {
      order_pending: 'Đơn chờ xác nhận',
      order_return: 'Trả / hoàn hàng',
      consultation_prescription: 'Tư vấn thuốc',
      consultation_prescription_assigned: 'Phân công tư vấn đơn thuốc',
      consultation_prescription_reminder: 'Nhắc nhở đơn thuốc',
      consultation_product: 'Tư vấn sản phẩm',
      consultation_product_assigned: 'Phân công tư vấn sản phẩm',
      consultation_disease: 'Tư vấn bệnh',
    };
    return map[type] || type;
  }

  prescriptionNoticeTypeLabel(n: AdminNotification): string {
    if (this.isPrescriptionPharmacistAssigned(n)) {
      const name = String(n.assignedPharmacistName || '').trim();
      return name ? `Đã phân công dược sĩ ${name}` : 'Đã phân công dược sĩ';
    }
    return this.typeLabel(n.type);
  }

  /** Icon Bootstrap Icons theo loại thông báo (dropdown). */
  dropdownTypeIconClass(type: string): string {
    const map: Record<string, string> = {
      order_pending: 'bi-bag-check-fill',
      order_return: 'bi-arrow-return-left',
      consultation_prescription: 'bi-capsule',
      consultation_prescription_assigned: 'bi-person-badge-fill',
      consultation_prescription_reminder: 'bi-bell-fill',
      consultation_product: 'bi-chat-square-text-fill',
      consultation_product_assigned: 'bi-person-badge-fill',
      consultation_disease: 'bi-heart-pulse-fill',
    };
    return map[type] || 'bi-bell-fill';
  }
}
