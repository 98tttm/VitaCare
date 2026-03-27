import { Component, OnInit, OnDestroy, ChangeDetectorRef, effect, inject, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { CartService } from '../../../core/services/cart.service';
import { CartAnimationService } from '../../../core/services/cart-animation.service';
import { BuyNowService } from '../../../core/services/buy-now.service';
import { AuthService } from '../../../core/services/auth.service';
import { ProductGallery } from '../product-gallery/product-gallery';
import { ProductInfoSummary } from '../product-info-summary/product-info-summary';
import { ProductTabsContent } from '../product-tabs-content/product-tabs-content';
import { RecentlyViewedProducts } from '../recently-viewed-products/recently-viewed-products';
import { ToastService } from '../../../core/services/toast.service';
import { NoticeService } from '../../../core/services/notice.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ProductGallery,
    ProductInfoSummary,
    ProductTabsContent,
    RecentlyViewedProducts
  ],
  templateUrl: './product-detail.html',
  styleUrls: ['./product-detail.css', './product-detail-reviews.css'],
})
export class ProductDetail implements OnInit, OnDestroy {
  private lastReviewRefreshAt = 0;
  product: any = null;
  productFaqs: any[] = [];
  openFaqIndexes: Set<number> = new Set();
  loading = true;
  selectedImage: string = '';
  quantity: number = 1;
  isGalleryModalOpen: boolean = false;
  categories: any[] = [];
  categoryPath: any[] = [];
  healthVideos: any[] = [];
  relatedProducts: any[] = [];
  favorites: any[] = [];
  recentlyViewedProducts: any[] = [];

  // Reviews State
  reviewsData: any = { sku: '', reviews: [] };
  reviewStats: any = {
    average: 0,
    total: 0,
    stars: [0, 0, 0, 0, 0] // [5*, 4*, 3*, 2*, 1*]
  };
  visibleReviewsCount = 3;
  selectedStarFilter: number | null = null;

  // Consultations State (Q&A)
  consultationsData: any = { sku: '', questions: [] };
  visibleConsultationsCount = 3;
  selectedConsultationSort: string = 'newest'; // newest, oldest, helpful
  replyingToQuestionId: string | null = null;
  consultationReplyContent: string = '';
  editingQuestionId: string | null = null;
  editQuestionContent: string = '';

  // Consultation Reply Edit State
  editingReplyId: string | null = null;
  editReplyContent: string = '';

  // Review Edit State
  editingReviewId: string | null = null;
  editReviewContent: string = '';
  editReviewRating: number = 5;

  // Review Reply Edit State
  editingReviewReplyId: string | null = null;
  editReviewReplyContent: string = '';

  // Review Reply Add State
  replyingToReviewId: string | null = null;
  replyContent: string = '';

  // Custom Delete Modal State
  showDeleteConfirmModal = false;
  itemToDelete: any = null;
  deleteType: 'review' | 'question' | 'reply' | 'review_reply' | null = null;
  targetQuestionId: string | null = null; // for reply deletion

  // Guest Identification
  guestId: string = '';

  // Video Detail Modal State
  showVideoDetailModal = false;
  selectedVideo: any = null;
  safeVideoUrl: SafeResourceUrl | null = null;
  modalRelatedVideos: any[] = [];

  // Scroll target from query param: 'reviews' | 'questions'
  private pendingScrollTo: 'reviews' | 'questions' | null = null;

  /** Tooltip danh sách người đã bấm "Hữu ích" */
  likerHoverKey: string | null = null;
  likerHoverPanel: { loading: boolean; names: string[]; more: number } | null = null;
  private likerHoverHideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly likerNamesCache = new Map<string, Record<string, string>>();

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private categoryService: CategoryService,
    private cartService: CartService,
    private cartAnimation: CartAnimationService,
    private buyNowService: BuyNowService,
    readonly authService: AuthService,
    private toastService: ToastService,
    private noticeService: NoticeService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    // Reload favorites when user logs in/out
    effect(() => {
      const user = this.authService.currentUser();
      this.loadFavorites();
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void {
    if (this.likerHoverHideTimer) {
      clearTimeout(this.likerHoverHideTimer);
      this.likerHoverHideTimer = null;
    }
  }

  likerPanelVisible(key: string): boolean {
    return this.likerHoverKey === key && this.likerHoverPanel != null;
  }

  private normalizeLikeUserIds(likes: any[] | null | undefined): string[] {
    if (!Array.isArray(likes)) return [];
    return likes
      .map((x) => (x && typeof x === 'object' && x.$oid ? String(x.$oid) : String(x || '').trim()))
      .filter(Boolean);
  }

  private applyLikerHoverNames(panelKey: string, orderedIds: string[], nameMap: Record<string, string>) {
    if (this.likerHoverKey !== panelKey) return;
    const display = orderedIds.map((id) => nameMap[id] || 'Thành viên');
    const names = display.slice(0, 4);
    const more = Math.max(0, orderedIds.length - 4);
    this.likerHoverPanel = { loading: false, names, more };
    this.cdr.markForCheck();
  }

  onLikersEnter(panelKey: string, likes: any[] | null | undefined) {
    const ids = this.normalizeLikeUserIds(likes);
    if (ids.length === 0) return;

    if (this.likerHoverHideTimer) {
      clearTimeout(this.likerHoverHideTimer);
      this.likerHoverHideTimer = null;
    }

    this.likerHoverKey = panelKey;
    this.likerHoverPanel = { loading: true, names: [], more: 0 };
    this.cdr.markForCheck();

    const cacheKey = [...ids].sort().join('|');
    const cached = this.likerNamesCache.get(cacheKey);
    if (cached) {
      this.applyLikerHoverNames(panelKey, ids, cached);
      return;
    }

    this.productService.getUserDisplayNames(ids).subscribe({
      next: (map) => {
        this.likerNamesCache.set(cacheKey, map);
        this.applyLikerHoverNames(panelKey, ids, map);
      },
      error: () => {
        if (this.likerHoverKey !== panelKey) return;
        this.likerHoverPanel = {
          loading: false,
          names: ids.slice(0, 4).map(() => 'Thành viên'),
          more: Math.max(0, ids.length - 4),
        };
        this.cdr.markForCheck();
      },
    });
  }

  onLikersLeave() {
    if (this.likerHoverHideTimer) clearTimeout(this.likerHoverHideTimer);
    this.likerHoverHideTimer = setTimeout(() => {
      this.likerHoverKey = null;
      this.likerHoverPanel = null;
      this.cdr.markForCheck();
    }, 220);
  }

  onLikersPopoverEnter() {
    if (this.likerHoverHideTimer) {
      clearTimeout(this.likerHoverHideTimer);
      this.likerHoverHideTimer = null;
    }
  }

  openVideoDetail(video: any, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!video) return;

    this.selectedVideo = video;
    this.showVideoDetailModal = true;

    // Data Hydration: If video from favorites lacks URL or description, fetch full data
    const vid = video.id || video._id?.$oid || video._id;
    if (vid && (!video.url || !video.long_description)) {
      this.productService.getHealthVideoById(String(vid)).subscribe({
        next: (fullVideo: any) => {
          if (fullVideo) {
            // Merge full data into selectedVideo, ensuring we don't lose existing fields
            this.selectedVideo = { ...this.selectedVideo, ...fullVideo };
            console.log('[ProductDetail] Hydrated video:', this.selectedVideo.title);
            this.prepareVideoPlayer(this.selectedVideo);
          } else {
            this.prepareVideoPlayer(this.selectedVideo);
          }
        },
        error: (err) => {
          console.error('[ProductDetail] Hydration error (maybe invalid ID?):', err);
          this.prepareVideoPlayer(this.selectedVideo);
        }
      });
    } else {
      this.prepareVideoPlayer(this.selectedVideo);
    }

    // Filter related videos safely
    const currentPlaylist = video?.classification?.playlist;
    this.modalRelatedVideos = (this.healthVideos || [])
      .filter(v => v && v.url !== video.url)
      .filter(v => !currentPlaylist || v.classification?.playlist === currentPlaylist)
      .slice(0, 5);

    if (this.modalRelatedVideos.length < 3) {
      const more = (this.healthVideos || [])
        .filter(v => v && v.url !== video.url && !this.modalRelatedVideos.some(rv => rv.url === v.url))
        .slice(0, 5 - this.modalRelatedVideos.length);
      this.modalRelatedVideos = [...this.modalRelatedVideos, ...more];
    }
  }

  private prepareVideoPlayer(video: any) {
    if (!video) return;

    // Generate standard YouTube URL
    const videoId = this.extractYoutubeId(video.url);
    if (videoId) {
      const origin = window.location.origin;
      const url = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${origin}`;
      this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    } else {
      this.safeVideoUrl = null;
    }

    this.cdr.detectChanges();

    // Scroll modal body to top
    setTimeout(() => {
      const modalBody = document.querySelector('.vc_vd_body');
      if (modalBody) {
        modalBody.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 200);
  }

  closeVideoDetail() {
    this.showVideoDetailModal = false;
    this.selectedVideo = null;
    this.safeVideoUrl = null;
    document.body.style.overflow = 'auto'; // Unlock scroll
  }

  extractYoutubeId(url: string): string | null {
    if (!url) return null;
    // Enhanced regex to support shorts and other variety of links
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return match[2];
    }
    // Fallback for direct 11-char ID if URL is just ID or simple path
    if (url.length === 11) return url;
    return null;
  }




  ngOnInit(): void {
    this.loadFavorites();

    // 1. Lấy danh mục để xây dựng breadcrumbs
    this.categoryService.getCategories().subscribe((cats: any[]) => {
      this.categories = cats;
      if (this.product) {
        this.buildCategoryPath(this.product.categoryId);
      }
    });

    this.loadRecentlyViewed();

    // 2. Theo dõi tham số URL
    this.route.paramMap.subscribe((params: any) => {
      const slug = params.get('slug');
      if (slug && slug !== 'undefined' && slug !== 'null') {
        this.fetchProduct(slug);
      }
    });

    // 3. Ưu tiên lấy query param ngay từ snapshot (tránh race condition khi điều hướng)
    const initialScrollTo = this.route.snapshot?.queryParamMap?.get('scrollTo');
    if (initialScrollTo === 'reviews' || initialScrollTo === 'questions') {
      this.pendingScrollTo = initialScrollTo;
    }

    // 3. Theo dõi query param để tự scroll tới phần review/qa
    this.route.queryParamMap.subscribe((qParams: any) => {
      const scrollTo = qParams.get('scrollTo');
      if (!scrollTo) return;
      if (scrollTo === 'reviews' || scrollTo === 'questions') {
        this.pendingScrollTo = scrollTo;
        // Nếu product đã render xong thì scroll luôn
        if (!this.loading && this.product) {
          const st = this.pendingScrollTo;
          this.pendingScrollTo = null;
          setTimeout(() => this.scrollToSection(st as string), 150);
        }
      }
    });

    // Auto refresh reviews if user just submitted from another page (Orders popup)
    window.addEventListener('storage', (e: StorageEvent) => {
      if (!e.key || typeof e.key !== 'string') return;
      if (!e.key.startsWith('vc_review_submitted_')) return;

      const sku = e.key.replace('vc_review_submitted_', '');
      if (!sku || !this.product?.sku) return;
      if (String(this.product.sku) !== String(sku)) return;

      const now = Date.now();
      // Simple throttle: avoid spamming requests
      if (this['lastReviewRefreshAt'] && now - (this as any).lastReviewRefreshAt < 500) return;
      (this as any).lastReviewRefreshAt = now;

      this.fetchReviews(String(sku));
    });

    this.guestId = this.getOrCreateGuestId();
  }

  getOrCreateGuestId(): string {
    let id = localStorage.getItem('vc_guest_id');
    if (!id) {
      id = 'guest_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('vc_guest_id', id);
    }
    return id;
  }

  getCurrentUserIdOrGuest(): string {
    return this.authService.currentUser()?.user_id || this.guestId;
  }

  getGenericId(item: any): string {
    if (!item) return '';
    const id = item._id || item.id;
    if (id && typeof id === 'object' && id.$oid) return id.$oid;
    return String(id || '');
  }

  /** Helper to safely extract a string ID from a value (string or {$oid: ...}) */
  private getStringId(val: any): string {
    if (!val) return '';
    if (typeof val === 'object' && val.$oid) return String(val.$oid);
    return String(val);
  }

  loadFavorites() {
    const user = this.authService.currentUser();
    if (!user) {
      this.favorites = [];
      this.groupFavorites();
      return;
    }

    const uid = user.user_id;

    // Load from local fallback first for instant UI response
    const localFavs = this.loadFavoritesFromLocal(uid);
    if (localFavs.length > 0) {
      this.favorites = localFavs;
      this.groupFavorites();
    }

    this.productService.getFavorites(uid).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.favorites = res.favorites || [];
          this.saveFavoritesToLocal(uid, this.favorites);
          this.groupFavorites();
          this.cdr.detectChanges();
        }
      },
      error: () => {
        console.warn('Could not load favorites from API, using local storage.');
      }
    });
  }

  private saveFavoritesToLocal(uid: string, favs: any[]) {
    localStorage.setItem(`favorites_${uid}`, JSON.stringify(favs));
  }

  private loadFavoritesFromLocal(uid: string): any[] {
    try {
      const raw = localStorage.getItem(`favorites_${uid}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  isFavorite(video: any): boolean {
    if (!video) return false;
    const vid = String(video.id || video._id?.$oid || video._id || '');
    if (!vid) return false;
    return this.favorites.some(fav => {
      const favId = String(fav.id || fav._id?.$oid || fav._id || '');
      return (fav.url && video.url && fav.url === video.url) || (favId && vid && favId === vid);
    });
  }

  toggleFavorite(video: any, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const user = this.authService.currentUser();
    if (!user) {
      // Guest cannot add to favorites
      this.authService.showHeaderSuccess('Vui lòng đăng nhập để lưu vào cẩm nang');
      this.authService.openAuthModal();
      return;
    }

    const uid = user.user_id;
    const isFav = this.isFavorite(video);

    if (isFav) {
      // Remove
      this.productService.removeFromFavorites(uid, video.id).subscribe({
        next: (res: any) => {
          if (res.success) {
            this.favorites = res.favorites || [];
            this.saveFavoritesToLocal(uid, this.favorites);
            this.groupFavorites();
            this.authService.showHeaderSuccess('Đã xóa khỏi cẩm nang');
          }
        }
      });
      // Optimistic local update
      this.favorites = this.favorites.filter(v => {
        const tid = String(v.id || v._id?.$oid || v._id || '');
        const vid = String(video.id || video._id?.$oid || video._id || '');
        return tid !== vid;
      });
      this.saveFavoritesToLocal(uid, this.favorites);
      this.groupFavorites();
    } else {
      // Add
      // Trích đoạn logic trong toggleFavorite()
      let categoryName = 'Sức khỏe chung';
      let categorySlug = 'suc-khoe-chung';

      // Priority 1: Danh mục Cấp 2
      if (this.categoryPath && this.categoryPath.length >= 2) {
        categoryName = this.categoryPath[1].name;
        categorySlug = this.categoryPath[1].slug || categorySlug;
      }
      // Priority 2: Danh mục Cấp 1
      else if (this.categoryPath && this.categoryPath.length > 0) {
        categoryName = this.categoryPath[0].name;
        categorySlug = this.categoryPath[0].slug || categorySlug;
      }
      // Priority 3: Backend join fallback
      else if (this.product && this.product.categoryName) {
        categoryName = this.product.categoryName;
        categorySlug = this.product.categorySlug || categorySlug;
      }

      const videoToSave = {
        id: String(video.id || video._id?.$oid || video._id || ''),
        title: video.title || '',
        thumbnail: video.thumbnail || '',
        url: video.url || '', // Critical: Ensure URL is saved for playback from favorites
        category: categoryName, // Sync with backend 'category' field
        categoryName: categoryName,
        categorySlug: categorySlug,
        duration: video.duration || '',
        date: video.date || new Date().toISOString()
      };

      this.productService.addToFavorites(uid, videoToSave).subscribe({
        next: (res: any) => {
          if (res.success) {
            this.favorites = res.favorites || [];
            this.saveFavoritesToLocal(uid, this.favorites);
            this.groupFavorites();
            this.authService.showHeaderSuccess('Đã lưu vào cẩm nang');
          }
        }
      });
      // Optimistic local update
      if (!this.favorites.some(v => v.id === videoToSave.id)) {
        this.favorites = [...this.favorites, videoToSave];
        this.saveFavoritesToLocal(uid, this.favorites);
        this.groupFavorites();
      }
    }
  }

  favoriteGroups: { category: string, videos: any[] }[] = [];

  groupFavorites() {
    const groups: { [key: string]: any[] } = {};
    this.favorites.forEach(video => {
      // Logic gom nhóm: Dựa hoàn toàn vào categoryName đã lưu
      const cat = video.categoryName || 'Sức khỏe chung';
      if (!groups[cat]) {
        groups[cat] = [];
      }

      // Fix broken/missing thumbnails: generate from YouTube URL if needed
      if (!video.thumbnail || video.thumbnail.includes('About_us_Hero.png')) {
        const videoId = this.extractYoutubeId(video.url);
        if (videoId) {
          video.thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      }

      groups[cat].push(video);
    });
    this.favoriteGroups = Object.keys(groups).map(cat => ({
      category: cat,
      videos: groups[cat]
    }));
  }

  fetchProduct(slug: string): void {
    if (!slug || slug === 'undefined' || slug === 'null') {
      // Slug không hợp lệ → dừng loading và để UI hiển thị trạng thái "không tìm thấy"
      this.loading = false;
      this.product = null;
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    this.productService.getProductBySlug(slug).subscribe({
      next: (res: any) => {
        // Kiểm tra nếu res có các trường bắt buộc (phòng trường hợp server trả về object lỗi {message: ...})
        if (res && (res._id || res.id)) {
          this.product = res;
          this.selectedImage = this.product.image;
          this.trackRecentlyViewed(this.product);

          if (this.categories.length > 0) {
            this.buildCategoryPath(this.product.categoryId);
          } else {
            // Gọi trực tiếp nếu categories chưa load xong
            this.fetchHealthVideos();
          }

          // Fetch Related Products
          const pId = this.product._id?.$oid || this.product._id;
          this.fetchRelatedProducts(pId);

          // Fetch Reviews
          if (this.product.sku) {
            this.fetchReviews(this.product.sku);
            this.fetchConsultations(this.product.sku);
          }

          // Fetch FAQs
          this.fetchProductFaqs(pId);

        }
          this.loading = false;
          this.cdr.detectChanges();

          // Scroll tới section nếu có yêu cầu
          if (this.pendingScrollTo) {
            const st = this.pendingScrollTo;
            this.pendingScrollTo = null;
            setTimeout(() => this.scrollToSection(st), 250);
          }
      },
      error: (err: any) => {
        console.error('Error fetching product:', err);
        this.loading = false;
            this.pendingScrollTo = null;
        this.cdr.detectChanges();
      }
    });
  }


  fetchRelatedProducts(productId: string) {
    this.productService.getRelatedProducts(productId).subscribe({
      next: (products: any[]) => {
        this.relatedProducts = products;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error fetching related products:', err);
      }
    });
  }

  fetchProductFaqs(productId: string): void {
    this.productService.getProductFaqs(productId).subscribe({
      next: (faqs: any[]) => {
        this.productFaqs = faqs;
        // Mặc định mở câu đầu tiên nếu có
        if (faqs && faqs.length > 0) {
          this.openFaqIndexes.add(0);
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error('Error fetching FAQs:', err)
    });
  }

  toggleFaq(index: number): void {
    if (this.openFaqIndexes.has(index)) {
      this.openFaqIndexes.delete(index);
    } else {
      this.openFaqIndexes.add(index);
    }
    this.cdr.detectChanges();
  }

  isFaqOpen(index: number): boolean {
    return this.openFaqIndexes.has(index);
  }

  buildCategoryPath(catId: any): void {
    const normalizeId = (id: any) => {
      if (!id) return null;
      return typeof id === 'object' && id.$oid ? id.$oid : id.toString();
    };

    let currentId = normalizeId(catId);
    if (!currentId) return;

    const path = [];
    let depth = 0;

    // Prevent infinite loops with max depth
    while (currentId && depth < 10) {
      const cat = this.categories.find(c => normalizeId(c._id) === currentId);
      if (cat) {
        path.unshift(cat);
        currentId = normalizeId(cat.parentId);
        depth++;
      } else {
        break;
      }
    }
    this.categoryPath = path;

    // Fetch videos once category path is ready
    this.fetchHealthVideos();
  }

  fetchHealthVideos(): void {
    const categoryName = this.categoryPath.length > 0 ? this.categoryPath[this.categoryPath.length - 1].name : '';

    let keyword = '';
    if (this.product) {
      const nameLower = (this.product.name || '').toLowerCase();
      const catPathNames = this.categoryPath.map(c => c.name.toLowerCase()).join(' ');
      const combinedContext = nameLower + ' ' + catPathNames;

      // Danh sách từ khóa "vàng" cần ưu tiên bắt (để matching chính xác)
      const goldTerms = [
        'mụn', 'da', 'nám', 'trắng da', 'rửa mặt', 'chống nắng',
        'canxi', 'zinc', 'kẽm', 'sắt', 'vitamin', 'omega', 'não', 'tim', 'gan', 'tiêu hóa', 'bé', 'trẻ'
      ];

      const foundTerms = goldTerms.filter(t => combinedContext.includes(t));

      // Lấy 3 từ khóa vàng tìm thấy + 2 từ đầu của tên sản phẩm (đã lọc stop words)
      const stopWords = ['siro', 'viên', 'uống', 'hộp', 'chai', 'tuýp', 'gel', 'kem', 'sữa', 'vỉ', 'x'];
      const nameWords = nameLower.split(/[\s,.-]+/).filter((w: string) => !stopWords.includes(w) && w.length > 2);

      keyword = [...new Set([...foundTerms, ...nameWords.slice(0, 2)])].join(' ');
    }

    if (!keyword && categoryName) {
      keyword = categoryName; // Fallback to category if no keyword found
    }

    console.log('[ProductDetail] Matching v5 (Vàng). Category:', categoryName, 'Keyword:', keyword);

    this.productService.getHealthVideos({
      limit: 20,
      category: categoryName,
      keyword: keyword,
      productName: this.product?.name
    }).subscribe({
      next: (videos: any[]) => {
        // Chỉ hiển thị những gì tìm thấy, không tự ý tìm bù (No Fallback)
        this.processVideos(videos);
      },
      error: (err: any) => console.error('Error fetching health videos:', err)
    });
  }

  processVideos(videos: any[]) {
    this.healthVideos = (videos || []).map(v => {
      const videoId = this.extractYoutubeId(v.url);
      const id = v._id?.$oid || v._id || videoId || v.id;
      return {
        ...v,
        id: id,
        thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : 'assets/images/banner/About_us_Hero.png'
      };
    });
    this.cdr.detectChanges();
  }

  // Carousel Logic
  currVideoIdx = 0;
  maxVisible = 4;
  showAllVideos = false;

  showFavoritesModal = false;

  get currentVideoList(): any[] {
    return this.healthVideos;
  }

  get visibleVideos() {
    const source = this.currentVideoList;
    if (this.showAllVideos) {
      return source;
    }
    return source.slice(this.currVideoIdx, this.currVideoIdx + this.maxVisible);
  }

  toggleShowAllVideos() {
    this.showAllVideos = !this.showAllVideos;
  }

  openFavoritesModal() {
    this.showFavoritesModal = true;
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  closeFavoritesModal() {
    this.showFavoritesModal = false;
    document.body.style.overflow = ''; // Restore scrolling
  }

  nextSlide() {
    if (!this.showAllVideos && this.currVideoIdx + this.maxVisible < this.currentVideoList.length) {
      this.currVideoIdx += 1;
    }
  }

  prevSlide() {
    if (!this.showAllVideos && this.currVideoIdx > 0) {
      this.currVideoIdx -= 1;
    }
  }

  canGoNext(): boolean {
    return !this.showAllVideos && (this.currVideoIdx + this.maxVisible < this.currentVideoList.length);
  }

  canGoPrev(): boolean {
    return !this.showAllVideos && (this.currVideoIdx > 0);
  }


  getLikeCount(video: any): string {
    if (!video) return '0';
    const url = video.url || '';
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash) + url.charCodeAt(i);
      hash |= 0;
    }
    // Tạo con số cơ sở từ 1,000 đến 15,000
    const baseRaw = Math.abs(hash % 14000) + 1000;
    const total = baseRaw + (this.isFavorite(video) ? 1 : 0);

    if (total >= 1000) {
      return (total / 1000).toFixed(1).replace('.0', '') + 'k';
    }
    return total.toString();
  }

  // Related Products Carousel Logic
  relatedProdIdx = 0;
  maxVisibleRelated = 6;

  get visibleRelatedProducts() {
    return this.relatedProducts.slice(this.relatedProdIdx, this.relatedProdIdx + this.maxVisibleRelated);
  }

  nextRelatedSlide() {
    if (this.relatedProdIdx + this.maxVisibleRelated < this.relatedProducts.length) {
      this.relatedProdIdx += 1;
    }
  }

  prevRelatedSlide() {
    if (this.relatedProdIdx > 0) {
      this.relatedProdIdx -= 1;
    }
  }

  canGoNextRelated(): boolean {
    return (this.relatedProdIdx + this.maxVisibleRelated < this.relatedProducts.length);
  }

  canGoPrevRelated(): boolean {
    return (this.relatedProdIdx > 0);
  }


  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  buyNowRelated(product: any): void {
    if (!product) return;
    this.buyNowService.buyNow(product, 1);
  }

  addRelatedToCart(product: any, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!product) return;

    this.cartService.addItem({
      _id: product._id?.$oid || product._id || product.id,
      sku: product.sku || '',
      productName: product.name || product.productName || '',
      name: product.name || '',
      image: product.image || '',
      price: (product.price || 0) - (product.discount || 0),
      discount: product.discount || 0,
      unit: product.unit || 'Hộp',
      slug: this.getProductSlug(product),
    }, 1);

    const btn = (event.target as HTMLElement).closest('button') || event.target as HTMLElement;
    this.cartAnimation.flyToCart(btn as HTMLElement);
  }

  // Review Methods
  fetchReviews(sku: string) {
    this.productService.getProductReviews(sku).subscribe({
      next: (data: any) => {
        this.reviewsData = data || { sku, reviews: [] };
        this.calculateReviewStats();
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error('Error fetching reviews:', err)
    });
  }

  calculateReviewStats() {
    const reviews = this.reviewsData.reviews || [];
    const total = reviews.length;
    if (total === 0) {
      this.reviewStats = { average: 0, total: 0, stars: [0, 0, 0, 0, 0] };
      return;
    }

    let sum = 0;
    const stars = [0, 0, 0, 0, 0]; // 5, 4, 3, 2, 1
    reviews.forEach((r: any) => {
      sum += r.rating;
      if (r.rating >= 1 && r.rating <= 5) {
        stars[5 - r.rating]++;
      }
    });

    this.reviewStats = {
      average: (sum / total).toFixed(1),
      total: total,
      stars: stars
    };
  }

  get totalFilteredCount(): number {
    let list = this.reviewsData.reviews || [];
    if (this.selectedStarFilter !== null) {
      list = list.filter((r: any) => r.rating === this.selectedStarFilter);
    }
    return list.length;
  }

  get filteredReviews() {
    let list = this.reviewsData.reviews || [];
    if (this.selectedStarFilter !== null) {
      list = list.filter((r: any) => r.rating === this.selectedStarFilter);
    }
    // Sort by time newest first
    return [...list].sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, this.visibleReviewsCount);
  }

  filterByStar(star: number | null) {
    this.selectedStarFilter = star;
    this.visibleReviewsCount = 3; // Reset count when filtering
  }

  loadMoreReviews() {
    this.visibleReviewsCount += 5;
  }

  collapseReviews() {
    this.visibleReviewsCount = 3;
    // Scroll smoothly to the top of review list when collapsing
    const element = document.querySelector('.review-list');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Consultation Methods
  fetchConsultations(sku: string) {
    this.productService.getProductConsultations(sku).subscribe({
      next: (data: any) => {
        this.consultationsData = data || { sku, questions: [] };
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error('Error fetching consultations:', err)
    });
  }

  get filteredConsultations() {
    let list = this.consultationsData.questions || [];

    // Sort
    if (this.selectedConsultationSort === 'newest') {
      list = [...list].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (this.selectedConsultationSort === 'oldest') {
      list = [...list].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (this.selectedConsultationSort === 'helpful') {
      list = [...list].sort((a: any, b: any) => (b.likes?.length || 0) - (a.likes?.length || 0));
    }

    return list.slice(0, this.visibleConsultationsCount);
  }

  filterConsultations(sort: string) {
    this.selectedConsultationSort = sort;
    this.visibleConsultationsCount = 3; // Reset when filtering
  }

  loadMoreConsultations() {
    this.visibleConsultationsCount += 5;
  }

  collapseConsultations() {
    this.visibleConsultationsCount = 3;
    const element = document.querySelector('.consultations-list');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  isConsultationLiked(question: any): boolean {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId || !question || !Array.isArray(question.likes)) return false;
    return question.likes.some((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });
  }

  likeConsultation(question: any) {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId) {
      this.authService.openAuthModal();
      return;
    }
    const qId = this.getGenericId(question);
    if (!qId) return;

    // Optimistic Update
    if (!Array.isArray(question.likes)) question.likes = [];
    const idx = question.likes.findIndex((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });

    if (idx > -1) {
      question.likes.splice(idx, 1);
    } else {
      question.likes.push(userId);
    }
    this.cdr.detectChanges();

    this.productService.likeConsultation({
      sku: this.product.sku,
      questionId: qId,
      userId: userId
    }).subscribe({
      next: (data: any) => {
        if (data && data.questions) {
          const updatedQ = data.questions.find((q: any) => this.getGenericId(q) === qId);
          if (updatedQ) {
            question.likes = updatedQ.likes;
            this.cdr.detectChanges();
          }
        }
      },
      error: (err: any) => {
        console.error('Like consultation error', err);
        // Revert on error could be added here if needed
      }
    });
  }

  toggleReplyConsultation(question: any) {
    const qid = this.getGenericId(question);
    if (this.replyingToQuestionId === qid) {
      this.replyingToQuestionId = null;
    } else {
      this.replyingToQuestionId = qid;
      this.consultationReplyContent = '';
    }
  }

  submitReplyConsultation(question: any) {
    if (!this.consultationReplyContent.trim()) {
      this.toastService.showError('Vui lòng nhập nội dung trả lời');
      return;
    }

    const user = this.authService.currentUser();
    const fullname = user ? (user.full_name as string || user.phone as string || '') : 'Khách';
    const avatar = user ? (user.avatar as string || '') : '';

    const payload = {
      sku: this.product.sku,
      questionId: this.getGenericId(question),
      content: this.consultationReplyContent,
      fullname: fullname,
      user_id: user?.user_id || this.getCurrentUserIdOrGuest(),
      avatar: avatar,
      isAdmin: !!user?.['isAdmin']
    };

    console.log('[DEBUG] Submitting consultation reply payload:', payload);

    this.productService.replyToConsultation(payload).subscribe({
      next: (data: any) => {
        this.toastService.showSuccess('Đã gửi phản hồi thành công!');
        this.consultationsData = data;
        this.replyingToQuestionId = null;
        this.consultationReplyContent = '';
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Reply consultation error:', err);
        const msg = err.error?.message || 'Lỗi gửi phản hồi. Vui lòng thử lại.';
        this.toastService.showError(msg);
      }
    });
  }

  // Reply Edit/Delete Methods
  startEditReply(question: any, reply: any) {
    this.editingReplyId = reply._id;
    this.editReplyContent = reply.content;
    this.replyingToQuestionId = null; // Close any open reply inputs
  }

  cancelEditReply() {
    this.editingReplyId = null;
    this.editReplyContent = '';
  }

  updateReply(question: any, reply: any) {
    if (!this.editReplyContent.trim()) {
      this.toastService.showError('Vui lòng nhập nội dung phản hồi');
      return;
    }

    const payload = {
      sku: this.product.sku,
      questionId: this.getGenericId(question),
      replyId: reply._id,
      content: this.editReplyContent,
      userId: this.getCurrentUserIdOrGuest()
    };

    this.productService.updateConsultationReply(payload).subscribe({
      next: (data: any) => {
        this.toastService.showSuccess('Đã cập nhật phản hồi');
        this.consultationsData = data;
        this.cancelEditReply();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Update reply error:', err);
        this.toastService.showError('Lỗi cập nhật phản hồi');
      }
    });
  }

  isExpertAnswerLiked(question: any): boolean {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId || !question || !Array.isArray(question.answerLikes)) return false;
    return question.answerLikes.some((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });
  }

  likeExpertAnswer(question: any) {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId) {
      this.authService.openAuthModal();
      return;
    }

    const qId = this.getGenericId(question);
    if (!qId) return;

    // Optimistic Update
    if (!Array.isArray(question.answerLikes)) question.answerLikes = [];
    const idx = question.answerLikes.findIndex((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });

    if (idx > -1) {
      question.answerLikes.splice(idx, 1);
    } else {
      question.answerLikes.push(userId);
    }
    this.cdr.detectChanges();

    this.productService.likeConsultationExpertAnswer({
      sku: this.product.sku,
      questionId: qId,
      userId: userId
    }).subscribe({
      next: (updatedDoc: any) => {
        if (updatedDoc && updatedDoc.questions) {
          const q = updatedDoc.questions.find((item: any) => this.getGenericId(item) === qId);
          if (q) {
            question.answerLikes = q.answerLikes;
            this.cdr.detectChanges();
          }
        }
      },
      error: (err: any) => {
        console.error('Like expert answer error:', err);
      }
    });
  }

  confirmDeleteReply(question: any, reply: any) {
    this.itemToDelete = reply;
    this.targetQuestionId = this.getGenericId(question);
    this.deleteType = 'reply';
    this.showDeleteConfirmModal = true;
  }

  isReplyLiked(reply: any): boolean {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId || !reply || !Array.isArray(reply.likes)) return false;
    return reply.likes.some((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });
  }

  likeReply(question: any, reply: any) {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId) {
      this.authService.openAuthModal();
      return;
    }

    const qId = this.getGenericId(question);
    const rId = reply._id;
    if (!qId || !rId) return;

    // Optimistic Update
    if (!Array.isArray(reply.likes)) reply.likes = [];
    const idx = reply.likes.findIndex((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });

    if (idx > -1) {
      reply.likes.splice(idx, 1);
    } else {
      reply.likes.push(userId);
    }
    this.cdr.detectChanges();

    this.productService.likeConsultationReply({
      sku: this.product.sku,
      questionId: qId,
      replyId: rId,
      userId: userId
    }).subscribe({
      next: (updatedDoc: any) => {
        // Sync with server state if needed, though local sync is often enough for simple Toggles
        if (updatedDoc && updatedDoc.questions) {
          const q = updatedDoc.questions.find((item: any) => this.getGenericId(item) === qId);
          if (q && q.replies) {
            const r = q.replies.find((item: any) => item._id === rId);
            if (r) {
              reply.likes = r.likes;
              this.cdr.detectChanges();
            }
          }
        }
      },
      error: (err: any) => {
        console.error('Like reply error:', err);
      }
    });
  }

  getStarPercentage(count: number): string {
    if (this.reviewStats.total === 0) return '0%';
    return (count / this.reviewStats.total * 100) + '%';
  }

  // Review Modal State
  showReviewModal = false;
  isQuestionMode = false;
  userRating = 5;
  userReviewContent = '';
  /** Tên hiển thị khi khách vãng lai gửi đánh giá/câu hỏi (bắt buộc nếu chưa đăng nhập) */
  guestDisplayName = '';

  openReviewModal(mode: 'review' | 'question' = 'review') {
    if (mode === 'review' && !this.authService.currentUser()) {
      this.authService.showHeaderSuccess('Vui lòng đăng nhập để đánh giá sản phẩm');
      this.authService.openAuthModal();
      return;
    }
    this.isQuestionMode = mode === 'question';
    this.showReviewModal = true;
    this.userRating = 5; // Reset to default
    this.userReviewContent = '';

    if (this.isQuestionMode && !this.authService.currentUser()) {
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      this.guestDisplayName = `Khách vãng lai ${randomCode}`;
    } else {
      this.guestDisplayName = '';
    }

    document.body.style.overflow = 'hidden';
  }

  closeReviewModal() {
    this.showReviewModal = false;
    document.body.style.overflow = '';
  }

  setUserRating(star: number) {
    this.userRating = star;
  }

  getRatingLabel(star: number): string {
    switch (star) {
      case 5: return 'Tuyệt vời';
      case 4: return 'Hài lòng';
      case 3: return 'Bình thường';
      case 2: return 'Không hài lòng';
      case 1: return 'Thất vọng';
      default: return '';
    }
  }

  submitReview() {
    if (!this.product || !this.product.sku) {
      this.toastService.showError('Không tìm thấy thông tin sản phẩm (SKU)');
      return;
    }
    const user = this.authService.currentUser();
    const fullname = user ? (user.full_name as string || user.phone as string || '') : (this.guestDisplayName?.trim() || '');
    if (!user?.user_id && !fullname) {
      this.toastService.showError('Vui lòng nhập họ tên để gửi đánh giá.');
      return;
    }

    const reviewData = {
      sku: this.product.sku,
      rating: this.userRating,
      content: this.userReviewContent,
      fullname,
      avatar: user?.avatar || '',
      customer_id: user?.user_id || this.guestId
    };

    this.productService.submitReview(reviewData).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess('Cảm ơn bạn đã đánh giá sản phẩm!');
        this.closeReviewModal();
        this.fetchReviews(this.product.sku); // Refresh list
        setTimeout(() => {
          this.noticeService.triggerRefresh(); // Refresh header bell
        }, 800);
      },
      error: (err: any) => {
        console.error('Submit review error:', err);
        this.toastService.showError('Có lỗi xảy ra khi gửi đánh giá. Vui lòng thử lại.');
      }
    });
  }

  submitQuestion() {
    if (!this.userReviewContent.trim()) {
      this.toastService.showError('Vui lòng nhập nội dung câu hỏi');
      return;
    }
    const user = this.authService.currentUser();
    const fullName = user ? (user.full_name as string || user.phone as string || '') : (this.guestDisplayName?.trim() || '');
    if (!user?.user_id && !fullName) {
      this.toastService.showError('Vui lòng nhập họ tên để gửi câu hỏi.');
      return;
    }

    const payload: any = {
      sku: this.product.sku,
      question: this.userReviewContent,
      full_name: fullName,
      avatar: user?.avatar || ''
    };
    if (user?.user_id) {
      payload['user_id'] = user.user_id;
    }

    this.productService.submitConsultation(payload).subscribe({
      next: (res: any) => {
        this.authService.showHeaderSuccess('Câu hỏi của bạn đã được gửi thành công! VitaCare sẽ phản hồi sớm nhất có thể.');
        this.closeReviewModal();
        this.fetchConsultations(this.product.sku); // Refresh list
        setTimeout(() => {
          this.noticeService.triggerRefresh(); // Refresh header bell
        }, 800);
      },
      error: (err: any) => {
        console.error('Submit question error:', err);
        this.toastService.showError('Có lỗi xảy ra khi gửi câu hỏi. Vui lòng thử lại.');
      }
    });
  }

  // Reply Handling
  toggleReply(review: any) {
    if (!this.authService.currentUser()) {
      this.toastService.showError('Vui lòng đăng nhập để phản hồi đánh giá');
      this.authService.openAuthModal();
      return;
    }
    const rId = this.getGenericId(review);
    if (this.replyingToReviewId === rId) {
      this.replyingToReviewId = null;
    } else {
      this.replyingToReviewId = rId;
      this.replyContent = '';
    }
  }

  submitReply(review: any) {
    if (!this.replyContent.trim()) {
      this.toastService.showError('Vui lòng nhập nội dung trả lời');
      return;
    }

    const user = this.authService.currentUser();
    const fullname = user ? (user.full_name as string || user.phone as string || '') : 'Khách';
    const avatar = user ? (user.avatar as string || '') : '';

    const payload = {
      sku: this.product.sku,
      reviewId: this.getGenericId(review),
      content: this.replyContent,
      fullname: fullname,
      avatar: avatar,
      isAdmin: !!user?.['isAdmin'],
      userId: this.getCurrentUserIdOrGuest() // Ensure correct ID extraction
    };

    console.log('[DEBUG] Submitting review reply payload:', payload);

    this.productService.replyToReview(payload).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess('Đã gửi phản hồi thành công!');
        this.replyingToReviewId = null;
        this.replyContent = '';
        this.fetchReviews(this.product.sku); // Refresh
      },
      error: (err: any) => {
        console.error('Reply error:', err);
        const msg = err.error?.message || 'Lỗi gửi phản hồi. Vui lòng thử lại.';
        this.toastService.showError(msg);
      }
    });
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hôm nay';
    if (diffDays < 30) return `${diffDays} ngày trước`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} tháng trước`;
    return `${Math.floor(diffDays / 365)} năm trước`;
  }

  autoResizeTextarea(event: any) {
    const textarea = event.target;
    textarea.style.height = 'auto'; // Reset height
    textarea.style.height = textarea.scrollHeight + 'px'; // Set to scrollHeight
  }

  getProductSlug(product: any): string {
    if (!product) return '';
    const id = product._id?.$oid || product._id || product.id || '';
    return product.slug || String(id);
  }

  getAvatarUrl(item: any): string | null {
    if (!item || !item.avatar) return null;
    return item.avatar;
  }

  getReviewImageUrl(img: any): string {
    const s = String(img || '').trim();
    if (!s) return '';
    if (s.startsWith('data:')) return s;
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    // If backend already returns absolute/relative with leading slash, keep it.
    if (s.startsWith('/')) return s;
    // Fallback: assume relative path on backend host.
    return `/${s.replace(/^\/+/, '')}`;
  }

  getInitials(name: string): string {
    if (!name) return 'K';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  isPharmacist(data: any): boolean {
    if (!data) return false;
    // Strictly check for the is_admin flag. 
    // Do NOT check for answeredBy here, as that exists on questions too.
    return !!data.is_admin;
  }

  isMember(data: any): boolean {
    if (!data) return false;
    const uid = data.user_id || data.userId || '';
    if (!uid) return false;
    return !String(uid).startsWith('guest_');
  }

  isGuest(data: any): boolean {
    if (!data) return true;
    const uid = data.user_id || data.userId || '';
    if (!uid) return true;
    return String(uid).startsWith('guest_');
  }

  isAdminRole(reply: any): boolean {
    // This is now redundant as all officials are Pharmacists, but keeping for structure
    return false;
  }

  getOfficialName(data: any): string {
    if (this.isPharmacist(data)) return 'VitaCare';
    const name = data.fullname || data.full_name;
    if (name) return name;
    if (this.isMember(data)) return 'Thành viên';
    return 'Khách vãng lai';
  }

  scrollToTab(tabId: string) {
    // 1. Switch to the correct tab if necessary (this logic depends on ProductTabsContent implementation)
    // For now, we assume scrolling to the element is enough or the component handles tab switching via route/fragment
    const element = document.getElementById(tabId) || document.querySelector(`[data-tab-id="${tabId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  isLiked(review: any): boolean {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId || !review || !Array.isArray(review.likes)) return false;
    return review.likes.some((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });
  }

  likeReview(review: any) {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId) {
      this.authService.openAuthModal();
      return;
    }

    const docId = this.getGenericId(review);
    if (!docId) return;

    // Optimistic cache update
    if (!Array.isArray(review.likes)) review.likes = [];
    const idx = review.likes.findIndex((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });

    if (idx > -1) {
      review.likes.splice(idx, 1);
    } else {
      review.likes.push(userId);
    }
    this.cdr.detectChanges();

    this.productService.likeReview({
      sku: this.product.sku,
      reviewId: docId,
      userId: userId
    }).subscribe({
      next: (updatedDoc: any) => {
        if (updatedDoc && updatedDoc.reviews) {
          const remoteRev = updatedDoc.reviews.find((r: any) => this.getGenericId(r) === docId);
          if (remoteRev && remoteRev.likes) {
            review.likes = remoteRev.likes;
            this.cdr.detectChanges();
          }
        }
      },
      error: (err: any) => console.error('Lỗi khi like đánh giá:', err)
    });
  }

  isReviewReplyLiked(reply: any): boolean {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId || !reply || !Array.isArray(reply.likes)) return false;
    return reply.likes.some((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });
  }

  likeReviewReply(review: any, reply: any) {
    const userId = String(this.getCurrentUserIdOrGuest() || '');
    if (!userId) {
      this.authService.openAuthModal();
      return;
    }

    const rId = this.getGenericId(review);
    const repId = reply._id;
    if (!rId || !repId) return;

    // Optimistic Update
    if (!Array.isArray(reply.likes)) reply.likes = [];
    const idx = reply.likes.findIndex((id: any) => {
      const idStr = (id && typeof id === 'object' && id.$oid) ? id.$oid : String(id || '');
      return idStr === userId;
    });

    if (idx > -1) {
      reply.likes.splice(idx, 1);
    } else {
      reply.likes.push(userId);
    }
    this.cdr.detectChanges();

    this.productService.likeReviewReply({
      sku: this.product.sku,
      reviewId: rId,
      replyId: repId,
      userId: userId
    }).subscribe({
      next: (updatedDoc: any) => {
        if (updatedDoc && updatedDoc.reviews) {
          const r = updatedDoc.reviews.find((item: any) => this.getGenericId(item) === rId);
          if (r && r.replies) {
            const rep = r.replies.find((item: any) => item._id === repId);
            if (rep) {
              reply.likes = rep.likes;
              this.cdr.detectChanges();
            }
          }
        }
      },
      error: (err: any) => {
        console.error('Like review reply error:', err);
      }
    });
  }

  // --- OWNERSHIP CHECKS ---
  canManageReview(review: any): boolean {
    const currentUid = this.getCurrentUserIdOrGuest();
    if (!currentUid || !review) return false;
    const rUid = this.getStringId(review.customer_id || review.user_id);
    const isOwner = !!(rUid && currentUid && String(rUid).toLowerCase() === String(currentUid).toLowerCase());

    if (!isOwner && (review.customer_id || review.user_id)) {
      (review as any)._debugOwnership = { currentUid, rUid };
    }
    return isOwner;
  }

  canManageReviewReply(review: any, reply: any): boolean {
    const currentUser = this.authService.currentUser();
    if (!currentUser || !reply) return false;

    const currentUid = currentUser.user_id;
    const currentName = currentUser.full_name;

    // Check by ID first
    const repUid = this.getStringId(reply.user_id || reply.userId);
    if (repUid && currentUid && String(repUid).toLowerCase() === String(currentUid).toLowerCase()) {
      return true;
    }

    // Fallback: check by name if ID is missing (common for new replies pending server restart)
    if (!repUid || repUid === 'null' || repUid === 'undefined') {
      if (reply.fullname && currentName && reply.fullname === currentName) {
        return true;
      }
    }

    return false;
  }

  // --- REVIEW EDIT/DELETE ---

  startEditReview(review: any) {
    this.editingReviewId = this.getGenericId(review);
    this.editReviewContent = review.content;
    this.editReviewRating = review.rating || 5;
  }

  cancelEditReview() {
    this.editingReviewId = null;
    this.editReviewContent = '';
  }

  updateReview(review: any) {
    if (!this.editReviewContent.trim()) {
      this.toastService.showError('Nội dung đánh giá không được để trống');
      return;
    }

    const payload = {
      sku: this.product.sku,
      reviewId: this.getGenericId(review),
      content: this.editReviewContent,
      rating: this.editReviewRating
    };

    this.productService.updateReview(payload).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess('Cập nhật đánh giá thành công!');
        this.editingReviewId = null;
        this.fetchReviews(this.product.sku);
      },
      error: (err: any) => {
        console.error('Update review error:', err);
        this.toastService.showError('Lỗi cập nhật đánh giá');
      }
    });
  }

  deleteReview(review: any) {
    this.itemToDelete = review;
    this.deleteType = 'review';
    this.showDeleteConfirmModal = true;
    document.body.style.overflow = 'hidden';
  }

  // --- REVIEW REPLY EDIT/DELETE ---
  startEditReviewReply(reply: any) {
    this.editingReviewReplyId = reply._id;
    this.editReviewReplyContent = reply.content;
  }

  cancelEditReviewReply() {
    this.editingReviewReplyId = null;
    this.editReviewReplyContent = '';
  }

  updateReviewReply(review: any, reply: any) {
    if (!this.editReviewReplyContent.trim()) {
      this.toastService.showError('Nội dung phản hồi không được để trống');
      return;
    }

    const payload = {
      sku: this.product.sku,
      reviewId: this.getGenericId(review),
      replyId: reply._id,
      content: this.editReviewReplyContent,
      userId: this.getCurrentUserIdOrGuest()
    };

    this.productService.updateReviewReply(payload).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess('Cập nhật phản hồi thành công!');
        this.editingReviewReplyId = null;
        this.fetchReviews(this.product.sku);
      },
      error: (err: any) => {
        console.error('Update reply error:', err);
        const msg = err.error?.message || 'Lỗi cập nhật phản hồi';
        this.toastService.showError(msg);
      }
    });
  }

  deleteReviewReply(review: any, reply: any) {
    this.itemToDelete = { review, reply };
    this.deleteType = 'review_reply';
    this.showDeleteConfirmModal = true;
    document.body.style.overflow = 'hidden';
  }

  // --- CONSULTATION EDIT/DELETE ---
  startEditQuestion(question: any) {
    this.editingQuestionId = this.getGenericId(question);
    this.editQuestionContent = question.question;
  }

  cancelEditQuestion() {
    this.editingQuestionId = null;
    this.editQuestionContent = '';
  }

  updateQuestion(question: any) {
    if (!this.editQuestionContent.trim()) {
      this.toastService.showError('Nội dung câu hỏi không được để trống');
      return;
    }

    const payload = {
      sku: this.product.sku,
      questionId: this.getGenericId(question),
      question: this.editQuestionContent
    };

    this.productService.updateConsultation(payload).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess('Cập nhật câu hỏi thành công!');
        this.editingQuestionId = null;
        this.fetchConsultations(this.product.sku);
      },
      error: (err: any) => {
        console.error('Update question error:', err);
        this.toastService.showError('Lỗi cập nhật câu hỏi');
      }
    });
  }

  deleteQuestion(question: any) {
    this.itemToDelete = question;
    this.deleteType = 'question';
    this.showDeleteConfirmModal = true;
    document.body.style.overflow = 'hidden';
  }

  // --- CUSTOM DELETE CONFIRMATION ---
  closeDeleteModal() {
    this.showDeleteConfirmModal = false;
    this.itemToDelete = null;
    this.deleteType = null;
    document.body.style.overflow = '';
  }

  confirmDelete() {
    if (!this.itemToDelete || !this.deleteType) return;
    const itemId = this.getGenericId(this.itemToDelete);

    if (this.deleteType === 'review') {
      this.productService.deleteReview(this.product.sku, itemId).subscribe({
        next: (res: any) => {
          this.toastService.showSuccess('Đã xóa đánh giá');
          this.fetchReviews(this.product.sku);
          this.closeDeleteModal();
        },
        error: (err: any) => {
          console.error('Delete review error:', err);
          this.toastService.showError('Lỗi khi xóa đánh giá');
        }
      });
    } else if (this.deleteType === 'question') {
      this.productService.deleteConsultation(this.product.sku, itemId).subscribe({
        next: (res: any) => {
          this.toastService.showSuccess('Đã xóa câu hỏi');
          this.fetchConsultations(this.product.sku);
          this.closeDeleteModal();
        },
        error: (err: any) => {
          console.error('Delete question error:', err);
          this.toastService.showError('Lỗi khi xóa câu hỏi');
        }
      });
    } else if (this.deleteType === 'reply' && this.targetQuestionId) {
      const userId = String(this.getCurrentUserIdOrGuest() || '');
      this.productService.deleteConsultationReply(this.product.sku, this.targetQuestionId, itemId, userId).subscribe({
        next: (res: any) => {
          this.toastService.showSuccess('Đã xóa phản hồi');
          this.consultationsData = res;
          this.closeDeleteModal();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          console.error('Delete reply error:', err);
          this.toastService.showError('Lỗi khi xóa phản hồi');
        }
      });
    } else if (this.deleteType === 'review_reply') {
      const { review, reply } = this.itemToDelete;
      this.productService.deleteReviewReply(
        this.product.sku,
        this.getGenericId(review),
        reply._id,
        this.getCurrentUserIdOrGuest()
      ).subscribe({
        next: () => {
          this.toastService.showSuccess('Đã xóa phản hồi');
          this.fetchReviews(this.product.sku);
          this.closeDeleteModal();
        },
        error: (err: any) => {
          console.error('Delete reply error:', err);
          const msg = err.error?.message || 'Lỗi khi xóa phản hồi';
          this.toastService.showError(msg);
        }
      });
    }
  }

  trackRecentlyViewed(product: any) {
    if (!product) return;
    const user = this.authService.currentUser();

    // Prepare minimal product object as requested
    const minimalProduct = {
      id: (product._id?.$oid || product._id || product.id)?.toString(),
      name: product.name,
      image: product.image,
      price: product.price,
      discount: product.discount,
      slug: this.getProductSlug(product)
    };

    if (user) {
      this.productService.trackProductView(user.user_id, minimalProduct).subscribe({
        next: () => this.loadRecentlyViewed(),
        error: (err) => console.error('[ProductDetail] Track view error:', err)
      });
    }

    let viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    viewed = viewed.filter((p: any) => (p._id?.$oid || p._id || p.id)?.toString() !== minimalProduct.id);
    viewed.unshift(product); // Still keep full product in localStorage for guest hydration
    viewed = viewed.slice(0, 20);
    localStorage.setItem('recentlyViewed', JSON.stringify(viewed));
    if (!user) this.loadRecentlyViewed();
  }

  loadRecentlyViewed() {
    const user = this.authService.currentUser();
    if (user) {
      this.productService.getRecentlyViewed(user.user_id).subscribe({
        next: (res: any) => {
          this.recentlyViewedProducts = (res?.recentlyViewed || []).slice(0, 6);
          this.cdr.detectChanges();
        },
        error: (err) => console.error('[ProductDetail] Load recently viewed error:', err)
      });
    } else {
      const viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
      this.recentlyViewedProducts = viewed.slice(0, 6);
    }
  }

  clearRecentlyViewedHistory() {
    const user = this.authService.currentUser();
    if (user) {
      this.productService.clearRecentlyViewedHistory(user.user_id).subscribe({
        next: () => this.loadRecentlyViewed(),
        error: (err) => console.error('[ProductDetail] Clear error:', err)
      });
    }
    localStorage.removeItem('recentlyViewed');
    if (!user) this.loadRecentlyViewed();
  }

  removeRecentlyViewedProduct(product: any) {
    if (!product) return;
    const user = this.authService.currentUser();
    const productId = (product._id?.$oid || product._id || product.id)?.toString();

    if (user) {
      this.productService.deleteRecentlyViewedProduct(user.user_id, productId).subscribe({
        next: () => this.loadRecentlyViewed(),
        error: (err) => console.error('[ProductDetail] Remove error:', err)
      });
    }

    let viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    viewed = viewed.filter((p: any) => (p._id?.$oid || p._id || p.id)?.toString() !== productId);
    localStorage.setItem('recentlyViewed', JSON.stringify(viewed));
    if (!user) this.loadRecentlyViewed();
  }

}
