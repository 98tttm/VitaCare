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
import type { NoticeItem } from '../../features/accounts/notice/notice';
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

  search_value = '';
  cart_count = 0;
  cart: Cart | null = null;
  isCartHoverVisible = false;
  isNotifyHoverVisible = false;
  unreadNotifyCount = 0;
  notificationsPreview: NoticeItem[] = [];
  notificationsLoading = false;
  notificationsError: string | null = null;
  /** Nhắc uống thuốc quá hạn (từ API) — popup thanh ngắn bên phải */
  showReminderPopup = false;
  /** Đang chạy hiệu ứng đóng (trượt ra) trước khi ẩn hẳn */
  reminderPopupClosing = false;
  medicationDueList: NoticeItem[] = [];
  /** Đang gửi "ghi nhận đã uống" để tránh double submit */
  reminderMarkingComplete = false;
  /** Popup đơn thuốc — hiện sau 5s, đóng sau 3s, dưới popup nhắc thuốc */
  prescriptionNoticeList: NoticeItem[] = [];
  showPrescriptionPopup = false;
  prescriptionPopupClosing = false;
  private prescriptionPopupTimeout: ReturnType<typeof setTimeout> | null = null;
  private prescriptionPopupAutoCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Popup đơn hàng — hiện sau 6s, đóng sau 3s, dưới popup đơn thuốc */
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
  private readonly REMINDER_POPUP_AUTO_CLOSE_MS = 5000;
  private readonly REMINDER_POPUP_CLOSE_DURATION_MS = 280;

  isHeaderCompact = false;
  private headerEl: HTMLElement | null = null;
  private rafId: number | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScrollY = 0;
  // Ngưỡng scroll để chuyển trạng thái header (giảm jitter, mượt hơn)
  private readonly COMPACT_SCROLL_Y = 40;  // dưới ~40px: luôn full-size
  private readonly EXPAND_SCROLL_Y = 90;   // chỉ khi kéo xuống sâu hơn mới thu gọn

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
        this.cart = null;
        this.cart_count = 0;
        this.cartService.setCartCount(0);
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
    }, 80);
  };

  private applyCompactState(scrollY: number): void {
    const deltaY = scrollY - this.lastScrollY;
    const scrollingUp = deltaY < 0;
    this.lastScrollY = scrollY;

    let nextCompact: boolean;
    if (scrollY <= this.COMPACT_SCROLL_Y) {
      nextCompact = false;
    } else if ((window as any).isFilteringJump) {
      nextCompact = true;
    } else if (this.isHeaderCompact) {
      // If already compact, stay compact unless we scroll back near the top
      nextCompact = scrollY > this.COMPACT_SCROLL_Y;
    } else {
      // If expanded, only go compact if we scroll down past threshold
      nextCompact = scrollY > this.EXPAND_SCROLL_Y;
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
    this.notificationsLoading = false;
    this.notificationsError = null;
    this.showReminderPopup = false;
    this.medicationDueList = [];
    this.reminderBadgeService.setReminderDueCount(0);
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
    } catch (_) {}
    this.reminderBadgeService.setPopupAcked();
  }

  private getPrescriptionPopupAckSession(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(HeaderComponent.PRESCRIPTION_POPUP_ACK_KEY) === '1';
  }
  private setPrescriptionPopupAckSession(): void {
    try {
      sessionStorage.setItem(HeaderComponent.PRESCRIPTION_POPUP_ACK_KEY, '1');
    } catch (_) {}
  }
  private getOrderPopupAckSession(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(HeaderComponent.ORDER_POPUP_ACK_KEY) === '1';
  }
  private setOrderPopupAckSession(): void {
    try {
      sessionStorage.setItem(HeaderComponent.ORDER_POPUP_ACK_KEY, '1');
    } catch (_) {}
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
    }, this.REMINDER_POPUP_CLOSE_DURATION_MS);
  }

  dismissReminderPopup(): void {
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    const ids = this.medicationDueList.map((n) => n.id);
    this.runReminderPopupCloseAnimation(() => {
      this.setReminderAckSession();
      if (userId && ids.length) {
        ids.forEach((id) =>
          this.noticeService.markAsRead(id, userId).subscribe({ error: () => {} })
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
    }, this.REMINDER_POPUP_CLOSE_DURATION_MS);
  }

  dismissPrescriptionPopup(): void {
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    const ids = this.prescriptionNoticeList.map((n) => n.id);
    this.runPrescriptionPopupCloseAnimation(() => {
      this.setPrescriptionPopupAckSession();
      if (userId && ids.length) {
        ids.forEach((id) =>
          this.noticeService.markAsRead(id, userId).subscribe({ error: () => {} })
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
    }, this.REMINDER_POPUP_CLOSE_DURATION_MS);
  }

  dismissOrderPopup(): void {
    const userId = (this.authService.currentUser() as { user_id?: string })?.user_id;
    const ids = this.orderNoticeList.map((n) => n.id);
    this.runOrderPopupCloseAnimation(() => {
      this.setOrderPopupAckSession();
      if (userId && ids.length) {
        ids.forEach((id) =>
          this.noticeService.markAsRead(id, userId).subscribe({ error: () => {} })
        );
      }
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
        }, this.REMINDER_POPUP_AUTO_CLOSE_MS);
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
        }, this.REMINDER_POPUP_AUTO_CLOSE_MS);
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
        }, this.REMINDER_POPUP_AUTO_CLOSE_MS);
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

  /** Chỉ giữ các lời nhắc trong cửa sổ ±60 phút: ví dụ lịch 15h chỉ hiện khi thời gian thực từ 14h đến 16h (chưa tick). */
  private filterReminderWithin60Minutes(list: NoticeItem[]): NoticeItem[] {
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const WINDOW_MIN = 60;
    return list.filter((n) => {
      const timeStr = this.getReminderScheduledTime(n);
      if (!timeStr) return true;
      const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10) || 0);
      const slotMin = h * 60 + m;
      const low = Math.max(0, slotMin - WINDOW_MIN);
      const high = Math.min(23 * 60 + 59, slotMin + WINDOW_MIN);
      return curMin >= low && curMin <= high;
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
          this.unreadNotifyCount = 0;
          this.medicationDueList = [];
          this.reminderBadgeService.setReminderDueCount(0);
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
          const dueMed = items.filter((n) => n.type === 'medication_reminder');
          const dueMedUnread = dueMed.filter((n) => !n.read);
          const dueMedWithinWindow = this.filterReminderWithin60Minutes(dueMedUnread);
          this.medicationDueList = dueMedWithinWindow;
          this.reminderBadgeService.setReminderDueCount(dueMedWithinWindow.length);
          const prescriptionItems = items.filter(
            (n) => n.type === 'prescription_created' || n.type === 'prescription_updated'
          );
          const prescriptionUnread = prescriptionItems.filter((n) => !n.read);
          const orderItems = items.filter(
            (n) => n.type === 'order_created' || n.type === 'order_updated'
          );
          const orderUnread = orderItems.filter((n) => !n.read);
          this.prescriptionNoticeList = prescriptionUnread;
          this.orderNoticeList = orderUnread;
          const unread = items.filter((n) => !n.read);
          this.unreadNotifyCount = Math.min(unread.length, 99);
          const sorted = [...items].sort((a, b) => {
            const am = a.type === 'medication_reminder' ? 0 : 1;
            const bm = b.type === 'medication_reminder' ? 0 : 1;
            if (am !== bm) return am - bm;
            const ar = a.read ? 1 : 0;
            const br = b.read ? 1 : 0;
            if (ar !== br) return ar - br;
            return 0;
          });
          const pick: NoticeItem[] = [];
          const seen = new Set<string>();
          for (const n of sorted) {
            if (pick.length >= 5) break;
            if (seen.has(n.id)) continue;
            if (!n.read || dueMed.some((d) => d.id === n.id)) {
              pick.push(n);
              seen.add(n.id);
            }
          }
          if (pick.length < 5) {
            for (const n of sorted) {
              if (pick.length >= 5) break;
              if (!seen.has(n.id)) {
                pick.push(n);
                seen.add(n.id);
              }
            }
          }
          this.notificationsPreview = pick.slice(0, 5);
          this.tryScheduleNotificationPopups(mayShowReminderPopup);
        } else {
          this.notificationsPreview = [];
          this.unreadNotifyCount = 0;
          this.medicationDueList = [];
          this.reminderBadgeService.setReminderDueCount(0);
          this.prescriptionNoticeList = [];
          this.orderNoticeList = [];
        }
        this.cdr.markForCheck();
      });
  }

  fetchHotDeals(): void {
    // Vấn đề 2: Mapping dữ liệu sạch cho section Hot Deals
    this.productService.getProducts({ limit: 5, sort: 'discount' }).subscribe(res => {
      this.hotDeals = (res.products || []).map((p: any) => {
        const currentPrice = p.price || 0;
        const discountAmount = p.discount || 0;
        const oldPrice = currentPrice + discountAmount;
        let discountPercent = 0;
        if (oldPrice > 0 && discountAmount > 0) {
          discountPercent = Math.round((discountAmount / oldPrice) * 100);
        }

        return {
          id: p._id?.$oid || p._id?.toString() || p._id,
          name: p.name,
          price: currentPrice || 0, // Fallback tránh hiện lỗi template
          oldPrice: oldPrice,
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
            { name: 'Góc sức khỏe', icon: 'bi bi-heart-pulse-fill', slug: 'goc-suc-khoe', route: '/bai-viet' },
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
      sort: 'newest'
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
    // Custom route (e.g. Góc sức khỏe -> /bai-viet, Tra cứu bệnh -> /disease)
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

    if (this.search_mode === 'article') {
      // Redirect to Health Corner with keyword
      this.router.navigate(['/category/goc-suc-khoe'], { queryParams: { keyword, mode: 'article' } });
    } else {
      this.router.navigate(['/products'], { queryParams: { keyword, mode: 'product' } });
    }
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
    if (this.authService.currentUser()) {
      this.isCartHoverVisible = false;
      this.cartSidebarService.openSidebar();
      this.cdr.markForCheck();
    } else {
      this.authService.openAuthModal();
    }
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

  goHome(e: Event): void { e.preventDefault(); this.router.navigate(['/']); }

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

}
