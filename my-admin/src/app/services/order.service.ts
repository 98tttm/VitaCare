import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class OrderService {
    private apiUrl = '/api/admin/orders';

    constructor(private http: HttpClient) { }

    getOrders(): Observable<any> {
        // Always fetch fresh data to avoid conflicts/stale state
        return this.http.get<any>(this.apiUrl);
    }

    getOrderById(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}`);
    }

    getLocations(): Observable<any> {
        return this.http.get<any>('/api/tree_complete');
    }

    /** Danh sách cửa hàng (hệ thống) — dùng chọn điểm nhận khi dược sĩ tạo đơn */
    getStoresList(limit: number = 500): Observable<any> {
        return this.http.get<any>(`/api/stores?page=1&limit=${limit}`);
    }

    /** Cây Tỉnh → Quận → Phường (giống my-user StoreService) */
    getStoreLocationsTree(): Observable<any> {
        return this.http.get<any>('/api/store-locations/tree');
    }

    /** Lọc cửa hàng theo địa bàn + từ khóa (giống my-user) */
    getStoresFiltered(filter: {
        keyword?: string;
        tinh_thanh?: string;
        quan_huyen?: string;
        phuong_xa?: string;
        page?: number;
        limit?: number;
    }): Observable<any> {
        let params = new HttpParams();
        if (filter.keyword) params = params.set('keyword', filter.keyword);
        if (filter.tinh_thanh) params = params.set('tinh_thanh', filter.tinh_thanh);
        if (filter.quan_huyen) params = params.set('quan_huyen', filter.quan_huyen);
        if (filter.phuong_xa) params = params.set('phuong_xa', filter.phuong_xa);
        if (filter.page) params = params.set('page', filter.page.toString());
        if (filter.limit) params = params.set('limit', filter.limit.toString());
        return this.http.get<any>('/api/stores', { params });
    }

    /**
     * Tạo đơn — backend chỉ expose POST /api/orders (không có POST /api/admin/orders).
     */
    createOrder(order: any): Observable<any> {
        return this.http.post<any>('/api/orders', order);
    }

    updateOrder(id: string, orderData: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/${id}`, orderData);
    }

    deleteOrder(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/${id}`);
    }
}
