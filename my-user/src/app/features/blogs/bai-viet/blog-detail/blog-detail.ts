import { Component, OnInit, ChangeDetectorRef, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

const API_BASE = 'http://localhost:3000/api';
/** Endpoint chi tiết bài viết - phải là "blogs" (số nhiều), không phải "blog" */
const BLOGS_DETAIL_PATH = API_BASE + '/blogs/';
function getBlogDetailUrl(slug: string): string {
  return BLOGS_DETAIL_PATH + encodeURIComponent(slug);
}

export interface BlogDetailData {
  _id?: string;
  title?: string;
  slug?: string;
  shortDescription?: string;
  excerpt?: string;
  description?: string;
  /** Nội dung HTML chính của bài (ưu tiên dùng) */
  descriptionHtml?: string;
  content?: string;
  body?: string;
  image?: string;
  imageUrl?: string;
  primaryImage?: { url?: string };
  category?: { name?: string; slug?: string };
  categoryName?: string;
  author?: string;
  authorName?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  viewCount?: number;
  views?: number;
}

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './blog-detail.html',
  styleUrl: './blog-detail.css',
})
export class BlogDetail implements OnInit {
  slug: string | null = null;
  blog: BlogDetailData | null = null;
  loading = true;
  notFound = false;
  relatedBlogs: { title: string; link?: string }[] = [];
  helpfulReaction: number | null = null;
  commentText = '';
  comments: { author: string; date: string; text: string }[] = [];
  /** Kích thước chữ: 'default' | 'large' */
  fontSize: 'default' | 'large' = 'default';

  @ViewChild('bodyContainer') bodyContainer?: ElementRef<HTMLElement>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slugParam = params.get('slug');
      this.slug = slugParam ? this.decodeSlug(slugParam) : null;
      if (this.slug) {
        this.loadBlog();
      } else {
        this.notFound = true;
        this.blog = null;
        setTimeout(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  private normalizeInlineImages(): void {
    // Chỉ chạy sau khi Angular đã render bodyHtml
    setTimeout(() => {
      const container = this.bodyContainer?.nativeElement;
      if (!container) return;

      const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      imgs.forEach((img) => {
        const src = img.getAttribute('src') || '';

        // Ẩn ảnh nếu không có src
        if (!src.trim()) {
          img.style.display = 'none';
          return;
        }

        // Nếu là đường dẫn tương đối tới backend (/uploads/...), prefix API server
        if (src.startsWith('/') && !src.startsWith('/assets/')) {
          img.src = `http://localhost:3000${src}`;
        }

        // Fallback khi ảnh lỗi: dùng placeholder chung
        img.onerror = () => {
          img.onerror = null;
          img.src = 'assets/placeholder/blog-main.jpg';
        };
      });
    });
  }

  private decodeSlug(s: string): string {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }

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
    if (a && typeof a === 'object' && (a.name || a.fullName || a.displayName)) return a.name || a.fullName || a.displayName || 'VitaCare';
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

  getSafeHtml(html: string): SafeHtml {
    if (!html) return '';
    // Chuyển link ngoài thành link nội bộ cho bài viết/bệnh
    const internalizedHtml = html
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/benh\/([^"]+).html"/gi, 'href="/benh/$1"')
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/bai-viet\/([^"]+).html"/gi, 'href="/bai-viet/$1"')
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/([^"]+).html"/gi, 'href="/bai-viet/$1"');

    return this.sanitizer.bypassSecurityTrustHtml(internalizedHtml);
  }

  /** Chuyển slug/URL bất kỳ thành path nội bộ sạch */
  public getInternalUrl(raw: string, type: string): string {
    if (!raw) return '/';
    let slug = raw;

    // Nếu là URL tuyệt đối, lấy phần sau domain
    if (slug.includes('nhathuoclongchau.com.vn/')) {
      slug = slug.split('nhathuoclongchau.com.vn/')[1];
    } else if (slug.startsWith('http')) {
      return slug;
    }

    // Xóa dấu / ở đầu nếu có
    if (slug.startsWith('/')) slug = slug.substring(1);

    // Xóa prefix dư thừa (cả có và không có / ở đầu)
    slug = slug.replace(/^benh\//i, '').replace(/^bai-viet\//i, '');
    // Xóa lần nữa nếu vẫn còn (trường hợp /bai-viet/bai-viet/...)
    slug = slug.replace(/^benh\//i, '').replace(/^bai-viet\//i, '');

    // Xóa đuôi .html
    slug = slug.replace(/\.html$/i, '');

    return `/${type}/${slug}`;
  }

  get breadcrumbs(): { name: string; link?: string }[] {
    const list: { name: string; link?: string }[] = [{ name: 'Trang chủ', link: '/' }, { name: 'Góc sức khỏe', link: '/bai-viet' }];

    if (this.blog && this.blog.category) {
      const cat = this.blog.category;
      if (cat.name) {
        list.push({ name: cat.name, link: `/bai-viet/danh-muc/${cat.slug || ''}` });
      }
    }

    if (this.blog && this.blog.title) {
      list.push({ name: this.blog.title });
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

      // Nếu đã có routerLink thì để Angular xử lý tự nhiên
      if (routerLink) return;

      // Chỉ intercept nếu là link nội bộ hoặc link longchau đã được biến đổi
      if (href && (href.startsWith('/') || href.includes('nhathuoclongchau.com.vn'))) {
        event.preventDefault();

        let targetUrl = href;
        if (href.includes('/benh/')) targetUrl = this.getInternalUrl(href, 'benh');
        else if (href.includes('/bai-viet/')) targetUrl = this.getInternalUrl(href, 'bai-viet');

        // Nếu là link nội bộ đã sạch (không có domain), dùng trực tiếp
        if (href.startsWith('/') && !href.includes('//')) {
          targetUrl = href;
        }

        window.scrollTo(0, 0);
        this.router.navigateByUrl(targetUrl);
      }
    }
  }

  get bodyHtml(): SafeHtml | null {
    if (!this.blog) return null;
    const raw =
      (this.blog as any).descriptionHtml ??
      (this.blog as any).content ??
      (this.blog as any).body ??
      this.blog.description;
    if (typeof raw !== 'string') return null;

    const safe = this.getSafeHtml(raw);
    // Sau khi có nội dung, normalize lại src ảnh inline
    this.normalizeInlineImages();
    return safe;
  }

  setReaction(value: number): void {
    this.helpfulReaction = value;
  }

  setFontSize(size: 'default' | 'large'): void {
    this.fontSize = size;
  }

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

  sendComment(): void {
    const text = (this.commentText || '').trim();
    if (!text) return;
    this.comments = [...this.comments, { author: 'Bạn', date: new Date().toLocaleDateString('vi-VN'), text }];
    this.commentText = '';
  }

  private loadBlog(): void {
    if (!this.slug) return;
    this.loading = true;
    this.notFound = false;
    this.blog = null;
    const url = getBlogDetailUrl(this.slug);
    this.http.get<BlogDetailData>(url).subscribe({
      next: (data) => {
        this.blog = data;
        setTimeout(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
        this.loadRelated();
      },
      error: (err) => {
        if (err.status === 404) {
          this.tryLoadFromList();
        } else {
          this.notFound = true;
          this.blog = null;
          setTimeout(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        }
      },
    });
  }

  /** Fallback: khi API chi tiết 404, lấy danh sách và tìm bài theo slug/_id để vẫn hiển thị data */
  private tryLoadFromList(): void {
    this.http.get<any[]>(`${API_BASE}/blogs?limit=100`).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : [];
        const normalized = (this.slug || '').replace(/^bai-viet\/?/i, '').trim().toLowerCase();
        const found = list.find((b) => {
          const s = ((b.slug || b.url || '') + '').replace(/^bai-viet\/?/i, '').trim().toLowerCase();
          const idStr = b._id ? String(b._id) : '';
          return (s && (s === normalized || s === (this.slug || '').toLowerCase())) || idStr === this.slug;
        });
        this.blog = found || null;
        this.notFound = !found;
        setTimeout(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
        if (found) this.loadRelated();
      },
      error: () => {
        this.notFound = true;
        this.blog = null;
        setTimeout(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  private loadRelated(): void {
    this.http.get<any[]>(`${API_BASE}/blogs?limit=8`).subscribe({
      next: (data) => {
        if (!Array.isArray(data)) return;
        const currentSlug = (this.blog?.slug || (this.blog as any)?._id?.toString() || '').replace(/^bai-viet\/?/i, '');
        this.relatedBlogs = data
          .filter((b) => {
            const s = (b.slug || (b as any)._id?.toString() || '').replace(/^bai-viet\/?/i, '');
            return s && s !== currentSlug;
          })
          .slice(0, 6)
          .map((b) => {
            const s = (b.slug || (b as any)._id?.toString() || '').replace(/^bai-viet\/?/i, '').trim();
            return {
              title: b.title || b.name || 'Góc sức khoẻ',
              link: s ? `/bai-viet/${s}` : undefined,
            };
          });
        this.cdr.detectChanges();
      },
      error: () => { },
    });
  }
}
