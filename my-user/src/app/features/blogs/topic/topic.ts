import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-topic',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './topic.html',
    styleUrl: './topic.css'
})
export class Topic implements OnInit {
    featuredTopicCategories: { name: string; count: number; slug: string }[] = [];
    loading = true;

    blogCategoryItems = [
        { name: 'Phòng bệnh & Sống khoẻ', slug: 'phong-benh-song-khoe' },
        { name: 'Dinh dưỡng', slug: 'dinh-duong' },
        { name: 'Mẹ & bé', slug: 'me-va-be' },
        { name: 'Khỏe đẹp', slug: 'khoe-dep' },
        { name: 'Giới tính', slug: 'gioi-tinh' },
        { name: 'Tin tức sức khỏe', slug: 'tin-tuc-suc-khoe' },
        { name: 'Người cao tuổi', slug: 'nguoi-cao-tuoi' },
    ];

    constructor(private http: HttpClient, private cdr: ChangeDetectorRef) { }

    ngOnInit(): void {
        this.loadCategoryCounts();
    }

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
                            slug: cat.slug
                        }))
                        .filter(c => {
                            const lower = c.name.toLowerCase();
                            return !lower.includes('khuyến mãi') && !lower.includes('phân loại') && !lower.includes('truyền thông');
                        })
                        .sort((a, b) => b.count - a.count);

                    this.loading = false;
                    this.cdr.detectChanges();
                }
            },
            error: (err) => {
                console.error('Lỗi khi lấy số lượng bài viết theo danh mục:', err);
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
    }
}
