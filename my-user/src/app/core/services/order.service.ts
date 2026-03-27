import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface OrderProduct {
    sku: string;
    productName: string;
    quantity: number;
    price: number;
    unit: string;
    image: string;
    hasPromotion: boolean;
    originalPrice?: number; // Optional if not in backend data
}

export interface Order {
    _id: string; // MongoDB ID
    order_id: string; // Readable ID like ORD0001
    user_id: string;
    status: string;
    statusPayment: string;
    totalAmount: number;
    subtotal?: number;
    directDiscount?: number;
    voucherDiscount?: number;
    shippingFee?: number;
    item: OrderProduct[]; // Backend uses 'item', frontend interface might need adjustment
    route?: {
        pending?: string;
        confirmed?: string;
        shipping?: string;
        delivered?: string;
        cancelled?: string; // Add cancelled date if exists
    };
    shippingInfo?: {
        fullName: string;
        phone: string;
        address: {
            city: string;
            district: string;
            ward: string;
            detail: string;
        }
    };
    // Add other fields as necessary from orders.json
}

@Injectable({
    providedIn: 'root'
})
export class OrderService {
    private apiUrl = '/api/orders';

    constructor(private http: HttpClient) { }

    getOrders(userId: string): Observable<{ success: boolean; items: Order[] }> {
        return this.http.get<{ success: boolean; items: Order[] }>(`${this.apiUrl}?user_id=${userId}`);
    }

    getCustomerID(): string {
        // Lấy customer ID / user_id từ localStorage.
        // Phiên bản mới của AuthService lưu user tại key 'vitacare_user'.
        try {
            const raw = localStorage.getItem('vitacare_user') || localStorage.getItem('userAuth');
            if (!raw) return 'guest';
            const auth = JSON.parse(raw);
            return (
                auth.user_id ||
                auth.UserID ||
                auth.CustomerID ||
                auth.customerId ||
                auth.userId ||
                'guest'
            );
        } catch {
            return 'guest';
        }
    }

    getOrdersByCustomer(customerID: string): Observable<{ success: boolean; data: any[] }> {
        // Backend hiện tại lọc theo user_id và trả về { success, items }.
        // Ở phiên bản Mongo này, customerID chính là user_id.
        return this.http
            .get<{ success: boolean; items: any[] }>(`${this.apiUrl}?user_id=${customerID}`)
            .pipe(
                map((res) => ({
                    success: res.success,
                    data: Array.isArray(res.items) ? res.items : [],
                }))
            );
    }

    cancelOrder(orderId: string, reason?: string): Observable<{ success: boolean; message: string }> {
        return this.http.put<{ success: boolean; message: string }>(`${this.apiUrl}/${orderId}/cancel`, {
            reason: reason || '',
        });
    }

    confirmReceived(orderId: string): Observable<{ success: boolean; message: string }> {
        return this.http.put<{ success: boolean; message: string }>(`${this.apiUrl}/${orderId}/confirm-received`, {});
    }

    confirmReturned(orderId: string): Observable<{ success: boolean; message: string }> {
        return this.http.put<{ success: boolean; message: string }>(`${this.apiUrl}/${orderId}/confirm-returned`, {});
    }

    /** Gửi yêu cầu trả hàng/hoàn tiền - backend chuyển status sang processing_return */
    requestReturn(orderId: string, reason?: string, detailedDescription?: string): Observable<{ success: boolean; message: string }> {
        return this.http.put<{ success: boolean; message: string }>(`${this.apiUrl}/${orderId}/request-return`, {
            reason: reason || '',
            detailedDescription: detailedDescription || '',
        });
    }

    cancelReturnRequest(orderId: string): Observable<{ success: boolean; message: string }> {
        return this.http.put<{ success: boolean; message: string }>(`${this.apiUrl}/${orderId}/cancel-return`, {});
    }
}

