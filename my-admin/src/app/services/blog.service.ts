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
    private apiUrl = 'http://localhost:3000/api/admin';

    constructor(private http: HttpClient) { }

    getBlogs(page: number = 1, limit: number = 20): Observable<BlogResponse> {
        return this.http.get<BlogResponse>(`${this.apiUrl}/blogs?page=${page}&limit=${limit}`);
    }

    createBlog(data: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/blogs`, data);
    }

    updateBlog(id: string, data: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/blogs/${id}`, data);
    }

    deleteBlog(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/blogs/${id}`);
    }

    getCategories(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/categories`);
    }
}
