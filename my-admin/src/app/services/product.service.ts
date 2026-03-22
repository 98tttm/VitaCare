import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ProductService {
    private apiUrl = 'http://localhost:3000/api/admin/products';

    constructor(private http: HttpClient) { }

    getProducts(page: number = 1, limit: number = 20, filters: any = {}): Observable<any> {
        let url = `${this.apiUrl}?page=${page}&limit=${limit}`;
        if (filters.search) url += `&search=${encodeURIComponent(filters.search)}`;
        if (filters.categoryIds) url += `&categoryIds=${encodeURIComponent(filters.categoryIds)}`;
        else if (filters.categoryId) url += `&categoryId=${encodeURIComponent(filters.categoryId)}`;
        if (filters.minPrice) url += `&minPrice=${filters.minPrice}`;
        if (filters.maxPrice) url += `&maxPrice=${filters.maxPrice}`;
        if (filters.units && filters.units.length > 0) url += `&units=${filters.units.join(',')}`;
        if (filters.stockStatus && filters.stockStatus.length > 0) url += `&stockStatus=${filters.stockStatus.join(',')}`;
        if (filters.expiryStatus && filters.expiryStatus.length > 0) url += `&expiryStatus=${filters.expiryStatus.join(',')}`;
        if (filters.needConsultation) url += `&needConsultation=1`;
        if (filters.sortColumn) url += `&sortColumn=${filters.sortColumn}`;
        if (filters.sortDirection) url += `&sortDirection=${filters.sortDirection}`;
        return this.http.get<any>(url);
    }

    getAllProducts(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}?page=1&limit=10000`);
    }

    getCategories(): Observable<any> {
        return this.http.get<any>('http://localhost:3000/api/categories');
    }

    getProductById(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}`);
    }

    /** Xuất xứ distinct từ DB (country + origin trên collection products) */
    getProductCountries(): Observable<any> {
        return this.http.get<any>('http://localhost:3000/api/admin/product-countries');
    }

    createProduct(product: any): Observable<any> {
        return this.http.post<any>(this.apiUrl, product);
    }

    updateProduct(id: string, productData: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/${id}`, productData);
    }

    /** Gán categoryId hàng loạt (popup phân loại nhóm sản phẩm). */
    bulkUpdateProductCategory(productIds: string[], categoryId: string): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/bulk-category`, { productIds, categoryId });
    }

    /** Gán nhiều sản phẩm vào một product_group (phục vụ KM theo nhóm). */
    bulkAssignProductGroup(productIds: string[], groupId: string): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/bulk-group`, { productIds, groupId });
    }

    deleteProduct(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/${id}`);
    }
    // Groups
    getGroups(): Observable<any> {
        return this.http.get<any>('http://localhost:3000/api/admin/product_groups');
    }

    createGroup(group: any): Observable<any> {
        return this.http.post<any>('http://localhost:3000/api/admin/product_groups', group);
    }

    deleteGroup(id: string): Observable<any> {
        return this.http.delete<any>(`http://localhost:3000/api/admin/product_groups/${id}`);
    }
}
