import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class CustomerService {
    private apiUrl = '/api/admin/users';

    constructor(private http: HttpClient) { }

    getCustomers(): Observable<any> {
        return this.http.get<any>(this.apiUrl);
    }

    getCustomerById(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}`);
    }

    getCustomerProfile(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}/profile`);
    }

    getCustomerOrders(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}/orders`);
    }

    getCustomerAddresses(userId: string): Observable<any> {
        return this.http.get<any>(`/api/addresses?user_id=${encodeURIComponent(userId)}`);
    }

    updateCustomer(id: string, customer: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/${id}`, customer);
    }

    deleteCustomer(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/${id}`);
    }

    /** Mã khách hàng dự kiến (CUS######) — GET /api/admin/customers/next-user-id */
    previewNextCustomerId(): Observable<any> {
        return this.http.get<any>('/api/admin/customers/next-user-id');
    }

    /** Tạo khách mới (admin) — POST /api/admin/customers */
    createCustomer(body: Record<string, unknown>): Observable<any> {
        return this.http.post<any>('/api/admin/customers', body);
    }

    /** Địa chỉ giao hàng — cùng API sổ địa chỉ user */
    createAddress(body: Record<string, unknown>): Observable<any> {
        return this.http.post<any>('/api/addresses', body);
    }

    // Groups
    getGroups(): Observable<any> {
        return this.http.get<any>('/api/admin/customer_groups');
    }

    createGroup(group: any): Observable<any> {
        return this.http.post<any>('/api/admin/customer_groups', group);
    }

    deleteGroup(id: string): Observable<any> {
        return this.http.delete<any>(`/api/admin/customer_groups/${id}`);
    }
}
