import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, concat, BehaviorSubject, Subject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth.service';

export interface CartItem {
    _id: string;
    sku: string;
    productName: string;
    quantity: number;
    discount: number;
    price: number;
    stock: number;
    hasPromotion: boolean;
    image: string;
    unit: string;
    category: string;
    addedAt: string;
    updatedAt: string;
    [key: string]: any;
}

export interface Cart {
    _id?: string;
    user_id: string;
    items: CartItem[];
    itemCount: number;
    totalQuantity: number;
    totalPrice?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface CartResponse {
    success: boolean;
    cart?: Cart;
    message?: string;
}

const CART_CACHE_MS = 60_000;
export const GUEST_CART_KEY = 'guest_cart_items';

@Injectable({
    providedIn: 'root'
})
export class CartService {
    private apiUrl = '/api/carts';
    private cache: { userId: string; res: CartResponse; at: number } | null = null;
    private authService = inject(AuthService);

    private _cartCount$ = new BehaviorSubject<number>(this.getInitialCartCount());
    readonly cartCount$ = this._cartCount$.asObservable();

    /** Phát ra sau mỗi lần thêm item thành công (để header có thể re-fetch cart data) */
    private _cartUpdated$ = new Subject<Cart | null>();
    readonly cartUpdated$ = this._cartUpdated$.asObservable();

    private apiBase = '';

    /**
     * Cart khách vãng lai lưu theo phiên.
     * - Dùng `sessionStorage`.
     * - Nếu còn dữ liệu cũ ở `localStorage`, migrate vào sessionStorage 1 lần khi đọc.
     */
    private readGuestCartRaw(): string | null {
        try {
            const sessionRaw = sessionStorage.getItem(GUEST_CART_KEY);
            if (sessionRaw !== null) return sessionRaw;

            const legacyLocalRaw = localStorage.getItem(GUEST_CART_KEY);
            if (legacyLocalRaw) {
                sessionStorage.setItem(GUEST_CART_KEY, legacyLocalRaw);
                localStorage.removeItem(GUEST_CART_KEY);
                return legacyLocalRaw;
            }
        } catch {
            // ignore
        }
        return null;
    }

    private writeGuestCartRaw(raw: string): void {
        try {
            sessionStorage.setItem(GUEST_CART_KEY, raw);
        } catch {
            // ignore
        }
    }

    constructor(private http: HttpClient) { }

    private normalizeMediaUrl(src?: string | null): string {
        if (!src) return 'assets/placeholder/product.png';
        if (typeof src !== 'string') return src as any;
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('assets/')) {
            return src;
        }
        if (src.startsWith('/')) {
            return `${this.apiBase}${src}`;
        }
        return `${this.apiBase}/${src}`;
    }

    get cartCountValue(): number {
        return this._cartCount$.value;
    }

    setCartCount(count: number): void {
        this._cartCount$.next(count);
    }

    getCart(userId: string): Observable<CartResponse> {
        const cached = this.cache && this.cache.userId === userId && (Date.now() - this.cache.at) < CART_CACHE_MS
            ? this.cache.res
            : null;
        const fetch$ = this.http.get<CartResponse>(`${this.apiUrl}?user_id=${userId}`).pipe(
            tap(res => {
                this.cache = { userId, res, at: Date.now() };
                if (res.success && res.cart) {
                    if (res.cart.items) {
                        res.cart.items = res.cart.items.map(it => ({
                            ...it,
                            image: this.normalizeMediaUrl(it.image)
                        }));
                    }
                    const totalQty = (res.cart.items || []).length;
                    this._cartCount$.next(totalQty);
                }
            })
        );
        if (cached) {
            return concat(of(cached), fetch$);
        }
        return fetch$;
    }

    updateCart(userId: string, items: CartItem[]): Observable<CartResponse> {
        return this.http.patch<CartResponse>(this.apiUrl, { user_id: userId, items }).pipe(
            tap(res => {
                if (res.success && res.cart) {
                    if (res.cart.items) {
                        res.cart.items = res.cart.items.map(it => ({
                            ...it,
                            image: this.normalizeMediaUrl(it.image)
                        }));
                    }
                    this.cache = { userId, res, at: Date.now() };
                    const totalQty = (res.cart.items || []).length;
                    this._cartCount$.next(totalQty);
                    this._cartUpdated$.next(res.cart);
                }
            })
        );
    }

    /**
     * Thêm item vào giỏ.
     * - Nếu user đã đăng nhập → gọi POST /api/carts/add-item (lưu MongoDB)
     * - Nếu chưa đăng nhập → lưu localStorage (guest cart)
     */
    addItem(item: any, quantity: number = 1): void {
        if (!item) return;

        const user = this.authService.currentUser();
        if (user && user.user_id) {
            this.addItemToServer(user.user_id, item, quantity);
        } else {
            this.addItemToLocal(item, quantity);
        }
    }

    /**
     * Thiết lập lại số lượng cho các sản phẩm trong luồng "Mua lại".
     * - Các sản phẩm được truyền vào sẽ có quantity đúng bằng trong đơn hàng gốc.
     * - Nếu sản phẩm đã có trong giỏ, quantity sẽ được GHI ĐÈ bằng quantity mới (không cộng dồn).
     * - Các sản phẩm khác trong giỏ vẫn được giữ nguyên.
     */
    setItemsForRepurchase(items: Array<Partial<CartItem> & { quantity: number }>): void {
        if (!items?.length) return;

        const user = this.authService.currentUser();
        const buildKey = (x: any) => String(x._id || x.id || x.sku || x.slug || '');

        // Chuẩn hoá danh sách sản phẩm repurchase
        const repurchaseIds = new Set<string>();
        const repurchaseItems: CartItem[] = items
            .map((p) => {
                const id = buildKey(p);
                if (!id) return null;
                repurchaseIds.add(id);
                const now = new Date().toISOString();
                return {
                    _id: id,
                    sku: p.sku || '',
                    productName: p.productName || (p as any).name || '',
                    quantity: Math.max(1, Number(p.quantity) || 1),
                    price: Number(p.price) || 0,
                    discount: Number(p.discount) || 0,
                    image: p.image || '',
                    unit: p.unit || 'Hộp',
                    category: (p as any).category || '',
                    addedAt: (p as any).addedAt || now,
                    updatedAt: now,
                    stock: Number(p.stock) || 0,
                    hasPromotion: Boolean((p as any).hasPromotion),
                } as CartItem;
            })
            .filter((x): x is CartItem => !!x);

        if (user && user.user_id) {
            // User đã đăng nhập: lấy giỏ hiện tại từ server rồi patch lại quantity
            this.getCart(user.user_id).subscribe((res) => {
                const currentItems = res.cart?.items ?? [];
                const kept = currentItems.filter(
                    (it) => !repurchaseIds.has(buildKey(it as any)),
                );
                const merged = [...repurchaseItems, ...kept];
                this.updateCart(user.user_id, merged).subscribe(); // fire-and-forget
            });
        } else {
            // Guest: thao tác trực tiếp trên localStorage
            const currentItems = this.getGuestCartItems();
            const kept = currentItems.filter(
                (it) => !repurchaseIds.has(buildKey(it as any)),
            );
            const merged = [...repurchaseItems, ...kept];
            this.updateGuestCart(merged);
        }
    }

    private addItemToServer(userId: string, item: any, quantity: number): void {
        const stock = Number(item.stock) || 99;
        const requestedQty = Math.max(1, quantity);

        const payload = {
            user_id: userId,
            item: {
                _id: item._id || item.id || '',
                sku: item.sku || '',
                productName: item.productName || item.name || '',
                price: Number(item.price) || 0,
                discount: Number(item.discount) || 0,
                image: item.image || '',
                unit: item.unit || 'Hộp',
                category: item.category || '',
                slug: item.slug || '',
                stock: stock,
                hasPromotion: Boolean(item.hasPromotion),
            },
            quantity: requestedQty,
        };

        this.http.post<CartResponse>(`${this.apiUrl}/add-item`, payload).subscribe({
            next: (res) => {
                if (res.success && res.cart) {
                    this.cache = null;
                    const totalQty = (res.cart.items || []).length;
                    this._cartCount$.next(totalQty);
                    this._cartUpdated$.next(res.cart);
                }
            },
            error: (err) => {
                console.error('[CartService] addItemToServer error:', err);
                this.addItemToLocal(item, quantity);
            }
        });
    }

    /**
     * Lấy danh sách sản phẩm trong giỏ của khách (sessionStorage).
     * Dùng khi khách chưa đăng nhập cần xem giỏ / đặt hàng.
     */
    getGuestCartItems(): CartItem[] {
        try {
            const raw = this.readGuestCartRaw();
            const items = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(items)) return [];
            return items.map((p: any) => ({
                _id: p._id || p.id || p.sku || p.slug || '',
                sku: p.sku || '',
                productName: p.productName || p.name || '',
                quantity: Math.max(1, Number(p.quantity) || 1),
                price: Number(p.price) || 0,
                discount: Number(p.discount) || 0,
                image: this.normalizeMediaUrl(p.image),
                unit: p.unit || 'Hộp',
                category: p.category || '',
                slug: p.slug || '',
                stock: Number(p.stock) || 0,
                hasPromotion: Boolean(p.hasPromotion),
                addedAt: p.addedAt || '',
                updatedAt: p.updatedAt || '',
            }));
        } catch {
            return [];
        }
    }

    /**
     * Xóa sản phẩm khỏi giỏ hàng.
     */
    removeItem(productId: string): void {
        const user = this.authService.currentUser();
        if (user && user.user_id) {
            // Server-side (User)
            this.getCart(user.user_id).subscribe(res => {
                if (res.success && res.cart) {
                    const filtered = (res.cart.items || []).filter(it => it._id !== productId);
                    this.updateCart(user.user_id, filtered).subscribe();
                }
            });
        } else {
            // Local (Guest)
            const items = this.getGuestCartItems();
            const filtered = items.filter(it => it._id !== productId);
            this.updateGuestCart(filtered);
        }
    }

    /**
     * Cập nhật giỏ hàng cho khách (sessionStorage).
     */
    updateGuestCart(items: CartItem[]): void {
        try {
            const toStore = items.map((i) => ({
                _id: i._id,
                sku: i.sku,
                productName: i.productName,
                quantity: i.quantity,
                price: i.price,
                discount: i.discount || 0,
                image: i.image,
                unit: i.unit ?? 'Hộp',
                category: (i as any).category,
                slug: (i as any).slug,
                stock: i.stock ?? 0,
            }));
            this.writeGuestCartRaw(JSON.stringify(toStore));
            const totalQty = items.length;
            this._cartCount$.next(totalQty);
            this._cartUpdated$.next({ user_id: 'guest', items, itemCount: items.length, totalQuantity: totalQty });
        } catch {
            /* ignore */
        }
    }

    /** Fallback: lưu sessionStorage cho guest */
    private addItemToLocal(item: any, quantity: number): void {
        const raw = this.readGuestCartRaw();
        let items: any[] = [];
        try {
            items = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(items)) items = [];
        } catch {
            items = [];
        }

        const id = item._id || item.id || item.sku || item.slug;
        if (!id) return;

        const stock = Number(item.stock) || 99;
        const existingIdx = items.findIndex((p: any) => (p._id || p.id || p.sku || p.slug) === id);

        if (existingIdx > -1) {
            const nextQty = (items[existingIdx].quantity || 0) + quantity;
            items[existingIdx].quantity = Math.min(nextQty, stock);
        } else {
            items.unshift({
                ...item,
                quantity: Math.min(quantity > 0 ? quantity : 1, stock),
                stock: stock
            });
        }

        this.writeGuestCartRaw(JSON.stringify(items));

        const totalQty = items.length;
        this._cartCount$.next(totalQty);

        // Để Header dropdown cập nhật ngay cho guest
        const guestItems = this.getGuestCartItems();
        this._cartUpdated$.next({
            user_id: 'guest',
            items: guestItems,
            itemCount: guestItems.length,
            totalQuantity: guestItems.length,
        });
    }

    /**
     * Nếu user đã login → trả 0, count sẽ được set đúng khi fetchCart() từ MongoDB.
     * Nếu guest → đọc từ sessionStorage.
     */
    private getInitialCartCount(): number {
        try {
            const userRaw = localStorage.getItem('vitacare_user');
            if (userRaw) {
                const user = JSON.parse(userRaw);
                if (user && user.user_id) return 0;
            }
        } catch { /* ignore */ }

        try {
            const raw = this.readGuestCartRaw();
            const items = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(items)) return 0;
            return items.length;
        } catch {
            return 0;
        }
    }
}
