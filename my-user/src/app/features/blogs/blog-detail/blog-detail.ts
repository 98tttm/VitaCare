import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { CartService } from '../../../core/services/cart.service';
import { BuyNowService } from '../../../core/services/buy-now.service';
import { CartAnimationService } from '../../../core/services/cart-animation.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingShippingComponent } from '../../../shared/loading-shipping/loading-shipping';

const API_BASE = 'http://localhost:3000/api';
const BLOGS_DETAIL_PATH = API_BASE + '/blogs/';

function getBlogDetailUrl(slug: string): string {
  return BLOGS_DETAIL_PATH + encodeURIComponent(slug);
}

interface BlogDetailData {
  _id: string | number;
  title: string;
  slug: string;
  category?: any;
  categoryName?: string;
  description?: string;
  content?: string;
  image?: string;
  imageUrl?: string;
  author?: any;
  authorName?: string;
  publishedAt?: string;
  createdAt?: string;
  viewCount?: number;
  views?: number;
  products?: any[];
  relatedArticles?: any[];
  tags?: any[];
  approver?: any;
  primaryImage?: { url?: string };
}

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, HttpClientModule, LoadingShippingComponent],
  templateUrl: './blog-detail.html',
  styleUrls: ['./blog-detail.css'],
})
export class BlogDetail implements OnInit, OnDestroy {
  @ViewChild('productSlider') productSlider!: ElementRef<HTMLDivElement>;
  @ViewChild('bodyContainer') bodyContainer?: ElementRef<HTMLElement>;

  blog: BlogDetailData | null = null;
  relatedBlogs: any[] = [];
  relatedProducts: any[] = [];
  loading = true;
  notFound = false;
  fontSize: 'default' | 'large' = 'default';
  userReaction: number | null = null;

  private routeSub: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private cartService: CartService,
    private buyNowService: BuyNowService,
    private cartAnimation: CartAnimationService,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      if (slug) {
        this.loadBlog(slug);
      }
    });

    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo(0, 0);
    }
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  private loadBlog(slug: string): void {
    this.loading = true;
    this.notFound = false;
    this.blog = null;
    this.http.get<BlogDetailData>(getBlogDetailUrl(slug)).subscribe({
      next: (data) => {
        this.blog = data;
        this.loading = false;
        this.cdr.detectChanges();
        this.fetchRelatedProducts();
        this.loadRelated();
      },
      error: (error) => {
        console.error('Error loading blog:', error);
        this.loading = false;
        this.notFound = true;
        this.blog = null;
        this.cdr.detectChanges();
      },
    });
  }

  // --- Carousel Navigation ---
  scrollProductNext(): void {
    if (!this.productSlider) return;
    const el = this.productSlider.nativeElement;
    el.scrollBy({ left: 300, behavior: 'smooth' });
  }

  scrollProductPrev(): void {
    if (!this.productSlider) return;
    const el = this.productSlider.nativeElement;
    el.scrollBy({ left: -300, behavior: 'smooth' });
  }

  // --- Product Interactions ---
  addToCart(product: any, event: Event): void {
    event.stopPropagation();
    this.cartService.addItem({
      _id: product._id || product.id,
      name: product.name,
      price: product.displayPrice || 0,
      image: product.image || product.imageUrl,
      quantity: 1,
      slug: product.slug,
      unit: product.displayUnit || 'Hộp'
    });
    this.cartAnimation.flyToCart(event.target as HTMLElement);
  }

  private normalizeProduct(p: any): any {
    if (!p) return p;
    // According to user: price = p.price.price, unit = p.price.measureUnitName
    const displayPrice = p.price?.price ?? p.price ?? 0;
    const displayUnit = p.price?.measureUnitName ?? p.unit ?? 'Hộp';

    return {
      ...p,
      displayPrice: typeof displayPrice === 'number' ? displayPrice : 0,
      displayUnit: displayUnit
    };
  }

  buyNow(product: any): void {
    this.buyNowService.buyNow({
      id: product._id || product.id,
      name: product.name,
      price: product.displayPrice || 0,
      image: product.image || product.imageUrl,
      quantity: 1,
      slug: product.slug
    });
  }

  requestConsultation(product: any): void {
    this.router.navigate(['/consultation'], {
      queryParams: { productId: product._id || product.id }
    });
  }

  goToProductDetail(product: any): void {
    const slug = product.slug || product._id || product.id;
    if (slug) {
      this.router.navigate(['/product', slug]);
    }
  }

  // --- Helpers & Getters ---
  get categoryName(): string {
    if (!this.blog) return 'Góc sức khoẻ';
    const cat = this.blog.category;
    if (cat?.name) return cat.name;
    return (this.blog as any).categoryName ?? 'Góc sức khoẻ';
  }

  get authorName(): string {
    if (!this.blog) return 'VitaCare';
    const a = (this.blog as any).authorName ?? (this.blog as any).author;
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object') {
      return a.fullName || a.name || a.displayName || 'VitaCare';
    }
    return 'VitaCare';
  }

  get publishedDate(): string {
    if (!this.blog) return '';
    const d = (this.blog as any).publishedAt ?? (this.blog as any).createdAt ?? (this.blog as any).updatedAt;
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  get viewCount(): number {
    if (!this.blog) return 0;
    return (this.blog as any).viewCount ?? (this.blog as any).views ?? 0;
  }

  get imageUrl(): string {
    if (!this.blog) return 'assets/placeholder/blog-main.jpg';
    const img = this.blog.primaryImage?.url ?? this.blog.image ?? (this.blog as any).imageUrl;
    return img || 'assets/placeholder/blog-main.jpg';
  }

  get introText(): string {
    if (!this.blog) return '';
    return (
      (this.blog as any).shortDescription ??
      (this.blog as any).excerpt ??
      (typeof this.blog.description === 'string' ? this.blog.description.replace(/<[^>]*>/g, '').slice(0, 300) : '') ??
      ''
    );
  }

  get bodyHtml(): SafeHtml | null {
    if (!this.blog) return null;
    const raw = (this.blog as any).descriptionHtml ?? (this.blog as any).content ?? (this.blog as any).body ?? this.blog.description;
    if (typeof raw !== 'string') return null;
    const safe = this.getSafeHtml(raw);
    this.normalizeInlineImages();
    return safe;
  }

  getSafeHtml(html: string): SafeHtml {
    if (!html) return '';
    let normalizedHtml = html
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/benh\/([^"]+).html"/gi, 'href="/benh/$1"')
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/bai-viet\/([^"]+).html"/gi, 'href="/bai-viet/$1"')
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/([^"]+).html"/gi, 'href="/bai-viet/$1"');

    normalizedHtml = normalizedHtml
      .replace(/<h3([^>]*)>/gi, '<b class="d-block mt-3 mb-2" $1>')
      .replace(/<\/h3>/gi, '</b>');

    return this.sanitizer.bypassSecurityTrustHtml(normalizedHtml);
  }

  private normalizeInlineImages(): void {
    setTimeout(() => {
      const container = this.bodyContainer?.nativeElement;
      if (!container) return;
      const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      imgs.forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (!src.trim()) { img.style.display = 'none'; return; }
        if (src.startsWith('/') && !src.startsWith('/assets/')) {
          img.src = `http://localhost:3000${src}`;
        }
        img.onerror = () => { img.onerror = null; img.src = 'assets/placeholder/blog-main.jpg'; };
      });
    });
  }

  get breadcrumbs(): { name: string; link?: string }[] {
    const list: { name: string; link?: string }[] = [{ name: 'Trang chủ', link: '/' }, { name: 'Góc sức khỏe', link: '/bai-viet' }];
    if (this.blog && this.blog.category) {
      const cat = this.blog.category;
      if (cat.name) {
        list.push({ name: cat.name, link: `/bai-viet/danh-muc/${cat.slug || ''}` });
      }
    }
    return list;
  }

  @HostListener('click', ['$event'])
  onComponentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      const routerLink = anchor.getAttribute('routerLink');
      if (routerLink) return;
      if (href && (href.startsWith('/') || href.includes('nhathuoclongchau.com.vn'))) {
        event.preventDefault();
        let targetUrl = href;
        if (href.includes('/benh/')) targetUrl = this.getInternalUrl(href, 'benh');
        else if (href.includes('/bai-viet/')) targetUrl = this.getInternalUrl(href, 'bai-viet');
        if (href.startsWith('/') && !href.includes('//')) { targetUrl = href; }
        window.scrollTo(0, 0);
        this.router.navigateByUrl(targetUrl);
      }
    }
  }

  public getInternalUrl(raw: string, type: string): string {
    if (!raw) return '/';
    let slug = raw;
    if (slug.includes('nhathuoclongchau.com.vn/')) { slug = slug.split('nhathuoclongchau.com.vn/')[1]; }
    else if (slug.startsWith('http')) { return slug; }
    if (slug.startsWith('/')) slug = slug.substring(1);
    slug = slug.replace(/^benh\//i, '').replace(/^bai-viet\//i, '');
    slug = slug.replace(/^benh\//i, '').replace(/^bai-viet\//i, '');
    slug = slug.replace(/\.html$/i, '');
    return `/${type}/${slug}`;
  }

  setReaction(value: number): void { this.userReaction = value; }
  setFontSize(size: 'default' | 'large'): void { this.fontSize = size; }

  /** URL trang bài viết hiện tại (để share) */
  get shareUrl(): string {
    if (typeof window !== 'undefined' && window.location) return window.location.href;
    return '';
  }

  /** Mở Facebook chế độ share bài viết */
  get facebookShareUrl(): string {
    const u = this.shareUrl;
    return u ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` : '#';
  }

  /** Mở Messenger chế độ gửi link cho bạn bè */
  get messengerShareUrl(): string {
    const u = this.shareUrl;
    return u ? `https://www.messenger.com/open/share/?link=${encodeURIComponent(u)}` : '#';
  }

  // --- Fetching ---
  private fetchRelatedProducts(): void {
    if (!this.blog) return;
    if (this.blog.products && this.blog.products.length > 0) {
      const firstItem = this.blog.products[0];
      if (firstItem.name && (firstItem.image || firstItem.imageUrl)) {
        this.relatedProducts = this.blog.products.map(p => this.normalizeProduct(p));
        this.cdr.detectChanges();
        return;
      }
      const productIds = this.blog.products.map(p => p._id || p.id || p.sku).filter(id => !!id);
      if (productIds.length > 0) {
        this.http.get<any>(`${API_BASE}/products?limit=50`).subscribe(res => {
          const allProds = Array.isArray(res) ? res : (res.data || res.items || []);
          this.relatedProducts = allProds
            .filter((p: any) =>
              productIds.includes(String(p._id)) || productIds.includes(String(p.id)) || productIds.includes(String(p.sku))
            )
            .map((p: any) => this.normalizeProduct(p));
          if (this.relatedProducts.length === 0) this.fetchProductsByCategory();
          this.cdr.detectChanges();
        });
        return;
      }
    }
    this.fetchProductsByCategory();
  }

  private fetchProductsByCategory(): void {
    const cat = this.blog?.category;
    const catName = cat?.name || (this.blog as any)?.categoryName;
    if (catName) {
      this.http.get<any>(`${API_BASE}/products?category=${encodeURIComponent(catName)}&limit=12`).subscribe(res => {
        const prods = Array.isArray(res) ? res : (res.data || res.items || []);
        this.relatedProducts = prods.map((p: any) => this.normalizeProduct(p));
        this.cdr.detectChanges();
      });
    }
  }

  private loadRelated(): void {
    if (this.blog?.relatedArticles && this.blog.relatedArticles.length > 0) {
      this.relatedBlogs = this.blog.relatedArticles.map(a => ({
        title: a.name || a.title,
        link: this.getInternalUrl(a.slug || a.id || '', 'bai-viet')
      }));
      this.cdr.detectChanges();
      return;
    }
    this.http.get<any[]>(`${API_BASE}/blogs?limit=10`).subscribe({
      next: (data) => {
        if (!Array.isArray(data)) return;
        const currentSlug = (this.blog?.slug || (this.blog as any)?._id || '').toString().toLowerCase();
        this.relatedBlogs = data
          .filter((b) => {
            const s = (b.slug || b._id || '').toString().toLowerCase();
            return s && s !== currentSlug;
          })
          .slice(0, 10)
          .map((b) => ({
            title: b.title || 'Góc sức khoẻ',
            link: this.getInternalUrl(b.slug || b._id || '', 'bai-viet'),
          }));
        this.cdr.detectChanges();
      },
      error: (err) => { console.error('Error loading related blogs:', err); },
    });
  }
}
