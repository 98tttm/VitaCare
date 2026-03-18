import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { LoadingShippingComponent } from '../../../shared/loading-shipping/loading-shipping';

@Component({
    selector: 'app-topic',
    standalone: true,
    imports: [CommonModule, RouterLink, LoadingShippingComponent],
    templateUrl: './topic.html',
    styleUrl: './topic.css'
})
export class Topic implements OnInit {
    allTopics: { name: string; count: number; slug: string }[] = [];
    featuredTopicCategories: { name: string; count: number; slug: string }[] = [];
    loading = true;
    skip = 0;
    limit = 12;
    totalTopics = 0;

    constructor(private http: HttpClient, private cdr: ChangeDetectorRef) { }

    ngOnInit(): void {
        this.loadTopicCounts();
    }

    private loadTopicCounts(): void {
        const url = `http://localhost:3000/api/blogs/topic-counts?skip=${this.skip}&limit=${this.limit}`;
        this.http.get<any>(url).subscribe({
            next: (res) => {
                if (res?.success && Array.isArray(res?.counts)) {
                    const newTopics = res.counts.map((item: any) => ({
                        name: item.name,
                        count: item.count,
                        slug: this.normalizeTopicSlug(item.slug || this.slugify(item.name))
                    }));

                    this.allTopics = [...this.allTopics, ...newTopics];
                    this.totalTopics = res.total || 0;
                    this.featuredTopicCategories = this.allTopics;

                    this.loading = false;
                    this.cdr.detectChanges();
                }
            },
            error: (err) => {
                console.error('Lỗi khi lấy số lượng bài viết theo tag:', err);
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
    }

    loadMore(): void {
        this.skip += this.limit;
        this.loadTopicCounts();
    }

    get remainingCount(): number {
        return Math.max(0, this.totalTopics - this.allTopics.length);
    }

    private normalizeTopicSlug(slug: string): string {
        if (!slug) return '';
        return slug.replace(/^chuyen-de\//i, '').replace(/^\/+/, '');
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
}
