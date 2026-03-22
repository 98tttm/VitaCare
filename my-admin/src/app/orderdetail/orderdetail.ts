import { Component, OnInit, Inject, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule, Location, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { OrderService } from '../services/order.service';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../services/product.service';
import { PromotionService } from '../services/promotion.service';
import {
  ApplicablePromotion,
  ADMIN_ORDER_DEFAULT_SHIPPING_FEE,
  ADMIN_ORDER_FREE_SHIPPING_THRESHOLD,
  buildApplicablePromotionsForAdminOrder,
  buildProductIdsByGroupId,
  CartLikeItem,
} from '../utils/applicable-promotions';
import { AdminMascotLoadingComponent } from '../shared/admin-mascot-loading/admin-mascot-loading.component';
import { VcSearchableSelectComponent } from '../shared/vc-searchable-select/vc-searchable-select.component';

@Component({
  selector: 'app-orderdetail',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, AdminMascotLoadingComponent, VcSearchableSelectComponent],
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

  // For Create Mode (trường tính tiền đồng bộ payload /api/orders)
  newOrder: any = {
    shippingInfo: { fullName: '', phone: '', address: '', city: '', district: '', ward: '' },
    item: [],
    paymentMethod: 'COD',
    subtotal: 0,
    directDiscount: 0,
    voucherDiscount: 0,
    vitaXuDiscount: 0,
    shippingFee: 0,
    shippingDiscount: 0,
    totalAmount: 0,
    discount: 0,
    code: '',
    name: '',
    promotion: [] as { promotion_id?: string; promotionId?: string; code?: string }[],
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
  /** KM kèm isApplicable / reason (giống giỏ hàng my-user) */
  applicablePromotions: ApplicablePromotion[] = [];
  selectedPromotionId: string = '';

  promoCategories: any[] = [];
  productIdsByGroupMap = new Map<string, string[]>();

  /** Dropdown tùy chỉnh trên form tạo/sửa đơn (thay select native). */
  openCreateSelect: string | null = null;

  readonly paymentOptions: { value: string; label: string }[] = [
    { value: 'COD', label: 'Thanh toán khi nhận hàng (COD)' },
    { value: 'Banking', label: 'Chuyển khoản' },
  ];

  get citySelectOptions(): { value: string; label: string }[] {
    return (this.cities || []).map((c: any) => ({ value: c.name_with_type, label: c.name_with_type }));
  }

  get districtSelectOptions(): { value: string; label: string }[] {
    return (this.districts || []).map((d: any) => ({ value: d.name_with_type, label: d.name_with_type }));
  }

  get wardSelectOptions(): { value: string; label: string }[] {
    return (this.wards || []).map((w: any) => ({ value: w.name_with_type, label: w.name_with_type }));
  }

  constructor(
    private location: Location,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(OrderService) private orderService: OrderService,
    @Inject(ProductService) private productService: ProductService,
    @Inject(PromotionService) private promotionService: PromotionService,
    private cdr: ChangeDetectorRef
  ) { }

  @HostListener('document:click', ['$event'])
  closeCreateSelectOnOutside(ev: MouseEvent) {
    const t = ev.target as HTMLElement;
    if (t.closest('.od-custom-select')) return;
    if (t.closest('vc-searchable-select')) return;
    this.openCreateSelect = null;
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    /** Route leaf path ổn định hơn `router.url` (tránh kẹt isLoading khi URL chưa sync). */
    const routePath = this.route.snapshot.routeConfig?.path || '';
    this.fetchPromotions(); // Always fetch for both modes

    if (routePath.startsWith('orders/edit')) {
      this.isCreateMode = true; // We use the create layout for edit
      this.isEditMode = true;
      this.isLoading = true;
      this.fetchLocations();
      this.prefetchAllProducts();
      this.fetchPromoSupportData();
      if (id) this.fetchOrderDetailForEdit(id);
    } else if (routePath === 'orders/create') {
      this.isCreateMode = true;
      this.isLoading = false;
      this.fetchLocations();
      this.prefetchAllProducts();
      this.fetchPromoSupportData();
    } else if (id) {
      this.fetchOrderDetail(id);
    } else {
      this.isLoading = false;
    }
  }

  fetchPromotions() {
    this.promotionService.getPromotions().subscribe({
      next: (res) => {
        if (res.success) {
          this.activePromotions = res.data || [];
          this.rebuildApplicablePromotions();
        }
      },
      error: (err) => console.error('Error fetching promotions:', err)
    });
  }

  fetchPromoSupportData() {
    this.productService.getCategories().subscribe({
      next: (res: any) => {
        this.promoCategories = Array.isArray(res) ? res : (res?.data || []);
        this.rebuildApplicablePromotions();
      },
      error: () => this.rebuildApplicablePromotions(),
    });
    this.productService.getGroups().subscribe({
      next: (res: any) => {
        const groups = res?.success ? res.data : [];
        this.productIdsByGroupMap = buildProductIdsByGroupId(groups || []);
        this.rebuildApplicablePromotions();
      },
      error: () => this.rebuildApplicablePromotions(),
    });
  }

  private lineItemsAsCartLike(): CartLikeItem[] {
    return (this.newOrder.item || []).map((i: any) => {
      let cat = i.categoryId || i.category;
      if (!cat && i.productId) {
        const p = this.allProducts.find((x) => String(x._id) === String(i.productId));
        if (p) cat = p.categoryId;
      }
      return {
        productId: i.productId,
        _id: i.productId,
        price: i.price,
        quantity: i.quantity,
        categoryId: cat,
        discount: i.discount,
      };
    });
  }

  /** Tổng (giá + discount dòng) * SL — dùng cho min_order & rule KM */
  private subtotalForPromotionRules(): number {
    return this.lineItemsAsCartLike().reduce((s, it) => {
      const p = Number(it.price) || 0;
      const d = Number(it.discount) || 0;
      const q = Number(it.quantity) || 1;
      return s + (p + d) * q;
    }, 0);
  }

  rebuildApplicablePromotions() {
    if (!this.isCreateMode) return;
    const items = this.lineItemsAsCartLike();
    const subRules = this.subtotalForPromotionRules();
    this.applicablePromotions = buildApplicablePromotionsForAdminOrder(
      this.activePromotions,
      items,
      subRules,
      this.promoCategories,
      this.productIdsByGroupMap,
      false,
    );
    if (this.selectedPromotionId) {
      const ap = this.applicablePromotions.find((p) => String(p._id) === String(this.selectedPromotionId));
      if (!ap?.isApplicable) {
        this.selectedPromotionId = '';
        this.syncPromotionFieldsFromSelection();
        this.showNotification('Mã khuyến mãi không còn áp dụng cho đơn hàng hiện tại.', 'warning');
      }
    }
    this.calculateTotal();
    this.cdr.markForCheck();
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
          this.syncLocationCascadesFromShipping();
          this.rebuildApplicablePromotions();
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

  syncPromotionFieldsFromSelection() {
    if (!this.selectedPromotionId) {
      this.newOrder.code = '';
      this.newOrder.name = '';
      this.newOrder.promotion = [];
      return;
    }
    const ap = this.applicablePromotions.find((p) => String(p._id) === String(this.selectedPromotionId));
    if (!ap || !ap.isApplicable) {
      this.newOrder.code = '';
      this.newOrder.name = '';
      this.newOrder.promotion = [];
      return;
    }
    this.newOrder.code = ap.code || '';
    this.newOrder.name = (ap as any).promotion_name || ap.name || '';
    const promoId = String(ap.promotion_id || ap._id || '');
    this.newOrder.promotion = [{ promotion_id: promoId, promotionId: promoId, code: ap.code }];
  }

  getSelectedPromotionName(): string {
    if (!this.selectedPromotionId) return '';
    const ap = this.applicablePromotions.find((p) => String(p._id) === String(this.selectedPromotionId));
    if (ap?.isApplicable) return (ap as any).promotion_name || ap.name || '';
    const promo = this.activePromotions.find((p) => p._id === this.selectedPromotionId);
    return promo ? (promo.promotion_name || promo.name || '') : '';
  }

  /** Giá trị hàng trước voucher (đồng bộ cách tính phí ship trang /order my-user) */
  calculateSubtotal(): number {
    return this.newOrder.item.reduce((sum: number, i: any) => {
      const p = Number(i.price) || 0;
      const q = Number(i.quantity) || 1;
      return sum + p * q;
    }, 0);
  }

  calculateTotal() {
    const items = this.newOrder.item || [];
    const subtotalGross = items.reduce((s: number, i: any) => {
      const p = Number(i.price) || 0;
      const d = Number(i.discount) || 0;
      const q = Number(i.quantity) || 1;
      return s + (p + d) * q;
    }, 0);
    const directLineSum = items.reduce((s: number, i: any) => {
      const d = Number(i.discount) || 0;
      const q = Number(i.quantity) || 1;
      return s + d * q;
    }, 0);
    const directDiscountPos = Math.max(0, -directLineSum);

    const ap = this.selectedPromotionId
      ? this.applicablePromotions.find((p) => String(p._id) === String(this.selectedPromotionId))
      : null;
    const valid = !!(ap?.isApplicable);
    const scope = String(ap?.scope || 'order').toLowerCase();
    const orderVoucher = valid && scope === 'order' ? Math.floor(Number(ap!.discountAmount) || 0) : 0;
    const shipVoucher = valid && scope === 'shipping' ? Math.floor(Number(ap!.discountAmount) || 0) : 0;

    const vita = 0;
    const totalAfterDeductions = Math.max(0, subtotalGross - directDiscountPos - orderVoucher - vita);
    const shippingGross =
      totalAfterDeductions > ADMIN_ORDER_FREE_SHIPPING_THRESHOLD ? 0 : ADMIN_ORDER_DEFAULT_SHIPPING_FEE;
    const shippingNet = Math.max(0, shippingGross - shipVoucher);

    this.newOrder.subtotal = Math.round(subtotalGross);
    this.newOrder.directDiscount = Math.round(directDiscountPos);
    this.newOrder.voucherDiscount = Math.round(orderVoucher);
    this.newOrder.vitaXuDiscount = vita;
    this.newOrder.shippingDiscount = shippingGross > 0 ? Math.min(shipVoucher, shippingGross) : 0;
    this.newOrder.shippingFee = Math.round(shippingNet);
    this.newOrder.totalAmount = Math.round(totalAfterDeductions + shippingNet);
    this.newOrder.discount = Math.round(orderVoucher + this.newOrder.shippingDiscount);
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
        this.syncLocationCascadesFromShipping();
      },
      error: (err) => console.error('Error loading locations:', err)
    });
  }

  /** Đồng bộ quận/phường khi mở form sửa (API đơn + danh sách tỉnh load lệch thời điểm). */
  syncLocationCascadesFromShipping() {
    const s = this.newOrder?.shippingInfo;
    if (!s || !this.cities?.length) return;
    const city = this.cities.find((c: any) => c.name_with_type === s.city);
    if (city && city['quan-huyen']) {
      this.districts = city['quan-huyen'];
      const dist = this.districts.find((d: any) => d.name_with_type === s.district);
      if (dist && dist['xa-phuong']) {
        this.wards = dist['xa-phuong'];
      } else {
        this.wards = [];
      }
    } else {
      this.districts = [];
      this.wards = [];
    }
  }

  toggleCreateSelect(key: string, event: MouseEvent) {
    event.stopPropagation();
    this.openCreateSelect = this.openCreateSelect === key ? null : key;
  }

  pickPayment(value: string, event: MouseEvent) {
    event.stopPropagation();
    this.newOrder.paymentMethod = value;
    this.openCreateSelect = null;
  }

  pickPromotion(id: string, event: MouseEvent) {
    event.stopPropagation();
    if (id) {
      const ap = this.applicablePromotions.find((p) => String(p._id) === String(id));
      if (!ap?.isApplicable) return;
    }
    this.selectedPromotionId = id;
    this.syncPromotionFieldsFromSelection();
    this.calculateTotal();
    this.openCreateSelect = null;
  }

  paymentMethodDisplayLabel(): string {
    const o = this.paymentOptions.find(p => p.value === this.newOrder.paymentMethod);
    return o ? o.label : (this.newOrder.paymentMethod || '');
  }

  promotionTriggerLabel(): string {
    if (!this.selectedPromotionId) return '';
    const ap = this.applicablePromotions.find((x) => String(x._id) === String(this.selectedPromotionId));
    if (ap?.isApplicable) return `${ap.code} — ${(ap as any).promotion_name || ap.name || ''}`;
    const p = this.activePromotions.find((x) => x._id === this.selectedPromotionId);
    return p ? `${p.code} — ${p.promotion_name || p.name || ''}` : '';
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
        if (this.isCreateMode) this.rebuildApplicablePromotions();
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
      if (this.isCreateMode) this.rebuildApplicablePromotions();
      else this.calculateTotal();
      this.closeProductModal();
      return;
    } else {
      this.newOrder.item.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        image: product.image || (product.gallery && product.gallery[0] ? product.gallery[0] : ''),
        price: product.price || 0,
        quantity: 1,
        categoryId: product.categoryId || product.category || '',
        discount: Number(product.discount) || 0,
      });
    }
    if (this.isCreateMode) this.rebuildApplicablePromotions();
    else this.calculateTotal();
    this.closeProductModal();
  }

  removeProduct(index: number) {
    this.newOrder.item.splice(index, 1);
    if (this.isCreateMode) this.rebuildApplicablePromotions();
    else this.calculateTotal();
  }

  updateTotal() {
    if (this.isCreateMode) this.rebuildApplicablePromotions();
    else this.calculateTotal();
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

    this.rebuildApplicablePromotions();
    if (this.selectedPromotionId) {
      const ap = this.applicablePromotions.find((p) => String(p._id) === String(this.selectedPromotionId));
      if (!ap?.isApplicable) {
        this.showNotification('Mã khuyến mãi không hợp lệ cho đơn hàng này.', 'warning');
        return;
      }
    }
    this.calculateTotal();
    const pm = String(this.newOrder.paymentMethod || 'cod').toLowerCase();
    const payload = {
      ...this.newOrder,
      paymentMethod: pm === 'banking' ? 'banking' : 'cod',
      atPharmacy: Boolean(this.newOrder.atPharmacy),
    };
    this.isLoading = true;
    this.orderService.createOrder(payload).subscribe({
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

    this.rebuildApplicablePromotions();
    if (this.selectedPromotionId) {
      const ap = this.applicablePromotions.find((p) => String(p._id) === String(this.selectedPromotionId));
      if (!ap?.isApplicable) {
        this.showNotification('Mã khuyến mãi không hợp lệ cho đơn hàng này.', 'warning');
        return;
      }
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
