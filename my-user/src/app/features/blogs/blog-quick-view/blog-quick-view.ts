import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BlogQuickViewService } from '../../../core/services/blog-quick-view.service';

@Component({
    selector: 'app-blog-quick-view',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './blog-quick-view.html',
    styleUrl: './blog-quick-view.css',
})
export class BlogQuickView {
    readonly blogQuickViewService = inject(BlogQuickViewService);
    private readonly router = inject(Router);

    close(): void {
        this.blogQuickViewService.close();
    }

    navigateToDetail(event: MouseEvent, blog: any): void {
        event.preventDefault();
        const link = this.getBlogLink(blog);
        this.close();
        this.router.navigateByUrl(link);
    }

    onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('bv-modal-overlay')) {
            this.close();
        }
    }

    private normalizeSlug(raw: string): string {
        if (!raw || typeof raw !== 'string') return '';
        let s = raw.trim().replace(/^\/+/, '');
        if (s.toLowerCase().startsWith('blog/')) s = s.slice(5);
        else if (s.toLowerCase().startsWith('bai-viet/')) s = s.slice(9);
        else if (s.toLowerCase().startsWith('chuyen-de/')) s = s.slice(10);
        return s;
    }

    getBlogLink(blog: any): string {
        if (!blog) return '/blog';
        const fromLink = blog.link ? blog.link.replace(/^\/?(blog|bai-viet|topic|chuyen-de)\/?/i, '').trim() : '';
        const fromSlug = blog.slug ? this.normalizeSlug(blog.slug) : '';
        const slug = this.normalizeSlug(fromLink) || fromSlug;
        return slug ? `/blog/${slug}` : '/blog';
    }
}
