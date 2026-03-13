import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ProductService } from '../services/product.service';
import { CategoryService } from '../services/category.service';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { getLocalIcon } from './header-icons';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements OnInit {

  search_value = '';
  cart_count = 0;

  recentSearches: string[] = [];
  isSearchFocused = false;
  search_mode: 'product' | 'article' = 'product';

  main_nav = ['Omega 3', 'Men vi sinh', 'Dung dịch vệ sinh', 'Kẽm', 'Thuốc nhỏ mắt', 'Sữa rửa mặt', 'Sắt'];
  trendingKeywords = ['Canxi', 'Omega 3', 'Kẽm', 'Men vi sinh', 'Thuốc nhỏ mắt', 'Dung dịch vệ sinh', 'Sữa rửa mặt', 'Sắt', 'Kem chống nắng', 'Siro ho'];

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

  constructor(
    private router: Router,
    private productService: ProductService,
    private categoryService: CategoryService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.fetchCategoriesAndBuildMenu();
    this.syncSearchWithValue();
    this.loadRecentSearches();

    // Sync search bar with current search keyword
    this.router.events.subscribe(() => {
      this.syncSearchWithValue();
    });

    this.fetchHotDeals();
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
          image: p.image || 'assets/images/placeholder.png',
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
          slug: 'benh-va-goc-suc-khoe',
          items: [
            { name: 'Góc sức khỏe', icon: 'bi bi-heart-pulse-fill', slug: 'goc-suc-khoe' },
            { name: 'Chuyên trang ung thư', icon: 'bi bi-shield-fill-plus', slug: 'chuyen-trang-ung-thu' },
            { name: 'Tra cứu bệnh', icon: 'bi bi-search-heart-fill', slug: 'tra-cuu-benh' }
          ]
        };
      }
      if (!this.megaMenuData['Hệ thống nhà thuốc']) {
        this.megaMenuData['Hệ thống nhà thuốc'] = {
          type: 'simple',
          slug: 'he-thong-nha-thuoc',
          items: [
            { name: 'Tìm nhà thuốc', icon: 'bi bi-geo-alt-fill', slug: 'tim-nha-thuoc' },
            { name: 'Hợp tác nhượng quyền', icon: 'bi bi-shop-window', slug: 'hop-tac-nhuong-quyen' }
          ]
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
          image: p.image || '/assets/images/placeholder.png',
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
    const root = this.megaMenuData[c];
    if (root && root.slug) {
      const segments = root.slug.split('/').filter(Boolean);
      this.router.navigate(['/category', ...segments]);
    }
    this.hoveredCategory = null;
  }

  onSubCategoryClick(sub: any): void {
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

  onLearnMore(e: Event): void { e.preventDefault(); }
  onLogin(e: Event): void { e.preventDefault(); }
  onCart(e: Event): void { e.preventDefault(); }
  onNotify(e: Event): void { e.preventDefault(); }
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
