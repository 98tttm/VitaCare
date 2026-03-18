import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { LoadingShippingComponent } from '../../../shared/loading-shipping/loading-shipping';

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
    loading = true;
    skip = 0;
    limit = 10;
    total = 0;
    tagSlug: string = '';
    tagName: string = '';
    featuredTopicCategories: { name: string; count: number; slug: string }[] = [];

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
        'tin-tuc-suc-khoe': 'Tin tức sức khỏe'
    };

    constructor(
        private http: HttpClient,
        private route: ActivatedRoute,
        private titleService: Title,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.loadTopicCounts();
        this.route.paramMap.subscribe(params => {
            const rawSlug = params.get('specialtySlug') || '';
            this.tagSlug = this.normalizeTopicSlug(rawSlug);

            // Priority: tagMap (accented) -> formatted normalizeTopicSlug
            this.tagName = this.tagMap[this.tagSlug] || this.formatSlug(this.tagSlug);
            this.titleService.setTitle(`Bài viết ${this.tagName} - VitaCare`);

            this.skip = 0;
            this.blogs = [];
            this.loadBlogs();
            this.fetchTagNameFromApi();
        });
    }

    private formatSlug(slug: string): string {
        if (!slug) return '';
        // Remove prefixes and separate words
        const clean = slug
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
        const url = `http://localhost:3000/api/blogs?limit=${this.limit}&skip=${this.skip}&tagSlug=${this.tagSlug}`;

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
        const slug = b.slug || b._id;
        return {
            title: b.title || 'Bài viết sức khỏe',
            image: b.primaryImage?.url || b.image || b.imageUrl || 'assets/images/banner/woman_doctor.png',
            excerpt: b.shortDescription || b.excerpt || (typeof b.description === 'string' ? b.description.replace(/<[^>]*>/g, '').slice(0, 160) : ''),
            link: `/bai-viet/${slug}`,
            slug: slug,
            categoryName: categoryName
        };
    }

    private normalizeTopicSlug(slug: string): string {
        if (!slug) return '';
        // Handle encoded slashes and double prefixes aggressively
        let normalized = decodeURIComponent(slug);

        // Remove any occurrences of 'chuyen-de/' prefix multiple times if necessary
        while (normalized.toLowerCase().includes('chuyen-de/')) {
            normalized = normalized.replace(/chuyen-de\//i, '');
        }

        return normalized.replace(/^\/+/, '').trim();
    }

    private loadTopicCounts(): void {
        const url = 'http://localhost:3000/api/blogs/topic-counts?limit=100';
        this.http.get<any>(url).subscribe({
            next: (res) => {
                if (res?.success && Array.isArray(res?.counts)) {
                    const counts = res.counts.map((item: any) => ({
                        name: item.name,
                        count: item.count,
                        slug: this.normalizeTopicSlug(item.slug || this.slugify(item.name))
                    })).filter((c: any) => {
                        const lower = c.name.toLowerCase();
                        return !lower.includes('khuyến mãi') && !lower.includes('phân loại') && !lower.includes('truyền thông');
                    });
                    this.featuredTopicCategories = counts.slice(0, 10);

                    // Build slug -> name map for proper Vietnamese display
                    if (this.tagSlug) {
                        const matched = counts.find((c: any) => c.slug === this.tagSlug);
                        if (matched) {
                            this.tagName = matched.name;
                            this.titleService.setTitle(`Bài viết ${this.tagName} - VitaCare`);
                        }
                    }

                    this.cdr.detectChanges();
                }
            },
            error: (err) => {
                console.error('Lỗi khi lấy số lượng bài viết theo chuyên đề:', err);
            }
        });
    }

    private fetchTagNameFromApi(): void {
        if (!this.tagSlug) return;
        // Try to get tag name with proper diacritics from a small blog API call
        const url = `http://localhost:3000/api/blogs?limit=1&tagSlug=${this.tagSlug}`;
        this.http.get<any>(url).subscribe({
            next: (res) => {
                if (res?.blogs?.length) {
                    const blog = res.blogs[0];
                    const tags: any[] = blog.tags || [];
                    const matchedTag = tags.find((t: any) => {
                        const tSlug = this.normalizeTopicSlug(t.slug || this.slugify(t.name || t.title || ''));
                        return tSlug === this.tagSlug;
                    });
                    if (matchedTag) {
                        const name = matchedTag.title || matchedTag.name;
                        if (name) {
                            this.tagName = name;
                            this.titleService.setTitle(`Bài viết ${this.tagName} - VitaCare`);
                            this.cdr.detectChanges();
                        }
                    }
                }
            },
            error: () => { } // Silently fail - tagName will stay from tagMap or formatSlug
        });
    }

    private slugify(text: string): string {
        if (!text) return '';
        return text
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
    }
}
