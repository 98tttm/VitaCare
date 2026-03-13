import { Component, OnInit, Inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location, DatePipe, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { OrderService } from '../services/order.service';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../services/product.service';
import { PromotionService } from '../services/promotion.service';

@Component({
  selector: 'app-orderdetail',
  standalone: true,
  imports: [CommonModule, DatePipe, CurrencyPipe, FormsModule],
  providers: [OrderService, ProductService, PromotionService],
  templateUrl: './orderdetail.html',
  styleUrl: './orderdetail.css',
})
export class Orderdetail implements OnInit {
  order: any = null;
  isLoading = true;
  isCreateMode = false;
  isEditMode = false;

  // Notification
  notification = { show: false, message: '', type: 'success' };

  // For Create Mode
  newOrder: any = {
    shippingInfo: { fullName: '', phone: '', address: '', city: '', district: '', ward: '' },
    item: [],
    paymentMethod: 'COD',
    totalAmount: 0,
    shippingFee: 30000
  };

  locationsTree: any[] = [];
  cities: any[] = [];
  districts: any[] = [];
  wards: any[] = [];

  // Product Selection Modal
  isProductModalOpen = false;
  allProducts: any[] = [];       // Toàn bộ sản phẩm đã fetch về (full dataset)
  displayedProducts: any[] = []; // Slice hiện tại đang hiển thị trong modal (20, 40, ...)
  filteredProducts: any[] = [];  // Kết quả sau khi áp filter tìm kiếm
  productSearchTerm = '';
  isLoadingProducts = false;     // Đang fetch ngầm từ server
  isProductsReady = false;       // Đã fetch xong chưa

  // Virtual scroll state (local, không gọi API thêm)
  displayBatchSize = 20;
  displayedCount = 20;

  activePromotions: any[] = [];
  selectedPromotionId: string = '';

  constructor(
    private location: Location,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(OrderService) private orderService: OrderService,
    @Inject(ProductService) private productService: ProductService,
    @Inject(PromotionService) private promotionService: PromotionService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.fetchPromotions(); // Always fetch for both modes

    if (this.router.url.includes('/orders/edit')) {
      this.isCreateMode = true; // We use the create layout for edit
      this.isEditMode = true;
      this.isLoading = true;
      this.fetchLocations();
      this.prefetchAllProducts();
      if (id) this.fetchOrderDetailForEdit(id);
    } else if (this.router.url.includes('/orders/create')) {
      this.isCreateMode = true;
      this.isLoading = false;
      this.fetchLocations();
      this.prefetchAllProducts();
    } else if (id) {
      this.fetchOrderDetail(id);
    }
  }

  fetchPromotions() {
    this.promotionService.getPromotions().subscribe({
      next: (res) => {
        if (res.success) {
          // Filter only active/applicable promotions if needed
          this.activePromotions = res.data;
        }
      },
      error: (err) => console.error('Error fetching promotions:', err)
    });
  }

  showNotification(message: string, type: 'success' | 'warning' | 'error' = 'success') {
    this.notification = { show: true, message, type };
    setTimeout(() => this.notification.show = false, 3000);
  }

  fetchOrderDetail(id: string) {
    console.log(`[Orderdetail] Fetching details for ${id}...`);
    this.orderService.getOrderById(id).subscribe({
      next: (res) => {
        console.log(`[Orderdetail] Response received:`, res);
        if (res.success) {
          this.order = res.data;
          // Normalize status alias
          if (this.order && this.order.status === 'return_processing') {
            this.order.status = 'processing_return';
          }
          console.log(`[Orderdetail] Order data assigned:`, this.order);
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        } else {
          console.error(`[Orderdetail] API returned success=false:`, res.message);
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('[Orderdetail] Error fetching order:', err);
        this.isLoading = false;
      }
    });
  }

  fetchOrderDetailForEdit(id: string) {
    this.orderService.getOrderById(id).subscribe({
      next: (res: any) => {
        if (res.success) {
          const data = res.data;
          this.order = data;
          // Normalize status alias
          if (this.order && this.order.status === 'return_processing') {
            this.order.status = 'processing_return';
          }
          this.newOrder = {
            ...data,
            shippingInfo: data.shippingInfo || { fullName: '', phone: '' },
            item: data.item && data.item.length ? data.item : []
          };
          if (data.code) {
            const matchedPromo = this.activePromotions.find(p => p.code === data.code);
            if (matchedPromo) this.selectedPromotionId = matchedPromo._id;
          }
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error fetching order for edit:', err);
        this.isLoading = false;
      }
    });
  }

  goBack() {
    this.location.back();
  }

  // Helper functions for status
  printOrder() {
    // Increased delay to ensure DOM and any complex styles are ready
    setTimeout(() => {
      window.print();
    }, 500);
  }

  updateStatus(newStatus: string) {
    if (!this.order?._id) return;
    this.isLoading = true;
    this.orderService.updateOrder(this.order._id, { status: newStatus }).subscribe({
      next: (res) => {
        if (res.success) {
          this.showNotification('Cập nhật trạng thái thành công!', 'success');
          this.fetchOrderDetail(this.order._id);
        } else {
          this.showNotification(res.message || 'Lỗi cập nhật', 'error');
          this.isLoading = false;
        }
      },
      error: (err) => {
        this.showNotification('Lỗi server khi cập nhật', 'error');
        this.isLoading = false;
      }
    });
  }

  confirmOrder() { this.updateStatus('confirmed'); }
  shipOrder() { this.updateStatus('shipping'); }
  deliverOrder() { this.updateStatus('delivered'); }
  cancelOrder() { this.updateStatus('cancelled'); }
  acceptReturn() { this.updateStatus('returning'); }
  rejectReturn() { this.updateStatus('rejected'); }

  get nextStepLabel(): string {
    if (!this.order) return 'Xác nhận';
    if (this.order.paymentMethod === 'banking' && this.order.statusPayment === 'unpaid') {
      return 'Xác nhận thanh toán';
    }
    if (this.order.status === 'pending') {
      // Một lần bấm sẽ xác nhận và chuyển sang đang giao
      return 'Xác nhận & bắt đầu giao hàng';
    }
    if (this.order.status === 'confirmed') {
      return 'Bắt đầu giao hàng';
    }
    if (this.order.status === 'shipping') {
      return 'Đã giao hàng';
    }
    return 'Xác nhận';
  }

  get showNextStepButton(): boolean {
    if (!this.order) return false;
    const finalStatuses = ['delivered', 'cancelled', 'refunded', 'rejected', 'returned', 'processing_return', 'return_processing'];
    if (finalStatuses.includes(this.order.status)) return false;

    // Banking but unpaid always shows 'Xác nhận thanh toán'
    if (this.order.paymentMethod === 'banking' && this.order.statusPayment === 'unpaid') return true;

    // Main flow
    return ['pending', 'confirmed', 'shipping'].includes(this.order.status);
  }

  processNextStep() {
    if (!this.order) return;
    if (this.order.paymentMethod === 'banking' && this.order.statusPayment === 'unpaid') {
      this.markAsPaid();
      return;
    }
    if (this.order.status === 'pending') {
      // Yêu cầu: đơn pending bấm một lần chuyển thẳng sang đang giao
      this.updateStatus('shipping'); // CHỜ XÁC NHẬN → ĐANG GIAO
    } else if (this.order.status === 'confirmed') {
      this.updateStatus('shipping'); // ĐÃ XÁC NHẬN → ĐANG GIAO
    } else if (this.order.status === 'shipping') {
      this.updateStatus('delivered'); // ĐANG GIAO → ĐÃ GIAO
    }
  }

  markAsPaid() {
    if (!this.order?._id) return;
    this.isLoading = true;
    this.orderService.updateOrder(this.order._id, { statusPayment: 'paid' }).subscribe({
      next: (res) => {
        if (res.success) {
          this.showNotification('Cập nhật thanh toán thành công!', 'success');
          this.fetchOrderDetail(this.order._id);
        } else {
          this.showNotification(res.message || 'Lỗi cập nhật', 'error');
          this.isLoading = false;
        }
      },
      error: (err) => {
        this.showNotification('Lỗi server khi cập nhật', 'error');
        this.isLoading = false;
      }
    });
  }

  onPromotionChange() {
    if (!this.selectedPromotionId) {
      this.newOrder.code = '';
      this.newOrder.name = '';
      this.newOrder.discount = 0;
      this.calculateTotal();
      return;
    }

    const promo = this.activePromotions.find(p => p._id === this.selectedPromotionId);
    if (promo) {
      this.newOrder.code = promo.code;
      this.newOrder.name = promo.promotion_name || promo.name;

      // Calculate discount
      if (promo.type === 'percentage') {
        const subtotal = this.calculateSubtotal();
        this.newOrder.discount = Math.floor((subtotal * (promo.value || promo.discount_value || 0)) / 100);
      } else {
        this.newOrder.discount = promo.value || promo.discount_value || 0;
      }
      this.calculateTotal();
    }
  }

  getSelectedPromotionName(): string {
    if (!this.selectedPromotionId) return '';
    const promo = this.activePromotions.find(p => p._id === this.selectedPromotionId);
    return promo ? (promo.promotion_name || promo.name || '') : '';
  }

  calculateSubtotal(): number {
    return this.newOrder.item.reduce((sum: number, i: any) => sum + (i.price * i.quantity), 0);
  }

  calculateTotal() {
    const subtotal = this.calculateSubtotal();
    const shipping = this.newOrder.shippingFee || 30000;
    const discount = this.newOrder.discount || 0;
    this.newOrder.totalAmount = subtotal + shipping - discount;
  }

  isConfirmed() {
    return this.order && this.order.status !== 'pending' && this.order.status !== 'cancelled';
  }

  isDelivered() {
    return this.order && this.order.status === 'delivered';
  }

  isPaid() {
    return this.order && (this.order.paymentStatus === 'paid' || this.order.statusPayment === 'paid');
  }

  // --- Create Mode Logic ---

  fetchLocations() {
    this.orderService.getLocations().subscribe({
      next: (res: any) => {
        const treeData = res.success ? res.data : res;
        const provincesObject = Array.isArray(treeData) ? treeData[0] : treeData;
        console.log('provincesObject', provincesObject ? Object.keys(provincesObject).length : 0);

        this.cities = Object.values(provincesObject)
          .map((province: any) => {
            const districts: any[] = [];

            if (province['quan-huyen']) {
              Object.values(province['quan-huyen']).forEach((district: any) => {
                const wards: any[] = [];

                if (district['xa-phuong']) {
                  Object.values(district['xa-phuong']).forEach((ward: any) => {
                    if (ward && ward.name && ward.name.trim() !== '') {
                      wards.push({
                        code: ward.code || '',
                        name_with_type: ward.name_with_type || ward.name || '',
                        name: ward.name || ''
                      });
                    }
                  });
                }

                if (district && district.name && district.name.trim() !== '') {
                  districts.push({
                    code: district.code || '',
                    name_with_type: district.name_with_type || district.name || '',
                    name: district.name || '',
                    'xa-phuong': wards.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
                  });
                }
              });
            }

            if (province && province.name && province.name.trim() !== '') {
              return {
                code: province.code || '',
                name_with_type: province.name_with_type || province.name || '',
                name: province.name || '',
                'quan-huyen': districts.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
              };
            }
            return null;
          })
          .filter((province: any) => province !== null)
          .sort((a: any, b: any) => a.name.localeCompare(b.name, 'vi'));
      },
      error: (err) => console.error('Error loading locations:', err)
    });
  }

  onCityChange() {
    const cityName = this.newOrder.shippingInfo.city;
    const city = this.cities.find(c => c.name_with_type === cityName);
    if (city && city['quan-huyen']) {
      this.districts = city['quan-huyen'];
    } else {
      this.districts = [];
    }
    this.wards = [];
    this.newOrder.shippingInfo.district = '';
    this.newOrder.shippingInfo.ward = '';
  }

  onDistrictChange() {
    const districtName = this.newOrder.shippingInfo.district;
    const dist = this.districts.find(d => d.name_with_type === districtName);
    if (dist && dist['xa-phuong']) {
      this.wards = dist['xa-phuong'];
    } else {
      this.wards = [];
    }
    this.newOrder.shippingInfo.ward = '';
  }

  // ─── Product Selection Modal ───────────────────────────────────────────────

  /** Fetch toàn bộ sản phẩm ngay khi vào trang (load ngầm) */
  prefetchAllProducts() {
    this.isLoadingProducts = true;
    this.productService.getAllProducts().subscribe({
      next: (res: any) => {
        this.allProducts = res.success ? res.data : (Array.isArray(res) ? res : []);
        this.isLoadingProducts = false;
        this.isProductsReady = true;
        // Nếu modal đang mở trong lúc chờ, cập nhật ngay
        if (this.isProductModalOpen) {
          this.resetDisplayedProducts();
        }
      },
      error: (err) => {
        console.error('Lỗi khi load sản phẩm:', err);
        this.isLoadingProducts = false;
      }
    });
  }

  /** Khởi tạo displayedProducts từ đầu (20 item đầu tiên) */
  resetDisplayedProducts() {
    this.displayedCount = this.displayBatchSize;
    const source = this.productSearchTerm
      ? this.allProducts.filter(p =>
        (p.name && p.name.toLowerCase().includes(this.productSearchTerm)) ||
        (p.sku && p.sku.toLowerCase().includes(this.productSearchTerm))
      )
      : this.allProducts;
    this.filteredProducts = source;
    this.displayedProducts = source.slice(0, this.displayedCount);
  }

  openProductModal() {
    this.productSearchTerm = '';
    this.isProductModalOpen = true;
    if (this.isProductsReady) {
      // Data đã sẵn sàng → hiển thị ngay
      this.resetDisplayedProducts();
    }
    // Nếu chưa ready, spinner sẽ hiển thị đến khi prefetchAllProducts() xong
  }

  closeProductModal() {
    this.isProductModalOpen = false;
  }

  /** Scroll trong danh sách modal → load thêm 20 item từ bộ nhớ (không gọi API) */
  onProductListScroll(event: Event) {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
    if (nearBottom && this.displayedCount < this.filteredProducts.length) {
      this.displayedCount += this.displayBatchSize;
      this.displayedProducts = this.filteredProducts.slice(0, this.displayedCount);
    }
  }

  /** Tìm kiếm trên TOÀN BỘ allProducts */
  onSearchProduct(event: any) {
    const term = event.target.value.toLowerCase().trim();
    this.productSearchTerm = term;
    if (!term) {
      this.filteredProducts = this.allProducts;
    } else {
      this.filteredProducts = this.allProducts.filter(p =>
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.sku && p.sku.toLowerCase().includes(term))
      );
    }
    // Reset hiển thị về 20 item đầu của kết quả
    this.displayedCount = this.displayBatchSize;
    this.displayedProducts = this.filteredProducts.slice(0, this.displayedCount);
  }

  selectProduct(product: any) {
    const exists = this.newOrder.item.find((i: any) => i.productId === product._id);
    if (exists) {
      exists.quantity++;
    } else {
      this.newOrder.item.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        image: product.image || (product.gallery && product.gallery[0] ? product.gallery[0] : ''),
        price: product.price || 0,
        quantity: 1
      });
    }
    this.calculateTotal();
    this.closeProductModal();
  }

  removeProduct(index: number) {
    this.newOrder.item.splice(index, 1);
    this.calculateTotal();
  }

  updateTotal() {
    this.calculateTotal();
  }

  createOrder() {
    if (!this.newOrder.shippingInfo.fullName || !this.newOrder.shippingInfo.phone) {
      this.showNotification('Vui lòng nhập tên và số điện thoại!', 'warning');
      return;
    }
    if (this.newOrder.item.length === 0) {
      this.showNotification('Vui lòng chọn ít nhất 1 sản phẩm!', 'warning');
      return;
    }

    this.calculateTotal(); // Ensure latest total with items, shipping and discount before saving
    this.isLoading = true;
    this.orderService.createOrder(this.newOrder).subscribe({
      next: (res) => {
        if (res.success) {
          this.showNotification('Tạo đơn hàng thành công!', 'success');
          setTimeout(() => {
            this.router.navigate(['/admin/orders']);
          }, 1000);
        } else {
          this.showNotification(res.message || 'Lỗi thêm mới', 'error');
          this.isLoading = false;
        }
      },
      error: (err) => {
        this.showNotification('Lỗi server khi thêm mới', 'error');
        this.isLoading = false;
      }
    });
  }

  updateEditOrder() {
    if (!this.newOrder.shippingInfo.fullName || !this.newOrder.shippingInfo.phone) {
      this.showNotification('Vui lòng nhập tên và số điện thoại!', 'warning');
      return;
    }
    if (this.newOrder.item.length === 0) {
      this.showNotification('Vui lòng chọn ít nhất 1 sản phẩm!', 'warning');
      return;
    }

    this.calculateTotal();
    this.isLoading = true;
    this.orderService.updateOrder(this.order._id, this.newOrder).subscribe({
      next: (res) => {
        if (res.success) {
          this.showNotification('Cập nhật đơn hàng thành công!', 'success');
          setTimeout(() => {
            this.router.navigate(['/admin/orders']);
          }, 1000);
        } else {
          this.showNotification(res.message || 'Lỗi cập nhật', 'error');
          this.isLoading = false;
        }
      },
      error: (err) => {
        this.showNotification('Lỗi server khi cập nhật', 'error');
        this.isLoading = false;
      }
    });
  }

}
