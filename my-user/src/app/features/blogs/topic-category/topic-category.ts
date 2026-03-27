import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { LoadingShippingComponent } from '../../../shared/loading-shipping/loading-shipping';
import { BlogQuickViewService } from '../../../core/services/blog-quick-view.service';


export interface BlogItem {
    title: string;
    image: string;
    excerpt: string;
    link: string;
    slug: string;
    categoryName: string;
}

@Component({
    selector: 'app-topic-category',
    standalone: true,
    imports: [CommonModule, RouterLink, LoadingShippingComponent],
    templateUrl: './topic-category.html',
    styleUrl: './topic-category.css'
})
export class TopicCategory implements OnInit {
    blogs: BlogItem[] = [];
    featuredTopicCategories: { name: string; count: number; slug: string }[] = [];
    featuredSidebarLimit = 8;
    doctors: { avatar: string; degree: string; name: string; specialize: string }[] = [];

    loading = true;
    skip = 0;
    limit = 10;
    total = 0;
    tagSlug: string = '';
    tagName: string = '';

    private tagMap: { [key: string]: string } = {
        'noi-tiet-chuyen-hoa': 'Nội tiết - Chuyển hóa',
        'than-tiet-nieu': 'Thận - Tiết niệu',
        'co-xuong-khop': 'Cơ xương khớp',
        'tim-mach': 'Tim mạch',
        'ho-hap': 'Hô hấp',
        'tieu-hoa-gan-mat': 'Tiêu hóa - Gan mật',
        'than-kinh': 'Thần kinh',
        'mat': 'Mắt',
        'tai-mui-hong': 'Tai mũi họng',
        'rang-ham-mat': 'Răng hàm mặt',
        'da-lieu': 'Da liễu',
        'nam-khoa': 'Nam khoa',
        'phu-khoa': 'Phụ khoa',
        'ung-buou': 'Ung bướu',
        'truyen-nhiem': 'Truyền nhiễm',
        'nhi-khoa': 'Nhi khoa',
        'san-khoa': 'Sản khoa',
        'lao-khoa': 'Lão khoa',
        'suc-khoe-tam-than': 'Sức khỏe tâm thần',
        'ung-thư': 'Ung thư',
        'dinh-duong': 'Dinh dưỡng',
        'y-hoc-the-thao': 'Y học thể thao',
        'phuc-hoi-chuc-nang': 'Phục hồi chức năng',
        'lam-dep': 'Làm đẹp',
        'khoe-dep': 'Khỏe đẹp',
        'me-va-be': 'Mẹ và bé',
        'phong-benh-song-khoe': 'Phòng bệnh & Sống khỏe',
        'tin-tuc-suc-khoe': 'Tin tức sức khỏe',
        'dot-quy': 'Đột quỵ',
        'tieu-duong': 'Tiểu đường',
        'huyet-ap-cao': 'Huyết áp cao',
        'huyet-ap': 'Huyết áp',
        'suc-khoe': 'Sức khỏe',
        'cham-soc-da': 'Chăm sóc da',
        'mang-thai': 'Mang thai',
        'thong-tin-suc-khoe': 'Thông tin sức khỏe',
        'cham-soc-rang-mieng': 'Chăm sóc răng miệng',
        'an-uong-lanh-manh': 'Ăn uống lành mạnh',
        'tre-so-sinh': 'Trẻ sơ sinh',
        'cham-soc-suc-khoe': 'Chăm sóc sức khỏe',
        'che-do-an-uong': 'Chế độ ăn uống',
        'giam-can': 'Giảm cân',
        'benh-ve-than-kinh': 'Bệnh về thần kinh',
        'xuong-khop': 'Xương khớp',
        'benh-da-day': 'Bệnh dạ dày',
        'da-day': 'Dạ dày'
    };

    // Alias between disease-group slugs and blog-topic slugs (data sources are not fully unified)
    private readonly topicAliasMap: Record<string, string> = {
        'than-kinh-tinh-than': 'benh-ve-than-kinh',
    };

    constructor(
        private http: HttpClient,
        private route: ActivatedRoute,
        private titleService: Title,
        private cdr: ChangeDetectorRef,
        private blogQuickViewService: BlogQuickViewService
    ) { }

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            const rawSlug = params.get('specialtySlug') || '';
            this.tagSlug = this.normalizeTopicSlug(rawSlug);
            this.tagSlug = this.topicAliasMap[this.tagSlug] || this.tagSlug;

            // Priority: accented mapping immediately to avoid "title flicker".
            this.tagName = this.tagMap[this.tagSlug] || '';
            this.titleService.setTitle(`Bài viết ${this.tagName || 'Chuyên đề'} - VitaCare`);

            this.skip = 0;
            this.blogs = [];
            this.loadBlogs();
            this.loadTopicCounts();
            this.loadDoctors();
        });
    }

    private loadTopicCounts(): void {
        // Fetch a broad list so current topic slug can always map to accented Vietnamese name.
        const url = '/api/blogs/topic-counts?limit=500';
        this.http.get<any>(url).subscribe({
            next: (res) => {
                if (res?.success && Array.isArray(res?.counts)) {
                    const counts = res.counts;
                    this.featuredTopicCategories = res.counts.map((item: any) => ({
                        name: item.name,
                        count: item.count,
                        slug: this.normalizeTopicSlug(item.slug || this.slugify(item.name))
                    }));

                    // Normalize current route slug to canonical API slug if possible.
                    // Some routes use alternative slugs (e.g. non-accented variants) that
                    // do not match backend tagSlug exactly and cause empty result lists.
                    const matchedBySlug = counts.find((item: any) =>
                        this.normalizeTopicSlug(item.slug || this.slugify(item.name)) === this.tagSlug
                    );
                    const matchedByNameSlug = counts.find((item: any) =>
                        this.slugify(item.name || '') === this.tagSlug
                    );
                    const matched = matchedBySlug || matchedByNameSlug;

                    // Prefer exact accented name from API for current topic title.
                    if (matched?.name) {
                        this.tagName = matched.name;
                        this.titleService.setTitle(`Bài viết ${this.tagName} - VitaCare`);
                    }

                    // If route slug is an alias, switch to canonical slug and reload posts.
                    if (matched) {
                        const canonicalSlug = this.normalizeTopicSlug(matched.slug || this.slugify(matched.name || ''));
                        if (canonicalSlug && canonicalSlug !== this.tagSlug) {
                            this.tagSlug = canonicalSlug;
                            this.skip = 0;
                            this.blogs = [];
                            this.loadBlogs();
                        }
                    }
                    this.cdr.detectChanges();
                }
            }
        });
    }

    private loadDoctors(): void {
        const url = '/api/doctors?limit=5';
        this.http.get<any[]>(url).subscribe({
            next: (data) => {
                if (Array.isArray(data)) {
                    this.doctors = data.map(d => ({
                        avatar: d.avatar?.url || d.image || 'assets/placeholder/avatar.png',
                        degree: d.degree || 'Bác sĩ',
                        name: d.name || d.fullName || 'Chuyên gia',
                        specialize: d.specialize || d.specialty || ''
                    }));
                    this.cdr.detectChanges();
                }
            }
        });
    }

    private formatSlug(slug: string): string {
        if (!slug) return '';
        // Remove prefixes and separate words
        const clean = slug
            .replace(/^topic\//i, '')
            .replace(/^chuyen-de\//i, '')
            .replace(/-/g, ' ');

        return clean
            .split(' ')
            .filter(word => word.length > 0)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    loadBlogs(): void {
        this.loading = true;
        const url = `/api/blogs?limit=${this.limit}&skip=${this.skip}&tagSlug=${this.tagSlug}`;

        this.http.get<any>(url).subscribe({
            next: (res) => {
                if (res && res.blogs) {
                    const newBlogs = res.blogs.map((b: any) => this.normalizeBlog(b));
                    this.blogs = [...this.blogs, ...newBlogs];
                    this.total = res.total || 0;
                }
                this.loading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Lỗi khi tải bài viết theo chủ đề:', err);
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
    }

    loadMore(): void {
        this.skip += this.limit;
        this.loadBlogs();
    }

    get remainingCount(): number {
        return Math.max(0, this.total - this.blogs.length);
    }

    private normalizeBlog(b: any): BlogItem {
        const mainCat = Array.isArray(b.categories) && b.categories[0] ? b.categories[0].name : null;
        const categoryName = mainCat || b.categoryName || 'Bài viết';
        const rawSlug = b.slug || b._id || '';

        // Strip possible prefixes from the blog slug
        const slug = rawSlug.toString()
            .replace(/^chuyen-de\//i, '')
            .replace(/^bai-viet\//i, '')
            .replace(/^blog\//i, '')
            .replace(/^topic\//i, '')
            .replace(/^\/+/, '');

        return {
            title: b.title || 'Bài viết sức khỏe',
            image: b.primaryImage?.url || b.image || b.imageUrl || 'assets/images/banner/woman_doctor.png',
            excerpt: b.shortDescription || b.excerpt || (typeof b.description === 'string' ? b.description.replace(/<[^>]*>/g, '').slice(0, 160) : ''),
            link: `/blog/${slug}`,
            slug: slug,
            categoryName: categoryName
        };
    }

    private normalizeTopicSlug(slug: string): string {
        if (!slug) return '';
        // Handle encoded slashes and double prefixes aggressively
        let normalized = decodeURIComponent(slug);

        // Remove any occurrences of 'topic/' or 'chuyen-de/' prefix multiple times if necessary
        while (normalized.toLowerCase().includes('topic/') || normalized.toLowerCase().includes('chuyen-de/')) {
            normalized = normalized.replace(/topic\//i, '').replace(/chuyen-de\//i, '');
        }

        return normalized.replace(/^\/+/, '').trim();
    }

    private slugify(text: string): string {
        if (!text) return '';
        return text
            .toString()
            .toLowerCase()
            .normalize('NFD') // Tách các dấu tiếng Việt
            .replace(/[\u0300-\u036f]/g, '') // Loại bỏ các dấu
            .replace(/[đĐ]/g, 'd') // Thay đ thành d
            .replace(/[^a-z0-9\s-]/g, '') // Loại bỏ ký tự đặc biệt
            .trim()
            .replace(/\s+/g, '-') // Thay khoảng trắng bằng dấu gạch ngang
            .replace(/-+/g, '-'); // Loại bỏ các dấu gạch ngang dư thừa
    }

    /** Mở popup xem nhanh bài viết */
    openQuickView(event: MouseEvent, blog: any): void {
        event.preventDefault();
        event.stopPropagation();
        this.blogQuickViewService.open(blog);
    }
}
