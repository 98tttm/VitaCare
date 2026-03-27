import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class CategoryService {

    private apiUrl = '/api/categories';

    constructor(private http: HttpClient) { }

    getCategories(): Observable<any> {
        return this.http.get(this.apiUrl);
    }

    getCategoriesLevel1(): Observable<any> {
        return this.http.get(`${this.apiUrl}?level=1`);
    }
}
