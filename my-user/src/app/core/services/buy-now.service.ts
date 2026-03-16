import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CartItem } from './cart.service';

export interface BuyNowItem {
    _id: string;
    sku: string;
    productName: string;
    quantity: number;
    price: number;
    discount: number;
    image: string;
    unit: string;
    category?: string;
    slug?: string;
    [key: string]: any;
}

export interface BuyNowSummary {
    subtotal: number;
    directDiscount: number;
    voucherDiscount: number;
}

const SESSION_KEY = 'vitacare_buy_now';
const SESSION_SUMMARY_KEY = 'vitacare_buy_now_summary';

@Injectable({ providedIn: 'root' })
export class BuyNowService {
    private router = inject(Router);

    private items: BuyNowItem[] = [];
    private summary: BuyNowSummary | null = null;

    /**
     * Lưu sản phẩm "Mua ngay" rồi chuyển qua trang đặt hàng.
     * Cho phép cả user đã đăng nhập và khách vãng lai.
     */
    buyNow(product: any, quantity: number = 1): void {
        const item: BuyNowItem = {
            _id: product._id?.$oid || product._id || product.id || '',
            sku: product.sku || '',
            productName: product.name || product.productName || '',
            quantity: Math.max(1, quantity),
            price: Number(product.price) || 0,
            discount: Number(product.discount) || 0,
            image: product.image || '',
            unit: product.unit || 'Hộp',
            category: product.category || '',
            slug: product.slug || '',
        };

        this.items = [item];
        // Tính toán tạm subtotal/giảm giá cho luồng Mua ngay
        const subtotal = (item.price + item.discount) * item.quantity;
        const directDiscount = item.discount * item.quantity;
        const voucherDiscount = 0;
        this.summary = { subtotal, directDiscount, voucherDiscount };
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.items));
            sessionStorage.setItem(SESSION_SUMMARY_KEY, JSON.stringify(this.summary));
        } catch { /* quota exceeded — ignore */ }

        this.router.navigate(['/order']);
    }

    /**
     * Dùng lại cơ chế "Mua ngay" để truyền danh sách
     * sản phẩm đã chọn từ giỏ hàng sang trang đặt hàng.
     * Cho phép cả user đã đăng nhập và khách vãng lai.
     */
    setItemsFromCart(items: CartItem[], summary?: BuyNowSummary): void {
        const mapped: BuyNowItem[] = (items || []).map((p) => ({
            _id: p._id,
            sku: p.sku || '',
            productName: p.productName || '',
            quantity: Math.max(1, p.quantity || 1),
            price: Number(p.price) || 0,
            discount: Number(p.discount) || 0,
            image: p.image || '',
            unit: p.unit || 'Hộp',
            category: (p as any).category || '',
            slug: (p as any).slug || '',
        }));

        this.items = mapped;
        if (summary) {
            this.summary = summary;
        } else {
            const subtotal = mapped.reduce(
                (s, i) => s + (i.price + i.discount) * i.quantity,
                0,
            );
            const directDiscount = mapped.reduce(
                (s, i) => s + i.discount * i.quantity,
                0,
            );
            this.summary = { subtotal, directDiscount, voucherDiscount: 0 };
        }
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.items));
            sessionStorage.setItem(SESSION_SUMMARY_KEY, JSON.stringify(this.summary));
        } catch { /* ignore quota errors */ }
    }

    getItems(): BuyNowItem[] {
        if (this.items.length > 0) return this.items;
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (raw) {
                this.items = JSON.parse(raw);
            }
        } catch { /* ignore */ }
        return this.items ?? [];
    }

    getSummary(): BuyNowSummary | null {
        if (this.summary) return this.summary;
        try {
            const raw = sessionStorage.getItem(SESSION_SUMMARY_KEY);
            if (raw) {
                this.summary = JSON.parse(raw) as BuyNowSummary;
                return this.summary;
            }
        } catch { /* ignore */ }
        return null;
    }

    clear(): void {
        this.items = [];
        this.summary = null;
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_SUMMARY_KEY);
    }

    hasItems(): boolean {
        return this.getItems().length > 0;
    }
}
