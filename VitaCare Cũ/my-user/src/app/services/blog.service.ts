import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class BlogService {
    private apiUrl = 'http://localhost:3000/api';

    constructor(private http: HttpClient) { }

    getBlogs(filters: any): Observable<any> {
        let params = new HttpParams();

        if (filters.keyword) params = params.set('keyword', filters.keyword);
        if (filters.page) params = params.set('page', filters.page.toString());
        if (filters.limit) params = params.set('limit', filters.limit.toString());
        if (filters.skip !== undefined) params = params.set('skip', filters.skip.toString());

        return this.http.get(`${this.apiUrl}/blogs`, { params });
    }
}
