import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';

export interface BlogItem {
  title: string;
  image?: string;
  excerpt?: string;
  link?: string;
  slug?: string;
  categoryName?: string;
}

export interface SubCategory {
  name: string;
  icon: string;
  count: number;
  slug: string;
  /** Nhiều từ khóa OR để đếm bài khớp phân loại (title/mô tả) */
  countKeywords?: string[];
  /** Ảnh đại diện lấy từ bài viết trong Mongo (ưu tiên hiển thị) */
  coverImage?: string;
}

@Component({
  selector: 'app-blog-category',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './blog-category.html',
  styleUrl: './blog-category.css',
})
export class BlogCategory implements OnInit {
  blogs: BlogItem[] = [];
  filteredBlogs: BlogItem[] = [];
  displayedBlogs: BlogItem[] = [];
  loading = true;
  elderlyCardArticles: BlogItem[] = [];

  pageSize = 6;
  initialSize = 10;
  loadCount = 0; // Number of times loadMore has been clicked
  totalCount = 0;

  get remainingCount(): number {
    const currentTotal = this.totalCount > 0 ? this.totalCount : this.filteredBlogs.length;
    return Math.max(0, currentTotal - this.displayedBlogs.length);
  }

  categorySlug: string = '';
  categoryName: string = '';
  subcat: string | null = null;

  subcategorySlug: string | null = null;
  currentCategoryItems: any = null;

  blogCategoryItems = [
    {
      name: 'Phòng bệnh & Sống khoẻ',
      slug: 'phong-benh-song-khoe',
      keywords: ['phòng ngừa bệnh', 'phòng bệnh', 'phòng ngừa', 'sống khoẻ', 'sống khỏe', 'kiến thức y khoa', 'y học cổ truyền', 'sức khỏe gia đình', 'tiêm chủng', 'tâm lý', 'xét nghiệm'],
      subcategories: [
        { name: 'Y học cổ truyền', slug: 'y-hoc-co-truyen', icon: 'assets/images/homepage/blogs/y_hoc_co_truyen.webp', count: 0, countKeywords: ['y học cổ truyền', 'đông y', 'thuốc nam', 'cổ truyền'] },
        { name: 'Kiến thức y khoa', slug: 'kien-thuc-y-khoa', icon: 'assets/images/homepage/blogs/kien_thuc_y_khoa.webp', count: 0, countKeywords: ['kiến thức y khoa', 'y khoa', 'bác sĩ', 'chẩn đoán'] },
        { name: 'Sức khỏe gia đình', slug: 'suc-khoe-gia-dinh', icon: 'assets/images/homepage/blogs/suc_khoe_gia_dinh.webp', count: 0, countKeywords: ['sức khỏe gia đình', 'gia đình', 'trẻ em', 'người thân'] },
        { name: 'Tiêm chủng', slug: 'tiem-chung', icon: 'assets/images/homepage/blogs/tiem_chung.webp', count: 0, countKeywords: ['tiêm chủng', 'vaccine', 'tiêm ngừa', 'chủng ngừa'] },
        { name: 'Tâm lý - Tâm thần', slug: 'tam-ly-tam-than', icon: 'assets/images/homepage/blogs/tam_ly.webp', count: 0, countKeywords: ['tâm lý', 'tâm thần', 'trầm cảm', 'stress', 'lo âu', 'tâm thần kinh'] },
        { name: 'Xét Nghiệm', slug: 'xet-nghiem', icon: 'assets/images/homepage/blogs/xet_nghiem.webp', count: 0, countKeywords: ['xét nghiệm', 'xét nghiệm máu', 'chẩn đoán hình ảnh', 'laboratory'] }
      ]
    },
    {
      name: 'Dinh dưỡng',
      slug: 'dinh-duong',
      keywords: ['chế độ dinh dưỡng', 'dinh dưỡng', 'ăn ngon', 'thực phẩm', 'ăn kiêng'],
      subcategories: [
        { name: 'Ăn ngon khỏe', slug: 'an-ngon-khoe', icon: 'assets/images/homepage/blogs/an_gi.jpg', count: 0, countKeywords: ['ăn ngon', 'thực đơn', 'món ăn', 'khỏe'] },
        { name: 'Thực phẩm dinh dưỡng', slug: 'thuc-pham-dinh-duong', icon: 'assets/images/homepage/blogs/ngu_ngon.jpg', count: 0, countKeywords: ['thực phẩm', 'dinh dưỡng', 'vitamin', 'bổ sung'] },
        { name: 'Chế độ ăn kiêng', slug: 'che-do-an-kieng', icon: 'assets/images/homepage/blogs/cam_cum.webp', count: 0, countKeywords: ['ăn kiêng', 'giảm cân', 'low carb', 'keto'] }
      ]
    },
    {
      name: 'Mẹ & bé',
      slug: 'me-va-be',
      keywords: ['chăm sóc mẹ và bé', 'mẹ và bé', 'mẹ & bé', 'mang thai', 'sinh con', 'trẻ'],
      subcategories: [
        { name: 'Kế hoạch mang thai', slug: 'ke-hoach-mang-thai', icon: 'assets/icon/health-test.png', count: 0, countKeywords: ['kế hoạch mang thai', 'chuẩn bị mang thai', 'thụ thai', 'sinh con'] },
        { name: 'Mang thai', slug: 'mang-thai', icon: 'assets/icon/medical_16660084.png', count: 0, countKeywords: ['mang thai', 'thai kỳ', 'bà bầu', 'thai nhi'] },
        { name: 'Sinh con', slug: 'sinh-con', icon: 'assets/icon/blood (1).png', count: 0, countKeywords: ['sinh con', 'đẻ mổ', 'đẻ thường', 'chuyển dạ'] },
        { name: 'Chăm sóc bé', slug: 'cham-soc-be', icon: 'assets/icon/chamsoccanhan/chamsocrangmieng.png', count: 0, countKeywords: ['chăm sóc bé', 'trẻ sơ sinh', 'em bé', 'nuôi con'] }
      ]
    },
    {
      name: 'Khỏe đẹp',
      slug: 'khoe-dep',
      keywords: ['sức khỏe làm đẹp', 'khỏe đẹp', 'làm đẹp', 'tóc', 'da', 'mỹ phẩm'],
      subcategories: [
        { name: 'Chăm sóc tóc', slug: 'cham-soc-toc', icon: 'assets/icon/duocmypham/chamsoctocdadau.png', count: 0, countKeywords: ['chăm sóc tóc', 'tóc', 'gàu', 'hói'] },
        { name: 'Dưỡng da', slug: 'duong-da', icon: 'assets/icon/duocmypham/chamsocdamat.png', count: 0, countKeywords: ['dưỡng da', 'da mặt', 'mụn', 'chống nắng'] },
        { name: 'Chăm sóc cơ thể', slug: 'cham-soc-co-the', icon: 'assets/icon/duocmypham/chamsoccothe.png', count: 0, countKeywords: ['chăm sóc cơ thể', 'cơ thể', 'tắm', 'body'] },
        { name: 'Mỹ phẩm', slug: 'my-pham', icon: 'assets/icon/duocmypham/myphamtrangdiem.png', count: 0, countKeywords: ['mỹ phẩm', 'trang điểm', 'son môi', 'kem nền'] }
      ]
    },
    {
      name: 'Giới tính',
      slug: 'gioi-tinh',
      keywords: ['giới tính', 'gioi tinh', 'sinh sản', 'tình dục'],
      subcategories: [
        { name: 'Sức khỏe sinh sản', slug: 'suc-khoe-sinh-san', icon: 'assets/icon/transgender_10894616.png', count: 0, countKeywords: ['sinh sản', 'thụ tinh', 'vô sinh', 'buồng trứng'] },
        { name: 'Đời sống tình dục', slug: 'doi-song-tinh-duc', icon: 'assets/icon/chamsoccanhan/hotrotinhduc.png', count: 0, countKeywords: ['tình dục', 'quan hệ', 'an toàn tình dục'] }
      ]
    },
    {
      name: 'Tin tức sức khỏe',
      slug: 'tin-tuc-suc-khoe',
      keywords: ['tin tức sức khoẻ', 'tin tức sức khỏe', 'tin y học', 'tin y dược', 'dịch bệnh', 'bệnh viện'],
      subcategories: [
        { name: 'Tin y dược', slug: 'tin-y-duoc', icon: 'assets/icon/medical_16660084.png', count: 0, countKeywords: ['y dược', 'dược phẩm', 'nhà thuốc', 'thuốc', 'dược sĩ', 'FDA', 'thuốc mới'] },
        { name: 'Dịch bệnh', slug: 'dich-benh', icon: 'assets/images/homepage/benh/mua4.webp', count: 0, countKeywords: ['dịch bệnh', 'dịch', 'covid', 'cúm', 'dịch tễ'] },
        { name: 'Bệnh viện', slug: 'benh-vien', icon: 'assets/images/banner/woman_doctor.png', count: 0, countKeywords: ['bệnh viện', 'cơ sở y tế', 'nhập viện', 'phòng khám'] }
      ]
    },
    { name: 'Người cao tuổi', slug: 'nguoi-cao-tuoi', keywords: ['người cao tuổi', 'nguoi cao tuoi', 'người già', 'ngũ tuần', 'lão khoa'] }
  ];

  constructor(private http: HttpClient, private route: ActivatedRoute, private titleService: Title, private cdr: ChangeDetectorRef) { }

  private extractBlogList(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.blogs)) return response.blogs;
    return [];
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.categorySlug = params.get('categorySlug') || '';
      this.subcategorySlug = params.get('subcategorySlug');
      this.updateCategoryInfo();
      this.resolveSubcatName();
      this.loadBlogs();
      this.loadCategoryCounts();
      this.loadSubcategoryCounts();
    });
  }

  resolveSubcatName(): void {
    if (this.subcategorySlug && this.currentCategoryItems?.subcategories) {
      const sub = this.currentCategoryItems.subcategories.find((s: any) => s.slug === this.subcategorySlug);
      this.subcat = sub ? sub.name : null;
    } else {
      this.subcat = null;
    }
  }

  private loadCategoryCounts(): void {
    const cat = this.blogCategoryItems.find(c => c.slug === this.categorySlug);
    if (!cat) return;

    // Dùng API /api/blogs hiện tại, lấy total làm số bài trong category / subcategory
    const base = 'http://localhost:3000/api/blogs';
    const categoryName = cat.name;
    const keyword = this.subcat ? this.subcat : '';

    let url = `${base}?limit=1&page=1&category=${encodeURIComponent(categoryName)}`;
    if (keyword) {
      url += `&keyword=${encodeURIComponent(keyword)}`;
    }

    this.http.get<any>(url).subscribe({
      next: (res) => {
        if (res && typeof res.total === 'number') {
          this.totalCount = res.total;
          this.cdr.detectChanges();
        }
      },
      error: () => {
        this.totalCount = 0;
        this.cdr.detectChanges();
      }
    });
  }

  /** Ảnh đại diện từ document blog (Mongo) — đồng bộ với normalizeBlog */
  private thumbFromBlogDoc(b: any): string {
    if (!b || typeof b !== 'object') return '';
    const raw =
      b.primaryImage?.url ||
      (typeof b.primaryImage === 'object' && b.primaryImage?.src) ||
      b.image ||
      b.imageUrl;
    if (!raw || typeof raw !== 'string') return '';
    const s = raw.trim();
    if (!s) return '';
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('assets/')) return s;
    if (s.startsWith('/')) return `http://localhost:3000${s}`;
    return `http://localhost:3000/${s}`;
  }

  private loadSubcategoryCounts(): void {
    if (!this.currentCategoryItems || !this.currentCategoryItems.subcategories) return;

    const base = 'http://localhost:3000/api/blogs';
    const categoryName = this.currentCategoryItems.name;

    this.currentCategoryItems.subcategories.forEach((sub: any) => {
      const kw = (sub.countKeywords && sub.countKeywords.length ? sub.countKeywords : [sub.name]).join(',');
      const url = `${base}?limit=1&page=1&category=${encodeURIComponent(categoryName)}&keywords=${encodeURIComponent(kw)}`;

      this.http.get<any>(url).subscribe({
        next: (res) => {
          if (res && typeof res.total === 'number') {
            sub.count = res.total;
          }
          sub.coverImage = undefined;
          this.cdr.detectChanges();
        },
        error: () => {
          sub.count = 0;
          sub.coverImage = undefined;
          this.cdr.detectChanges();
        }
      });
    });
  }

  /** Khi ảnh blog lỗi → fallback icon tĩnh rồi placeholder */
  onSubcategoryImgError(ev: Event, sub: SubCategory & { coverImage?: string }): void {
    const el = ev.target as HTMLImageElement;
    if (sub.coverImage && el.src.includes(sub.coverImage.split('?')[0])) {
      sub.coverImage = undefined;
      el.src = sub.icon;
      return;
    }
    el.onerror = null;
    el.src = 'assets/placeholder/blog-thumb.jpg';
  }

  updateCategoryInfo() {
    const cat = this.blogCategoryItems.find(c => c.slug === this.categorySlug);
    this.currentCategoryItems = cat;
    if (cat) {
      this.categoryName = cat.name;
      this.titleService.setTitle(cat.name + ' - Bài viết');
    } else {
      this.categoryName = 'Danh mục bài viết';
    }
  }

  private loadBlogs(): void {
    this.loading = true;
    this.loadCount = 0;
    const skip = 0;
    const limit = this.initialSize;
    const cat = this.blogCategoryItems.find(c => c.slug === this.categorySlug);

    const keywordsParam = cat && cat.keywords.length > 0 ? cat.keywords.join(',') : '';
    const kwQuery = keywordsParam ? `&keywords=${encodeURIComponent(keywordsParam)}` : '';
    const categoryQuery = this.categoryName !== 'Danh mục bài viết' ? `&category=${encodeURIComponent(this.categoryName)}` : '';
    const subcategoryQuery = this.subcat ? `&subcategory=${encodeURIComponent(this.subcat)}` : '';
    const url = `http://localhost:3000/api/blogs?limit=${limit}&skip=${skip}${categoryQuery}${subcategoryQuery}${kwQuery}`;

    this.http.get<any>(url).subscribe({
      next: (res) => {
        const data = this.extractBlogList(res);
        this.blogs = data.map((b) => this.normalizeBlog(b));

        if (this.blogs.length === 0 && skip === 0) {
          this.setFallbackBlogs();
        }

        this.filterBlogs();
        this.loadElderlyBlogs();
        setTimeout(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        if (skip === 0) this.setFallbackBlogs();
        this.filterBlogs();
        setTimeout(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  loadMore() {
    this.loadCount++;
    const skip = this.initialSize + ((this.loadCount - 1) * this.pageSize);
    const limit = this.pageSize;
    const cat = this.blogCategoryItems.find(c => c.slug === this.categorySlug);

    const keywordsParam = cat && cat.keywords.length > 0 ? cat.keywords.join(',') : '';
    const kwQuery = keywordsParam ? `&keywords=${encodeURIComponent(keywordsParam)}` : '';
    const categoryQuery = this.categoryName !== 'Danh mục bài viết' ? `&category=${encodeURIComponent(this.categoryName)}` : '';
    const subcategoryQuery = this.subcat ? `&subcategory=${encodeURIComponent(this.subcat)}` : '';
    const url = `http://localhost:3000/api/blogs?limit=${limit}&skip=${skip}${categoryQuery}${subcategoryQuery}${kwQuery}`;

    this.http.get<any>(url).subscribe({
      next: (res) => {
        const data = this.extractBlogList(res);
        if (Array.isArray(data) && data.length > 0) {
          const newBlogs = data.map(b => this.normalizeBlog(b));
          this.blogs = [...this.blogs, ...newBlogs];
          this.filterBlogs();
          this.cdr.detectChanges();
        }
      }
    });
  }

  private loadElderlyBlogs(): void {
    const url = `http://localhost:3000/api/blogs?category=${encodeURIComponent('Người cao tuổi')}&limit=5`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        const data = this.extractBlogList(res);
        if (Array.isArray(data)) {
          this.elderlyCardArticles = data.map(b => this.normalizeBlog(b));
          this.cdr.detectChanges();
        }
      }
    });
  }

  filterBlogs() {
    // Backend API already accurately limits to subcategory keywords when appropriate,
    // so we no longer need complex frontend excerpt matching.
    this.filteredBlogs = [...this.blogs];
    this.updateDisplayedBlogs();
  }

  updateDisplayedBlogs() {
    const totalToDisplay = this.initialSize + (this.loadCount * this.pageSize);
    this.displayedBlogs = this.filteredBlogs.slice(0, totalToDisplay);
  }

  private normalizeSlug(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw.trim().replace(/^\/+/, '');
    if (s.toLowerCase().startsWith('bai-viet/')) s = s.slice(9);
    return s;
  }

  private normalizeBlog(b: any): BlogItem {
    const mainCat = Array.isArray(b.categories) && b.categories[0] ? b.categories[0].name : null;
    const categoryName = mainCat || b.categoryName || 'Bài viết';
    const slugRaw = (b.slug || (b as any).slug)?.trim();
    const idStr = b._id != null ? String(b._id) : '';
    const slug = this.normalizeSlug(slugRaw || '') || idStr;
    const link = slug ? `/bai-viet/${slug}` : '/bai-viet';
    return {
      title: b.title || b.name || 'Bài viết sức khỏe',
      image: b.primaryImage?.url || b.image || b.imageUrl || 'assets/placeholder/blog-thumb.jpg',
      excerpt: b.shortDescription || b.excerpt || (typeof b.description === 'string' ? b.description.replace(/<[^>]*>/g, '').slice(0, 160) : ''),
      link,
      slug: slug || undefined,
      categoryName: categoryName,
    };
  }

  private setFallbackBlogs(): void {
    const catName = this.categoryName;
    this.blogs = Array.from({ length: 12 }).map((_, i) => ({
      title: `${catName} - Bài viết mẫu ${i + 1}`,
      image: 'assets/placeholder/blog-main.jpg',
      excerpt: `Đây là bài viết mẫu cho chuyên mục ${catName}. Cung cấp các thông tin hữu ích và kiến thức chuyên sâu về chủ đề này.`,
      link: `/bai-viet/bai-viet-mau-${i + 1}`,
      slug: `bai-viet-mau-${i + 1}`,
      categoryName: catName
    }));
  }
}
