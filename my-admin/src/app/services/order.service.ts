import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class OrderService {
    private apiUrl = 'http://localhost:3000/api/admin/orders';

    constructor(private http: HttpClient) { }

    getOrders(): Observable<any> {
        // Always fetch fresh data to avoid conflicts/stale state
        return this.http.get<any>(this.apiUrl);
    }

    getOrderById(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}`);
    }

    getLocations(): Observable<any> {
        return this.http.get<any>('http://localhost:3000/api/tree_complete');
    }

    createOrder(order: any): Observable<any> {
        return this.http.post<any>(this.apiUrl, order);
    }

    updateOrder(id: string, orderData: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/${id}`, orderData);
    }

    deleteOrder(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/${id}`);
    }
}
