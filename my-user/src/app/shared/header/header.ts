import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ChangeDetectorRef,
  NgZone,
  inject,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { timeout, catchError, filter, map } from 'rxjs/operators';
import { of, Subscription, forkJoin } from 'rxjs';

import { ProductService } from '../../core/services/product.service';
import { CategoryService } from '../../core/services/category.service';
import { AuthService } from '../../core/services/auth.service';
import { CartService, Cart, CartItem } from '../../core/services/cart.service';
import { CartSidebarService } from '../../core/services/cart-sidebar.service';
import { NoticeService } from '../../core/services/notice.service';
import { ReminderService } from '../../core/services/reminder.service';
import { ReminderBadgeService } from '../../core/services/reminder-badge.service';
import { BlogPopupService } from '../../core/services/blog-popup.service';
import { isHelpfulLikeNotice, type NoticeItem } from '../../features/accounts/notice/notice';
import { HOME_URL } from '../../core/constants/navigation.constants';
import { getLocalIcon } from './header-icons';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements OnInit, AfterViewInit, OnDestroy {
  private router = inject(Router);
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  readonly authService = inject(AuthService);
  private cartService = inject(CartService);
  private cartSidebarService = inject(CartSidebarService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private noticeService = inject(NoticeService);
  private reminderService = inject(ReminderService);
  private reminderBadgeService = inject(ReminderBadgeService);
  private blogPopupService = inject(BlogPopupService);
  private notificationPopupsScheduled = false;

  /** Dropdown chuông: nhận diện thông báo "Hữu ích" (template). */
  readonly bellHelpfulLikeNotice = isHelpfulLikeNotice;

  search_value = '';
  cart_count = 0;
  cart: Cart | null = null;
  isCartHoverVisible = false;
  isNotifyHoverVisible = false;
  unreadNotifyCount = 0;
  notificationsPreview: NoticeItem[] = [];
  /** Danh sách thông báo đầy đủ để "Xem thêm" (tối ưu: chỉ slice ra UI). */
  private notificationsAll: NoticeItem[] = [];
  /** Số lượng đang hiển thị trong dropdown bell. */
  private notificationsLimit = 5;
  private readonly notificationsStep = 5;
  notificationsLoading = false;
  notificationsError: string | null = null;
  /** Nhắc uống thuốc quá hạn (từ API) — popup thanh ngắn bên phải */
  showReminderPopup = false;
  /** Đang chạy hiệu ứng đóng (trượt ra) trước khi ẩn hẳn */
  reminderPopupClosing = false;
  medicationDueList: NoticeItem[] = [];
  /** Đang gửi "ghi nhận đã uống" để tránh double submit */
  reminderMarkingComplete = false;
  /** Popup đơn thuốc — hiện sau 5s, đóng sau 3s; trên UI xếp giữa (dưới đơn hàng, trên nhắc uống thuốc) */
  prescriptionNoticeList: NoticeItem[] = [];
  showPrescriptionPopup = false;
  prescriptionPopupClosing = false;
  private prescriptionPopupTimeout: ReturnType<typeof setTimeout> | null = null;
  private prescriptionPopupAutoCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Popup đơn hàng — hiện sau 6s, đóng sau 3s; trên UI nằm trên cùng trong cột thông báo bên phải */
  orderNoticeList: NoticeItem[] = [];
  showOrderPopup = false;
  orderPopupClosing = false;
  private orderPopupTimeout: ReturnType<typeof setTimeout> | null = null;
  private orderPopupAutoCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly PRESCRIPTION_POPUP_DELAY_MS = 5000;
  private readonly ORDER_POPUP_DELAY_MS = 6000;
  isAccountDropdownVisible = false;
  private accountDropdownTimeout: ReturnType<typeof setTimeout> | null = null;
  private cartHoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private notifyHoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private cartCountSub?: Subscription;
  private cartUpdatedSub?: Subscription;
  private reminderPopupTimeout: ReturnType<typeof setTimeout> | null = null;
  private reminderPopupAutoCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Mỗi khung tím hiển thị ~6s rồi tự gọi dismiss (trượt ra phải). Khoảng 5–7s. */
  private readonly NOTIFY_BAR_VISIBLE_MS = 6000;
  /** Khớp với `vc_reminder_bar_out` trong header.css — chờ hết trượt mới gỡ *ngIf. */
  private readonly NOTIFY_BAR_SLIDE_OUT_MS = 580;

  isHeaderCompact = false;
  private headerEl: HTMLElement | null = null;
  private rafId: number | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScrollY = 0;
  // Ngưỡng scroll để chuyển trạng thái header theo hướng cuộn (giảm jitter)
  private readonly TOP_EXPAND_Y = 40; // gần đầu trang: luôn header nguyên bản
  private readonly COMPACT_TRIGGER_Y = 90; // cuộn xuống sâu hơn mức này thì thu gọn
  private readonly SCROLL_DIRECTION_DEADZONE = 6; // bỏ qua dao động nhỏ để tránh nhấp nháy

  activePill: string | null = null;

  recentSearches: string[] = [];
  isSearchFocused = false;
  search_mode: 'product' | 'article' = 'product';

  main_nav = [
    'Omega 3',
    'Men vi sinh',
    'Dung dịch vệ sinh',
    'Kẽm',
    'Thuốc nhỏ mắt',
    'Sữa rửa mặt',
    'Sắt',
    'Vitamin C',
    'Siro'
  ];
  trendingKeywords = [
    'Canxi',
    'Vitamin tổng hợp',
    'Omega 3',
    'Kẽm',
    'Men vi sinh',
    'Thuốc nhỏ mắt',
    'Dung dịch vệ sinh',
    'Sữa rửa mặt',
    'Sắt',
    'Kem chống nắng',
    'Siro ho'
  ];

  hotDeals: any[] = [];
  searchBanner = 'assets/icon/banner.png';

  // ...

  onMainNavClick(e: Event, item: string): void {
    e.preventDefault();
    this.search_value = item;
    this.onSearch();
  }

  category_pills: string[] = [
    'Thực phẩm chức năng',
    'Dược mỹ phẩm',
    'Thuốc',
    'Chăm sóc cá nhân',
    'Thiết bị y tế',
    'Bệnh & Góc sức khỏe',
    'Hệ thống nhà thuốc'
  ];

  orderedL2Names = [
    'Vitamin & Khoáng chất',
    'Sinh lý - Nội tiết tố',
    'Tăng cường chức năng',
    'Hỗ trợ điều trị',
    'Hỗ trợ tiêu hóa',
    'Thần kinh não',
    'Hỗ trợ làm đẹp',
    'Sức khoẻ tim mạch',
    'Dinh dưỡng'
  ];

  hoveredCategory: string | null = null;
  activeSubCategory: string | null = null;
  alphabet: string[] = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' ');

  private menuTimeout: any;

  megaMenuData: any = {};

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user && (user as any).user_id) {
        const uid = (user as any).user_id as string;
        this.fetchCart(uid);
        this.resetNotificationsState();
        this.fetchNotificationsPreview(uid, true);
      } else {
        // Khách vãng lai: hiển thị cart từ session, không bắt login
        const guestItems = this.cartService.getGuestCartItems();
        this.cart = {
          user_id: 'guest',
          items: guestItems,
          itemCount: guestItems.length,
          totalQuantity: guestItems.reduce((s, i) => s + (i.quantity || 1), 0),
        } as Cart;
        this.cart_count = guestItems.length;
        this.cartService.setCartCount(guestItems.length);
        this.resetNotificationsState();
      }
    });
    effect(() => {
      if (this.blogPopupService.dismissed()) {
        this.tryScheduleNotificationPopups(true);
      }
    });
  }

  ngOnInit(): void {
    this.fetchCategoriesAndBuildMenu();
    this.syncSearchWithValue();
    this.loadRecentSearches();

    this.router.events.subscribe(() => {
      this.syncSearchWithValue();
    });

    this.fetchHotDeals();

    this.cartCountSub = this.cartService.cartCount$.subscribe(count => {
      this.cart_count = count;
      this.cdr.markForCheck();
    });

    this.cartUpdatedSub = this.cartService.cartUpdated$.subscribe(cart => {
      if (cart) {
        this.cart = cart as Cart;
        this.cart_count = (cart.items || []).length;
        this.cdr.detectChanges();
      }
    });

    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((e) => {
      this.updateActivePill(e.urlAfterRedirects || e.url);
      const uid = (this.authService.currentUser() as { user_id?: string })?.user_id;
      if (uid) {
        this.fetchNotificationsPreview(uid, true);
      }
    });

    // Listen for manual notification refreshes
    this.noticeService.refresh$.subscribe(() => {
      const uid = (this.authService.currentUser() as { user_id?: string })?.user_id;
      if (uid) {
        this.fetchNotificationsPreview(uid, true);
      }
    });

    this.updateActivePill(this.router.url);
  }

  ngAfterViewInit(): void {
    this.headerEl = document.querySelector('.vc_header') as HTMLElement | null;
    if (!this.headerEl) return;

    this.zone.runOutsideAngular(() => {
      this.headerEl?.classList.add('vc_header_fixed');
      this.lastScrollY = window.scrollY || document.documentElement?.scrollTop || 0;
      setTimeout(() => {
        this.applyCompactState(this.lastScrollY);
        this.syncBodyPaddingTop();
        this.syncNotifyBarsOffset();
      }, 0);
      window.addEventListener('scroll', this.onWindowScroll, { passive: true });
      window.addEventListener('resize', this.onWindowResize, { passive: true });
    });
  }

  ngOnDestroy(): void {
    this.cartCountSub?.unsubscribe();
    this.cartUpdatedSub?.unsubscribe();
    if (this.reminderPopupTimeout) {
      clearTimeout(this.reminderPopupTimeout);
      this.reminderPopupTimeout = null;
    }
    if (this.reminderPopupAutoCloseTimeout) {
      clearTimeout(this.reminderPopupAutoCloseTimeout);
      this.reminderPopupAutoCloseTimeout = null;
    }
    if (this.prescriptionPopupTimeout) {
      clearTimeout(this.prescriptionPopupTimeout);
      this.prescriptionPopupTimeout = null;
    }
    if (this.prescriptionPopupAutoCloseTimeout) {
      clearTimeout(this.prescriptionPopupAutoCloseTimeout);
      this.prescriptionPopupAutoCloseTimeout = null;
    }
    if (this.orderPopupTimeout) {
      clearTimeout(this.orderPopupTimeout);
      this.orderPopupTimeout = null;
    }
    if (this.orderPopupAutoCloseTimeout) {
      clearTimeout(this.orderPopupAutoCloseTimeout);
      this.orderPopupAutoCloseTimeout = null;
    }
    window.removeEventListener('scroll', this.onWindowScroll as any);
    window.removeEventListener('resize', this.onWindowResize as any);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    document.body.style.paddingTop = '';
    document.documentElement.style.removeProperty('--vc-notify-bars-top');
  }

  private onWindowScroll = (): void => {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      this.applyCompactState(y);
    });
  };

  private onWindowResize = (): void => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.syncBodyPaddingTop();
      this.syncNotifyBarsOffset();
    }, 80);
  };

  private applyCompactState(scrollY: number): void {
    const deltaY = scrollY - this.lastScrollY;
    const scrollingDown = deltaY > this.SCROLL_DIRECTION_DEADZONE;
    const scrollingUp = deltaY < -this.SCROLL_DIRECTION_DEADZONE;
    this.lastScrollY = scrollY;

    let nextCompact = this.isHeaderCompact;
    if (scrollY <= this.TOP_EXPAND_Y) {
      nextCompact = false;
    } else if ((window as any).isFilteringJump) {
      nextCompact = true;
    } else if (scrollingUp) {
      // Chỉ cần cuộn lên là mở lại header nguyên bản, không cần về đầu trang.
      nextCompact = false;
    } else if (scrollingDown && scrollY > this.COMPACT_TRIGGER_Y) {
      // Cuộn xuống thì chuyển sang header thu gọn.
      nextCompact = true;
    }

    if (nextCompact === this.isHeaderCompact) return;

    this.zone.run(() => {
      this.isHeaderCompact = nextCompact;
    });

    if (!this.headerEl) return;
    if (nextCompact) {
      this.headerEl.classList.add('vc_header_compact');
    } else {
      this.headerEl.classList.remove('vc_header_compact');
    }
    this.syncNotifyBarsOffset();
  }

  /** Căn khối thông báo tím bên phải ngay dưới mép dưới header (full / compact). */
  private syncNotifyBarsOffset(): void {
    if (!this.headerEl) return;
    requestAnimationFrame(() => {
      if (!this.headerEl) return;
      const bottom = Math.ceil(this.headerEl.getBoundingClientRect().bottom);
      document.documentElement.style.setProperty('--vc-notify-bars-top', `${bottom + 10}px`);
    });
  }

  private syncBodyPaddingTop(): void {
    if (!this.headerEl) return;
    const wasCompact = this.headerEl.classList.contains('vc_header_compact');
    if (wasCompact) {
      this.headerEl.classList.remove('vc_header_compact');
    }
    const h = this.headerEl.getBoundingClientRect().height;
    document.body.style.paddingTop = `${Math.ceil(h)}px`;
    if (wasCompact) {
      this.headerEl.classList.add('vc_header_compact');
    }
    this.syncNotifyBarsOffset();
  }

  updateActivePill(url: string): void {
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/^\/category\/([^/]+)/);
    if (!match) {
      this.activePill = null;
      return;
    }
    const slug = match[1];
    for (const pill of this.category_pills) {
      const rootData = this.megaMenuData[pill];
      if (!rootData) continue;
      if (rootData.slug === slug) {
        this.activePill = pill;
        return;
      }
      for (const subKey of Object.keys(rootData)) {
        const sub = rootData[subKey];
        if (sub && typeof sub === 'object' && sub.slug === slug) {
          this.activePill = pill;
          return;
        }
      }
    }
    this.activePill = null;
  }

  private fetchCart(userId: string): void {
    this.cartService.getCart(userId).subscribe((res) => {
      if (res.success && res.cart) {
        this.cart = res.cart;
        this.cart_count = (this.cart.items || []).length;
        this.cartService.setCartCount(this.cart_count);
        let tp = 0;
        if (this.cart.items) {
          this.cart.items.forEach((item) => {
            tp += (item.price || 0) * (item.quantity || 1);
          });
        }
        (this.cart as any).totalPrice = tp;
        this.cdr.detectChanges();
      }
    });
  }

  get limitedCartItems(): CartItem[] {
    return this.cart?.items?.slice(0, 10) || [];
  }

  onCartMouseEnter(): void {
    if (this.cartHoverTimeout) {
      clearTimeout(this.cartHoverTimeout);
      this.cartHoverTimeout = null;
    }
    this.isCartHoverVisible = true;
    this.cdr.markForCheck();
  }

  onCartMouseLeave(): void {
    this.cartHoverTimeout = setTimeout(() => {
      this.isCartHoverVisible = false;
      this.cartHoverTimeout = null;
      this.cdr.markForCheck();
    }, 150);
  }

  onAccountMouseEnter(): void {
    if (this.accountDropdownTimeout) clearTimeout(this.accountDropdownTimeout);
    this.isAccountDropdownVisible = true;
  }

  onAccountMouseLeave(): void {
    this.isAccountDropdownVisible = false;
  }

  onNotifyMouseEnter(): void {
    if (this.notifyHoverTimeout) {
      clearTimeout(this.notifyHoverTimeout);
      this.notifyHoverTimeout = null;
    }
    this.isNotifyHoverVisible = true;
    const user = this.authService.currentUser();
    const uid = (user as any)?.user_id as string | undefined;
    if (uid && !this.notificationsLoading) {
      this.fetchNotificationsPreview(uid, false);
    }
    this.cdr.markForCheck();
  }

  onNotifyMouseLeave(): void {
    this.notifyHoverTimeout = setTimeout(() => {
      this.isNotifyHoverVisible = false;
      this.cdr.markForCheck();
    }, 150);
  }

  private resetNotificationsState(): void {
    if (this.reminderPopupTimeout) {
      clearTimeout(this.reminderPopupTimeout);
      this.reminderPopupTimeout = null;
    }
    if (this.reminderPopupAutoCloseTimeout) {
      clearTimeout(this.reminderPopupAutoCloseTimeout);
      this.reminderPopupAutoCloseTimeout = null;
    }
    if (this.prescriptionPopupTimeout) {
      clearTimeout(this.prescriptionPopupTimeout);
      this.prescriptionPopupTimeout = null;
    }
    if (this.prescriptionPopupAutoCloseTimeout) {
      clearTimeout(this.prescriptionPopupAutoCloseTimeout);
      this.prescriptionPopupAutoCloseTimeout = null;
    }
    if (this.orderPopupTimeout) {
      clearTimeout(this.orderPopupTimeout);
      this.orderPopupTimeout = null;
    }
    if (this.orderPopupAutoCloseTimeout) {
      clearTimeout(this.orderPopupAutoCloseTimeout);
      this.orderPopupAutoCloseTimeout = null;
    }
    this.isNotifyHoverVisible = false;
    this.unreadNotifyCount = 0;
    this.notificationsPreview = [];
    this.notificationsAll = [];
    this.notificationsLimit = 5;
    this.notificationsLoading = false;
    this.notificationsError = null;
    this.showReminderPopup = false;
    this.medicationDueList = [];
    this.reminderBadgeService.setReminderDueCount(0, []);
    this.showPrescriptionPopup = false;
    this.prescriptionNoticeList = [];
    this.showOrderPopup = false;
    this.orderNoticeList = [];
    this.notificationPopupsScheduled = false;
    this.cdr.markForCheck();
  }

  private static REMINDER_ACK_KEY = 'vc_reminder_ack';
  private static PRESCRIPTION_POPUP_ACK_KEY = 'vc_prescription_popup_ack';
  private static ORDER_POPUP_ACK_KEY = 'vc_order_popup_ack';

  /** Đã ghi nhận/đóng popup trong phiên này (theo origin) → không nhắc lại; mở cổng khác = origin khác = nhắc lại. */
  private getReminderAckSession(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(HeaderComponent.REMINDER_ACK_KEY) === '1';
  }

  private setReminderAckSession(): void {
    try {
      sessionStorage.setItem(HeaderComponent.REMINDER_ACK_KEY, '1');
    } catch (_) { }
    this.reminderBadgeService.setPopupAcked();
  }

  private getPrescriptionPopupAckSession(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(HeaderComponent.PRESCRIPTION_POPUP_ACK_KEY) === '1';
  }
  private setPrescriptionPopupAckSession(): void {
    try {
      sessionStorage.setItem(HeaderComponent.PRESCRIPTION_POPUP_ACK_KEY, '1');
    } catch (_) { }
  }
  private getOrderPopupAckSession(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(HeaderComponent.ORDER_POPUP_ACK_KEY) === '1';
  }
  private setOrderPopupAckSession(): void {
    try {
      sessionStorage.setItem(HeaderComponent.ORDER_POPUP_ACK_KEY, '1');
    } catch (_) { }
  }

  /** Chạy hiệu ứng đóng (trượt ra) rồi gọi callback (nếu có). */
  private runReminderPopupCloseAnimation(callback?: () => void): void {
    if (this.reminderPopupAutoCloseTimeout) {
      clearTimeout(this.reminderPopupAutoCloseTimeout);
      this.reminderPopupAutoCloseTimeout = null;
    }
    if (this.reminderPopupClosing) return;
    if (!this.showReminderPopup) {
      callback?.();
      this.cdr.markForCheck();
      return;
    }
    this.reminderPopupClosing = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.showReminderPopup = false;
      this.reminderPopupClosing = false;
      callback?.();
      this.cdr.markForCheck();
    }, this.NOTIFY_BAR_SLIDE_OUT_MS);
  }

  dismissReminderPopup(): void {
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    const ids = this.medicationDueList
      .map((n) => n.id)
      // reminder-due-* là notice "ảo" (sinh động từ reminders), không tồn tại trong DB → tránh gọi markAsRead để khỏi 404
      .filter((id) => !String(id || '').startsWith('reminder-due-'));
    this.runReminderPopupCloseAnimation(() => {
      this.setReminderAckSession();
      if (userId && ids.length) {
        ids.forEach((id) =>
          this.noticeService.markAsRead(id, userId).subscribe({ error: () => { } })
        );
      }
    });
  }

  private runPrescriptionPopupCloseAnimation(callback?: () => void): void {
    if (this.prescriptionPopupAutoCloseTimeout) {
      clearTimeout(this.prescriptionPopupAutoCloseTimeout);
      this.prescriptionPopupAutoCloseTimeout = null;
    }
    if (this.prescriptionPopupClosing) return;
    if (!this.showPrescriptionPopup) {
      callback?.();
      this.cdr.markForCheck();
      return;
    }
    this.prescriptionPopupClosing = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.showPrescriptionPopup = false;
      this.prescriptionPopupClosing = false;
      callback?.();
      this.cdr.markForCheck();
    }, this.NOTIFY_BAR_SLIDE_OUT_MS);
  }

  dismissPrescriptionPopup(): void {
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    const ids = this.prescriptionNoticeList.map((n) => n.id);
    this.runPrescriptionPopupCloseAnimation(() => {
      this.setPrescriptionPopupAckSession();
      if (userId && ids.length) {
        ids.forEach((id) =>
          this.noticeService.markAsRead(id, userId).subscribe({ error: () => { } })
        );
      }
    });
  }

  goToPrescriptionFromPopup(e: Event): void {
    e.preventDefault();
    this.runPrescriptionPopupCloseAnimation(() => {
      this.setPrescriptionPopupAckSession();
      this.router.navigate(['/account'], { queryParams: { menu: 'prescriptions' } });
    });
  }

  private runOrderPopupCloseAnimation(callback?: () => void): void {
    if (this.orderPopupAutoCloseTimeout) {
      clearTimeout(this.orderPopupAutoCloseTimeout);
      this.orderPopupAutoCloseTimeout = null;
    }
    if (this.orderPopupClosing) return;
    if (!this.showOrderPopup) {
      callback?.();
      this.cdr.markForCheck();
      return;
    }
    this.orderPopupClosing = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.showOrderPopup = false;
      this.orderPopupClosing = false;
      callback?.();
      this.cdr.markForCheck();
    }, this.NOTIFY_BAR_SLIDE_OUT_MS);
  }

  dismissOrderPopup(): void {
    this.runOrderPopupCloseAnimation(() => {
      this.setOrderPopupAckSession();
    });
  }

  goToOrderFromPopup(e: Event): void {
    e.preventDefault();
    this.runOrderPopupCloseAnimation(() => {
      this.setOrderPopupAckSession();
      this.router.navigate(['/account'], { queryParams: { menu: 'orders' } });
    });
  }

  /**
   * Lên lịch 3 popup (nhắc lịch, đơn thuốc, đơn hàng) chỉ khi popup "Có thể bạn chưa biết?" đã đóng/xem.
   * Chỉ hiện các thông báo chưa đọc (lists đã filter ở subscribe).
   */
  tryScheduleNotificationPopups(mayShowReminderPopup = true): void {
    if (!this.blogPopupService.dismissed()) return;
    if (this.notificationPopupsScheduled) return;

    if (this.reminderPopupTimeout) {
      clearTimeout(this.reminderPopupTimeout);
      this.reminderPopupTimeout = null;
    }
    if (this.prescriptionPopupTimeout) {
      clearTimeout(this.prescriptionPopupTimeout);
      this.prescriptionPopupTimeout = null;
    }
    if (this.orderPopupTimeout) {
      clearTimeout(this.orderPopupTimeout);
      this.orderPopupTimeout = null;
    }

    let didSchedule = false;
    if (
      mayShowReminderPopup &&
      this.medicationDueList.length > 0 &&
      !this.getReminderAckSession()
    ) {
      didSchedule = true;
      this.reminderPopupTimeout = setTimeout(() => {
        this.reminderPopupTimeout = null;
        this.showReminderPopup = true;
        this.cdr.markForCheck();
        if (this.reminderPopupAutoCloseTimeout) {
          clearTimeout(this.reminderPopupAutoCloseTimeout);
          this.reminderPopupAutoCloseTimeout = null;
        }
        this.reminderPopupAutoCloseTimeout = setTimeout(() => {
          this.reminderPopupAutoCloseTimeout = null;
          this.dismissReminderPopup();
        }, this.NOTIFY_BAR_VISIBLE_MS);
      }, 4000);
    }
    if (this.prescriptionNoticeList.length > 0 && !this.getPrescriptionPopupAckSession()) {
      didSchedule = true;
      this.prescriptionPopupTimeout = setTimeout(() => {
        this.prescriptionPopupTimeout = null;
        this.showPrescriptionPopup = true;
        this.cdr.markForCheck();
        if (this.prescriptionPopupAutoCloseTimeout) {
          clearTimeout(this.prescriptionPopupAutoCloseTimeout);
          this.prescriptionPopupAutoCloseTimeout = null;
        }
        this.prescriptionPopupAutoCloseTimeout = setTimeout(() => {
          this.prescriptionPopupAutoCloseTimeout = null;
          this.dismissPrescriptionPopup();
        }, this.NOTIFY_BAR_VISIBLE_MS);
      }, this.PRESCRIPTION_POPUP_DELAY_MS);
    }
    if (this.orderNoticeList.length > 0 && !this.getOrderPopupAckSession()) {
      didSchedule = true;
      this.orderPopupTimeout = setTimeout(() => {
        this.orderPopupTimeout = null;
        this.showOrderPopup = true;
        this.cdr.markForCheck();
        if (this.orderPopupAutoCloseTimeout) {
          clearTimeout(this.orderPopupAutoCloseTimeout);
          this.orderPopupAutoCloseTimeout = null;
        }
        this.orderPopupAutoCloseTimeout = setTimeout(() => {
          this.orderPopupAutoCloseTimeout = null;
          this.dismissOrderPopup();
        }, this.NOTIFY_BAR_VISIBLE_MS);
      }, this.ORDER_POPUP_DELAY_MS);
    }
    if (didSchedule) {
      this.notificationPopupsScheduled = true;
    }
  }

  /** Một dòng cho thanh ngang: "Bạn có 2 lời nhắc uống thuốc lúc 08:00, 14:00" */
  get reminderBannerLine(): string {
    const list = this.medicationDueList;
    if (!list.length) return '';
    const times = [
      ...new Set(
        list.map((n) => {
          const meta = n.meta || '';
          const t = meta.split('·')[0]?.trim() || '';
          if (/^\d{1,2}:\d{2}$/.test(t)) return t;
          const m = (n.message || '').match(/lịch\s+(\d{1,2}:\d{2})/i);
          return m ? m[1] : '';
        }).filter(Boolean),
      ),
    ].sort() as string[];
    const timeStr = times.length ? times.join(', ') : 'hôm nay';
    const n = list.length;
    if (n === 1) {
      return `Bạn có 1 lời nhắc uống thuốc lúc ${timeStr}.`;
    }
    return `Bạn có ${n} lời nhắc uống thuốc lúc ${timeStr}.`;
  }

  get prescriptionBannerLine(): string {
    const n = this.prescriptionNoticeList.length;
    if (n === 0) return '';
    return n === 1
      ? 'Bạn có 1 thông báo về đơn thuốc.'
      : `Bạn có ${n} thông báo về đơn thuốc.`;
  }

  get orderBannerLine(): string {
    const n = this.orderNoticeList.length;
    if (n === 0) return '';
    return n === 1
      ? 'Bạn có 1 thông báo về đơn hàng.'
      : `Bạn có ${n} thông báo về đơn hàng.`;
  }

  /** Parse notice id "reminder-due-<rid>-<YYYY>-<MM>-<DD>-<HHmm>" → { reminderId, date, time }. */
  private parseReminderDueId(id: string): { reminderId: string; date: string; time: string } | null {
    if (!id || !id.startsWith('reminder-due-')) return null;
    const parts = id.split('-');
    // reminder-due-<24charId>-YYYY-MM-DD-HHmm
    if (parts.length < 7) return null;
    const reminderId = parts[2];
    const date = `${parts[3]}-${parts[4]}-${parts[5]}`;
    const t = parts[6] || '';
    const time = t.length >= 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : '08:00';
    return { reminderId, date, time };
  }

  /** Lấy giờ (HH:mm) lên lịch từ notice medication_reminder; trả về null nếu không parse được. */
  private getReminderScheduledTime(n: NoticeItem): string | null {
    const parsed = this.parseReminderDueId(n.id);
    if (parsed) return parsed.time;
    const meta = (n.meta || '').split('·')[0]?.trim() || '';
    if (/^\d{1,2}:\d{2}$/.test(meta)) return meta;
    const m = (n.message || '').match(/lịch\s+(\d{1,2}:\d{2})/i);
    return m ? m[1] : null;
  }

  private getNoticeTimeMs(n: NoticeItem): number {
    // 1) Prefer `time` from API if present
    if (n.time) {
      const ms = new Date(n.time).getTime();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }

    // 2) For medication reminders, parse due id to get exact hh:mm + date
    if (n.type === 'medication_reminder') {
      const parsed = this.parseReminderDueId(n.id);
      if (parsed) {
        const dueDate = new Date(`${parsed.date}T${parsed.time}:00+07:00`);
        const ms = dueDate.getTime();
        if (Number.isFinite(ms) && ms > 0) return ms;
      }
    }

    // 3) Fallback: parse hh:mm only (no date) -> return 0 so it will go last
    return 0;
  }

  /** Nhóm notice nhắc uống thuốc (bao gồm id reminder-due-* sinh động). */
  private isReminderNotice(n: NoticeItem): boolean {
    return n.type === 'medication_reminder' || String(n.id || '').startsWith('reminder-due-');
  }

  /**
   * Thời gian hiển thị ở bell dropdown: dạng "Vừa xong" / "10 phút" / "1 giờ" ...
   * Yêu cầu: màu xám + nằm cùng hàng với title.
   */
  formatBellRelativeTime(n: NoticeItem): string {
    const ms = this.getNoticeTimeMs(n);
    if (!ms) return '';

    const date = new Date(ms);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - date.getTime());

    const diffM = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffM < 1) return 'Vừa xong';
    if (diffM < 60) return `${diffM} phút`;
    if (diffH < 24) return `${diffH} giờ`;
    if (diffD < 7) return `${diffD} ngày`;

    // Với thông báo cũ hơn 7 ngày: hiển thị ngày (không dùng "trước" để đúng style người dùng).
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  getBellNoticeIcon(n: NoticeItem): string {
    const title = n.title || '';
    const message = n.message || '';

    if (isHelpfulLikeNotice(n)) return 'bi-hand-thumbs-up-fill';
    if (n.type === 'medication_reminder') return 'bi-alarm-fill';
    if (n.type === 'prescription_created') return 'bi-capsule-pill';
    if (n.type === 'prescription_updated') return 'bi-file-earmark-medical';
    if (n.type === 'review_reply') return 'bi-chat-dots-fill';
    if (n.type === 'qa_reply') return 'bi-chat-left-quote-fill';
    if (n.type === 'qa_submitted' || n.linkLabel === 'Xem phản hồi')
      return 'bi-chat-left-text-fill';
    if (n.type === 'order_updated' && (title.includes('Câu hỏi') || message.includes('câu hỏi'))) return 'bi-question-circle-fill';
    if (n.type === 'order_updated' && (title.includes('Đánh giá') || n.linkLabel === 'Xem đánh giá')) return 'bi-chat-dots';
    if (n.type === 'order_updated' && (title.includes('đang được giao') || message.includes('đang trên đường'))) return 'bi-truck';
    if (n.type === 'order_updated' && (title.includes('đã được giao') || message.includes('đã được giao thành công') || message.includes('vui lòng xác nhận nhận hàng'))) return 'bi-check-circle-fill';
    if (n.type === 'order_updated' && (title.includes('Bạn đã nhận hàng') || message.includes('xác nhận giao thành công') || message.includes('chờ bạn đánh giá'))) return 'bi-person-check-fill';
    if (n.type === 'order_created') return 'bi-box-seam-fill';
    if (n.type === 'order_updated') return 'bi-truck';
    return 'bi-bell';
  }

  getBellNoticeIconClass(n: NoticeItem): string {
    const title = n.title || '';
    const message = n.message || '';

    if (isHelpfulLikeNotice(n)) return 'vc_notify_icon--helpful';
    if (n.type === 'medication_reminder') return 'vc_notify_icon--remind';
    if (n.type === 'prescription_created' || n.type === 'prescription_updated') return 'vc_notify_icon--prescription';
    if (n.type === 'review_reply') return 'vc_notify_icon--evaluation';
    if (n.type === 'qa_reply' || n.type === 'qa_submitted' || n.linkLabel === 'Xem phản hồi')
      return 'vc_notify_icon--qa';
    if (n.type === 'order_updated' && (title.includes('Câu hỏi') || message.includes('câu hỏi'))) return 'vc_notify_icon--qa';
    if (n.type === 'order_updated' && (title.includes('Đánh giá') || n.linkLabel === 'Xem đánh giá')) return 'vc_notify_icon--evaluation';
    if (n.type === 'order_updated' && (title.includes('đang được giao') || message.includes('đang trên đường'))) return 'vc_notify_icon--order-delivering';
    if (n.type === 'order_updated' && (title.includes('đã được giao') || message.includes('đã giao thành công') || message.includes('xác nhận nhận hàng'))) return 'vc_notify_icon--order-delivered';
    if (n.type === 'order_updated' && (title.includes('Bạn đã nhận hàng') || message.includes('xác nhận giao thành công') || message.includes('chờ bạn đánh giá'))) return 'vc_notify_icon--order-received';
    if (n.type === 'order_created' || n.type === 'order_updated') return 'vc_notify_icon--order';
    return 'vc_notify_icon--default';
  }

  /** Chỉ giữ các lời nhắc trong cửa sổ ±60 phút: ví dụ lịch 15h chỉ hiện khi thời gian thực từ 14h đến 16h (chưa tick). */
  private filterReminderWithin60Minutes(list: NoticeItem[]): NoticeItem[] {
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const WINDOW_MIN = 60;
    return list.filter((n) => {
      const timeStr = this.getReminderScheduledTime(n);
      if (!timeStr) {
        const ms = this.getNoticeTimeMs(n);
        if (!ms) return false;
        const diffMin = Math.abs(now.getTime() - ms) / 60000;
        return diffMin <= WINDOW_MIN;
      }
      const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10) || 0);
      const slotMin = h * 60 + m;
      const low = Math.max(0, slotMin - WINDOW_MIN);
      const high = Math.min(23 * 60 + 59, slotMin + WINDOW_MIN);
      if (curMin >= low && curMin <= high) return true;

      // Fallback theo timestamp notice (nếu parse HH:mm không khớp/không có).
      const ms = this.getNoticeTimeMs(n);
      if (!ms) return false;
      const diffMin = Math.abs(now.getTime() - ms) / 60000;
      return diffMin <= WINDOW_MIN;
    });
  }

  openRemindFromPopup(e: Event): void {
    e.preventDefault();
    if (this.reminderMarkingComplete) return;
    if (this.reminderPopupAutoCloseTimeout) {
      clearTimeout(this.reminderPopupAutoCloseTimeout);
      this.reminderPopupAutoCloseTimeout = null;
    }
    const list = [...this.medicationDueList];
    const parsed = list
      .map((n) => this.parseReminderDueId(n.id))
      .filter((p): p is { reminderId: string; date: string; time: string } => p !== null);
    if (parsed.length > 0) {
      this.reminderMarkingComplete = true;
      this.cdr.markForCheck();
      forkJoin(
        parsed.map((p) =>
          this.reminderService.markComplete(p.reminderId, p.date, p.time).pipe(
            catchError(() => of({ success: false }))
          )
        )
      ).subscribe({
        next: () => {
          this.reminderMarkingComplete = false;
          this.runReminderPopupCloseAnimation(() => {
            this.setReminderAckSession();
            this.medicationDueList = [];
            this.router.navigate(['/account'], { queryParams: { menu: 'remind' } });
          });
        },
        error: () => {
          this.reminderMarkingComplete = false;
          this.runReminderPopupCloseAnimation(() => {
            this.setReminderAckSession();
            this.router.navigate(['/account'], { queryParams: { menu: 'remind' } });
          });
        },
      });
    } else {
      this.runReminderPopupCloseAnimation(() => {
        this.setReminderAckSession();
        this.router.navigate(['/account'], { queryParams: { menu: 'remind' } });
      });
    }
  }

  private fetchNotificationsPreview(userId: string, mayShowReminderPopup: boolean): void {
    if (!userId) {
      this.resetNotificationsState();
      return;
    }
    this.notificationsLoading = true;
    this.notificationsError = null;
    this.cdr.markForCheck();
    this.noticeService
      .getNotices(userId)
      .pipe(
        timeout(8000),
        catchError(() => {
          this.notificationsError = 'Không tải được thông báo.';
          this.notificationsLoading = false;
          this.notificationsPreview = [];
          this.notificationsAll = [];
          this.notificationsLimit = 5;
          this.unreadNotifyCount = 0;
          this.medicationDueList = [];
          this.reminderBadgeService.setReminderDueCount(0, []);
          this.prescriptionNoticeList = [];
          this.orderNoticeList = [];
          this.cdr.markForCheck();
          return of({ success: false, items: [] as NoticeItem[] });
        }),
      )
      .subscribe((res) => {
        this.notificationsLoading = false;
        if (res.success && Array.isArray(res.items)) {
          const items = res.items as NoticeItem[];
          const dueMed = items.filter((n) => this.isReminderNotice(n));
          const dueMedUnread = dueMed.filter((n) => !n.read);
          const dueMedWithinWindow = this.filterReminderWithin60Minutes(dueMedUnread);
          this.medicationDueList = dueMedWithinWindow;
          this.reminderBadgeService.setReminderDueCount(
            dueMedWithinWindow.length,
            dueMedWithinWindow.map((n) => this.formatReminderDueTooltipLine(n))
          );
          const bellItems = items.filter((n) => !this.isReminderNotice(n));
          const prescriptionItems = bellItems.filter(
            (n) => n.type === 'prescription_created' || n.type === 'prescription_updated'
          );
          const prescriptionUnread = prescriptionItems.filter((n) => !n.read);
          const orderItems = bellItems.filter(
            (n) => n.type === 'order_created' || n.type === 'order_updated'
          );
          const orderUnread = orderItems.filter((n) => !n.read);
          this.prescriptionNoticeList = prescriptionUnread;
          this.orderNoticeList = orderUnread;
          // Bell chỉ tính/hiển thị thông báo không phải reminder.
          const unread = bellItems.filter((n) => !n.read);
          this.unreadNotifyCount = Math.min(unread.length, 99);
          const sorted = [...bellItems].sort((a, b) => {
            const ta = this.getNoticeTimeMs(a);
            const tb = this.getNoticeTimeMs(b);
            // Luôn chỉ sắp xếp theo thời gian (mới nhất lên trước).
            return tb - ta;
          });

          // Giữ đúng thứ tự theo thời gian, loại trùng id, KHÔNG ưu tiên read/unread.
          const uniqueSorted: NoticeItem[] = [];
          const seen = new Set<string>();
          for (const n of sorted) {
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            uniqueSorted.push(n);
          }

          this.notificationsAll = uniqueSorted;
          this.notificationsLimit = 5;
          this.notificationsPreview = this.notificationsAll.slice(0, this.notificationsLimit);
          this.tryScheduleNotificationPopups(mayShowReminderPopup);
        } else {
          this.notificationsPreview = [];
          this.notificationsAll = [];
          this.notificationsLimit = 5;
          this.unreadNotifyCount = 0;
          this.medicationDueList = [];
          this.reminderBadgeService.setReminderDueCount(0, []);
          this.prescriptionNoticeList = [];
          this.orderNoticeList = [];
        }
        this.cdr.markForCheck();
      });
  }

  /** Tên thuốc / nhãn hiển thị từ thông báo nhắc (meta "HH:mm · tên", meta_label, hoặc phần trước "—" trong message). */
  private extractReminderMedDisplayName(n: NoticeItem): string {
    const meta = (n.meta || '').trim();
    const mMeta = meta.match(/^\d{1,2}:\d{2}\s*·\s*(.+)$/);
    if (mMeta?.[1]) {
      const name = mMeta[1].trim();
      if (name) return name;
    }
    const ml = (n.meta_label || '').trim();
    if (ml) return ml;

    const msg = (n.message || '').replace(/\s+/g, ' ').trim();
    if (msg) {
      const em = msg.indexOf('—');
      if (em > 0) {
        const name = msg.slice(0, em).trim();
        if (name) return name;
      }
      const hy = msg.search(/\s-\s/);
      if (hy > 0) {
        const name = msg.slice(0, hy).trim();
        if (name) return name;
      }
    }

    const title = (n.title || '').trim();
    if (title && title !== 'Nhắc uống thuốc') return title;

    return 'Thuốc';
  }

  /** Một dòng cho tooltip FAB viên thuốc (đồng bộ danh sách đang đến hạn trong cửa sổ ±60 phút). */
  private formatReminderDueTooltipLine(n: NoticeItem): string {
    const timeStr = this.getReminderScheduledTime(n);
    let med = this.extractReminderMedDisplayName(n);
    if (med.length > 80) med = `${med.slice(0, 77)}…`;
    if (timeStr) return `${timeStr} — ${med}`;
    const metaT = (n.meta || '').trim().match(/^(\d{1,2}:\d{2})/);
    if (metaT?.[1]) return `${metaT[1]} — ${med}`;
    const t = (n.time || '').trim();
    if (t) return `${t} — ${med}`;
    return med;
  }

  canLoadMoreNotifications(): boolean {
    return this.notificationsAll.length > this.notificationsLimit;
  }

  loadMoreNotifications(): void {
    const next = this.notificationsLimit + this.notificationsStep;
    this.notificationsLimit = next;
    this.notificationsPreview = this.notificationsAll.slice(0, this.notificationsLimit);
    this.cdr.markForCheck();
  }

  fetchHotDeals(): void {
    // Vấn đề 2: Mapping dữ liệu sạch cho section Hot Deals
    this.productService.getProducts({ limit: 5, sort: 'discount' }).subscribe(res => {
      this.hotDeals = (res.products || []).map((p: any) => {
        // Backend: `price` là giá gốc, `discount` là số tiền giảm (VND).
        // => Giá sau giảm = price - discount
        const originalPrice = Number(p.price) || 0;
        const discountAmount = Number(p.discount) || 0;
        const salePrice = Math.max(0, originalPrice - discountAmount);

        let discountPercent = 0;
        if (originalPrice > 0 && discountAmount > 0) {
          discountPercent = Math.round((discountAmount / originalPrice) * 100);
        }

        return {
          id: p._id?.$oid || p._id?.toString() || p._id,
          name: p.name,
          price: salePrice || 0, // giá sau giảm
          oldPrice: originalPrice, // giá gốc để template hiển thị gạch ngang
          discountPercent: discountPercent,
          unit: p.unit || 'Hộp',
          image: p.image || 'assets/icon/medical_16660084.png',
          slug: p.slug || (p._id?.$oid || p._id?.toString() || p._id)
        };
      });
    });
  }

  loadRecentSearches(): void {
    const stored = localStorage.getItem('recentSearches');
    if (stored) {
      try {
        this.recentSearches = JSON.parse(stored);
      } catch (e) {
        this.recentSearches = [];
      }
    }
  }

  saveRecentSearch(keyword: string): void {
    // Remove if exists to move to top
    this.recentSearches = this.recentSearches.filter(k => k.toLowerCase() !== keyword.toLowerCase());
    // Add to top
    this.recentSearches.unshift(keyword);
    // Limit to 5
    if (this.recentSearches.length > 5) {
      this.recentSearches.pop();
    }
    localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
  }

  private syncSearchWithValue(): void {
    const urlTree = this.router.parseUrl(this.router.url);
    const keyword = urlTree.queryParamMap.get('keyword');
    if (keyword) {
      this.search_value = keyword;
    } else {
      this.search_value = '';
    }
  }

  // ================= FETCH LOGIC =================

  /**
   * Category bar + mega-menu: cùng nguồn với quản lý sản phẩm (admin) — GET /api/categories.
   *
   * Cấu trúc 3 tầng (parentId trỏ lên cấp trên):
   * - L1: danh mục gốc (pill), ví dụ "Thực phẩm chức năng" — parentId null.
   * - L2: cột trái mega-menu (vd. "Vitamin & Khoáng chất") — parentId = _id của L1.
   * - L3: nhóm trong panel phải (vd. "Dầu cá, Omega 3, DHA") — parentId = _id của L2; mỗi mục có slug + id.
   *
   * Sản phẩm trên storefront lọc theo categoryId (thường là _id danh mục LÁ — L3 khi có).
   * Admin nên gán product.categoryId = _id của đúng mục L3 đó để khớp đường dẫn / lọc trên my-user.
   */
  fetchCategoriesAndBuildMenu(): void {
    this.categoryService.getCategories().subscribe((categories: any[]) => {
      // 1. Identify Level 1 Roots
      const roots = categories.filter((c: any) => c.parentId == null || c.parentId === 'null' || !c.parentId);

      roots.forEach((root: any) => {
        const rootId = this.normalizeId(root._id);
        const rootData: any = { type: 'mega', id: rootId, slug: root.slug };

        // 2. Find Level 2 Children
        let l2 = categories.filter((c: any) => {
          const pId = this.normalizeId(c.parentId);
          return pId === rootId;
        });

        // Sort TPCN specifically
        if (root.name === 'Thực phẩm chức năng') {
          l2.sort((a: any, b: any) => {
            const idxA = this.orderedL2Names.indexOf(a.name);
            const idxB = this.orderedL2Names.indexOf(b.name);
            return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
          });
        }

        l2.forEach((sub: any) => {
          const subId = this.normalizeId(sub._id);
          // 3. Find Level 3 Children
          const l3 = categories
            .filter((c: any) => {
              const pId = this.normalizeId(c.parentId);
              return pId === subId;
            })
            .map((child: any) => ({
              name: child.name,
              slug: child.slug,
              id: this.normalizeId(child._id),
              image: getLocalIcon(child.name, child.icon)
            }));

          rootData[sub.name] = {
            id: subId,
            slug: sub.slug,
            icon: getLocalIcon(sub.name, sub.icon),
            groups: l3,
            bestSellers: [],
            loading: false
          };
        });

        this.megaMenuData[root.name] = rootData;
      });

      // Simple menus fallbacks
      if (!this.megaMenuData['Bệnh & Góc sức khỏe']) {
        this.megaMenuData['Bệnh & Góc sức khỏe'] = {
          type: 'simple',
          slug: '',
          items: [
            { name: 'Góc sức khỏe', icon: 'bi bi-heart-pulse-fill', slug: 'goc-suc-khoe', route: '/blog' },
            { name: 'Tra cứu bệnh', icon: 'bi bi-search-heart-fill', slug: 'tra-cuu-benh', route: '/disease' }
          ]
        };
      }
      if (!this.megaMenuData['Hệ thống nhà thuốc']) {
        this.megaMenuData['Hệ thống nhà thuốc'] = {
          type: 'direct',
          slug: 'he-thong-nha-thuoc',
          directRoute: '/store-system'
        };
      }

      this.cdr.detectChanges();
    });
  }

  fetchBestSellersForL2(id: string, rootName: string, subName: string): void {
    if (!id) return;

    if (this.megaMenuData[rootName] && this.megaMenuData[rootName][subName]) {
      // Prevent multiple fetches for the same subcategory
      if (this.megaMenuData[rootName][subName].loading) return;
      this.megaMenuData[rootName][subName].loading = true;
    }

    console.log(`[Header] Fetching Best Sellers for ID: ${id} (Root: ${rootName}, Sub: ${subName})`);

    // Use categoryId - the backend now handles recursion for IDs too!
    this.productService.getProducts({
      categoryId: id,
      limit: 5,
      sort: 'best_seller'
    }).pipe(
      timeout(4000),
      catchError(err => {
        console.warn(`[Header] Fetch failed for category ID: ${id}`, err);
        return of({ products: [] });
      })
    ).subscribe((response: any) => {
      const items = response?.products || [];
      this.updateMenuData(rootName, subName, items);
    }, () => {
      this.updateMenuData(rootName, subName, []);
    });

    // Đồng thời lấy ảnh sản phẩm cho các danh mục level 3 (thay icon mặc định)
    this.fetchProductImagesForL3Groups(rootName, subName);
  }

  /** Lấy ảnh 1 sản phẩm bất kỳ thuộc mỗi danh mục level 3 để hiển thị thay icon mặc định */
  private fetchProductImagesForL3Groups(rootName: string, subName: string): void {
    const subData = this.megaMenuData[rootName]?.[subName];
    const groups = subData?.groups;
    if (!Array.isArray(groups) || groups.length === 0) return;
    if (subData.l3ImagesFetched) return;
    subData.l3ImagesFetched = true;

    const requests = groups
      .filter((g: any) => g.id)
      .map((g: any) =>
        this.productService.getProducts({ categoryId: g.id, limit: 1 }).pipe(
          timeout(3000),
          map((res: any) => {
            const products = res?.products || [];
            return { group: g, product: products[0] };
          }),
          catchError(() => of({ group: g, product: null }))
        )
      );

    if (requests.length === 0) return;

    forkJoin(requests).subscribe((results: { group: any; product: any }[]) => {
      results.forEach(({ group, product }) => {
        if (product?.image) {
          group.image = product.image;
        }
      });
      this.cdr.detectChanges();
    });
  }

  // Helper to update UI state
  private updateMenuData(rootName: string, subName: string, items: any[]): void {
    if (this.megaMenuData[rootName] && this.megaMenuData[rootName][subName]) {
      this.megaMenuData[rootName][subName].bestSellers = items.map((p: any) => {
        // User Logic: discount field IS the amount to add to price to get original price.
        const discountAmount = p.discount || 0;
        const currentPrice = p.price || 0;
        const oldPrice = currentPrice + discountAmount;

        let discountPercent = 0;
        if (oldPrice > 0 && discountAmount > 0) {
          discountPercent = Math.round((discountAmount / oldPrice) * 100);
        }

        const idStr = p._id?.$oid || p._id?.toString() || p._id;

        return {
          id: idStr,
          _id: p._id, // Keep original for getProductSlug
          name: p.name,
          image: p.image || 'assets/icon/medical_16660084.png',
          price: currentPrice,
          oldPrice: oldPrice,
          discountAmount: discountAmount,
          discountPercent: discountPercent,
          slug: p.slug || idStr
        };
      });
      this.megaMenuData[rootName][subName].loading = false;
      this.cdr.detectChanges();
    }
  }

  // ================= CLICK HANDLERS =================

  onCategoryClick(c: string): void {
    if (c === 'Bệnh & Góc sức khỏe') {
      this.hoveredCategory = c;
      return;
    }
    const root = this.megaMenuData[c];
    if (!root) {
      this.hoveredCategory = null;
      return;
    }
    if (root.type === 'direct' && root.directRoute) {
      this.router.navigateByUrl(root.directRoute);
      this.hoveredCategory = null;
      return;
    }
    if (root.slug) {
      const segments = root.slug.split('/').filter(Boolean);
      this.router.navigate(['/category', ...segments]);
    }
    this.hoveredCategory = null;
  }

  onSubCategoryClick(sub: any): void {
    // Custom route (e.g. Góc sức khỏe -> /blog, Tra cứu bệnh -> /disease)
    if (typeof sub === 'object' && sub?.route) {
      this.router.navigateByUrl(sub.route);
      this.hoveredCategory = null;
      return;
    }

    let slug = null;

    // 1. Try to get slug from object directly (Modern approach)
    if (typeof sub === 'object' && sub?.slug) {
      slug = sub.slug;
    }

    // 2. Handle specific string commands or legacy string lookups
    if (sub === 'Xem thêm' || sub === 'Xem tất cả' || sub?.name === 'Xem thêm') {
      if (this.activeSubCategory && this.hoveredCategory) {
        const activeData = this.getSubCategoryData(this.hoveredCategory, this.activeSubCategory);
        if (activeData?.slug) {
          slug = activeData.slug;
        }
      }
    } else if (!slug && typeof sub === 'string' && this.hoveredCategory) {
      // Lookup by string name
      const data = this.getSubCategoryData(this.hoveredCategory, sub);
      if (data?.slug) {
        slug = data.slug;
      }
    }

    // 3. Navigate if slug found
    if (slug) {
      console.log('Navigating to slug:', slug);
      const segments = slug.split('/').filter(Boolean);
      this.router.navigate(['/category', ...segments]);
      this.hoveredCategory = null;
    } else {
      console.warn('Could not determine navigation slug for:', sub);
    }
  }

  onProductClick(p: any): void {
    // Navigation is now handled by [routerLink] in HTML
    this.hoveredCategory = null;
  }

  getProductSlug(product: any): string {
    if (!product) return '';
    return product.slug || (product._id?.$oid || product._id);
  }

  onSearch(): void {
    const keyword = this.search_value.trim();
    if (!keyword) return;

    this.saveRecentSearch(keyword);
    this.isSearchFocused = false; // Close dropdown

    this.router.navigate(['/tim-kiem'], {
      queryParams: {
        s: keyword,
        type: this.search_mode
      }
    });
  }

  onSearchFocus(): void {
    this.isSearchFocused = true;
  }

  onSearchBlur(): void {
    // Small delay to allow click events on the dropdown items to fire
    setTimeout(() => {
      this.isSearchFocused = false;
    }, 200);
  }

  onSearchMouseLeave(): void {
    this.isSearchFocused = false;
  }

  selectRecentSearch(term: string): void {
    this.search_value = term;
    this.onSearch();
  }

  removeRecentSearch(e: Event, term: string): void {
    e.stopPropagation();
    e.preventDefault();
    this.recentSearches = this.recentSearches.filter(k => k !== term);
    localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
  }

  clearRecentSearches(): void {
    this.recentSearches = [];
    localStorage.removeItem('recentSearches');
  }

  onLearnMore(e: Event): void {
    e.preventDefault();
    this.router.navigate(['/about']);
  }

  onLogin(e: Event): void {
    e.preventDefault();
    if (this.authService.currentUser()) {
      this.router.navigate(['/account'], { queryParams: { menu: 'info' } });
    } else {
      this.authService.openAuthModal();
    }
  }

  onCart(e: Event): void {
    e.preventDefault();
    this.isCartHoverVisible = false;
    this.cartSidebarService.openSidebar();
    this.cdr.markForCheck();
  }

  onCartItemActivate(e: Event, item: CartItem): void {
    e.preventDefault();
    e.stopPropagation();
    const id = String((item as any)?._id ?? (item as any)?.id ?? '').trim();
    if (!id) return;
    this.isCartHoverVisible = false;
    this.cartSidebarService.openSidebarWithFocus(id);
    this.cdr.markForCheck();
  }

  onRemoveFromCart(e: Event, item: any): void {
    e.preventDefault();
    e.stopPropagation();
    const id = item._id || item.id;
    if (id) {
      this.cartService.removeItem(id);
    }
  }

  onNotify(e: Event): void {
    e.preventDefault();
    if (!this.authService.currentUser()) {
      this.authService.openAuthModal();
      return;
    }
    this.isNotifyHoverVisible = false;
    this.router.navigate(['/account'], { queryParams: { menu: 'notifications' } });
  }

  /**
   * Nhấn vào 1 thông báo trong bell:
   * - Nếu !read: mark read ở backend
   * - Điều hướng sang account/notifications và scroll đúng item bằng `highlightId`
   */
  openNoticeFromBell(n: NoticeItem): void {
    const user = this.authService.currentUser() as { user_id?: string } | null;
    const userId = user?.user_id;
    if (!userId) {
      this.authService.openAuthModal();
      return;
    }

    const id = String(n.id || '');
    if (!id) return;

    // Đóng dropdown để tránh che UI
    this.isNotifyHoverVisible = false;
    this.cdr.markForCheck();

    const navigate = () => {
      this.router.navigate(['/account'], {
        queryParams: { menu: 'notifications', highlightId: id },
      });
    };

    // reminder-due-* là notice "ảo" sinh động từ reminder => không chắc có endpoint markAsRead chuẩn
    if (id.startsWith('reminder-due-')) {
      // Để background chuyển màu trắng ngay lập tức
      n.read = true;

      const parsed = this.parseReminderDueId(id);
      if (parsed) {
        // Mark complete ở backend reminder (để reminder biến mất khỏi list)
        this.reminderService.markComplete(parsed.reminderId, parsed.date, parsed.time).subscribe({
          next: () => navigate(),
          error: () => navigate(),
        });
        return;
      }
      navigate();
      return;
    }

    if (n.read) {
      navigate();
      return;
    }

    this.noticeService.markAsRead(id, userId).subscribe({
      next: () => {
        n.read = true;
        navigate();
      },
      error: () => {
        // Nếu API lỗi thì vẫn điều hướng để user xem nội dung
        navigate();
      },
    });
  }

  goHome(e: Event): void { e.preventDefault(); this.router.navigate([HOME_URL]); }

  onMouseEnter(category: string): void {
    if (this.menuTimeout) clearTimeout(this.menuTimeout);
    this.hoveredCategory = category;
    // console.log('Hovering:', category, 'Type:', this.getMenuType(category));

    const subs = this.getSubCategoriesData(category);
    if (subs.length > 0) {
      this.onSubMouseEnter(subs[0].name);
    }
  }

  onMouseLeave(): void {
    this.menuTimeout = setTimeout(() => {
      this.hoveredCategory = null;
      this.activeSubCategory = null;
      this.cdr.detectChanges();
    }, 100);
  }

  onMenuMouseEnter(): void {
    if (this.menuTimeout) clearTimeout(this.menuTimeout);
  }

  onOverlayMouseLeave(): void {
    this.hoveredCategory = null;
    this.activeSubCategory = null;
    this.cdr.detectChanges();
  }

  onSubMouseEnter(sub: string): void {
    this.activeSubCategory = sub;
    if (this.hoveredCategory && sub) {
      const data = this.getSubCategoryData(this.hoveredCategory, sub);
      if (data && data.id && (!data.bestSellers || data.bestSellers.length === 0)) {
        this.fetchBestSellersForL2(data.id, this.hoveredCategory, sub);
      }
    }
  }

  // ================= HELPERS FOR TEMPLATE =================

  getMenuType(c: string): string {
    return this.megaMenuData[c]?.type || 'none';
  }

  getSubType(parent: string, sub: string): string {
    return this.megaMenuData[parent]?.[sub]?.type || 'default';
  }

  getSubCategorySlug(parent: string, subName: string): string {
    const data = this.megaMenuData[parent];
    if (data && data[subName]) {
      return data[subName].slug || '';
    }
    return '';
  }

  getSubCategoriesData(parent: string): any[] {
    const data = this.megaMenuData[parent];
    if (!data) return [];
    if (data.type === 'direct') return [];
    if (data.type === 'simple') return data.items || [];

    // Filter out metadata keys
    return Object.keys(data)
      .filter(k => k !== 'type' && k !== 'id' && k !== 'slug')
      .map(k => {
        const item = data[k];
        // Defensive check
        if (!item) return { name: k, icon: '', slug: '' };
        return { name: k, icon: item.icon, slug: item.slug };
      });
  }

  getSubCategoryData(parent: string, sub: string): any {
    const parentData = this.megaMenuData[parent];
    if (parentData?.type === 'simple') {
      return parentData.items.find((i: any) => i.name === sub) || null;
    }
    return parentData?.[sub] || null;
  }

  getLeafItems(parent: string, sub: string): any[] {
    return this.megaMenuData[parent]?.[sub]?.groups || [];
  }

  getBestSellers(parent: string, sub: string): any[] {
    return this.megaMenuData[parent]?.[sub]?.bestSellers || [];
  }

  isSubCategoryLoading(parent: string, sub: string): boolean {
    return this.megaMenuData[parent]?.[sub]?.loading || false;
  }

  private normalizeId(id: any): string {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (id.$oid) return id.$oid;
    if (typeof id.toString === 'function') return id.toString();
    return String(id);
  }

  getPopularItems(parent: string, sub: string): string[] { return []; }
  getSectionTitle(parent: string, sub: string): string { return 'Bán chạy nhất'; }

  hideMascot(e: Event): void { (e.target as HTMLImageElement).style.display = 'none'; }

  /** Returns the full route array for a category slug (supports multi-segment slugs) */
  getCategoryRoute(slug: string): string[] {
    if (!slug) return ['/category'];
    return ['/category', ...slug.split('/').filter(Boolean)];
  }

  /** Chuẩn hoá tiering từ backend sang class màu (đồng/bạc/vàng) */
  getTierClass(tier: string | null | undefined): string {
    if (!tier) return '';
    const raw = tier.toString().trim().toLowerCase();
    // Chuẩn hoá đơn giản dấu tiếng Việt
    const normalized = raw
      .replace('đ', 'd')
      .replace('ồng', 'ong')
      .replace('ạc', 'ac')
      .replace('àng', 'ang');

    if (normalized.includes('gold') || normalized.includes('vang')) {
      return 'vc_action_tier--gold';
    }
    if (normalized.includes('silver') || normalized.includes('bac')) {
      return 'vc_action_tier--silver';
    }
    if (normalized.includes('bronze') || normalized.includes('dong')) {
      return 'vc_action_tier--bronze';
    }
    // Mặc định coi là Đồng nếu không match rõ
    return 'vc_action_tier--bronze';
  }

}
