import { Component, OnInit, ChangeDetectorRef, effect, inject, Injector } from '@angular/core';
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
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ProductGallery,
    ProductInfoSummary,
    ProductTabsContent
  ],
  templateUrl: './product-detail.html',
  styleUrls: ['./product-detail.css', './product-detail-reviews.css'],
})
export class ProductDetail implements OnInit {
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

  // Video Detail Modal State
  showVideoDetailModal = false;
  selectedVideo: any = null;
  safeVideoUrl: SafeResourceUrl | null = null;
  modalRelatedVideos: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private categoryService: CategoryService,
    private cartService: CartService,
    private cartAnimation: CartAnimationService,
    private buyNowService: BuyNowService,
    readonly authService: AuthService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    // Reload favorites when user logs in/out
    effect(() => {
      const user = this.authService.currentUser();
      this.loadFavorites();
    }, { allowSignalWrites: true });
  }

  openVideoDetail(video: any, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!video) return;

    this.selectedVideo = video;
    this.showVideoDetailModal = true;

    // 1. Filter related videos safely
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

    // 2. Generate standard YouTube URL
    const videoId = this.extractYoutubeId(video.url);
    if (videoId) {
      const origin = window.location.origin;
      const url = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${origin}`;
      this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    } else {
      this.safeVideoUrl = null;
    }

    document.body.style.overflow = 'hidden';
    this.cdr.detectChanges();

    // Scroll modal body to top when changing video
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




  ngOnInit(): void {
    this.loadFavorites();

    // 1. Lấy danh mục để xây dựng breadcrumbs
    this.categoryService.getCategories().subscribe((cats: any[]) => {
      this.categories = cats;
      if (this.product) {
        this.buildCategoryPath(this.product.categoryId);
      }
    });

    // 2. Theo dõi tham số URL
    this.route.paramMap.subscribe((params: any) => {
      const slug = params.get('slug');
      if (slug && slug !== 'undefined' && slug !== 'null') {
        this.fetchProduct(slug);
      }
    });
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
    const vid = video.id || video._id?.$oid || video._id;
    return this.favorites.some(fav =>
      (fav.url && video.url && fav.url === video.url) ||
      (fav.id && vid && String(fav.id) === String(vid))
    );
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
      this.favorites = this.favorites.filter(v => v.id !== video.id);
      this.saveFavoritesToLocal(uid, this.favorites);
      this.groupFavorites();
    } else {
      // Add
      let categoryName = 'Sức khỏe chung';
      if (this.categoryPath.length >= 2) {
        categoryName = this.categoryPath[1].name;
      } else if (this.categoryPath.length > 0) {
        categoryName = this.categoryPath[0].name;
      }

      const videoToSave = { ...video, categoryName: categoryName };
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
      const cat = video.categoryName || 'Sức khỏe chung';
      if (!groups[cat]) {
        groups[cat] = [];
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

          // Track recently viewed in localStorage (Silent)
          this.trackRecentlyViewed(this.product);
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error fetching product:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  trackRecentlyViewed(product: any) {
    if (!product) return;
    let viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    const pId = product._id?.$oid || product._id;
    viewed = viewed.filter((p: any) => (p._id?.$oid || p._id) !== pId);
    viewed.unshift(product);
    viewed = viewed.slice(0, 6);
    localStorage.setItem('recentlyViewed', JSON.stringify(viewed));
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

  extractYoutubeId(url: string): string | null {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
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
    const userId = this.getOrCreateUserId();
    return question.likes && question.likes.includes(userId);
  }

  likeConsultation(question: any) {
    const userId = this.getOrCreateUserId();
    this.productService.likeConsultation({
      sku: this.product.sku,
      questionId: question.id,
      userId: userId
    }).subscribe({
      next: (data: any) => {
        this.consultationsData = data;
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error('Like consultation error', err)
    });
  }

  toggleReplyConsultation(question: any) {
    if (this.replyingToQuestionId === question.id) {
      this.replyingToQuestionId = null;
    } else {
      this.replyingToQuestionId = question.id;
      this.consultationReplyContent = '';
    }
  }

  submitReplyConsultation(question: any) {
    if (!this.consultationReplyContent.trim()) {
      this.toastService.showError('Vui lòng nhập nội dung trả lời');
      return;
    }

    const payload = {
      sku: this.product.sku,
      questionId: question.id,
      content: this.consultationReplyContent,
      fullname: '', // Backend will generate guest name
      isAdmin: false
    };

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
        this.toastService.showError('Lỗi gửi phản hồi. Vui lòng thử lại.');
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
      fullname
    };

    this.productService.submitReview(reviewData).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess('Cảm ơn bạn đã đánh giá sản phẩm!');
        this.closeReviewModal();
        this.fetchReviews(this.product.sku); // Refresh list
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
    };
    if (user?.user_id) {
      payload['user_id'] = user.user_id;
    }

    this.productService.submitConsultation(payload).subscribe({
      next: (res: any) => {
        this.authService.showHeaderSuccess('Câu hỏi của bạn đã được gửi thành công! VitaCare sẽ phản hồi sớm nhất có thể.');
        this.closeReviewModal();
        this.fetchConsultations(this.product.sku); // Refresh list
      },
      error: (err: any) => {
        console.error('Submit question error:', err);
        this.toastService.showError('Có lỗi xảy ra khi gửi câu hỏi. Vui lòng thử lại.');
      }
    });
  }

  // Reply Handling
  replyingToReviewId: string | null = null;
  replyContent: string = '';

  toggleReply(review: any) {
    if (this.replyingToReviewId === review._id) {
      this.replyingToReviewId = null;
    } else {
      this.replyingToReviewId = review._id;
      this.replyContent = '';
    }
  }

  submitReply(review: any) {
    if (!this.replyContent.trim()) {
      this.toastService.showError('Vui lòng nhập nội dung trả lời');
      return;
    }

    const payload = {
      sku: this.product.sku,
      reviewId: review._id,
      content: this.replyContent,
      fullname: 'Khách', // Default for now
      isAdmin: false
    };

    this.productService.replyToReview(payload).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess('Đã gửi phản hồi thành công!');
        this.replyingToReviewId = null;
        this.replyContent = '';
        this.fetchReviews(this.product.sku); // Refresh
      },
      error: (err: any) => {
        console.error('Reply error:', err);
        this.toastService.showError('Lỗi gửi phản hồi. Vui lòng thử lại.');
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
    // Ưu tiên _id để điều hướng đáng tin cậy (backend tìm theo ObjectId)
    if (product._id) {
      if (typeof product._id === 'string') return product._id;
      if (product._id.$oid) return product._id.$oid;
      if (typeof product._id.toString === 'function') return product._id.toString();
    }
    if (product.slug && product.slug.trim() !== '') return product.slug;
    return '';
  }

  getOrCreateUserId(): string {
    let userId = localStorage.getItem('guest_user_id');
    if (!userId) {
      userId = `GUEST_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      localStorage.setItem('guest_user_id', userId);
    }
    return userId;
  }

  isLiked(review: any): boolean {
    const userId = this.getOrCreateUserId();
    return review.likes && review.likes.includes(userId);
  }

  likeReview(review: any) {
    const userId = this.getOrCreateUserId();

    this.productService.likeReview({
      sku: this.product.sku,
      reviewId: review._id,
      userId: userId
    }).subscribe({
      next: (updatedDoc: any) => {
        // Since backend returns the whole updated DOC
        if (updatedDoc && updatedDoc.reviews) {
          const updatedReview = updatedDoc.reviews.find((r: any) => r._id === review._id);
          if (updatedReview) {
            // Update specific review in our local list to trigger UI change
            const index = this.reviewsData.reviews.findIndex((r: any) => r._id === review._id);
            if (index !== -1) {
              this.reviewsData.reviews[index] = updatedReview;
              // Re-filter if necessary, or just force update
              this.calculateReviewStats(); // re-calc stats if needed
              this.cdr.detectChanges();
            }

            // Also update filteredReviews if it's being displayed there
            const fIndex = this.filteredReviews.findIndex((r: any) => r._id === review._id);
            if (fIndex !== -1) {
              this.filteredReviews[fIndex] = updatedReview;
            }
          }
        }
      },
      error: (err: any) => console.error('Like error', err)
    });
  }

}
