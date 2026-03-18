import { Component, OnDestroy, AfterViewInit, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CartService } from '../../../core/services/cart.service';
import { CartAnimationService } from '../../../core/services/cart-animation.service';
import { BuyNowService } from '../../../core/services/buy-now.service';
import { AuthService } from '../../../core/services/auth.service';
import { HealthTestService } from '../../../core/services/health-test.service';
import { CategoryService } from '../../../core/services/category.service';
import { BlogService } from '../../../core/services/blog.service';
import { BlogPopupService } from '../../../core/services/blog-popup.service';
import { PromotionService } from '../../../core/services/promotion.service';

interface Product {
  id?: number | string;
  name: string;
  image: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  stock?: number;
  categoryId?: any;
  slug?: string;  // dùng để điều hướng /product/:slug
}

interface Category {
  id?: number;
  name: string;
  icon: string;
}

interface Disease {
  _id?: any;
  name: string;
  image?: string;
  items?: string[]; // bullet points / symptoms
  /** Đường dẫn chi tiết cũ (single disease) – giữ để fallback nếu cần */
  link?: string;
  /** slug nhóm bệnh (groupSlug) dùng cho trang /category/tra-cuu-benh/:groupSlug */
  groupSlug?: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, HttpClientModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class Home implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('brandSlider', { static: false }) brandSlider!: ElementRef<HTMLDivElement> | null;
  @ViewChild('productSlider', { static: false }) productSlider!: ElementRef<HTMLDivElement> | null;
  @ViewChild('seasonalSlider', { static: false }) seasonalSlider!: ElementRef<HTMLDivElement> | null;
  @ViewChild('diseaseSection', { static: false }) diseaseSection!: ElementRef<HTMLElement> | null;
  @ViewChild('quizSlider', { static: false }) quizSlider!: ElementRef<HTMLDivElement> | null;
  @ViewChild('flashProductsSlider', { static: false }) flashProductsSlider!: ElementRef<HTMLDivElement> | null;

  // holds the computed scroll step (width of 4 items)
  private brandScrollStep = 360;
  private productScrollStep = 360;
  private seasonalScrollStep = 360;
  // resize listener ref
  private resizeHandler: (() => void) | null = null;

  // ===== Seasonal nav state (Ý 1: thêm ở đây) =====
  seasonalCanPrev = false;
  seasonalCanNext = false;
  private seasonalScrollListener: (() => void) | null = null;

  // Banner slider (background)
  banners = [
    '/assets/images/banner/Homepage_LNY.png',
    '/assets/images/banner/Hompage_VLT.png',
    '/assets/images/banner/Homepage_YOH.png',
  ];

  // Sub-banners for vc-hero
  subBanner1 = 'assets/images/banner/Banner Homepage  (2).png'; // Left large
  subBanner2 = 'assets/images/banner/Banner Homepage .png';    // Right bottom (User input: sub_2 = ô bên phải nhỏ ở dưới)
  subBanner3 = 'assets/images/banner/Banner Homepage  (1).png'; // Right top    (User input: sub_3 = ô bên phải nhỏ ở trên)

  currentBannerIndex = 0;
  activeFlashSlot: 0 | 1 = 0;

  flashSlotTodayLabel = '';
  flashSlotTomorrowLabel = '';

  flashSlotTodayStatus = '';
  flashSlotTomorrowStatus = '';

  private flashSaleTimer: number | null = null;
  private flashCountdownTimer: number | null = null;

  /** Đếm ngược: slot "Đang diễn ra" → đến 22:00 (Kết thúc sau); slot "Sắp diễn ra" → đến 8:00 (Bắt đầu sau) */
  flashCountdownHours = 0;
  flashCountdownMinutes = 0;
  flashCountdownSeconds = 0;
  flashCountdownEnded = false;
  flashCountdownLabel = 'Kết thúc sau';

  /** ===== Cross-fade state (2 layer) ===== */
  activeLayer: 'A' | 'B' = 'A';
  bgA = this.banners[0];
  bgB = this.banners[0];

  /** animation guard + timer */
  private isAnimating = false;
  private unlockTimer: number | null = null;
  /** Fallback timer cho block Góc sức khỏe trên homepage khi API blog chậm. */
  private homeBlogFallbackTimer: number | null = null;

  /** thời gian fade (ms) — nên khớp CSS transition opacity */
  readonly fadeMs = 420;

  /** Touch/Swipe banner trên mobile */
  private bannerTouchStartX = 0;

  /** Optional: tự chạy banner (nếu muốn) */
  // private autoplayTimer: number | null = null;
  // readonly autoplayMs = 5000;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private cart: CartService,
    private cartAnimation: CartAnimationService,
    private buyNowService: BuyNowService,
    private router: Router,
    private authService: AuthService,
    private healthTestService: HealthTestService,
    private categoryService: CategoryService,
    private blogService: BlogService,
    private blogPopupService: BlogPopupService,
    private promotionService: PromotionService
  ) {
    // Nếu muốn autoplay thì bật:
    // this.startAutoplay();
  }

  ngOnInit(): void {
    // fetch featured products from backend (limit to 8)
    this.loadFeaturedProducts();
    // fetch flash sale products
    this.loadFlashSaleProducts(8);
    // fetch blogs for 'Góc sức khỏe'
    // Một request limit lớn hơn → đủ bài cho Góc SK + random popup, chờ API một lần
    this.blogPopupPageEnterMs = typeof Date !== 'undefined' ? Date.now() : 0;
    // Lên lịch popup ngay bằng pool fallback — đảm bảo luôn hiện sau 4s; khi API trả về sẽ cập nhật nội dung nếu cần
    this.prepareBlogPopupFromPool(this.getBlogPopupFallbackPool());
    this.scheduleBlogPopupReveal();
    this.loadBlogs(6, 24);
    this.loadQuizItems();
    this.loadCategorySlugsFromApi();
    this.computeFlashSaleSlots();
    this.flashSaleTimer = window.setInterval(() => this.computeFlashSaleSlots(), 60 * 1000);
    this.computeFlashCountdown();
    this.flashCountdownTimer = window.setInterval(() => {
      this.computeFlashCountdown();
      this.cdr.markForCheck();
    }, 1000);
    // Mobile: bệnh theo mùa chỉ hiện 4, bấm "Xem thêm" mới hiện hết
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 576px)').matches) {
      this.showAllSeasonalDiseases = false;
    }
    this.loadDynamicBanners();
  }

  private loadDynamicBanners(): void {
    this.promotionService.getPromotions().subscribe({
      next: (promotions) => {
        if (!promotions || promotions.length === 0) return;

        // Lọc các promotion có typeBanner bắt đầu bằng "main_"
        const bannerPromos = promotions
          .filter(p => p.typeBanner && p.typeBanner.startsWith('main_'))
          .sort((a, b) => (a.typeBanner || '').localeCompare(b.typeBanner || ''));

        if (bannerPromos.length > 0) {
          const newBanners = bannerPromos.map(p => {
            // Lấy ảnh đầu tiên từ mảng images hoặc fallback
            if (p.images && p.images.length > 0) {
              return p.images[0];
            }
            return '/assets/images/banner/About_us_Hero.png';
          });

          this.banners = newBanners;
          this.bgA = this.banners[0];
          this.bgB = this.banners[0];
          this.currentBannerIndex = 0;
          this.cdr.markForCheck();
        }

        // Lọc các sub-banner (sub_1, sub_2, sub_3)
        const sub1 = promotions.find(p => p.typeBanner === 'sub_1');
        const sub2 = promotions.find(p => p.typeBanner === 'sub_2');
        const sub3 = promotions.find(p => p.typeBanner === 'sub_3');

        if (sub1?.images?.length) this.subBanner1 = sub1.images[0];
        if (sub2?.images?.length) this.subBanner2 = sub2.images[0];
        if (sub3?.images?.length) this.subBanner3 = sub3.images[0];

        if (sub1 || sub2 || sub3) {
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        console.error('Failed to load dynamic banners', err);
      }
    });
  }

  private scrollRevealObserver: IntersectionObserver | null = null;

  ngAfterViewInit(): void {
    this.recomputeSliderSteps();
    this.resizeHandler = () => this.recomputeSliderSteps();
    window.addEventListener('resize', this.resizeHandler);
    this.initScrollReveal();
  }

  private initScrollReveal(): void {
    const elements = document.querySelectorAll('.scroll-reveal');
    if (!elements.length) return;

    this.scrollRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            // Unobserve after reveal so animation plays only once
            this.scrollRevealObserver?.unobserve(entry.target);

            // Stagger-reveal card children (vc_reveal_element) inside this section
            const cards = entry.target.querySelectorAll('.vc_reveal_element:not(.active)');
            cards.forEach((card, i) => {
              const el = card as HTMLElement;
              el.style.transitionDelay = `${i * 0.06}s`;
              // Slight timeout to let the parent reveal first
              setTimeout(() => {
                el.classList.add('active');
              }, 80 + i * 60);
            });
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -60px 0px'
      }
    );

    elements.forEach((el) => this.scrollRevealObserver!.observe(el));
  }

  ngOnDestroy(): void {
    this.clearUnlockTimer();

    // remove resize listener
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.scrollRevealObserver) {
      this.scrollRevealObserver.disconnect();
      this.scrollRevealObserver = null;
    }

    // (nếu bạn đã làm flashsale realtime bằng setInterval)
    if (this.flashSaleTimer !== null) {
      window.clearInterval(this.flashSaleTimer);
      this.flashSaleTimer = null;
    }
    if (this.flashCountdownTimer !== null) {
      window.clearInterval(this.flashCountdownTimer);
      this.flashCountdownTimer = null;
    }

    if (this.homeBlogFallbackTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.homeBlogFallbackTimer);
      this.homeBlogFallbackTimer = null;
    }
    if (this.blogPopupAutoCloseTimer !== null) {
      window.clearTimeout(this.blogPopupAutoCloseTimer);
      this.blogPopupAutoCloseTimer = null;
    }
    if (this.blogPopupRevealTimer !== null) {
      window.clearTimeout(this.blogPopupRevealTimer);
      this.blogPopupRevealTimer = null;
    }

    // this.stopAutoplay();
  }

  /** API dùng trong template */
  nextBanner(): void {
    this.goToBanner(this.currentBannerIndex + 1);
  }

  prevBanner(): void {
    this.goToBanner(this.currentBannerIndex - 1);
  }

  setBanner(i: number): void {
    this.goToBanner(i);
  }

  /** Mobile: bắt đầu chạm để lướt banner */
  onBannerTouchStart(e: TouchEvent): void {
    if (e.touches?.length) this.bannerTouchStartX = e.touches[0].clientX;
  }

  /** Mobile: kết thúc chạm — vuốt trái = next, vuốt phải = prev */
  onBannerTouchEnd(e: TouchEvent): void {
    if (!e.changedTouches?.length) return;
    const endX = e.changedTouches[0].clientX;
    const delta = endX - this.bannerTouchStartX;
    const minSwipe = 50;
    if (delta > minSwipe) this.prevBanner();
    if (delta < -minSwipe) this.nextBanner();
  }

  /** Core: đổi banner mượt bằng cross-fade 2 lớp */
  private goToBanner(nextIndex: number): void {
    const n = this.banners.length;
    if (!n) return;

    // normalize index (chấp nhận âm)
    nextIndex = (nextIndex % n + n) % n;

    // nếu bấm vào đúng banner hiện tại thì thôi
    if (nextIndex === this.currentBannerIndex) return;

    // nếu đang fade thì bỏ qua để tránh spam click giật
    if (this.isAnimating) return;

    this.isAnimating = true;
    const nextUrl = this.banners[nextIndex];

    // đặt URL vào layer không active, rồi flip activeLayer => CSS sẽ fade
    if (this.activeLayer === 'A') {
      this.bgB = nextUrl;
      this.activeLayer = 'B';
    } else {
      this.bgA = nextUrl;
      this.activeLayer = 'A';
    }

    this.currentBannerIndex = nextIndex;

    // mở khoá click sau khi animation xong
    this.clearUnlockTimer();
    this.unlockTimer = window.setTimeout(() => {
      this.isAnimating = false;
      this.unlockTimer = null;
    }, this.fadeMs + 40);
  }

  private clearUnlockTimer(): void {
    if (this.unlockTimer !== null) {
      window.clearTimeout(this.unlockTimer);
      this.unlockTimer = null;
    }
  }
  private computeFlashSaleSlots(): void {
    const now = new Date();

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // khung giờ cố định
    const startMin = 8 * 60;   // 08:00
    const endMin = 22 * 60;    // 22:00

    this.flashSlotTodayLabel = this.buildSlotLabel(today, '8:00', '22:00');
    this.flashSlotTomorrowLabel = this.buildSlotLabel(tomorrow, '8:00', '22:00');

    this.flashSlotTodayStatus = this.getSlotStatus(today, startMin, endMin, now);
    this.flashSlotTomorrowStatus = this.getSlotStatus(tomorrow, startMin, endMin, now);

    // auto active theo ngày hiện tại
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayOnly = today.getTime();
    this.activeFlashSlot = (nowDateOnly === todayOnly) ? 0 : 1;
  }

  private buildSlotLabel(date: Date, start: string, end: string): string {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${start} - ${end}, ${d}/${m}/${y}`;
  }

  private getSlotStatus(slotDate: Date, startMin: number, endMin: number, now: Date): string {
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const slotDateOnly = slotDate.getTime();

    if (nowDateOnly < slotDateOnly) return 'Sắp diễn ra';
    if (nowDateOnly > slotDateOnly) return 'Đã kết thúc';

    // cùng ngày: xét theo giờ phút
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < startMin) return 'Sắp diễn ra';
    if (nowMin > endMin) return 'Đã kết thúc';
    return 'Đang diễn ra';
  }

  /** Trạng thái slot đang chọn (Sắp diễn ra / Đang diễn ra / Đã kết thúc) */
  get activeFlashSlotStatus(): string {
    return this.activeFlashSlot === 0 ? this.flashSlotTodayStatus : this.flashSlotTomorrowStatus;
  }

  /** Khi "Sắp diễn ra": thay các chữ số trước phần ngàn bằng x (90.000→xx.000, 100.000→xxx.000, 1.000.000→x.xxx.000). */
  obscureFlashPrice(value: number | undefined | null): string {
    if (value == null || value < 0) return '0';
    const s = Math.round(value).toString();
    const parts: string[] = [];
    for (let i = s.length; i > 0; i -= 3) parts.unshift(s.slice(Math.max(0, i - 3), i));
    const segments = parts.join('.').split('.');
    const last = segments[segments.length - 1];
    const toX = (str: string) => 'x'.repeat(str.length);
    if (last === '000' && segments.length > 1) {
      return [...segments.slice(0, -1).map(toX), '000'].join('.');
    }
    return segments.map(toX).join('.');
  }

  /** Giá flash: khi "Sắp diễn ra" dùng obscureFlashPrice, còn lại format số bình thường. */
  getFlashPriceDisplay(p: Product): string {
    if (this.activeFlashSlotStatus === 'Sắp diễn ra') return this.obscureFlashPrice(p.price);
    return (p.price ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  }

  /** Giá gạch chân flash: luôn hiển thị số thật (không che). */
  getFlashOriginalPriceDisplay(p: Product): string {
    return (p.originalPrice ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  }

  /** Tag % sale: (giá gạch chân - giá bán) / giá bán, làm tròn không thập phân. "xx%" khi sự kiện chưa diễn ra. */
  getFlashSaleTag(p: Product): string {
    if (this.activeFlashSlotStatus === 'Sắp diễn ra') return 'xx%';
    const giaBan = p.price ?? 0;
    const giaGachChan = p.originalPrice;
    if (giaGachChan != null && giaGachChan > 0 && giaBan > 0 && giaGachChan > giaBan) {
      const pct = Math.min(99, Math.max(1, Math.round(((giaGachChan - giaBan) / giaBan) * 100)));
      return `-${pct}%`;
    }
    return '0%';
  }

  /** Đếm ngược: "Sắp diễn ra" → đến 8:00 (Bắt đầu sau); "Đang diễn ra" → đến 22:00 (Kết thúc sau) */
  computeFlashCountdown(): void {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const slotDate = this.activeFlashSlot === 0 ? today : tomorrow;
    const startMin = 8 * 60;
    const endMin = 22 * 60;
    const status = this.getSlotStatus(slotDate, startMin, endMin, now);

    let targetDate: Date;
    let label: string;
    let endedLabel: string;

    if (status === 'Sắp diễn ra') {
      targetDate = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), 8, 0, 0, 0);
      label = 'Bắt đầu sau';
      endedLabel = 'Đã bắt đầu';
    } else if (status === 'Đang diễn ra') {
      targetDate = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), 22, 0, 0, 0);
      label = 'Kết thúc sau';
      endedLabel = 'Đã kết thúc';
    } else {
      this.flashCountdownHours = 0;
      this.flashCountdownMinutes = 0;
      this.flashCountdownSeconds = 0;
      this.flashCountdownEnded = true;
      this.flashCountdownLabel = 'Đã kết thúc';
      return;
    }

    let diff = targetDate.getTime() - now.getTime();
    if (diff <= 0) {
      this.flashCountdownHours = 0;
      this.flashCountdownMinutes = 0;
      this.flashCountdownSeconds = 0;
      this.flashCountdownEnded = true;
      this.flashCountdownLabel = endedLabel;
      return;
    }

    this.flashCountdownEnded = false;
    this.flashCountdownLabel = label;
    this.flashCountdownHours = Math.floor(diff / 3600000);
    this.flashCountdownMinutes = Math.floor((diff % 3600000) / 60000);
    this.flashCountdownSeconds = Math.floor((diff % 60000) / 1000);
  }


  // ===== Mock data giữ nguyên =====
  flashSaleProducts: Product[] = [
    { id: 1, name: 'Paracetamol 500mg', image: 'assets/images/banner/About_us_Hero.png', price: 25000, originalPrice: 31250, discount: 0.2 },
    { id: 2, name: 'Vitamin C 1000mg', image: 'assets/images/banner/About_us_Hero.png', price: 80000, originalPrice: 94118, discount: 0.15 },
    { id: 3, name: 'Cough Syrup', image: 'assets/images/banner/About_us_Hero.png', price: 45000 },
  ];

  // load flash sale products từ backend:
  // - chỉ lấy các sản phẩm có khuyến mãi (có giảm giá thực sự)
  //   => hoặc có discount > 0, hoặc originalPrice > price
  // - random thứ tự
  // - giới hạn số lượng thẻ hiển thị (ví dụ 12)
  private loadFlashSaleProducts(limit = 200): void {
    // Chỉ lấy các sản phẩm đang có giảm giá từ backend
    const url = `http://localhost:3000/api/products?limit=${limit}&hasDiscount=true&sort=discount`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        const list = Array.isArray(res?.products) ? res.products : Array.isArray(res) ? res : [];
        if (!Array.isArray(list) || list.length === 0) {
          this.cdr.detectChanges();
          this.scheduleProductSliderRecompute();
          return;
        }
        const mapped = list.map((p: any) => {
          const giaBan = p.salePrice ?? p.price;
          const price = Number(giaBan) || 0;
          let originalPrice: number | undefined;
          if (p.originalPrice != null && p.originalPrice > 0) {
            originalPrice = Number(p.originalPrice);
          } else if (p.salePrice != null && p.price != null && Number(p.price) > 0) {
            originalPrice = Number(p.price);
          } else {
            const discount = p.discount ?? 0;
            if (discount > 0 && price > 0) {
              if (discount <= 1) originalPrice = Math.round(price / (1 - discount));
              else originalPrice = price + Math.round(Number(discount));
            }
          }
          if (originalPrice != null && originalPrice <= price) originalPrice = undefined;
          return {
            id: p._id || p.id,
            name: p.name || p.title || 'Sản phẩm',
            image: p.image || p.imageUrl || 'assets/images/banner/About_us_Hero.png',
            price,
            originalPrice,
            discount: p.discount || 0,
            categoryId: p.categoryId || p.category_id || (p.category && (p.category._id || p.category.id)) || undefined,
            slug: p.slug || (p.slugName && String(p.slugName).trim() ? p.slugName : null) || (p._id ? String(p._id) : p.id ? String(p.id) : ''),
          };
        });
        const discounted = mapped.filter((p: any) => {
          const price = p.price ?? 0;
          const discount = p.discount ?? 0;
          const hasPromo = (discount > 0) || (p.originalPrice && p.originalPrice > price);
          return !!p.image && price > 0 && hasPromo;
        });

        // Số lượng thẻ Deal cần hiển thị (có thể tăng/giảm tuỳ thiết kế)
        const desiredCount = 24;
        let picked: any[] = [];

        if (discounted.length > 0) {
          // Ưu tiên chọn sản phẩm đến từ nhiều danh mục khác nhau (round-robin theo categoryId)
          picked = this.pickByCategoryRoundRobin(discounted as Product[], desiredCount);
        } else {
          // Fallback: nếu không có sản phẩm discount, chọn random trong toàn bộ list có giá > 0
          const valid = mapped.filter((p: any) => !!p.image && (p.price ?? 0) > 0);
          picked = this.shuffleArray(valid).slice(0, Math.min(desiredCount, valid.length));
        }

        this.flashSaleProducts = picked;
        this.cdr.detectChanges();
        this.scheduleProductSliderRecompute();
      },
      error: (err) => {
        console.error('Failed to load flash sale products', err);
        this.cdr.detectChanges();
        this.scheduleProductSliderRecompute();
      }
    });
  }

  categories: Category[] = [
    { id: 1, name: 'Thuốc kê đơn', icon: 'assets/images/homepage/categlories/6.png' },
    { id: 2, name: 'Thực phẩm chức năng', icon: 'assets/images/homepage/categlories/2.png' },
    { id: 3, name: 'Dược phẩm', icon: 'assets/images/homepage/categlories/3.png' },
    { id: 4, name: 'Chăm sóc cá nhân', icon: 'assets/images/homepage/categlories/11.png' },
  ];

  products: Product[] = [
    { id: 11, name: 'Sữa rửa mặt', image: 'assets/images/banner/About_us_Hero.png', price: 120000 },
    { id: 12, name: 'Bộ test nhanh', image: 'assets/images/banner/About_us_Hero.png', price: 95000 },
    { id: 13, name: 'Kem bôi', image: 'assets/images/banner/About_us_Hero.png', price: 78000 },
  ];

  // Health blogs fetched from backend
  blogs: Array<{ title: string; image?: string; excerpt?: string; slug?: string; link?: string; categoryName?: string }> = [];

  // "Có thể bạn chưa biết?" popup
  popupBlog: { title: string; image?: string; excerpt?: string; link?: string } | null = null;
  showBlogPopup = false;
  /** Thời điểm vào Home — popup chỉ mở sau 4s kể từ đây */
  private blogPopupPageEnterMs = 0;
  private blogPopupRevealTimer: number | null = null;
  readonly blogPopupDelayMs = 4000;
  /** Tự đóng sau lâu (ms) — tăng thời gian để người dùng kịp đọc */
  private blogPopupAutoCloseTimer: number | null = null;
  readonly blogPopupAutoCloseMs = 5 * 60 * 1000;

  /** Pool fallback cho popup khi chưa có API — dùng ngay khi vào trang để popup luôn hiện sau 4s */
  private getBlogPopupFallbackPool(): Array<{ title: string; image?: string; excerpt?: string; slug?: string; link?: string }> {
    return [
      {
        title: '5 thói quen giúp ngủ ngon hơn',
        image: 'assets/images/homepage/blogs/ngu_ngon.jpg',
        excerpt: 'Tổng hợp 5 thói quen dễ thực hiện giúp cải thiện giấc ngủ...',
        slug: 'ngu-nguon',
        link: '/bai-viet/ngu-nguon',
      },
      {
        title: 'Ăn gì để tăng sức đề kháng?',
        image: 'assets/images/homepage/blogs/an_gi.jpg',
        excerpt: 'Các thực phẩm giàu vitamin và khoáng chất cho hệ miễn dịch...',
        slug: 'tang-suc-de-khang',
        link: '/bai-viet/tang-suc-de-khang',
      },
      {
        title: 'Cách xử trí khi bị cảm lạnh',
        image: 'assets/images/homepage/blogs/cam_cum.webp',
        excerpt: 'Mẹo chăm sóc tại nhà và khi nên gặp bác sĩ...',
        slug: 'xu-tri-cam-lanh',
        link: '/bai-viet/xu-tri-cam-lanh',
      },
    ];
  }

  // featured products loading state
  isLoadingFeaturedProducts = false;
  isFeaturedProductsError = false;

  // Favorite brands for the brand slider (use public asset paths)
  favBrands = [
    { id: 1, img: 'assets/images/homepage/fav_brand/1.webp', labelImg: 'assets/images/homepage/fav_brand/label1.webp', label: 'JpanWell' },
    { id: 2, img: 'assets/images/homepage/fav_brand/2.webp', labelImg: 'assets/images/homepage/fav_brand/label2.webp', label: 'Omexxel' },
    { id: 3, img: 'assets/images/homepage/fav_brand/3.webp', labelImg: 'assets/images/homepage/fav_brand/label3.webp', label: 'Brauer' },
    { id: 4, img: 'assets/images/homepage/fav_brand/4.webp', labelImg: 'assets/images/homepage/fav_brand/label4.webp', label: 'Hatro' },
    { id: 5, img: 'assets/images/homepage/fav_brand/5.webp', labelImg: 'assets/images/homepage/fav_brand/label5.webp', label: 'Vitabiotics' },
    { id: 6, img: 'assets/images/homepage/fav_brand/6.webp', labelImg: 'assets/images/homepage/fav_brand/label6.webp', label: 'Brand6' },
    { id: 7, img: 'assets/images/homepage/fav_brand/7.webp', labelImg: 'assets/images/homepage/fav_brand/label7.webp', label: 'Brand7' },
    { id: 8, img: 'assets/images/homepage/fav_brand/8.webp', labelImg: 'assets/images/homepage/fav_brand/label8.webp', label: 'Brand8' },
    { id: 9, img: 'assets/images/homepage/fav_brand/9.webp', labelImg: 'assets/images/homepage/fav_brand/label9.webp', label: 'Brand9' }
  ];

  /** Quick actions (rendered in the homepage quick-actions area)
   *  - Images: src/assets/homepage/quick/1.webp .. 6.webp
   *  - Order: 1 Tư vấn dược sĩ, 2 Kiểm tra sức khoẻ, 3 Công cụ sức khoẻ, 4 Đơn của tôi, 5 Tìm nhà thuốc, 6 Tra cứu thuốc chính hãng
   */
  quickActions = [
    { id: 1, label: 'Tư vấn đơn thuốc', srcPath: 'src/assets/images/homepage/quick/1.webp', publicPath: 'assets/images/homepage/quick/1.webp' },
    { id: 2, label: 'Kiểm tra sức khoẻ', srcPath: 'src/assets/images/homepage/quick/2.webp', publicPath: 'assets/images/homepage/quick/2.webp' },
    { id: 3, label: 'Công cụ sức khoẻ', srcPath: 'src/assets/images/homepage/quick/3.webp', publicPath: 'assets/images/homepage/quick/3.webp' },
    { id: 4, label: 'Đơn của tôi', srcPath: 'src/assets/images/homepage/quick/4.webp', publicPath: 'assets/images/homepage/quick/4.webp' },
    { id: 5, label: 'Tìm nhà thuốc', srcPath: 'src/assets/images/homepage/quick/5.webp', publicPath: 'assets/images/homepage/quick/5.webp' },
    { id: 6, label: 'Tra cứu thuốc chính hãng', srcPath: 'src/assets/images/homepage/quick/6.webp', publicPath: 'assets/images/homepage/quick/6.webp' }
  ];

  /** Load slug từ API categories (cùng nguồn với header) để dẫn đúng link danh sách sản phẩm */
  private loadCategorySlugsFromApi(): void {
    this.categoryService.getCategories().subscribe((categories: any[]) => {
      const roots = categories.filter((c: any) => c.parentId == null || c.parentId === 'null' || !c.parentId);
      roots.forEach((root: any) => {
        const rootId = this.normalizeCategoryId(root._id);
        this.categoryNameToSlug[root.name] = root.slug || '';
        const l2 = categories.filter((c: any) => this.normalizeCategoryId(c.parentId) === rootId);
        l2.forEach((sub: any) => {
          this.categoryNameToSlug[sub.name] = sub.slug || '';
          const subId = this.normalizeCategoryId(sub._id);
          categories
            .filter((c: any) => this.normalizeCategoryId(c.parentId) === subId)
            .forEach((child: any) => {
              this.categoryNameToSlug[child.name] = child.slug || '';
            });
        });
      });
      this.cdr.markForCheck();
    });
  }

  private normalizeCategoryId(id: any): string {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (id?.$oid) return id.$oid;
    return String(id);
  }

  /** Click danh mục sản phẩm → trang danh sách theo slug từ API (giống category bar header) */
  onCategoryClick(c: { slug?: string; name: string }): void {
    const slugFromApi = this.categoryNameToSlug[c.name];
    const slug = (slugFromApi && slugFromApi.trim()) || c.slug || '';
    if (!slug) return;
    const segments = slug.split('/').filter(Boolean);
    this.router.navigate(['/category', ...segments]);
  }

  /** Click thương hiệu yêu thích → danh sách sản phẩm thương hiệu đó */
  onBrandClick(b: { label?: string }): void {
    const brand = b.label || '';
    if (brand) this.router.navigate(['/products'], { queryParams: { brand } });
  }

  /** Click vào thẻ sản phẩm → chi tiết sản phẩm */
  goToProductDetail(p: Product): void {
    const slug = p.slug || (typeof p.id === 'string' ? p.id : p.id != null ? String(p.id) : '');
    if (slug) this.router.navigate(['/product', slug]);
  }

  // Quick action click handler: id 1 Tư vấn, 2 Kiểm tra sức khoẻ, 3 Công cụ sức khoẻ, 4 Đơn của tôi, 5 Tìm nhà thuốc, 6 Tra cứu thuốc
  onQuickActionClick(qa: { id: number; label: string }): void {
    switch (qa.id) {
      case 1:
        this.router.navigate(['/consultation']);
        break;
      case 2:
        this.router.navigate(['/health-test']);
        break;
      case 3:
        if (this.authService.currentUser()) {
          this.router.navigate(['/account'], { queryParams: { menu: 'health' } });
        } else {
          this.router.navigate(['/health/bmi']);
        }
        break;
      case 4:
        if (this.authService.currentUser()) {
          this.router.navigate(['/account'], { queryParams: { menu: 'orders' } });
        } else {
          this.authService.openAuthModal();
        }
        break;
      case 5:
        this.router.navigate(['/store-system']);
        break;
      case 6:
        window.open('https://dichvucong.dav.gov.vn/congbothuoc/index', '_blank');
        break;
      default:
        break;
    }
  }

  /** Map tên danh mục -> slug từ API (đồng bộ với category bar header) */
  private categoryNameToSlug: Record<string, string> = {};

  // Danh mục sản phẩm: slug dùng để điều hướng /category/:slug (fallback nếu API chưa load)
  homepageCategories = [
    { id: 1, name: 'Thần kinh não', slug: 'than-kinh-nao', iconSrc: 'src/assets/images/homepage/categlories/1.png', icon: 'assets/images/homepage/categlories/1.png' },
    { id: 2, name: 'Vitamin & Khoáng chất', slug: 'vitamin-khoang-chat', iconSrc: 'src/assets/images/homepage/categlories/2.png', icon: 'assets/images/homepage/categlories/2.png' },
    { id: 3, name: 'Sức khoẻ tim mạch', slug: 'suc-khoe-tim-mach', iconSrc: 'src/assets/images/homepage/categlories/3.png', icon: 'assets/images/homepage/categlories/3.png' },
    { id: 4, name: 'Tăng sức đề kháng, miễn dịch', slug: 'tang-suc-de-khang-mien-dich', iconSrc: 'src/assets/images/homepage/categlories/4.png', icon: 'assets/images/homepage/categlories/4.png' },
    { id: 5, name: 'Hỗ trợ tiêu hoá', slug: 'ho-tro-tieu-hoa', iconSrc: 'src/assets/images/homepage/categlories/5.png', icon: 'assets/images/homepage/categlories/5.png' },
    { id: 6, name: 'Sinh lý - Nội tiết tố', slug: 'sinh-ly-noi-tiet-to', iconSrc: 'src/assets/images/homepage/categlories/6.png', icon: 'assets/images/homepage/categlories/6.png' },
    { id: 7, name: 'Dinh dưỡng', slug: 'dinh-duong', iconSrc: 'src/assets/images/homepage/categlories/7.png', icon: 'assets/images/homepage/categlories/7.png' },
    { id: 8, name: 'Hỗ trợ điều trị', slug: 'ho-tro-dieu-tri', iconSrc: 'src/assets/images/homepage/categlories/8.png', icon: 'assets/images/homepage/categlories/8.png' },
    { id: 9, name: 'Giải pháp làn da', slug: 'giai-phap-lan-da', iconSrc: 'src/assets/images/homepage/categlories/9.png', icon: 'assets/images/homepage/categlories/9.png' },
    { id: 10, name: 'Chăm sóc da mặt', slug: 'cham-soc-da-mat', iconSrc: 'src/assets/images/homepage/categlories/10.png', icon: 'assets/images/homepage/categlories/10.png' },
    { id: 11, name: 'Chăm sóc cơ thể', slug: 'cham-soc-co-the', iconSrc: 'src/assets/images/homepage/categlories/11.png', icon: 'assets/images/homepage/categlories/11.png' },
    { id: 12, name: 'Hỗ trợ làm đẹp', slug: 'ho-tro-lam-dep', iconSrc: 'src/assets/images/homepage/categlories/12.png', icon: 'assets/images/homepage/categlories/12.png' }
  ];

  // Health quiz (Kiểm tra sức khỏe) – danh sách từ API, icon Material Symbols giống health-test
  quizItems: Array<{ id: number; quizId: string; icon: string; title: string; description: string }> = [];

  /** Map quiz_id -> Material Symbol name (đồng bộ với health-test) */
  private static readonly QUIZ_ICON_MAP: Record<string, string> = {
    '01_Benh_Hen': 'pulmonology',
    '02_COPD_Man_Tinh': 'air',
    '03_Lam_Dung_Thuoc_Hen': 'medication',
    '04_GERD': 'info',
    '05_Suy_Gian_Tinh_Mach': 'monitor_heart',
    '09_Tri_Nho_TNmindtest': 'psychology',
    '10_Tim_Mach_Than_Chuyen_Hoa': 'favorite',
  };

  private loadQuizItems(): void {
    this.healthTestService.getQuizzes().subscribe({
      next: (data: any[]) => {
        this.quizItems = (data || []).map((q: any, index: number) => {
          const quizId = q.quiz_id || q.id || '';
          return {
            id: index + 1,
            quizId,
            icon: Home.QUIZ_ICON_MAP[quizId] || 'quiz',
            title: q.category_short || q.category || 'Bài kiểm tra',
            description: q.category ? `Bài kiểm tra ${q.category}` : (q.category_short || 'Bài kiểm tra sức khỏe'),
          };
        });
        this.cdr.markForCheck();
      },
      error: () => {
        this.quizItems = [];
        this.cdr.markForCheck();
      },
    });
  }

  scrollQuizPrev(): void {
    if (!this.quizSlider) return;
    const el = this.quizSlider.nativeElement;
    el.scrollBy({ left: -el.clientWidth, behavior: 'smooth' });
  }

  scrollQuizNext(): void {
    if (!this.quizSlider) return;
    const el = this.quizSlider.nativeElement;
    el.scrollBy({ left: el.clientWidth, behavior: 'smooth' });
  }

  startQuiz(q: { quizId?: string }): void {
    if (q.quizId) {
      this.router.navigate(['/health-test'], { queryParams: { quiz: q.quizId } });
    } else {
      this.router.navigate(['/health-test']);
    }
  }

  requestConsultation(product?: any): void {
    const queryParams: any = {};
    if (product) {
      const productId = product.id || product._id;
      if (productId) {
        queryParams.productId = productId;
      }
    }
    this.router.navigate(['/consultation'], { queryParams });
    window.scrollTo(0, 0);
  }

  scrollFlashPrev(): void {
    if (!this.flashProductsSlider) return;
    const el = this.flashProductsSlider.nativeElement;
    el.scrollBy({ left: -el.clientWidth, behavior: 'smooth' });
  }

  scrollFlashNext(): void {
    if (!this.flashProductsSlider) return;
    const el = this.flashProductsSlider.nativeElement;
    el.scrollBy({ left: el.clientWidth, behavior: 'smooth' });
  }

  scrollBrandNext(): void {
    if (!this.brandSlider) return;
    this.brandSlider.nativeElement.scrollBy({ left: this.brandScrollStep, behavior: 'smooth' });
  }

  scrollBrandPrev(): void {
    if (!this.brandSlider) return;
    this.brandSlider.nativeElement.scrollBy({ left: -this.brandScrollStep, behavior: 'smooth' });
  }

  scrollProductNext(): void {
    if (!this.productSlider) return;
    this.productSlider.nativeElement.scrollBy({ left: this.productScrollStep, behavior: 'smooth' });
  }

  scrollProductPrev(): void {
    if (!this.productSlider) return;
    this.productSlider.nativeElement.scrollBy({ left: -this.productScrollStep, behavior: 'smooth' });
  }

  scrollSeasonalNext(): void {
    const el = this.seasonalSlider?.nativeElement;
    if (!el) return;
    const step = this.computeSeasonalScrollStep();
    el.scrollBy({ left: step, behavior: 'smooth' });
  }

  scrollSeasonalPrev(): void {
    const el = this.seasonalSlider?.nativeElement;
    if (!el) return;
    const step = this.computeSeasonalScrollStep();
    el.scrollBy({ left: -step, behavior: 'smooth' });
  }

  private getFlexGapPx(el: HTMLElement): number {
    // flex gap có thể nằm ở `gap` hoặc `columnGap`
    const styles = window.getComputedStyle(el);
    const gapStr = styles.gap || (styles as any).columnGap || '0px';
    const gap = parseFloat(gapStr);
    return Number.isFinite(gap) ? gap : 0;
  }

  private computeSeasonalScrollStep(): number {
    const el = this.seasonalSlider?.nativeElement;
    if (!el) return 360;

    const card = el.querySelector('.seasonal-card') as HTMLElement | null;
    const gap = this.getFlexGapPx(el);

    if (!card) {
      // fallback: đi theo viewport nếu chưa query được card
      return Math.max(200, el.clientWidth);
    }

    const cardW = card.getBoundingClientRect().width;
    // mỗi lần đi 4 ô
    const step = (cardW + gap) * 4;

    // tránh step quá nhỏ
    return Math.max(200, Math.round(step));
  }

  private recomputeSliderSteps(): void {
    // brand
    if (this.brandSlider && this.brandSlider.nativeElement) {
      const el = this.brandSlider.nativeElement;
      const viewport = el.clientWidth;
      this.brandScrollStep = Math.max(200, Math.round((viewport * 4) / 5));
    } else {
      this.brandScrollStep = 360;
    }

    // product
    if (this.productSlider && this.productSlider.nativeElement) {
      const pel = this.productSlider.nativeElement;
      const pviewport = pel.clientWidth;
      this.productScrollStep = Math.max(200, Math.round((pviewport * 4) / 5));
    } else {
      this.productScrollStep = 360;
    }
  }

  /** Tính % giảm giá an toàn cho block "Sản phẩm nổi bật hôm nay". */
  getFeaturedDiscountPercent(p: Product | undefined | null): number {
    if (!p) return 0;
    const price = p.price ?? 0;
    const discount = p.discount ?? 0;
    if (price <= 0 || discount <= 0) return 0;
    const pct = (discount / price) * 100;
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return 0;
    return pct;
  }

  // fetch featured products from backend (limit to 8) – hiển thị random mỗi lần load
  private loadFeaturedProducts(limit = 8): void {
    this.isLoadingFeaturedProducts = true;
    this.isFeaturedProductsError = false;
    // backend server in this repo exposes /api/products on port 3000
    const url = `http://localhost:3000/api/products?limit=${limit}`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        this.isLoadingFeaturedProducts = false;
        const data = Array.isArray(res?.products) ? res.products : Array.isArray(res) ? res : [];
        if (!Array.isArray(data)) {
          this.scheduleProductSliderRecompute();
          return;
        }
        // map to Product shape (có slug để click vào mở chi tiết, kèm discount để hiển thị block đỏ)
        const mapped = data.map((p: any) => ({
          id: p._id || p.id,
          name: p.name || p.title || 'Sản phẩm',
          image: p.image || p.imageUrl || 'assets/images/banner/About_us_Hero.png',
          price: p.price || p.salePrice || 0,
          discount: p.discount || 0,
          slug: p.slug || (p.slugName && String(p.slugName).trim() ? p.slugName : null) || (p._id ? String(p._id) : p.id ? String(p.id) : ''),
        }));
        // Chỉ lấy sản phẩm có ảnh và giá > 0 (ẩn sản phẩm 0đ khỏi block Nổi bật)
        const valid = mapped.filter((p: any) => !!p.image && (p.price ?? 0) > 0);
        // xáo trộn để "Sản phẩm nổi bật hôm nay" trông ngẫu nhiên
        this.products = this.shuffleArray(valid).slice(0, limit);
        // if backend returned empty, mark as error/empty so template can show fallback
        if (!this.products || this.products.length === 0) {
          this.isFeaturedProductsError = true;
        }
        this.cdr.detectChanges();
        this.scheduleProductSliderRecompute();
      },
      error: (err) => {
        this.isLoadingFeaturedProducts = false;
        this.isFeaturedProductsError = true;
        console.error('Failed to load products', err);
        this.cdr.detectChanges();
        this.scheduleProductSliderRecompute();
      }
    });
  }

  /** Gọi sau khi products load xong để layout slider tính lại, sản phẩm hiện ngay không cần bấm mũi tên */
  private scheduleProductSliderRecompute(): void {
    setTimeout(() => this.recomputeSliderSteps(), 0);
    requestAnimationFrame(() => this.recomputeSliderSteps());
  }

  // fetch health blogs: fetchLimit lớn → random popup đa dạng, chỉ 1 round-trip API
  private loadBlogs(displayLimit = 6, fetchLimit = 24): void {
    if (typeof window !== 'undefined') {
      this.homeBlogFallbackTimer = window.setTimeout(() => {
        if (!this.blogs || this.blogs.length === 0) {
          this.blogs = [
            {
              title: '5 thói quen giúp ngủ ngon hơn',
              image: 'assets/images/homepage/blogs/ngu_ngon.jpg',
              excerpt: 'Tổng hợp 5 thói quen dễ thực hiện giúp cải thiện giấc ngủ...',
              slug: 'ngu-nguon',
              link: '/bai-viet/ngu-nguon',
              categoryName: 'Dinh dưỡng',
            },
            {
              title: 'Ăn gì để tăng sức đề kháng?',
              image: 'assets/images/homepage/blogs/an_gi.jpg',
              excerpt: 'Các thực phẩm giàu vitamin và khoáng chất cho hệ miễn dịch...',
              slug: 'tang-suc-de-khang',
              link: '/bai-viet/tang-suc-de-khang',
              categoryName: 'Dinh dưỡng',
            },
            {
              title: 'Cách xử trí khi bị cảm lạnh',
              image: 'assets/images/homepage/blogs/cam_cum.webp',
              excerpt: 'Mẹo chăm sóc tại nhà và khi nên gặp bác sĩ...',
              slug: 'xu-tri-cam-lanh',
              link: '/bai-viet/xu-tri-cam-lanh',
              categoryName: 'Sức khỏe',
            },
          ];
          this.prepareBlogPopupFromPool(this.blogs);
          this.scheduleBlogPopupReveal();
        }
      }, 1000);
    }

    this.blogService.getBlogs({ limit: fetchLimit, page: 1 }).subscribe({
      next: (res) => {
        const data = Array.isArray(res?.blogs) ? res.blogs : Array.isArray(res) ? res : [];

        const normalizeImageUrl = (src?: string | null): string | undefined => {
          if (!src) return undefined;
          if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('assets/')) return src;
          if (src.startsWith('/')) return `http://localhost:3000${src}`;
          return `http://localhost:3000/${src}`;
        };

        const mapped = data.map((b: any) => {
          const primaryCat = Array.isArray(b.categories) ? b.categories.find((c: any) => c?.category?.isPrimary) : null;
          const cat = primaryCat?.category ?? (Array.isArray(b.categories) ? b.categories[0]?.category : null);
          const fromCategories = cat?.name ?? (Array.isArray(b.categories) && b.categories[0] ? (b.categories[0] as any).name : undefined);
          const categoryName = fromCategories ?? (b as any).category?.name ?? (b as any).categoryName ?? undefined;
          const rawImage = b.primaryImage?.url || b.image || b.imageUrl || undefined;
          const rawSlug = (b.slug || (b as any).slug || (b as any)._id || '').toString().trim();
          const normalizedSlug = rawSlug
            .replace(/^\/+/, '')
            .replace(/^bai-viet\//i, '')
            .replace(/\.html?$/i, '');
          return {
            title: b.title || b.name || 'Bài viết sức khỏe',
            image: normalizeImageUrl(rawImage),
            excerpt:
              b.shortDescription ||
              b.excerpt ||
              (typeof b.description === 'string' ? b.description.replace(/<[^>]*>/g, '').slice(0, 160) : undefined),
            slug: normalizedSlug || undefined,
            link: normalizedSlug ? `/bai-viet/${normalizedSlug}` : undefined,
            categoryName: categoryName || 'Bài viết',
          };
        });

        this.blogs = mapped.slice(0, displayLimit);

        if (!this.blogs || this.blogs.length === 0) {
          this.blogs = [
            {
              title: '5 thói quen giúp ngủ ngon hơn',
              image: 'assets/images/homepage/blogs/ngu_ngon.jpg',
              excerpt: 'Tổng hợp 5 thói quen dễ thực hiện giúp cải thiện giấc ngủ...',
              slug: 'ngu-nguon',
              link: '/bai-viet/ngu-nguon',
              categoryName: 'Dinh dưỡng',
            },
            {
              title: 'Ăn gì để tăng sức đề kháng?',
              image: 'assets/images/homepage/blogs/an_gi.jpg',
              excerpt: 'Các thực phẩm giàu vitamin và khoáng chất cho hệ miễn dịch...',
              slug: 'tang-suc-de-khang',
              link: '/bai-viet/tang-suc-de-khang',
              categoryName: 'Dinh dưỡng',
            },
            {
              title: 'Cách xử trí khi bị cảm lạnh',
              image: 'assets/images/homepage/blogs/cam_cum.webp',
              excerpt: 'Mẹo chăm sóc tại nhà và khi nên gặp bác sĩ...',
              slug: 'xu-tri-cam-lanh',
              link: '/bai-viet/xu-tri-cam-lanh',
              categoryName: 'Sức khỏe',
            },
          ];
        }

        if (this.homeBlogFallbackTimer !== null && typeof window !== 'undefined') {
          window.clearTimeout(this.homeBlogFallbackTimer);
          this.homeBlogFallbackTimer = null;
        }
        const pool = mapped.length ? mapped : this.blogs;
        this.prepareBlogPopupFromPool(pool);
        this.scheduleBlogPopupReveal();
      },
      error: (err) => {
        console.error('Failed to load blogs', err);
        this.blogs = [
          {
            title: '5 thói quen giúp ngủ ngon hơn',
            image: 'assets/images/homepage/blogs/ngu_ngon.jpg',
            excerpt: 'Tổng hợp 5 thói quen dễ thực hiện giúp cải thiện giấc ngủ...',
            slug: 'ngu-nguon',
            link: '/bai-viet/ngu-nguon',
            categoryName: 'Dinh dưỡng',
          },
          {
            title: 'Ăn gì để tăng sức đề kháng?',
            image: 'assets/images/homepage/blogs/an_gi.jpg',
            excerpt: 'Các thực phẩm giàu vitamin và khoáng chất cho hệ miễn dịch...',
            slug: 'tang-suc-de-khang',
            link: '/bai-viet/tang-suc-de-khang',
            categoryName: 'Dinh dưỡng',
          },
          {
            title: 'Cách xử trí khi bị cảm lạnh',
            image: 'assets/images/homepage/blogs/cam_cum.webp',
            excerpt: 'Mẹo chăm sóc tại nhà và khi nên gặp bác sĩ...',
            slug: 'xu-tri-cam-lanh',
            link: '/bai-viet/xu-tri-cam-lanh',
            categoryName: 'Sức khỏe',
          },
        ];

        if (this.homeBlogFallbackTimer !== null && typeof window !== 'undefined') {
          window.clearTimeout(this.homeBlogFallbackTimer);
          this.homeBlogFallbackTimer = null;
        }
        this.prepareBlogPopupFromPool(this.blogs);
        this.scheduleBlogPopupReveal();
      },
    });
  }

  // fetch diseases from backend
  // diseases array hard-coded to match design (no MongoDB)
  /** Slug nhóm "bệnh theo mùa" — dùng cho link "Tìm hiểu thêm" ở tab Bệnh theo mùa → trang nhóm giống chuyên khoa */
  readonly seasonalGroupSlug = 'benh-theo-mua';

  diseases: Disease[] = [
    {
      _id: 'benh-nam-gioi',
      name: 'BỆNH NAM GIỚI',
      image: 'assets/images/homepage/benh/doi_tuong_1.webp',
      items: ['Rối loạn cương dương', 'Viêm tuyến tiền liệt', 'Vô sinh / Hiếm muộn'],
      groupSlug: 'benh-nam-gioi'
    },
    {
      _id: 'benh-nu-gioi',
      name: 'BỆNH NỮ GIỚI',
      image: 'assets/images/homepage/benh/doi_tuong_2.webp',
      items: ['Rối loạn kinh nguyệt', 'Viêm nhiễm phụ khoa', 'Vấn đề mãn kinh'],
      groupSlug: 'benh-nu-gioi'
    },
    {
      _id: 'benh-nguoi-gia',
      name: 'BỆNH NGƯỜI GIÀ',
      image: 'assets/images/homepage/benh/doi_tuong_3.webp',
      items: ['Alzheimer', 'Suy giảm chức năng', 'Phục hồi sau tai biến'],
      groupSlug: 'benh-nguoi-gia'
    },
    {
      _id: 'benh-tre-em',
      name: 'BỆNH TRẺ EM',
      image: 'assets/images/homepage/benh/doi_tuong_4.webp',
      items: ['Tiêu chảy, rối loạn tiêu hóa', 'Sốt siêu vi', 'Viêm đường hô hấp'],
      groupSlug: 'benh-tre-em'
    }
  ];

  // which disease tab is active: 'doi_tuong' (by target) or 'mua' (seasonal)
  activeDiseaseTab: 'doi_tuong' | 'mua' = 'doi_tuong';

  goToSeasonal(): void {
    this.activeDiseaseTab = 'mua';
    setTimeout(() => {
      this.recomputeSliderSteps();
      this.seasonalSlider?.nativeElement?.scrollTo({ left: 0, behavior: 'auto' });
    }, 80);
  }

  /** Click "Tìm hiểu thêm" trong block Bệnh theo đối tượng → trang nhóm bệnh /category/tra-cuu-benh/:groupSlug */
  onDiseaseGroupClick(d: Disease, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!d) return;
    const slug = (d.groupSlug || d._id || '').toString().trim();
    if (!slug) return;
    this.router.navigate(['/category/tra-cuu-benh', slug]);
  }

  /** Slug cho link chi tiết sản phẩm (Flash Sale + Featured). */
  getProductSlug(product: Product | any): string {
    if (!product) return '';
    // Ưu tiên _id để điều hướng đáng tin cậy (backend tìm theo ObjectId)
    const id = product._id ?? product.id;
    if (id !== undefined && id !== null) {
      if (typeof id === 'string') return id;
      if (id.$oid) return id.$oid;
      if (typeof id.toString === 'function') return id.toString();
    }
    // Fallback sang slug nếu không có _id
    if (product.slug && String(product.slug).trim() !== '') return product.slug;
    return '';
  }

  /** Thêm sản phẩm vào giỏ (dùng cho Thêm vào giỏ trên Homepage). */
  addToCart(product: Product | any, event?: MouseEvent): void {
    this.cart.addItem({
      _id: product?._id || product?.id,
      sku: product?.sku || '',
      productName: product?.name || '',
      name: product?.name || '',
      image: product?.image || '',
      price: product?.price ?? 0,
      discount: product?.discount || 0,
      unit: product?.unit || 'Hộp',
      slug: this.getProductSlug(product),
      stock: product?.stock !== undefined ? product.stock : 99
    }, 1);

    if (event) {
      const btn = (event.target as HTMLElement).closest('button') || event.target as HTMLElement;
      this.cartAnimation.flyToCart(btn as HTMLElement);
    }

    this.cdr.detectChanges();
  }

  /** "Mua ngay" → chuyển thẳng tới trang đặt hàng với sản phẩm này. */
  buyNow(product: Product | any): void {
    if (!product) return;
    const stock = product.stock !== undefined ? product.stock : 99;
    this.buyNowService.buyNow({
      ...product,
      stock: stock
    }, 1);
  }

  // seasonal diseases (Bệnh theo mùa) - images ordered left-to-right
  seasonalDiseases = [
    // slug đã map theo data/benh.json để mở thẳng trang chi tiết
    { name: 'Đau mắt đỏ', image: 'assets/images/homepage/benh/mua1.webp', items: ['Viêm kết mạc', 'Đỏ, rát mắt'], slug: 'dau-mat-do-545' },
    { name: 'Cảm lạnh', image: 'assets/images/homepage/benh/mua2.webp', items: ['Ho, sổ mũi', 'Mệt mỏi'], slug: 'cam-lanh-583' },
    { name: 'Đậu mùa khỉ', image: 'assets/images/homepage/benh/mua3.webp', items: ['Nổi mụn', 'Sốt nhẹ'], slug: 'dau-mua-khi-1408' },
    { name: 'Cúm A H3N2', image: 'assets/images/homepage/benh/mua4.webp', items: ['Sốt, ho', 'Đau cơ'], slug: 'cum-a-h3-n2' },
    { name: 'Sốt xuất huyết', image: 'assets/images/homepage/benh/mua5.webp', items: ['Sốt cao', 'Chảy máu'], slug: 'sot-xuat-huyet-dengue-155' },
    { name: 'Ebola', image: 'assets/images/homepage/benh/mua6.webp', items: ['Sốt', 'Suy nội tạng'], slug: 'ebola-438' },
    { name: 'Cúm', image: 'assets/images/homepage/benh/mua7.webp', items: ['Sốt', 'Ho khan'], slug: 'cum-mua' },
    { name: 'Bệnh tay chân miệng', image: 'assets/images/homepage/benh/mua8.webp', items: ['Nổi phỏng', 'Sốt'], slug: 'benh-tay-chan-mieng-432' }
  ];

  /** Mobile: hiển thị 4 bệnh đầu, bấm "Xem thêm" mới hiện hết; desktop hiện hết */
  showAllSeasonalDiseases = true;
  get seasonalDiseasesToShow() {
    return this.showAllSeasonalDiseases ? this.seasonalDiseases : this.seasonalDiseases.slice(0, 4);
  }
  get seasonalDiseasesRemainingCount() {
    return Math.max(0, this.seasonalDiseases.length - 4);
  }
  showMoreSeasonalDiseases(): void {
    this.showAllSeasonalDiseases = true;
  }

  /** Click \"Tìm hiểu thêm\" trong block Bệnh theo mùa → đi thẳng tới chi tiết bệnh */
  onSeasonalDiseaseClick(item: any, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!item) return;
    let slug: string = (item.slug || item.link || '').toString().trim();
    if (!slug) return;
    // Hỗ trợ cả dạng '/benh/...' hoặc 'benh/...'
    slug = slug.replace(/^\/?benh\//, '');
    slug = slug.replace(/\.html?$/i, '');
    if (!slug) return;
    this.router.navigate(['/benh', slug]);
  }

  /** Chọn sản phẩm flash deal theo kiểu round-robin giữa các danh mục để danh sách đa dạng hơn. */
  private pickByCategoryRoundRobin(list: Product[], desiredCount: number): Product[] {
    if (!Array.isArray(list) || list.length === 0 || desiredCount <= 0) {
      return [];
    }

    // Xáo trộn trước để thứ tự trong từng nhóm cũng ngẫu nhiên
    const shuffled = this.shuffleArray(list);

    // Gom theo categoryId (nếu thiếu thì cho vào nhóm 'unknown')
    const groups = new Map<string, Product[]>();
    for (const p of shuffled) {
      const keyRaw = (p.categoryId !== undefined && p.categoryId !== null) ? p.categoryId : 'unknown';
      const key = String(keyRaw);
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    }

    const result: Product[] = [];

    // Lần lượt lấy từng sản phẩm từ mỗi nhóm → đảm bảo nhiều danh mục khác nhau
    while (result.length < desiredCount && groups.size > 0) {
      for (const [key, arr] of groups) {
        if (!arr.length) {
          groups.delete(key);
          continue;
        }
        const item = arr.shift()!;
        result.push(item);
        if (!arr.length) {
          groups.delete(key);
        }
        if (result.length >= desiredCount) break;
      }
    }

    return result;
  }

  /** Chỉ gán popupBlog — không mở popup (mở sau 4s + khi đã có data) */
  private prepareBlogPopupFromPool(
    pool: Array<{ title: string; image?: string; excerpt?: string; slug?: string; link?: string }>
  ): void {
    const valid = pool.filter((b) => b.image && b.title && b.link);
    const picked =
      valid.length > 0
        ? valid[Math.floor(Math.random() * valid.length)]
        : pool[0]
          ? {
            ...pool[0],
            link: pool[0].link || (pool[0].slug ? `/bai-viet/${pool[0].slug}` : ''),
            image: pool[0].image || 'assets/images/homepage/blogs/ngu_ngon.jpg',
          }
          : null;
    if (!picked || !picked.title) return;
    this.popupBlog = {
      title: picked.title,
      image: picked.image || 'assets/images/homepage/blogs/ngu_ngon.jpg',
      excerpt: picked.excerpt || '',
      link: (picked.link || (picked.slug ? `/bai-viet/${picked.slug}` : '')) as string,
    };
    this.cdr.detectChanges();
  }

  /** Sau đủ 4s từ lúc vào Home mới hiện popup; nếu API trả sau 4s thì hiện ngay khi có data */
  private scheduleBlogPopupReveal(): void {
    if (typeof window === 'undefined' || !this.popupBlog) return;
    if (this.blogPopupRevealTimer !== null) {
      window.clearTimeout(this.blogPopupRevealTimer);
      this.blogPopupRevealTimer = null;
    }
    const elapsed = Date.now() - this.blogPopupPageEnterMs;
    const wait = Math.max(0, this.blogPopupDelayMs - elapsed);
    this.blogPopupRevealTimer = window.setTimeout(() => {
      this.blogPopupRevealTimer = null;
      if (!this.popupBlog || this.showBlogPopup) return;
      this.showBlogPopup = true;
      this.scheduleBlogPopupAutoClose();
      this.cdr.detectChanges();
    }, wait);
  }

  private scheduleBlogPopupAutoClose(): void {
    if (this.blogPopupAutoCloseTimer !== null) {
      window.clearTimeout(this.blogPopupAutoCloseTimer);
      this.blogPopupAutoCloseTimer = null;
    }
    this.blogPopupAutoCloseTimer = window.setTimeout(() => {
      this.showBlogPopup = false;
      this.blogPopupAutoCloseTimer = null;
      this.blogPopupService.setDismissed();
      this.cdr.detectChanges();
    }, this.blogPopupAutoCloseMs);
  }

  closeBlogPopup(): void {
    this.showBlogPopup = false;
    if (this.blogPopupAutoCloseTimer !== null) {
      window.clearTimeout(this.blogPopupAutoCloseTimer);
      this.blogPopupAutoCloseTimer = null;
    }
    this.blogPopupService.setDismissed();
  }

  goToBlogPopup(): void {
    if (this.popupBlog?.link) {
      this.router.navigateByUrl(this.popupBlog.link);
    }
    this.closeBlogPopup();
  }

  /** Fisher–Yates shuffle để random danh sách sản phẩm. */
  private shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}