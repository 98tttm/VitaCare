import { Component, OnInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

export interface BlogItem {
  title: string;
  image?: string;
  excerpt?: string;
  link?: string;
  slug?: string;
  categoryName?: string;
}

@Component({
  selector: 'app-bai-viet-blog',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './blog.html',
  styleUrl: './blog.css',
})
export class Blog implements OnInit {
  blogs: BlogItem[] = [];
  loading = true;
  featuredTopicCategories: { name: string; count: number; slug: string }[] = [];

  preventionCardArticles: BlogItem[] = [];
  nutritionCardArticles: BlogItem[] = [];
  momBabyCardArticles: BlogItem[] = [];
  beautyCardArticles: BlogItem[] = [];
  genderCardArticles: BlogItem[] = [];
  healthNewsCardArticles: BlogItem[] = [];
  elderlyCardArticles: BlogItem[] = [];

  /** Danh mục: tên + slug + mô tả ngắn (dùng cho hàng btn-cat và ô giới thiệu) */
  blogCategoryItems: { name: string; slug: string; intro: string }[] = [
    { name: 'Phòng bệnh & Sống khoẻ', slug: 'phong-benh-song-khoe', intro: 'Cách phòng bệnh và sống khỏe mỗi ngày qua chế độ ăn, vận động và lối sống lành mạnh.' },
    { name: 'Dinh dưỡng', slug: 'dinh-duong', intro: 'Kiến thức dinh dưỡng, thực đơn cân bằng và thực phẩm tốt cho sức khỏe.' },
    { name: 'Mẹ & bé', slug: 'me-va-be', intro: 'Chăm sóc thai kỳ, trẻ sơ sinh và nuôi dạy con khỏe mạnh.' },
    { name: 'Khỏe đẹp', slug: 'khoe-dep', intro: 'Làm đẹp an toàn, chăm sóc da và sức khỏe từ bên trong.' },
    { name: 'Giới tính', slug: 'gioi-tinh', intro: 'Sức khỏe sinh sản, tình dục an toàn và các vấn đề liên quan.' },
    { name: 'Tin tức sức khỏe', slug: 'tin-tuc-suc-khoe', intro: 'Tin tức y tế, nghiên cứu mới và cập nhật từ chuyên gia.' },
    { name: 'Người cao tuổi', slug: 'nguoi-cao-tuoi', intro: 'Chăm sóc sức khỏe, phòng bệnh và nâng cao chất lượng cuộc sống cho người cao tuổi.' },
  ];

  /** Giữ tên cho hàng btn-cat (tương thích template) */
  get blogCategories(): string[] {
    return this.blogCategoryItems.map((c) => c.name);
  }

  /** Bác sĩ chuyên khoa (sidebar Đội ngũ chuyên môn) - load từ MongoDB */
  doctors: { avatar: string; degree: string; name: string; specialize: string }[] = [];

  private readonly defaultDoctors: { avatar: string; degree: string; name: string; specialize: string }[] = [
    { avatar: 'assets/placeholder/avatar.png', degree: 'Bác sĩ Chuyên khoa 1', name: 'Nguyễn Văn A', specialize: 'Nội tiết' },
    { avatar: 'assets/placeholder/avatar.png', degree: 'Bác sĩ', name: 'Trần Thị B', specialize: 'Dinh dưỡng' },
    { avatar: 'assets/placeholder/avatar.png', degree: 'Tiến sĩ', name: 'Lê Văn C', specialize: 'Tiêu hóa' },
    { avatar: 'assets/placeholder/avatar.png', degree: 'Bác sĩ', name: 'Phạm Thị D', specialize: 'Tim mạch' },
    { avatar: 'assets/placeholder/avatar.png', degree: 'Thạc sĩ', name: 'Hoàng Văn E', specialize: 'Nội tổng hợp' },
  ];

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.loadBlogs();
    this.loadDoctors();
    this.loadCategoryCounts();
  }

  /** Đếm số bài cho từng chuyên mục dựa trên API /api/blogs/category-counts */
  private loadCategoryCounts(): void {
    const url = 'http://localhost:3000/api/blogs/category-counts';
    this.http.get<any>(url).subscribe({
      next: (res) => {
        if (res?.success && res?.counts) {
          const countsMap = res.counts;
          this.featuredTopicCategories = this.blogCategoryItems
            .map(cat => ({
              name: cat.name,
              count: countsMap[cat.name] || 0,
              slug: this.normalizeTopicSlug(cat.slug)
            }))
            .filter(c => {
              const lower = c.name.toLowerCase();
              return !lower.includes('khuyến mãi') && !lower.includes('phân loại') && !lower.includes('truyền thông');
            })
            .sort((a, b) => b.count - a.count);
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Lỗi khi lấy số lượng bài viết theo danh mục:', err);
      }
    });
  }

  /** Lấy số lượng bài viết của một danh mục từ featuredTopicCategories */
  getCategoryCount(categoryName: string): number {
    if (!this.featuredTopicCategories || this.featuredTopicCategories.length === 0) return 0;
    const cat = this.featuredTopicCategories.find(c => c.name === categoryName);
    return cat ? cat.count : 0;
  }

  private loadDoctors(): void {
    const url = 'http://localhost:3000/api/doctors?limit=10';
    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        if (Array.isArray(data) && data.length > 0) {
          this.doctors = data.map((d) => this.normalizeDoctor(d));
        } else {
          this.doctors = [...this.defaultDoctors];
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.doctors = [...this.defaultDoctors];
        this.cdr.detectChanges();
      },
    });
  }

  private normalizeDoctor(d: any): { avatar: string; degree: string; name: string; specialize: string } {
    const avatarRaw =
      d.avatar ?? d.image ?? d.photo ?? d.avatarUrl ?? d.imageUrl ?? d.primaryImage ?? 'assets/placeholder/avatar.png';
    const avatar =
      typeof avatarRaw === 'object' && avatarRaw !== null && avatarRaw.src
        ? this.ensureAvatarUrl(avatarRaw.src)
        : typeof avatarRaw === 'string'
          ? avatarRaw
          : 'assets/placeholder/avatar.png';
    const degree = d.degree ?? d.hocVi ?? d.degreeTitle ?? d.title ?? '';
    const name = d.name ?? d.fullName ?? d.doctorName ?? 'Bác sĩ';
    const specialize = d.specialize ?? d.specialty ?? d.specialization ?? d.field ?? d.chuyenKhoa ?? '';
    return { avatar, degree, name, specialize };
  }

  private ensureAvatarUrl(src: string): string {
    if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('assets/') || src.startsWith('/')) {
      return src || 'assets/placeholder/avatar.png';
    }
    return `https://${src}`;
  }

  private extractBlogList(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.blogs)) return response.blogs;
    return [];
  }

  private loadBlogs(): void {
    const url = 'http://localhost:3000/api/blogs?limit=10';
    this.http.get<any>(url).subscribe({
      next: (res) => {
        const data = this.extractBlogList(res);
        this.blogs = data.map((b) => this.normalizeBlog(b));
        if (this.blogs.length === 0) this.setFallbackBlogs();

        this.loadCategoryBlogs('Phòng bệnh & Sống khoẻ', 'preventionCardArticles');
        this.loadCategoryBlogs('Dinh dưỡng', 'nutritionCardArticles');
        this.loadCategoryBlogs('Mẹ & bé', 'momBabyCardArticles');
        this.loadCategoryBlogs('Khỏe đẹp', 'beautyCardArticles');
        this.loadCategoryBlogs('Giới tính', 'genderCardArticles');
        this.loadCategoryBlogs('Tin tức sức khỏe', 'healthNewsCardArticles');
        this.loadCategoryBlogs('Người cao tuổi', 'elderlyCardArticles');

        setTimeout(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        // Fallback or leave empty arrays
        this.setFallbackBlogs();
        setTimeout(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  private loadCategoryBlogs(category: string, prop: keyof this): void {
    const catUrl = encodeURIComponent(category);
    const url = `http://localhost:3000/api/blogs?category=${catUrl}&limit=5`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        const data = this.extractBlogList(res);
        if (Array.isArray(data)) {
          (this as any)[prop] = data.map(b => this.normalizeBlog(b));
          this.cdr.detectChanges();
        }
      }
    });
  }

  /** Chuẩn hóa slug: bỏ prefix bai-viet/ hoặc /bai-viet/ để tránh URL trùng (bai-viet/bai-viet/...) */
  private normalizeSlug(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw.trim().replace(/^\/+/, '');
    if (s.toLowerCase().startsWith('bai-viet/')) s = s.slice(9);
    return s;
  }

  private normalizeBlog(b: any): BlogItem {
    const categoryName = b.category?.name || b.categoryName || 'Góc sức khoẻ';
    const slugRaw = (b.slug || b.url || '')?.trim();
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

  /** Link đến trang chi tiết bài viết. Luôn trả về /bai-viet/{slug} (không lặp bai-viet). */
  getBlogDetailLink(b: BlogItem): string {
    if (!b) return '/bai-viet';
    const fromLink = b.link ? b.link.replace(/^\/?bai-viet\/?/i, '').trim() : '';
    const fromSlug = b.slug ? this.normalizeSlug(b.slug) : '';
    const slug = this.normalizeSlug(fromLink) || fromSlug;
    return slug ? `/bai-viet/${slug}` : '/bai-viet';
  }

  private setFallbackBlogs(): void {
    this.blogs = [
      { title: 'Thanh toán 10 người nhập viện sau khi Ăn thịt, trứng cá xanh', image: 'assets/placeholder/blog-main.jpg', excerpt: 'Mô tả ngắn về sự cố an toàn thực phẩm...', link: '/bai-viet/anuong', slug: 'anuong', categoryName: 'Tin tức' },
      { title: '5 thói quen giúp ngủ ngon hơn', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Tổng hợp 5 thói quen dễ thực hiện...', link: '/bai-viet/ngu-ngon', slug: 'ngu-ngon', categoryName: 'Dinh dưỡng' },
      { title: 'Ăn gì để tăng sức đề kháng?', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Các thực phẩm giàu vitamin...', link: '/bai-viet/tang-de-khang', slug: 'tang-de-khang', categoryName: 'Dinh dưỡng' },
      { title: 'Cách xử trí khi bị cảm lạnh', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Mẹo chăm sóc tại nhà...', link: '/bai-viet/cam-lanh', slug: 'cam-lanh', categoryName: 'Sức khỏe' },
      { title: 'Chế độ ăn cho người tiểu đường', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Gợi ý thực đơn và lưu ý...', link: '/bai-viet/tieu-duong', slug: 'tieu-duong', categoryName: 'Chế độ dinh dưỡng' },
      { title: 'Phòng ngừa bệnh tim mạch', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Lối sống và dinh dưỡng...', link: '/bai-viet/tim-mach', slug: 'tim-mach', categoryName: 'Phòng ngừa bệnh' },
      { title: 'Chăm sóc da mùa khô', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Bí quyết dưỡng ẩm...', link: '/bai-viet/lam-dep', slug: 'lam-dep', categoryName: 'Sức khỏe làm đẹp' },
      { title: 'Dinh dưỡng cho bà bầu', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Thực phẩm nên và không nên...', link: '/bai-viet/me-va-be', slug: 'me-va-be', categoryName: 'Chăm sóc mẹ và bé' },
      { title: 'Thuốc kháng sinh: dùng đúng cách', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Lưu ý khi sử dụng...', link: '/bai-viet/thuoc-benh', slug: 'thuoc-benh', categoryName: 'Thuốc và bệnh' },
      { title: 'Sức khỏe cộng đồng trong mùa dịch', image: 'assets/placeholder/blog-thumb.jpg', excerpt: 'Cách bảo vệ bản thân và gia đình...', link: '/bai-viet/cong-dong', slug: 'cong-dong', categoryName: 'Sức khỏe cộng đồng' },
    ];
  }

  /** Danh sách category đang có trong data blogs (sau khi load API hoặc fallback) */
  get blogCategoriesFromData(): string[] {
    const set = new Set<string>();
    this.blogs.forEach((b) => {
      const name = (b.categoryName || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }

  /** Bài nổi bật (Góc sức khỏe) */
  get mainBlog(): BlogItem | null {
    return this.blogs[0] ?? null;
  }

  /** 4 bài bên phải Góc sức khỏe */
  get relatedBlogs(): BlogItem[] {
    return this.blogs.slice(1, 5);
  }

  /** Chủ đề nổi bật: 6 bài dạng thẻ */
  get featuredTopics(): BlogItem[] {
    return this.blogs.slice(0, 6);
  }

  /** Bài viết mới nhất: list trái */
  get latestArticles(): BlogItem[] {
    return this.blogs.slice(0, 8);
  }

  /** Đọc nhiều nhất: chỉ tiêu đề */
  get mostReadTitles(): string[] {
    return this.blogs.slice(0, 10).map((b) => b.title);
  }

  /** Map từng mục (tựa đề) sang từ khóa category để lọc blogs */
  private readonly sectionCategoryKeywords: Record<string, string[]> = {
    nutrition: ['chế độ dinh dưỡng', 'dinh dưỡng'],
    medicalNews: ['tin y học', 'y học', 'tin tức sức khỏe'],
    prevention: ['phòng ngừa bệnh', 'phòng bệnh', 'phòng ngừa', 'sống khoẻ', 'sống khỏe'],
    beauty: ['sức khỏe làm đẹp', 'khỏe đẹp', 'làm đẹp'],
    momBaby: ['chăm sóc mẹ và bé', 'mẹ và bé', 'mẹ & bé', 'mẹ và bé'],
    gender: ['giới tính', 'gioi tinh'],
    healthNews: ['tin tức sức khoẻ', 'tin tức sức khỏe', 'tin tuc suc khoe', 'tin y học', 'tin y dược', 'dịch bệnh', 'bệnh viện'],
    medicine: ['thuốc và bệnh', 'thuốc'],
    community: ['sức khỏe cộng đồng', 'cộng đồng'],
  };

  /** Lọc blogs theo category của mục (so khớp categoryName với từ khóa của mục) */
  getBlogsByCategory(sectionKey: string, limit = 6): BlogItem[] {
    const keywords = this.sectionCategoryKeywords[sectionKey] || [];
    const lower = (s: string) => (s || '').toLowerCase().trim();
    const filtered = this.blogs.filter((b) => {
      const name = lower(b.categoryName || '');
      return keywords.some((kw) => name.includes(lower(kw)));
    });
    return filtered.slice(0, limit);
  }

  /** Chế độ dinh dưỡng: lọc theo category */
  get nutritionArticles(): BlogItem[] {
    const list = this.getBlogsByCategory('nutrition', 6);
    return list.length ? list : this.blogs.slice(0, 6);
  }

  /** Tin Y học: lọc theo category */
  get medicalNews(): BlogItem[] {
    const list = this.getBlogsByCategory('medicalNews', 5);
    return list.length ? list : this.blogs.slice(0, 5);
  }

  /** Phòng ngừa bệnh: 1 lớn + 4 nhỏ, lọc theo category */
  get preventionList(): BlogItem[] {
    return this.getBlogsByCategory('prevention', 10);
  }

  get preventionMain(): BlogItem | null {
    const list = this.preventionList;
    return list[0] ?? this.blogs[0] ?? null;
  }

  get preventionRelated(): BlogItem[] {
    const list = this.preventionList;
    return list.slice(1, 5).length ? list.slice(1, 5) : this.blogs.slice(1, 5);
  }

  /** Sub-categories cho thẻ "Phòng bệnh & Sống khoẻ" (nav ngang) */
  preventionSubCategories = [
    'Kiến thức y khoa',
    'Y học cổ truyền',
    'Sức khỏe gia đình',
    'Tiêm chủng',
    'Tâm lý - Tâm thần',
    'Xét Nghiệm',
  ];

  /** Sub-categories cho thẻ "Dinh dưỡng" (nav ngang) */
  nutritionSubCategories = ['Ăn ngon khỏe', 'Thực phẩm dinh dưỡng', 'Chế độ ăn kiêng'];

  /** Sub-categories cho thẻ "Mẹ & bé" (nav ngang) */
  momBabySubCategories = ['Kế hoạch mang thai', 'Mang thai', 'Sinh con', 'Chăm sóc bé'];

  /** Sub-categories cho thẻ "Khỏe đẹp" (nav ngang) */
  beautySubCategories = ['Chăm sóc tóc', 'Dưỡng da', 'Chăm sóc cơ thể', 'Mỹ phẩm'];

  /** Sub-categories cho thẻ "Giới tính" (nav ngang) */
  genderSubCategories = ['Sức khỏe giới tính', 'Đời sống tình dục'];

  /** Sub-categories cho thẻ "Tin tức sức khoẻ" (nav ngang) */
  healthNewsSubCategories = ['Tin y dược', 'Dịch bệnh', 'Bệnh viện'];
  private normalizeTopicSlug(slug: string): string {
    if (!slug) return '';
    return slug.replace(/^chuyen-de\//i, '').replace(/^\/+/, '');
  }
}
