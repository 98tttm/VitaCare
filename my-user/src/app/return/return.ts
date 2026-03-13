import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject, ChangeDetectorRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrderService, Order as BackendOrder } from '../services/order.service';
import { AuthService } from '../services/auth.service';
import { CartService, CartItem } from '../services/cart.service';
import { CartSidebarService } from '../services/cart-sidebar.service';

/** Trạng thái đơn liên quan đổi trả (MongoDB orders.status). Chấp nhận cả tên trong DB và chuẩn hóa về id tab. */
const RETURN_STATUSES = [
    'processing_return', 'return_processing', // DB có thể dùng return_processing
    'returning', 'returned', 'refund_rejected', 'rejected',
] as const;

interface OrderProduct {
    id: string;
    name: string;
    image: string;
    price: number;
    originalPrice?: number;
    quantity: number;
    unit: string;
    totalPrice: number;
    category?: string;
    gifted?: boolean;
    parentId?: string;
}

interface Order {
    id: string;
    orderNumber: string;
    orderDate: string;
    status: string;
    totalAmount: number;
    products: OrderProduct[];
    returnReason?: string;
    paymentMethod?: string;
}

@Component({
    selector: 'app-return-management',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './return.html',
    styleUrls: ['./return.css'],
})
export class ReturnManagementComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
    @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
    @ViewChild('tabList') tabList?: ElementRef;

    /** Truyền từ Account (giống Orders) để đảm bảo có userId khi vào tab và refetch khi đổi user */
    @Input() userId: string | undefined;

    private orderService = inject(OrderService);
    private authService = inject(AuthService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);
    private cartService = inject(CartService);
    private cartSidebar = inject(CartSidebarService);

    searchQuery = '';
    activeTab: string = 'processing_return';
    canScrollLeft = false;
    canScrollRight = false;

    /** Đơn hàng có trạng thái đổi trả (từ MongoDB) */
    orders: Order[] = [];
    isLoading = true;
    expandedOrders = new Set<string>();

    showCancelModal = false;
    cancelOrder: Order | null = null;

    /** Modal xác nhận đã nhận hàng (hoàn tất đổi trả) */
    showConfirmReceivedModal = false;
    confirmOrder: Order | null = null;

    /** Modal chi tiết đơn đổi trả (2 cột giống Đơn hàng của tôi) */
    showDetailModal = false;
    selectedDetailOrder: Order | null = null;
    detailSearchQuery = '';
    get filteredOrdersForDetail(): Order[] {
        const list = this.getFilteredReturns();
        if (!this.detailSearchQuery.trim()) return list;
        const q = this.detailSearchQuery.toLowerCase().trim();
        return list.filter(
            (o) =>
                o.orderNumber.toLowerCase().includes(q) ||
                o.products.some((p) => p.name.toLowerCase().includes(q))
        );
    }

    tabs = [
        { id: 'processing_return', label: 'Đang xử lý trả hàng/hoàn tiền', count: 0 },
        { id: 'returning', label: 'Đang hoàn', count: 0 },
        { id: 'returned', label: 'Đã hoàn/trả', count: 0 },
        { id: 'rejected', label: 'Từ chối hoàn/trả', count: 0 },
    ];

    ngOnInit(): void {
        const uid = this.userId || this.authService.currentUser()?.user_id;
        if (uid) {
            this.fetchReturnOrders(uid);
        } else {
            setTimeout(() => {
                this.orders = [];
                this.isLoading = false;
                this.updateTabCounts();
                this.cdr.detectChanges();
            }, 0);
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['userId'] && this.userId) {
            this.fetchReturnOrders(this.userId);
        }
    }

    ngOnDestroy(): void { }

    ngAfterViewInit(): void {
        this.checkScrollButtons();
    }

    fetchReturnOrders(userId: string): void {
        if (!userId) return;
        this.isLoading = true;
        this.cdr.detectChanges();
        this.orderService.getOrders(userId).subscribe({
            next: (res) => {
                setTimeout(() => {
                    const rawItems = Array.isArray((res as any).items) ? (res as any).items : Array.isArray((res as any).data) ? (res as any).data : [];
                    if (res.success && rawItems.length >= 0) {
                        const filtered = rawItems.filter((o: any) => {
                            const s = (o.status != null ? o.status : o.orderStatus || '').toString().trim().toLowerCase();
                            return (RETURN_STATUSES as readonly string[]).includes(s);
                        });
                        this.orders = filtered.map((o: BackendOrder) => this.mapBackendOrder(o));
                    } else {
                        this.orders = [];
                    }
                    this.updateTabCounts();
                    this.isLoading = false;
                    this.cdr.detectChanges();
                }, 0);
            },
            error: (err) => {
                console.warn('[ReturnManagement] getOrders error', err);
                setTimeout(() => {
                    this.orders = [];
                    this.updateTabCounts();
                    this.isLoading = false;
                    this.cdr.detectChanges();
                }, 0);
            },
        });
    }

    private mapBackendOrder(backend: any): Order {
        const route = backend.route || {};
        const orderDate = route.pending || new Date().toISOString();
        const rawItems = Array.isArray(backend.item) ? backend.item : Array.isArray(backend.items) ? backend.items : [];
        const products: OrderProduct[] = rawItems.map((item: any, index: number) => {
            const rawPid = item?.productId || item?._id;
            let productId = '';
            if (rawPid) {
                if (typeof rawPid === 'string') productId = rawPid;
                else if (rawPid.$oid) productId = rawPid.$oid;
                else if (typeof rawPid.toString === 'function') productId = rawPid.toString();
            }
            // Backup: fallback sang sku nếu thiếu _id
            if (!productId && item?.sku) {
                productId = item.sku;
            }

            return {
                id: productId,
                name: item.productName || item.name || '',
                image: item.image || '',
                price: item.price ?? 0,
                quantity: item.quantity ?? 0,
                unit: item.unit || '',
                totalPrice: (item.price ?? 0) * (item.quantity ?? 0),
                category: '',
                gifted: false,
            };
        });
        const rawStatus = (backend.status != null ? backend.status : backend.orderStatus || '').toString().trim().toLowerCase();
        let status = rawStatus === 'refund_rejected' ? 'rejected' : rawStatus;
        if (status === 'return_processing') status = 'processing_return';
        return {
            id: backend._id?.toString?.() || backend.order_id || '',
            orderNumber: backend.order_id || backend.orderNumber || '',
            orderDate,
            status,
            totalAmount: backend.totalAmount ?? 0,
            products,
            returnReason: backend.returnReason || '',
            paymentMethod: backend.paymentMethod || 'cod',
        };
    }

    scrollTabs(direction: number): void {
        if (this.tabList?.nativeElement) {
            this.tabList.nativeElement.scrollBy({ left: direction, behavior: 'smooth' });
            setTimeout(() => this.checkScrollButtons(), 300);
        }
    }

    checkScrollButtons(): void {
        setTimeout(() => {
            if (!this.tabList?.nativeElement) return;
            const el = this.tabList.nativeElement;
            this.canScrollLeft = el.scrollLeft > 0;
            this.canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
            this.cdr.detectChanges();
        }, 0);
    }

    updateTabCounts(): void {
        this.tabs.forEach((tab) => {
            tab.count = this.orders.filter((o) => o.status === tab.id).length;
        });
    }

    onTabClick(tabId: string): void {
        this.activeTab = tabId;
    }

    clearSearch(): void {
        this.searchQuery = '';
        setTimeout(() => this.searchInput?.nativeElement?.focus(), 0);
    }

    performSearch(): void { }

    getFilteredReturns(): Order[] {
        let filtered = this.orders.filter((o) => o.status === this.activeTab);
        if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(
                (o) =>
                    o.orderNumber.toLowerCase().includes(q) ||
                    o.products.some((p) => p.name.toLowerCase().includes(q))
            );
        }
        return filtered.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
    }

    getStatusLabel(status: string): string {
        const s = (status || '').toLowerCase().trim();
        const map: Record<string, string> = {
            'pending': 'Chờ xác nhận',
            'confirmed': 'Đã xác nhận',
            'shipping': 'Đang giao hàng',
            'delivered': 'Đã giao hàng',
            'received': 'Đã nhận hàng',
            'unreview': 'Chưa đánh giá',
            'reviewed': 'Đã đánh giá',
            'completed': 'Hoàn thành',
            'cancelled': 'Đã hủy',
            'processing_return': 'Đang xử lý trả hàng/hoàn tiền',
            'returning': 'Đang hoàn',
            'returned': 'Đã hoàn/trả',
            'refund_rejected': 'Từ chối hoàn tiền',
            'rejected': 'Từ chối hoàn/trả',
        };
        return map[s] || status;
    }

    formatCurrency(amount: number): string {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }

    formatDate(dateStr: string): string {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    hasMoreProducts(order: Order): boolean {
        return order.products.length > 1;
    }

    isOrderExpanded(order: Order): boolean {
        return this.expandedOrders.has(order.id);
    }

    onViewMore(order: Order): void {
        if (this.expandedOrders.has(order.id)) {
            this.expandedOrders.delete(order.id);
        } else {
            this.expandedOrders.add(order.id);
        }
    }

    getDisplayProducts(order: Order): OrderProduct[] {
        const main = order.products.filter((p) => !p.gifted);
        if (this.expandedOrders.has(order.id)) return main;
        return main.slice(0, 1);
    }

    hasGiftedProduct(_product: OrderProduct, _order: Order): boolean {
        return false;
    }

    getGiftedProduct(_product: OrderProduct, _order: Order): OrderProduct | undefined {
        return undefined;
    }

    getTotalQuantity(order: Order): number {
        return order.products.reduce((sum, p) => sum + p.quantity, 0);
    }

    viewOrderDetails(order: Order): void {
        this.openDetailModal(order);
    }

    openDetailModal(selected?: Order): void {
        this.showDetailModal = true;
        this.detailSearchQuery = '';
        this.selectedDetailOrder = selected || (this.getFilteredReturns()[0] ?? null);
        this.cdr.detectChanges();
    }

    closeDetailModal(): void {
        this.showDetailModal = false;
        this.selectedDetailOrder = null;
        this.detailSearchQuery = '';
        this.cdr.detectChanges();
    }

    openOrderDetailInModal(order: Order): void {
        this.selectedDetailOrder = order;
    }

    onDetailSearchChange(): void {
        this.cdr.detectChanges();
    }

    clearDetailSearch(): void {
        this.detailSearchQuery = '';
        this.cdr.detectChanges();
    }

    formatDateTimeDisplay(dateStr: string): string {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    getPaymentMethodLabel(method: string): string {
        const map: Record<string, string> = {
            cod: 'Tiền mặt khi nhận hàng',
            momo: 'Ví MoMo',
            banking: 'Chuyển khoản ngân hàng',
            credit_card: 'Thẻ tín dụng/ghi nợ',
        };
        return map[method] || method;
    }

    getStatusClass(status: string): string {
        const map: Record<string, string> = {
            processing_return: 'status-processing_return',
            returning: 'status-returning',
            returned: 'status-returned',
            rejected: 'status-rejected',
        };
        return map[status] || '';
    }

    openCancelModal(order: Order): void {
        this.cancelOrder = order;
        this.showCancelModal = true;
    }

    closeCancelModal(): void {
        this.showCancelModal = false;
        this.cancelOrder = null;
    }

    confirmCancelRequest(): void {
        const orderToCancel = this.cancelOrder;
        if (orderToCancel) {
            this.orderService.cancelReturnRequest(orderToCancel.orderNumber).subscribe({
                next: (res) => {
                    if (res.success) {
                        // Cập nhật trạng thái local trước khi lọc ra
                        orderToCancel.status = 'unreview';
                        this.orders = this.orders.filter((o) => o.id !== orderToCancel.id);
                        this.updateTabCounts();
                        this.cdr.detectChanges();
                        // Chuyển sang danh sách đơn hàng chưa đánh giá
                        this.router.navigate(['/account'], { queryParams: { menu: 'reviews' } });
                    }
                },
                error: (err) => {
                    console.error('Cancel return request error:', err);
                    // Fallback local update
                    if (orderToCancel) {
                        this.orders = this.orders.filter((o) => o && o.id !== orderToCancel.id);
                        this.updateTabCounts();
                        this.cdr.detectChanges();
                    }
                }
            });
        }
        this.closeCancelModal();
    }

    openConfirmReceivedModal(order: Order): void {
        this.confirmOrder = order;
        this.showConfirmReceivedModal = true;
        this.cdr.detectChanges();
    }

    closeConfirmReceivedModal(): void {
        this.showConfirmReceivedModal = false;
        this.confirmOrder = null;
        this.cdr.detectChanges();
    }

    /** Gửi xác nhận đã nhận hàng (hoàn tất đổi trả) sau khi user đồng ý trong popup */
    confirmReceivedReturn(order: Order): void {
        this.orderService.confirmReturned(order.orderNumber).subscribe({
            next: (res) => {
                if (res.success) {
                    order.status = 'returned';
                    this.updateTabCounts();
                    this.cdr.detectChanges();
                }
            },
            error: (err) => {
                console.error('Confirm returned error:', err);
                // Fallback local update
                order.status = 'returned';
                this.updateTabCounts();
                this.cdr.detectChanges();
            }
        });
    }

    executeConfirmReceived(): void {
        if (this.confirmOrder) {
            this.confirmReceivedReturn(this.confirmOrder);
        }
        this.closeConfirmReceivedModal();
    }

    onRepurchase(order: Order): void {
        if (!order.products?.length) return;

        const ids = new Set<string>();
        order.products.forEach((p) => {
            const payload: Partial<CartItem> = {
                _id: p.id || '',
                sku: '', // đơn đổi trả hiện không có sku, backend sẽ map theo _id
                productName: p.name,
                price: p.price ?? 0,
                discount: 0,
                image: p.image || '',
                unit: p.unit || 'Hộp',
                category: p.category || '',
                hasPromotion: false,
            };
            if (payload._id) ids.add(String(payload._id));
            this.cartService.addItem(payload, p.quantity || 1);
        });

        localStorage.setItem('repurchase_selection', JSON.stringify({
            skus: [],
            ids: Array.from(ids),
        }));

        this.cartSidebar.openSidebar();
    }
}
