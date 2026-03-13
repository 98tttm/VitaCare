import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProductService } from '../services/product.service';
import { CategoryService } from '../services/category.service';
import { BlogService } from '../services/blog.service';
import { Subscription, combineLatest } from 'rxjs'; // Import combineLatest

import { Filter } from './filter/filter';
import { FeatureCategories } from './feature-categories/feature-categories';
import { ProductList } from './product-list/product-list';
import { getLocalIcon } from '../header/header-icons';

@Component({
    selector: 'app-product',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, Filter, FeatureCategories, ProductList],
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
    private routeSub: Subscription | undefined;

    constructor(
        private productService: ProductService,
        private categoryService: CategoryService,
        private blogService: BlogService,
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef
    ) { }

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
            // 1. Handle Slug (Route Param) - Support multi-segment slugs like "thuoc/he-ho-hap"
            let slug = params.get('slug');
            if (!slug) {
                // Multi-segment routes: category/:seg1/:seg2 or category/:seg1/:seg2/:seg3
                const seg1 = params.get('seg1');
                const seg2 = params.get('seg2');
                const seg3 = params.get('seg3');
                if (seg1 && seg2 && seg3) {
                    slug = `${seg1}/${seg2}/${seg3}`;
                } else if (seg1 && seg2) {
                    slug = `${seg1}/${seg2}`;
                } else if (seg1) {
                    slug = seg1;
                }
            }

            if (slug) {
                slug = decodeURIComponent(slug);
                this.filters.categorySlug = slug;
            } else {
                this.filters.categorySlug = '';
            }

            // 2. Handle Filters (Query Params)
            this.syncFiltersFromUrl(qParams);

            // 3. Update View & Fetch
            this.updateCurrentCategory();
            if (this.searchMode === 'article') {
                this.fetchBlogs();
            } else {
                this.fetchProducts();
            }
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

    fetchProducts() {
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
                console.log(`[Product] Fetched ${this.products.length} products (Total: ${this.total})`);
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
        this.blogService.getBlogs(this.filters).subscribe({
            next: (res) => {
                this.blogs = res.blogs || [];
                this.total = res.total || 0;
                this.totalProducts = res.total || 0;
                // Reset display limit and show initial blogs
                this.blogDisplayLimit = this.initialBlogLimit;
                this.updateDisplayedBlogs();
                this.isLoading = false;
                this.cdr.detectChanges();
                console.log(`[Product] Fetched ${this.blogs.length} blogs (Total: ${this.total})`);
            },
            error: (err) => {
                console.error('[Product] Fetch blogs error:', err);
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    updateDisplayedBlogs() {
        this.displayedBlogs = this.blogs.slice(0, this.blogDisplayLimit);
    }

    loadMoreBlogs() {
        this.blogDisplayLimit += 6;
        this.updateDisplayedBlogs();
        this.cdr.detectChanges();
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
        // Fetch is triggered by URL subscription
        this.updateUrl();
    }

    onFilterChanged(event: any) {
        if (event.type === 'price') {
            this.filters.minPrice = event.value.min;
            this.filters.maxPrice = event.value.max;
        } else if (event.type === 'brand') {
            // "Tất cả" logic for brand
            if (event.value === 'Tất cả') {
                this.filters.brand = '';
            } else {
                this.filters.brand = this.filters.brand === event.value ? '' : event.value;
            }
        } else if (['audience', 'origin', 'flavor', 'indication', 'brandOrigin'].includes(event.type)) {
            let list = [...(this.filters[event.type] || [])];

            if (event.value === 'Tất cả') {
                // If "All" is selected, clear everything else (reset)
                list = [];
            } else {
                // If other option selected, ensure "All" isn't effectively represented (it's implicit empty list)
                const index = list.indexOf(event.value);
                if (index > -1) list.splice(index, 1);
                else list.push(event.value);
            }
            this.filters[event.type] = list;
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
                    icon: getLocalIcon(c.name, c.icon)
                }));
            this.isLevel2 = !!this.currentCategory.parentId;
            this.featureLayoutMode = this.isLevel2 ? 'grid' : 'slider';

            this.buildBreadcrumbs(this.currentCategory);
            this.applyStats(); // Apply stats whenever subCategories changes

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
        viewed = viewed.filter((p: any) => p._id !== product._id);
        viewed.unshift(product);
        viewed = viewed.slice(0, 6); // Just 6 latest
        localStorage.setItem('recentlyViewed', JSON.stringify(viewed));
        this.loadRecentlyViewed();
    }

    loadRecentlyViewed() {
        const viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        this.recentlyViewedProducts = viewed.slice(0, 6);
    }

    loadRecentlyViewedBlogs() {
        const viewed = JSON.parse(localStorage.getItem('recentlyViewedBlogs') || '[]');
        this.recentlyViewedBlogs = viewed.slice(0, 6);
    }

    trackRecentlyViewedBlog(blog: any) {
        if (!blog) return;
        let viewed = JSON.parse(localStorage.getItem('recentlyViewedBlogs') || '[]');
        // Remove if already exists
        viewed = viewed.filter((b: any) => b.url !== blog.url);
        // Add to top
        viewed.unshift({
            title: blog.title,
            url: blog.url,
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
        event.target.src = 'assets/images/placeholder.png';
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

    removeSearchHistoryItem(e: Event, keyword: string) {
        e.stopPropagation();
        e.preventDefault();
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
