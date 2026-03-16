import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { BlogService } from '../../../core/services/blog.service';
import { Subscription, combineLatest, forkJoin, of } from 'rxjs'; // Import combineLatest, forkJoin, of
import { timeout, catchError, map } from 'rxjs/operators';

import { ProductFilter } from '../product-filter/product-filter';
import { FeatureCategories } from '../feature-categories/feature-categories';
import { ProductList } from '../product-list/product-list';
import { getLocalIcon } from '../../../shared/header/header-icons';
import { RecentlyViewedProducts } from '../recently-viewed-products/recently-viewed-products';
import { RecentlyViewedBlogs } from '../../blogs/recently-viewed-blogs/recently-viewed-blogs';

@Component({
    selector: 'app-product',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        ProductFilter,
        FeatureCategories,
        ProductList,
        RecentlyViewedProducts,
        RecentlyViewedBlogs,
    ],
    templateUrl: './product.html',
    styleUrl: './product.css',
})
export class Product implements OnInit, OnDestroy {
    products: any[] = [];
    blogs: any[] = [];
    displayedBlogs: any[] = [];
    searchMode: 'product' | 'article' = 'product';
    initialBlogLimit = 6;
    blogDisplayLimit = 6;
    categories: any[] = [];
    parentCategories: any[] = [];
    subCategories: any[] = [];
    currentCategory: any = null;
    isLevel2: boolean = false;
    featureLayoutMode: 'slider' | 'grid' = 'slider';
    productStats: any = {};
    sidebarHierarchy: any = {
        parent: null,
        current: null,
        siblings: [],
        children: []
    };
    recentlyViewedProducts: any[] = [];
    recentlyViewedBlogs: any[] = [];
    searchHistory: any[] = [];

    // Pagination & Counts
    total = 0;
    totalProducts = 0;

    breadcrumbs: any[] = [];

    orderedL2Names = [
        'Vitamin & Khoáng chất', 'Sinh lý - Nội tiết tố', 'Tăng cường chức năng',
        'Hỗ trợ điều trị', 'Hỗ trợ tiêu hóa', 'Thần kinh não',
        'Hỗ trợ làm đẹp', 'Sức khoẻ tim mạch', 'Dinh dưỡng'
    ];

    // Filter Data for sidebar
    brands = ['Nature\'s way', 'Blackmores', 'Swisse', 'Healthy Care', 'DHC'];
    priceRanges = [
        { label: 'Dưới 100.000đ', min: 0, max: 100000 },
        { label: '100.000đ đến 300.000đ', min: 100000, max: 300000 },
        { label: '300.000đ đến 500.000đ', min: 300000, max: 500000 },
        { label: 'Trên 500.000đ', min: 500000, max: null }
    ];

    filters: any = {
        categorySlug: '',
        keyword: '', // Added keyword filter
        minPrice: null,
        maxPrice: null,
        brand: '',
        sort: 'newest',
        page: 1,
        limit: 12,
        audience: [],
        origin: [],
        flavor: [],
        indication: [],
        brandOrigin: []
    };

    showPriceSortDropdown = false;
    viewMode: 'grid' | 'list' = 'grid';
    isLoading = false;
    private isPopState = false;
    private routeSub: Subscription | undefined;
    private previousCategorySlug: string | null = null;

    @HostBinding('style.min-height') minHeight = 'auto';

    constructor(
        private productService: ProductService,
        private categoryService: CategoryService,
        private blogService: BlogService,
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef,
        private ngZone: NgZone
    ) {
        const nav = this.router.getCurrentNavigation();
        if (nav && nav.trigger === 'popstate') {
            this.isPopState = true;
        }
    }

    ngOnInit(): void {
        this.loadCategories();
        this.loadStats();
        this.loadRecentlyViewed();
        this.loadRecentlyViewedBlogs();
        this.loadSearchHistory();

        // Combine Query Params and Route Params to prevent race conditions
        this.routeSub = combineLatest([
            this.route.paramMap,
            this.route.queryParams
        ]).subscribe(([params, qParams]) => {
            // 1. Handle Slug (Route Param) - ALWAYS support multi-segment slugs like "thuoc/he-ho-hap"
            // Angular route definitions:
            //   category/:slug
            //   category/:slug/:subslug
            //   category/:slug/:subslug/:seg3
            // will expose params: slug, subslug, seg3. We need to join all parts.
            const parts: string[] = [];
            const slug1 = params.get('slug');
            const slug2 = params.get('subslug');
            const slug3 = params.get('seg3');

            if (slug1) parts.push(slug1);
            if (slug2) parts.push(slug2);
            if (slug3) parts.push(slug3);

            const fullSlug = parts.length > 0 ? decodeURIComponent(parts.join('/')) : '';

            if (fullSlug) {
                this.filters.categorySlug = fullSlug;
            } else {
                this.filters.categorySlug = '';
            }

            let isCategoryChange = false;
            // Always treat initial load or category change as true
            if (this.previousCategorySlug !== fullSlug) {
                isCategoryChange = true;
                this.previousCategorySlug = fullSlug;
            }

            // 2. Handle Filters (Query Params)
            this.syncFiltersFromUrl(qParams);

            // 3. Update View & Fetch
            this.updateCurrentCategory();
            if (this.searchMode === 'article') {
                this.fetchBlogs();
            } else {
                this.fetchProducts(isCategoryChange);
            }
            setTimeout(() => this.cdr.detectChanges(), 0);
        });
    }

    loadStats() {
        this.productService.getProductStats().subscribe(stats => {
            this.productStats = stats;
            this.applyStats();
        });
    }

    applyStats() {
        if (this.subCategories && this.subCategories.length > 0 && Object.keys(this.productStats).length > 0) {
            this.subCategories.forEach(sub => {
                sub.productCount = this.productStats[sub._id] || 0;
            });
            // Trigger change detection by creating a new array reference
            this.subCategories = [...this.subCategories];
            this.cdr.detectChanges();
        }
    }

    ngOnDestroy(): void {
        if (this.routeSub) this.routeSub.unsubscribe();
    }

    private syncFiltersFromUrl(qParams: any) {
        this.filters.brand = qParams['brand'] || '';
        this.filters.keyword = qParams['keyword'] || ''; // Sync keyword
        this.searchMode = qParams['mode'] === 'article' ? 'article' : 'product';
        this.filters.minPrice = qParams['minPrice'] !== undefined ? (qParams['minPrice'] === 'null' ? null : Number(qParams['minPrice'])) : null;
        this.filters.maxPrice = qParams['maxPrice'] !== undefined ? (qParams['maxPrice'] === 'null' ? null : Number(qParams['maxPrice'])) : null;
        this.filters.sort = qParams['sort'] || 'newest';
        this.filters.page = qParams['page'] ? parseInt(qParams['page']) : 1;
        this.filters.limit = qParams['limit'] ? parseInt(qParams['limit']) : 12;

        this.filters.audience = qParams['audience'] ? qParams['audience'].split(',') : [];
        this.filters.origin = qParams['origin'] ? qParams['origin'].split(',') : [];
        this.filters.flavor = qParams['flavor'] ? qParams['flavor'].split(',') : [];
        this.filters.indication = qParams['indication'] ? qParams['indication'].split(',') : [];
        this.filters.brandOrigin = qParams['brandOrigin'] ? qParams['brandOrigin'].split(',') : [];
    }

    fetchProducts(isCategoryChange: boolean = false) {
        this.isLoading = true;
        // Save search to history if there's a keyword
        if (this.filters.keyword) {
            this.saveSearchHistory(this.filters.keyword);
        }
        this.productService.getProducts(this.filters).subscribe({
            next: (res) => {
                this.products = res.products || [];
                this.total = res.total || 0;
                this.totalProducts = res.total || 0;
                this.isLoading = false;
                this.cdr.detectChanges();

                if (!this.isPopState) {
                    this.scrollToProductTop(isCategoryChange);
                    this.minHeight = 'auto';
                } else {
                    // Give a tall height to allow browser to restore scroll position
                    this.minHeight = '3000px';
                    setTimeout(() => {
                        this.minHeight = 'auto';
                        this.isPopState = false;
                    }, 500);
                }
                console.log(`[Product] Fetched ${this.products.length} products`);
            },
            error: (err) => {
                console.error('[Product] Fetch error:', err);
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    fetchBlogs() {
        this.isLoading = true;
        // Save search to history if there's a keyword
        if (this.filters.keyword) {
            this.saveSearchHistory(this.filters.keyword);
        }
        this.blogService.getBlogs({ ...this.filters, limit: 1000 }).subscribe({
            next: (res) => {
                this.blogs = res.blogs || [];
                this.total = res.total || 0;
                this.totalProducts = res.total || 0;
                this.blogDisplayLimit = this.initialBlogLimit; // Mặc định hiện 6 bài đầu
                this.updateDisplayedBlogs();
                this.isLoading = false;
                this.cdr.detectChanges();

                if (!this.isPopState) {
                    // Similar logic for blogs if needed, or if we want to stay where we were
                }
                this.isPopState = false;

                console.log(`[Product] Fetched ${this.blogs.length} blogs`);
            },
            error: (err) => {
                console.error('[Product] Fetch blogs error:', err);
                this.blogs = [];
                this.displayedBlogs = [];
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    updateDisplayedBlogs() {
        this.displayedBlogs = this.blogs.slice(0, this.blogDisplayLimit);
    }

    loadMoreBlogs() {
        this.blogDisplayLimit = Math.min(this.blogDisplayLimit + 6, this.blogs.length);
        this.updateDisplayedBlogs();
        this.cdr.detectChanges();
    }

    /**
     * Lấy ảnh 1 sản phẩm bất kỳ cho từng danh mục con (subCategories)
     * để hiển thị trên các thẻ danh mục (feature-categories) thay cho icon mặc định.
     */
    private fetchProductImagesForSubCategories(): void {
        const subs = this.subCategories;
        if (!Array.isArray(subs) || subs.length === 0) return;

        const requests = subs
            .filter((s: any) => s.normalizedId)
            .map((s: any) =>
                this.productService.getProducts({ categoryId: s.normalizedId, limit: 1 }).pipe(
                    timeout(3000),
                    map((res: any) => {
                        const products = res?.products || [];
                        return { sub: s, product: products[0] || null };
                    }),
                    catchError(() => of({ sub: s, product: null }))
                )
            );

        if (requests.length === 0) return;

        forkJoin(requests).subscribe((results: { sub: any; product: any }[]) => {
            let changed = false;
            results.forEach(({ sub, product }) => {
                if (product?.image) {
                    sub.icon = product.image;
                    changed = true;
                }
            });
            if (changed) {
                this.subCategories = [...this.subCategories];
                this.cdr.detectChanges();
            }
        });
    }

    collapseBlogs() {
        this.blogDisplayLimit = this.initialBlogLimit;
        this.updateDisplayedBlogs();
        this.cdr.detectChanges();
        // Scroll to top of blog list
        const blogSection = document.querySelector('.blog-articles');
        if (blogSection) {
            blogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    trackByProduct(index: number, item: any): string {
        return item._id?.$oid || item._id || index.toString();
    }

    updateUrl() {
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {
                brand: this.filters.brand || null,
                keyword: this.filters.keyword || null, // Persist keyword in URL
                minPrice: this.filters.minPrice !== null ? this.filters.minPrice : 'null',
                maxPrice: this.filters.maxPrice !== null ? this.filters.maxPrice : 'null',
                sort: this.filters.sort,
                page: this.filters.page === 1 ? null : this.filters.page,
                limit: this.filters.limit === 12 ? null : this.filters.limit,
                audience: this.filters.audience?.length ? this.filters.audience.join(',') : null,
                origin: this.filters.origin?.length ? this.filters.origin.join(',') : null,
                flavor: this.filters.flavor?.length ? this.filters.flavor.join(',') : null,
                indication: this.filters.indication?.length ? this.filters.indication.join(',') : null
            },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    onSortToggle(sort: string) {
        this.filters.sort = sort;
        this.showPriceSortDropdown = false;
        this.filters.page = 1; // Reset to page 1 on sort change
        // Fetch is triggered by URL subscription
        this.updateUrl();
    }

    private scrollToProductTop(isCategoryChange: boolean = false) {
        if (typeof window !== 'undefined') {
            // Khi có từ khoá tìm kiếm: luôn scroll về đầu trang để người dùng thấy thanh chọn (Sản phẩm / Bài viết sức khoẻ)
            if (this.filters.keyword) {
                window.scrollTo({ top: 0, behavior: 'auto' });
                return;
            }
            if (isCategoryChange) {
                // Sang category mới -> scroll lên trên cùng (dưới header)
                window.scrollTo({ top: 0, behavior: 'auto' });
            } else {
                // Chỉ click bộ lọc -> scroll đến list sản phẩm
                const productSection = document.querySelector('.product-two-columns') || document.querySelector('app-product-list');
                if (productSection) {
                    (window as any).isFilteringJump = true;
                    const y = productSection.getBoundingClientRect().top + window.scrollY - 140;
                    window.scrollTo({ top: y, behavior: 'auto' });
                    setTimeout(() => {
                        (window as any).isFilteringJump = false;
                    }, 100);
                } else {
                    window.scrollTo({ top: 0, behavior: 'auto' });
                }
            }
        }
    }

    onFilterChanged(event: any) {
        const { type, value, checked } = event;

        if (type === 'price') {
            this.filters.minPrice = value.min;
            this.filters.maxPrice = value.max;
        } else if (type === 'brand') {
            if (value === 'Tất cả') {
                // "Tất cả" cho brand nghĩa là bỏ lọc thương hiệu
                this.filters.brand = '';
            } else {
                // Thương hiệu là single-select: check = chọn, uncheck = bỏ chọn
                if (checked) {
                    this.filters.brand = value;
                } else if (this.filters.brand === value) {
                    this.filters.brand = '';
                }
            }
        } else if (['audience', 'origin', 'flavor', 'indication', 'brandOrigin'].includes(type)) {
            let list = [...(this.filters[type] || [])];

            if (value === 'Tất cả') {
                // Chọn "Tất cả" -> clear hết filter mảng
                if (checked) {
                    list = [];
                }
            } else {
                if (checked) {
                    if (!list.includes(value)) {
                        list.push(value);
                    }
                } else {
                    const index = list.indexOf(value);
                    if (index > -1) {
                        list.splice(index, 1);
                    }
                }
            }

            this.filters[type] = list;
        }

        this.filters.page = 1;
        // Fetch is triggered by URL subscription
        this.updateUrl();
    }

    onRemoveFilter(tag: any) {
        if (tag.type === 'brand') {
            this.filters.brand = '';
        } else if (tag.type === 'price') {
            this.filters.minPrice = null;
            this.filters.maxPrice = null;
        } else if (['audience', 'origin', 'flavor', 'indication', 'brandOrigin'].includes(tag.type)) {
            const list = [...(this.filters[tag.type] || [])];
            const index = list.indexOf(tag.value);
            if (index > -1) {
                list.splice(index, 1);
                this.filters[tag.type] = list;
            }
        }
        this.filters.page = 1;
        this.updateUrl();
    }

    onClearAllFilters() {
        this.filters.brand = '';
        this.filters.minPrice = null;
        this.filters.maxPrice = null;
        this.filters.audience = [];
        this.filters.origin = [];
        this.filters.flavor = [];
        this.filters.indication = [];
        this.filters.brandOrigin = [];
        this.filters.page = 1;
        this.updateUrl();
    }

    loadCategories() {
        this.categoryService.getCategories().subscribe((res: any[]) => {
            this.categories = res;
            const rootCategories = this.categories.filter(c => !c.parentId);
            const dummyCategories = [
                { name: 'Bệnh và góc sức khỏe', slug: 'benh-va-goc-suc-khoe', _id: 'dummy_benh' },
                { name: 'Hệ thống nhà thuốc', slug: 'he-thong-nha-thuoc', _id: 'dummy_nha_thuoc' }
            ];
            this.parentCategories = [...rootCategories];
            dummyCategories.forEach(dummy => {
                if (!this.parentCategories.find(c => c.name === dummy.name)) {
                    this.parentCategories.push(dummy);
                }
            });
            this.updateCurrentCategory();
        });
    }

    updateCurrentCategory() {
        if (this.filters.categorySlug) {
            const parent = this.parentCategories.find(c => c.slug === this.filters.categorySlug);
            if (parent) {
                this.updateViewForCategory(parent);
                return;
            }
            if (this.categories.length > 0) {
                const found = this.categories.find(c => c.slug === this.filters.categorySlug);
                if (found) this.updateViewForCategory(found);
            }
        } else {
            this.currentCategory = null;
            this.subCategories = [];
            this.sidebarHierarchy = { parent: null, current: null, siblings: this.parentCategories, children: [] };
        }
    }

    updateViewForCategory(category: any) {
        this.currentCategory = category;
        if (this.currentCategory) {
            // Level 2 Check: If parentId is present, it's Level 2 (or deeper)
            // But root categories (Level 1) have no parentId.
            this.isLevel2 = !!this.currentCategory.parentId;
            this.featureLayoutMode = this.isLevel2 ? 'grid' : 'slider';

            const currentIdStr = (this.currentCategory._id?.$oid || this.currentCategory._id)?.toString();
            this.subCategories = this.categories
                .filter(c => {
                    const pStr = (c.parentId?.$oid || c.parentId)?.toString();
                    return pStr === currentIdStr;
                })
                .map(c => ({
                    ...c,
                    icon: getLocalIcon(c.name, c.icon),
                    normalizedId: (c._id?.$oid || c._id)?.toString()
                }));
            this.isLevel2 = !!this.currentCategory.parentId;
            this.featureLayoutMode = this.isLevel2 ? 'grid' : 'slider';

            this.buildBreadcrumbs(this.currentCategory);
            this.applyStats(); // Apply stats whenever subCategories changes

            // Với các danh mục cấp thấp hơn (Level 2 trở xuống), lấy ảnh sản phẩm cho từng danh mục con
            if (this.isLevel2 && this.subCategories.length > 0) {
                this.fetchProductImagesForSubCategories();
            }

            if (this.currentCategory.name === 'Thực phẩm chức năng') {
                this.subCategories.sort((a, b) => {
                    const idxA = this.orderedL2Names.indexOf(a.name);
                    const idxB = this.orderedL2Names.indexOf(b.name);
                    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                });
            }

            const currentParentIdStr = (this.currentCategory.parentId?.$oid || this.currentCategory.parentId)?.toString();
            const parent = this.categories.find(c => (c._id?.$oid || c._id)?.toString() === currentParentIdStr);
            const siblings = this.categories.filter(c => {
                const pStr = (c.parentId?.$oid || c.parentId)?.toString();
                const cIdStr = (c._id?.$oid || c._id)?.toString();
                return pStr === currentParentIdStr && cIdStr !== currentIdStr;
            });

            this.sidebarHierarchy = {
                parent: parent || null,
                current: this.currentCategory,
                siblings: this.currentCategory.parentId ? siblings : this.parentCategories.filter(c => (c._id?.$oid || c._id)?.toString() !== currentIdStr),
                children: this.subCategories
            };
        } else {
            this.isLevel2 = false;
            this.featureLayoutMode = 'slider';
        }
    }

    onCategorySelected(category: any) {
        const slug = category.slug || '';
        // Navigate using the full slug (may have multiple segments like 'thuoc/he-ho-hap')
        const segments = slug.split('/').filter(Boolean);
        this.router.navigate(['/category', ...segments]);
        this.updateViewForCategory(category);
    }

    onCategoryHover(category: any) {
        this.updateViewForCategory(category);
    }

    setSearchMode(mode: 'product' | 'article') {
        if (this.searchMode === mode) return;
        this.searchMode = mode;

        // Update URL with mode parameter
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { mode: mode },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });

        // Fetch appropriate data
        if (mode === 'article') {
            this.fetchBlogs();
        } else {
            this.fetchProducts();
        }
    }

    setViewMode(mode: 'grid' | 'list') {
        this.viewMode = mode;
    }

    trackRecentlyViewed(product: any) {
        if (!product) return;
        let viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');

        // So khớp ID chắc chắn
        const productId = (product._id?.$oid || product._id)?.toString();
        viewed = viewed.filter((p: any) => {
            const pid = (p._id?.$oid || p._id)?.toString();
            return pid !== productId;
        });

        viewed.unshift(product);
        viewed = viewed.slice(0, 20); // Lưu tối đa 20 sản phẩm
        localStorage.setItem('recentlyViewed', JSON.stringify(viewed));
        this.loadRecentlyViewed();
    }

    loadRecentlyViewed() {
        const viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        this.recentlyViewedProducts = viewed.slice(0, 6); // Only show 6
    }

    loadRecentlyViewedBlogs() {
        const viewed = JSON.parse(localStorage.getItem('recentlyViewedBlogs') || '[]');
        this.recentlyViewedBlogs = viewed.slice(0, 6);
    }

    getBlogDetailLink(blog: any): string {
        if (!blog) return '/bai-viet';
        const slug = blog.slug || (blog.url && typeof blog.url === 'string' ? blog.url.replace(/.*\/bai-viet\/?/i, '').replace(/\.html$/i, '').trim() : '') || (blog._id ? String(blog._id) : '');
        return slug ? `/bai-viet/${encodeURIComponent(slug)}` : '/bai-viet';
    }

    trackRecentlyViewedBlog(blog: any) {
        if (!blog) return;
        const blogUrl = blog.url || this.getBlogDetailLink(blog);
        let viewed = JSON.parse(localStorage.getItem('recentlyViewedBlogs') || '[]');
        viewed = viewed.filter((b: any) => (b.url || b.link) !== blogUrl);
        // Add to top
        viewed.unshift({
            title: blog.title,
            url: blogUrl,
            link: this.getBlogDetailLink(blog),
            primaryImage: blog.primaryImage,
            shortDescription: blog.shortDescription,
            publishedAt: blog.publishedAt,
            author: blog.author
        });
        // Keep only 6 latest
        viewed = viewed.slice(0, 6);
        localStorage.setItem('recentlyViewedBlogs', JSON.stringify(viewed));
        this.loadRecentlyViewedBlogs();
    }

    clearRecentlyViewedBlogs(e?: Event) {
        if (e) e.stopPropagation();
        localStorage.removeItem('recentlyViewedBlogs');
        this.loadRecentlyViewedBlogs();
    }

    clearRecentlyViewed(e?: Event) {
        if (e) e.stopPropagation();
        localStorage.removeItem('recentlyViewed');
        this.loadRecentlyViewed();
    }

    removeRecentlyViewedProduct(product: any) {
        if (!product) return;
        let viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        const productId = (product._id?.$oid || product._id)?.toString();
        viewed = viewed.filter((p: any) => {
            const pid = (p._id?.$oid || p._id)?.toString();
            return pid !== productId;
        });
        localStorage.setItem('recentlyViewed', JSON.stringify(viewed));
        this.loadRecentlyViewed();
    }

    loadMore() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.cdr.detectChanges();

        const currentCount = this.products.length;
        const query: any = { ...this.filters, limit: 8, skip: currentCount };

        console.log(`[Product] Loading more... Current: ${currentCount}, Skip: ${query.skip}`);

        this.productService.getProducts(query).subscribe({
            next: (res) => {
                const newProducts = res.products || [];
                console.log(`[Product] Received: ${newProducts.length} items`);

                if (newProducts.length > 0) {
                    // Filter duplicates based on _id
                    const existingIds = new Set(this.products.map(p => p._id?.$oid || p._id));
                    const uniqueProducts = newProducts.filter((p: any) => !existingIds.has(p._id?.$oid || p._id));

                    if (uniqueProducts.length < newProducts.length) {
                        console.warn(`[Product] Filtered ${newProducts.length - uniqueProducts.length} duplicates!`);
                    }

                    this.products = [...this.products, ...uniqueProducts];
                }
                this.isLoading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('[Product] Load more error:', err);
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    getDiscountedPrice(price: number, discount: number): number {
        return price - (discount || 0);
    }

    getDiscountPercentage(price: number, discount: number): number {
        if (!discount || !price || price <= 0) return 0;
        return Math.round((discount / price) * 100);
    }

    handleImageError(event: any) {
        event.target.src = 'assets/images/banner/woman_doctor.png';
    }

    buildBreadcrumbs(category: any) {
        let crumbs = [];
        let current = category;
        while (current) {
            crumbs.unshift(current);
            if (current.parentId) {
                current = this.categories.find(c => c._id === current.parentId);
            } else {
                current = null;
            }
        }
        this.breadcrumbs = crumbs;
    }

    loadSearchHistory() {
        const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
        this.searchHistory = history.slice(0, 7); // Only keep last 7
    }

    saveSearchHistory(keyword: string) {
        if (!keyword || keyword.trim() === '') return;

        let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');

        // Remove duplicate if exists
        history = history.filter((item: any) => item.keyword !== keyword);

        // Add new search at the beginning
        history.unshift({
            keyword: keyword,
            timestamp: new Date().toISOString()
        });

        // Keep only last 20 searches in storage
        history = history.slice(0, 20);

        localStorage.setItem('searchHistory', JSON.stringify(history));
        this.loadSearchHistory();
    }

    removeSearchHistoryItem(keyword: string) {
        let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
        history = history.filter((item: any) => item.keyword !== keyword);
        localStorage.setItem('searchHistory', JSON.stringify(history));
        this.loadSearchHistory();
    }

    clearSearchHistory() {
        localStorage.removeItem('searchHistory');
        this.loadSearchHistory();
    }

    getProductSlug(product: any): string {
        if (!product) return '';
        if (product.slug && product.slug.trim() !== '') return product.slug;

        if (product._id) {
            if (typeof product._id === 'string') return product._id;
            if (product._id.$oid) return product._id.$oid;
            if (typeof product._id.toString === 'function') return product._id.toString();
        }
        return '';
    }
}

export { Product as ProductComponent };
