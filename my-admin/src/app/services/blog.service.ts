import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BlogResponse {
    success: boolean;
    data: any[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

@Injectable({
    providedIn: 'root'
})
export class BlogService {
    private apiUrl = '/api/admin';

    constructor(private http: HttpClient) { }

    getBlogs(page: number = 1, limit: number = 20): Observable<BlogResponse> {
        return this.http.get<BlogResponse>(`${this.apiUrl}/blogs?page=${page}&limit=${limit}`);
    }

    getBlogById(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/blogs/${encodeURIComponent(id)}?includeContent=true`);
    }

    createBlog(data: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/blogs`, data);
    }

    updateBlog(id: string, data: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/blogs/${encodeURIComponent(id)}`, data);
    }

    deleteBlog(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/blogs/${encodeURIComponent(id)}`);
    }

    getCategories(): Observable<any> {
        // Categories của blog (không phải categories sản phẩm)
        return this.http.get<any>(`${this.apiUrl}/blog-categories`);
    }

    uploadBlogImage(file: File): Observable<any> {
        const form = new FormData();
        form.append('file', file);
        return this.http.post<any>(`${this.apiUrl}/blogs/upload-image`, form);
    }
}
