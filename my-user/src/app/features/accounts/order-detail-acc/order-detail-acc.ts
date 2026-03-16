import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  Output,
  EventEmitter,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OrderService } from '../../../core/services/order.service';
import { ToastService } from '../../../core/services/toast.service';
import { CartService, CartItem } from '../../../core/services/cart.service';
import { CartSidebarService } from '../../../core/services/cart-sidebar.service';

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
  sku?: string;
}

interface ShippingAddress {
  street: string;
  ward: string;
  district: string;
  city: string;
}

interface ShippingInfo {
  fullName: string;
  phone: string;
  email?: string;
  address?: ShippingAddress;
}

interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate?: string;
  // Đồng bộ với Order trong orders.ts
  status:
  | 'pending'
  | 'confirmed'
  | 'shipping'
  | 'delivered'
  | 'received'
  | 'completed'
  | 'cancelled'
  | 'refund_rejected'
  | 'unreview'
  | 'reviewed'
  | 'processing_return'
  | 'returning'
  | 'returned';
  totalAmount: number;
  subtotal?: number;
  directDiscount?: number;
  voucherDiscount?: number;
  products: OrderProduct[];
  shippingInfo?: ShippingInfo;
  shippingFee?: number;
  discount?: number;
  paymentMethod?: string;
  isReviewed?: boolean;
  isReturned?: boolean;
}

@Component({
  selector: 'app-order-detail-acc',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-detail-acc.html',
  styleUrl: './order-detail-acc.css',
})
export class OrderDetailAcc {
  private router = inject(Router);
  private orderService = inject(OrderService);
  private toast = inject(ToastService);
  private cartService = inject(CartService);
  private cartSidebar = inject(CartSidebarService);

  @ViewChild('searchInput') searchInput?: ElementRef;
  @Output() close = new EventEmitter<void>();

  // Modal State
  showDetailModal = false;
  allOrders: Order[] = [];
  filteredOrders: Order[] = [];
  selectedOrder: Order | null = null;

  // Search
  searchQuery: string = '';

  // Nested Modals
  showCancelOrderModal = false;
  showConfirmReceivedModal = false;

  // Open modal with orders data
  openModal(orders: Order[], selectedOrderId?: string): void {
    this.allOrders = [...orders];
    this.filteredOrders = [...orders];
    this.searchQuery = '';
    this.showDetailModal = true;

    // Auto-select first order or specified order
    if (selectedOrderId) {
      const order = this.allOrders.find(o => o.id === selectedOrderId);
      if (order) {
        this.selectedOrder = order;
      } else if (this.allOrders.length > 0) {
        this.selectedOrder = this.allOrders[0];
      }
    } else if (this.allOrders.length > 0) {
      this.selectedOrder = this.allOrders[0];
    }
  }

  // Close modal
  closeDetailModal(): void {
    this.showDetailModal = false;
    this.selectedOrder = null;
    this.searchQuery = '';
    this.showCancelOrderModal = false;
    this.showConfirmReceivedModal = false;
    this.close.emit();
  }

  // Select order for detail view
  openOrderDetail(order: Order): void {
    this.selectedOrder = order;
  }

  // Search functionality
  onSearchChange(): void {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredOrders = [...this.allOrders];
      return;
    }

    this.filteredOrders = this.allOrders.filter(
      order =>
        order.orderNumber.toLowerCase().includes(query) ||
        order.products.some(p => p.name.toLowerCase().includes(query))
    );
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filteredOrders = [...this.allOrders];
    setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
  }

  focusSearchInput(): void {
    this.searchInput?.nativeElement.focus();
  }

  // Status utilities
  getStatusClass(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'status-pending',
      'confirmed': 'status-confirmed',
      'shipping': 'status-shipping',
      'delivered': 'status-delivered',
      'received': 'status-received',
      'unreview': 'status-delivered', // Hoặc status-received tùy thiết kế
      'reviewed': 'status-completed',
      'completed': 'status-completed',
      'cancelled': 'status-cancelled',
      'returning': 'status-returning',
      'returned': 'status-returned',
      'refund_rejected': 'status-refund_rejected',
    };
    return statusMap[status] || '';
  }

  getStatusLabel(status: string): string {
    const s = (status || '').toLowerCase().trim();
    const labelMap: Record<string, string> = {
      'pending': 'Chờ xác nhận',
      'confirmed': 'Đã xác nhận',
      'shipping': 'Đang giao hàng',
      'delivered': 'Đã giao hàng',
      'received': 'Đã nhận hàng',
      'unreview': 'Chưa đánh giá',
      'completed': 'Hoàn thành',
      'cancelled': 'Đã hủy',
      'reviewed': 'Đã đánh giá',
      'processing_return': 'Yêu cầu trả hàng',
      'returning': 'Đang hoàn trả',
      'returned': 'Đã hoàn trả',
      'refund_rejected': 'Từ chối hoàn tiền',
    };
    return labelMap[s] || status;
  }

  getPaymentMethodLabel(method: string): string {
    const methodMap: Record<string, string> = {
      'cod': 'Tiền mặt khi nhận hàng',
      'momo': 'Ví MoMo',
      'banking': 'Chuyển khoản ngân hàng',
      'credit_card': 'Thẻ tín dụng/ghi nợ',
    };
    return methodMap[method] || method;
  }

  // Date formatting
  formatDateDisplay(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatDateTimeDisplay(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Currency formatting
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  }

  // Product utilities
  getPurchasedProducts(products: OrderProduct[]): OrderProduct[] {
    return products.filter(p => !p.gifted);
  }

  hasGiftedProduct(product: OrderProduct, order: Order): boolean {
    return order.products.some(p => p.gifted && p.parentId === product.id);
  }

  getGiftedProduct(product: OrderProduct, order: Order): OrderProduct | undefined {
    return order.products.find(p => p.gifted && p.parentId === product.id);
  }

  goToProductDetail(product: OrderProduct, event: Event): void {
    event.stopPropagation();
    // Ưu tiên _id; nếu chưa có (đơn cũ) thì fallback sang sku để backend map ngược lại
    const targetId = product.id || product.sku;
    if (!targetId) {
      console.warn('[OrderDetailAcc] Missing product.id & sku, skip navigation');
      return;
    }
    this.router.navigate(['/product', targetId]);
  }

  // Address formatting
  getFullAddress(address: ShippingAddress): string {
    if (!address) return '';
    const parts = [address.street, address.ward, address.district, address.city].filter(Boolean);
    return parts.join(', ');
  }

  // Order summary calculations
  getSubtotalWithVAT(): number {
    if (!this.selectedOrder) return 0;
    return this.selectedOrder.products
      .filter(p => !p.gifted)
      .reduce((sum, p) => sum + p.totalPrice, 0);
  }

  isFreeShipping(): boolean {
    // Check if order has free shipping promotion
    return this.selectedOrder?.shippingFee === 0 && this.getBaseShippingFee() > 0;
  }

  getBaseShippingFee(): number {
    // Return base shipping fee before discount (if applicable)
    // This would need to be stored in order data or calculated based on business rules
    return 30000; // Default base shipping fee
  }

  // Review and return checks
  hasOrderBeenReviewed(order: Order): boolean {
    return order.isReviewed === true;
  }

  hasOrderBeenReturned(order: Order): boolean {
    return order.isReturned === true;
  }

  // Action buttons
  onCancelOrder(): void {
    this.showCancelOrderModal = true;
  }

  closeCancelOrderModal(): void {
    this.showCancelOrderModal = false;
  }

  async confirmCancelOrder(): Promise<void> {
    if (!this.selectedOrder) return;

    try {
      // Sử dụng orderNumber (trùng với order_id) để backend tìm đúng document
      await this.orderService.cancelOrder(this.selectedOrder.orderNumber).toPromise();
      this.toast.showSuccess('Đơn hàng đã được hủy thành công');

      // Update order status
      this.selectedOrder.status = 'cancelled';
      const orderIndex = this.allOrders.findIndex(o => o.id === this.selectedOrder!.id);
      if (orderIndex !== -1) {
        this.allOrders[orderIndex].status = 'cancelled';
      }

      this.closeCancelOrderModal();
      // Reload lại trang để đồng bộ danh sách đơn hàng ngoài màn Account
      window.location.reload();
    } catch (error) {
      console.error('Error canceling order:', error);
      this.toast.showError('Có lỗi xảy ra khi hủy đơn hàng');
    }
  }

  confirmReceivedOrder(): void {
    this.showConfirmReceivedModal = true;
  }

  closeConfirmReceivedModal(): void {
    this.showConfirmReceivedModal = false;
  }

  async executeConfirmReceivedOrder(): Promise<void> {
    if (!this.selectedOrder) return;

    try {
      // Sử dụng orderNumber (order_id trên MongoDB) thay vì _id
      await this.orderService.confirmReceived(this.selectedOrder.orderNumber).toPromise();
      this.toast.showSuccess('Đã xác nhận nhận hàng thành công');

      // Update order status
      this.selectedOrder.status = 'unreview';
      const orderIndex = this.allOrders.findIndex(o => o.id === this.selectedOrder!.id);
      if (orderIndex !== -1) {
        this.allOrders[orderIndex].status = 'unreview';
      }

      this.closeConfirmReceivedModal();
      // Reload lại trang để cập nhật trạng thái đơn hàng, sau đó user có thể tự vào mục đánh giá nếu muốn
      this.closeDetailModal();
      window.location.reload();
    } catch (error) {
      console.error('Error confirming received:', error);
      this.toast.showError('Có lỗi xảy ra khi xác nhận nhận hàng');
    }
  }

  onRate(): void {
    if (!this.selectedOrder) return;
    this.closeDetailModal();
    this.router.navigate(['/account'], {
      queryParams: { menu: 'reviews', orderId: this.selectedOrder.id },
    });
  }

  onReturnRefund(): void {
    if (!this.selectedOrder) return;
    this.closeDetailModal();
    this.router.navigate(['/account'], {
      queryParams: { menu: 'returns', orderId: this.selectedOrder.id },
    });
  }

  onRepurchaseOrder(): void {
    if (!this.selectedOrder) return;

    const purchasedProducts = this.getPurchasedProducts(this.selectedOrder.products);
    if (!purchasedProducts.length) return;

    const skus = new Set<string>();
    const ids = new Set<string>();

    const repurchaseItems: Array<Partial<CartItem> & { quantity: number }> = purchasedProducts.map((p) => {
      const payload: Partial<CartItem> & { quantity: number } = {
        _id: p.id || p.sku || '',
        sku: p.sku || '',
        productName: p.name,
        price: p.price || 0,
        discount: 0,
        image: p.image || '',
        unit: p.unit || 'Hộp',
        category: p.category || '',
        hasPromotion: false,
        quantity: p.quantity || 1,
      };
      if (payload.sku) skus.add(payload.sku);
      if (payload._id) ids.add(String(payload._id));
      return payload;
    });

    this.cartService.setItemsForRepurchase(repurchaseItems);
    localStorage.setItem('repurchase_selection', JSON.stringify({
      skus: Array.from(skus),
      ids: Array.from(ids),
    }));
    this.cartSidebar.openSidebar();
  }
}
