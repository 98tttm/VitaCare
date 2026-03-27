import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { LoadingShippingComponent } from '../../../shared/loading-shipping/loading-shipping';

export interface BlogItem {
    title: string;
    image?: string;
    excerpt?: string;
    link?: string;
    slug?: string;
    categoryName?: string;
}

@Component({
    selector: 'app-blog-sub-category',
    standalone: true,
    imports: [CommonModule, RouterLink, LoadingShippingComponent],
    templateUrl: './blog-sub-category.html',
    styleUrl: './blog-sub-category.css',
})
export class BlogSubCategory implements OnInit {
    blogs: BlogItem[] = [];
    displayedBlogs: BlogItem[] = [];
    loading = true;

    pageSize = 8;
    initialSize = 12;
    loadCount = 0;
    totalCount = 0;

    categorySlug: string = '';
    subcategorySlug: string = '';
    categoryName: string = '';
    subcategoryName: string = '';

    get remainingCount(): number {
        return Math.max(0, this.totalCount - this.displayedBlogs.length);
    }

    blogCategoryItems = [
        {
            name: 'Phòng bệnh & Sống khoẻ',
            slug: 'phong-benh-song-khoe',
            keywords: ['phòng ngừa bệnh', 'phòng bệnh', 'phòng ngừa', 'sống khoẻ', 'sống khỏe', 'kiến thức y khoa', 'y học cổ truyền', 'sức khỏe gia đình', 'tiêm chủng', 'tâm lý', 'xét nghiệm'],
            subcategories: [
                { name: 'Y học cổ truyền', slug: 'y-hoc-co-truyen' },
                { name: 'Kiến thức y khoa', slug: 'kien-thuc-y-khoa' },
                { name: 'Sức khỏe gia đình', slug: 'suc-khoe-gia-dinh' },
                { name: 'Tiêm chủng', slug: 'tiem-chung' },
                { name: 'Tâm lý - Tâm thần', slug: 'tam-ly-tam-than' },
                { name: 'Xét Nghiệm', slug: 'xet-nghiem' }
            ]
        },
        {
            name: 'Dinh dưỡng',
            slug: 'dinh-duong',
            keywords: ['chế độ dinh dưỡng', 'dinh dưỡng', 'ăn ngon', 'thực phẩm', 'ăn kiêng'],
            subcategories: [
                { name: 'Ăn ngon khỏe', slug: 'an-ngon-khoe' },
                { name: 'Thực phẩm dinh dưỡng', slug: 'thuc-pham-dinh-duong' },
                { name: 'Chế độ ăn kiêng', slug: 'che-do-an-kieng' }
            ]
        },
        {
            name: 'Mẹ & bé',
            slug: 'me-va-be',
            keywords: ['chăm sóc mẹ và bé', 'mẹ và bé', 'mẹ & bé', 'mang thai', 'sinh con', 'trẻ'],
            subcategories: [
                { name: 'Kế hoạch mang thai', slug: 'ke-hoach-mang-thai' },
                { name: 'Mang thai', slug: 'mang-thai' },
                { name: 'Sinh con', slug: 'sinh-con' },
                { name: 'Chăm sóc bé', slug: 'cham-soc-be' }
            ]
        },
        {
            name: 'Khỏe đẹp',
            slug: 'khoe-dep',
            keywords: ['sức khỏe làm đẹp', 'khỏe đẹp', 'làm đẹp', 'tóc', 'da', 'mỹ phẩm'],
            subcategories: [
                { name: 'Chăm sóc tóc', slug: 'cham-soc-toc' },
                { name: 'Dưỡng da', slug: 'duong-da' },
                { name: 'Chăm sóc cơ thể', slug: 'cham-soc-co-the' },
                { name: 'Mỹ phẩm', slug: 'my-pham' }
            ]
        },
        {
            name: 'Giới tính',
            slug: 'gioi-tinh',
            keywords: ['giới tính', 'gioi tinh', 'sinh sản', 'tình dục'],
            subcategories: [
                { name: 'Sức khỏe sinh sản', slug: 'suc-khoe-sinh-san' },
                { name: 'Đời sống tình dục', slug: 'doi-song-tinh-duc' }
            ]
        },
        {
            name: 'Tin tức sức khỏe',
            slug: 'tin-tuc-suc-khoe',
            keywords: ['tin tức sức khoẻ', 'tin tức sức khỏe', 'tin y học', 'tin y dược', 'dịch bệnh', 'bệnh viện'],
            subcategories: [
                { name: 'Tin y dược', slug: 'tin-y-duoc' },
                { name: 'Dịch bệnh', slug: 'dich-benh' },
                { name: 'Bệnh viện', slug: 'benh-vien' }
            ]
        }
    ];

    constructor(
        private http: HttpClient,
        private route: ActivatedRoute,
        private titleService: Title,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            this.categorySlug = params.get('categorySlug') || '';
            this.subcategorySlug = params.get('subcategorySlug') || '';
            this.resolveInfo();
            this.loadBlogs();
        });
    }

    resolveInfo(): void {
        const cat = this.blogCategoryItems.find(c => c.slug === this.categorySlug);
        if (cat) {
            this.categoryName = cat.name;
            const sub = cat.subcategories.find(s => s.slug === this.subcategorySlug);
            if (sub) {
                this.subcategoryName = sub.name;
                this.titleService.setTitle(`${this.subcategoryName} - ${this.categoryName} - Góc sức khoẻ`);
            }
        }
    }

    loadBlogs(): void {
        this.loading = true;
        this.loadCount = 0;
        const limit = this.initialSize;
        const skip = 0;

        const url = `/api/blogs?limit=${limit}&skip=${skip}&category=${encodeURIComponent(this.categoryName)}&subcategory=${encodeURIComponent(this.subcategoryName)}`;

        this.http.get<any>(url).subscribe({
            next: (res) => {
                const data = this.extractBlogList(res);
                this.blogs = data.map(b => this.normalizeBlog(b));
                this.totalCount = res.total || this.blogs.length;
                this.updateDisplayedBlogs();
                this.loading = false;
                this.cdr.detectChanges();
            },
            error: () => {
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
    }

    loadMore(): void {
        this.loadCount++;
        const skip = this.initialSize + ((this.loadCount - 1) * this.pageSize);
        const limit = this.pageSize;

        const url = `/api/blogs?limit=${limit}&skip=${skip}&category=${encodeURIComponent(this.categoryName)}&subcategory=${encodeURIComponent(this.subcategoryName)}`;

        this.http.get<any>(url).subscribe({
            next: (res) => {
                const data = this.extractBlogList(res);
                if (Array.isArray(data) && data.length > 0) {
                    const newBlogs = data.map(b => this.normalizeBlog(b));
                    this.blogs = [...this.blogs, ...newBlogs];
                    this.updateDisplayedBlogs();
                    this.cdr.detectChanges();
                }
            }
        });
    }

    private extractBlogList(response: any): any[] {
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.blogs)) return response.blogs;
        return [];
    }

    private updateDisplayedBlogs(): void {
        this.displayedBlogs = [...this.blogs];
    }

    private normalizeSlug(raw: string): string {
        if (!raw || typeof raw !== 'string') return '';
        let s = raw.trim().replace(/^\/+/, '');
        if (s.toLowerCase().startsWith('blog/')) s = s.slice(5);
        else if (s.toLowerCase().startsWith('bai-viet/')) s = s.slice(9);
        return s;
    }

    private normalizeBlog(b: any): BlogItem {
        const slugRaw = (b.slug || (b as any).slug)?.trim();
        const idStr = b._id != null ? String(b._id) : '';
        const slug = this.normalizeSlug(slugRaw || '') || idStr;
        const link = slug ? `/blog/${slug}` : '/blog';

        return {
            title: b.title || b.name || 'Bài viết sức khỏe',
            image: b.primaryImage?.url || b.image || b.imageUrl || 'assets/placeholder/blog-thumb.jpg',
            excerpt: b.shortDescription || b.excerpt || '',
            link,
            slug: slug || undefined,
            categoryName: this.subcategoryName
        };
    }
}
