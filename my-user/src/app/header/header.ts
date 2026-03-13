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

import { ProductService } from '../services/product.service';
import { CategoryService } from '../services/category.service';
import { AuthService } from '../services/auth.service';
import { CartService, Cart, CartItem } from '../services/cart.service';
import { CartSidebarService } from '../services/cart-sidebar.service';
import { NoticeService } from '../services/notice.service';
import type { NoticeItem } from '../notice/notice';
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

  search_value = '';
  cart_count = 0;
  cart: Cart | null = null;
  isCartHoverVisible = false;
  isNotifyHoverVisible = false;
  unreadNotifyCount = 0;
  notificationsPreview: NoticeItem[] = [];
  notificationsLoading = false;
  notificationsError: string | null = null;
  /** Nhắc uống thuốc quá hạn (từ API) — popup góc phải */
  showReminderPopup = false;
  medicationDueList: NoticeItem[] = [];
  isAccountDropdownVisible = false;
  private accountDropdownTimeout: ReturnType<typeof setTimeout> | null = null;
  private cartHoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private notifyHoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private cartCountSub?: Subscription;
  private cartUpdatedSub?: Subscription;

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
        this.cart_count = (cart.items || []).reduce(
          (sum, it) => sum + (Number(it.quantity) || 0),
          0
        );
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
      this.syncBodyPaddingTop();
    });
  };

  private onWindowResize = (): void => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.syncBodyPaddingTop();
    }, 80);
  };

  private applyCompactState(scrollY: number): void {
    const scrollingUp = scrollY < this.lastScrollY;
    this.lastScrollY = scrollY;

    let nextCompact: boolean;
    if (scrollY <= this.COMPACT_SCROLL_Y) {
      nextCompact = false;
    } else if (scrollingUp) {
      nextCompact = false;
    } else {
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
    const h = this.headerEl.getBoundingClientRect().height;
    document.body.style.paddingTop = `${Math.ceil(h)}px`;
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
        this.cart_count = (this.cart.items || []).reduce(
          (sum, it) => sum + (Number(it.quantity) || 0),
          0
        );
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
    return this.cart?.items?.slice(0, 3) || [];
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
    this.isNotifyHoverVisible = false;
    this.unreadNotifyCount = 0;
    this.notificationsPreview = [];
    this.notificationsLoading = false;
    this.notificationsError = null;
    this.showReminderPopup = false;
    this.medicationDueList = [];
    this.cdr.markForCheck();
  }

  dismissReminderPopup(): void {
    this.showReminderPopup = false;
    this.cdr.markForCheck();
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

  openRemindFromPopup(e: Event): void {
    e.preventDefault();
    this.dismissReminderPopup();
    this.router.navigate(['/account'], { queryParams: { menu: 'remind' } });
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
          this.cdr.markForCheck();
          return of({ success: false, items: [] as NoticeItem[] });
        }),
      )
      .subscribe((res) => {
        this.notificationsLoading = false;
        if (res.success && Array.isArray(res.items)) {
          const items = res.items as NoticeItem[];
          const dueMed = items.filter((n) => n.type === 'medication_reminder');
          this.medicationDueList = dueMed;
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
          if (mayShowReminderPopup && dueMed.length > 0) {
            this.showReminderPopup = true;
          }
        } else {
          this.notificationsPreview = [];
          this.unreadNotifyCount = 0;
          this.medicationDueList = [];
        }
        this.cdr.markForCheck();
      });
  }

  fetchHotDeals(): void {
    // Fetch top 5 products with highest discount for the search "Hot Deals" section
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
          price: currentPrice,
          oldPrice: oldPrice,
          discountPercent: discountPercent,
          unit: 'Hộp',
          image: p.image || 'assets/icon/medical_16660084.png',
          slug: p.slug
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
