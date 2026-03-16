import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CartService, Cart, CartItem } from '../../../core/services/cart.service';
import { BuyNowService } from '../../../core/services/buy-now.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';

import { StoreService, StoreFilter } from '../../../core/services/store.service';
import { Store } from '../../../core/models/store.model';

interface AddressItem {
  _id: string;
  user_id?: string;
  name?: string;
  full_name?: string;
  phone?: string;
  email?: string;
  fullAddress?: string;
  full_address?: string;
  province?: string;
  district?: string;
  ward?: string;
  detail?: string;
  isDefault?: boolean;
  is_default?: boolean;
  [key: string]: any;
}

interface LocationItem {
  code: string;
  name: string;
  name_with_type: string;
}

// Fallback interfaces if the API still uses them, but we will mostly use the StoreService tree
interface PharmacyProvince {
  code: string;
  name: string;
}
interface PharmacyWard {
  ward: string;
  district: string;
}

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './order.html',
  styleUrl: './order.css',
})
export class Order implements OnInit, OnDestroy {
  private router = inject(Router);
  private cartService = inject(CartService);
  private buyNowService = inject(BuyNowService);
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private toastService = inject(ToastService);
  private storeService = inject(StoreService);
  private location = inject(Location);

  cart: Cart | null = null;
  cartLoading = true;
  totalPrice = 0;
  /** Các thông tin tổng tiền/giảm giá lấy từ giỏ hàng (cart sidebar) */
  cartSubtotal = 0;
  cartDirectDiscount = 0;
  cartVoucherDiscount = 0;
  isBuyNow = false;
  deliveryTab: 'home' | 'pharmacy' = 'home';
  paymentMethod = '';
  requestInvoice = false;
  hideProductInfo = false;

  recipientNamePhone = '';
  recipientAddress = '';
  isDefaultAddress = false;
  showAddressModal = false;
  addressList: AddressItem[] = [];
  selectedAddressId: string | null = null;
  addressModalLoading = false;

  showAddressFormModal = false;
  addressFormMode: 'create' | 'edit' = 'create';
  editingAddressId: string | null = null;
  provinces: LocationItem[] = [];
  districts: LocationItem[] = [];
  wards: LocationItem[] = [];
  addressForm = {
    name: '', phone: '', email: '', provinceCode: '', districtCode: '', wardCode: '', detail: '', isDefault: false,
  };
  addressFormPhoneError = '';
  orderNote = '';

  private confirmService = inject(ConfirmService);

  payerName = '';
  payerPhone = '';

  // New Store filtering logic
  pharmacyProvince = '';
  pharmacyDistrict = '';
  pharmacyWard = '';

  allPharmacyLocations: any[] = [];
  availableDistricts: any[] = [];
  availableWards: string[] = [];

  availableStores: Store[] = [];
  selectedStore: Store | null = null;
  storeSearchKeyword = '';

  /** Thời gian nhận hàng dự kiến */
  deliveryDates: { date: Date; label: string }[] = [];
  /** Khung giờ nhận hàng: 08:00–20:00 (không có sau 20h) */
  deliveryTimeSlots = [
    '08:00 - 09:00', '09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00',
    '12:00 - 13:00', '13:00 - 14:00', '14:00 - 15:00', '15:00 - 16:00',
    '16:00 - 17:00', '17:00 - 18:00', '18:00 - 19:00', '19:00 - 20:00',
  ];
  selectedDeliveryDateIdx = 0;
  selectedTimeSlot = '08:00 - 09:00';
  showDeliveryTimeModal = false;
  /** Giá trị tạm trong popup (chỉ apply khi bấm Xác nhận) */
  tempDateIdx = 0;
  tempTimeSlot = '08:00 - 09:00';

  /** Trạng thái submit đơn hàng */
  isSubmitting = false;
  /** Lỗi validation hiển thị khi thiếu field bắt buộc */
  validationErrors: string[] = [];
  /** Popup đặt hàng thành công */
  showOrderSuccess = false;
  successOrderId = '';

  /** Popup thanh toán QR cho các phương thức không phải COD */
  showQrPaymentModal = false;
  /** Payload đơn hàng tạm thời, chỉ gửi sau khi user bấm \"Đã thanh toán\" */
  private pendingOrderPayload: any | null = null;

  private readonly bodyClass = 'vitacare-order-page';

  /** Ngưỡng đơn hàng để miễn phí vận chuyển (đ) */
  static readonly FREE_SHIPPING_THRESHOLD = 300_000;
  /** Phí vận chuyển mặc định khi đơn < ngưỡng (đ) */
  static readonly DEFAULT_SHIPPING_FEE = 30_000;

  /** Phí vận chuyển: 0 nếu tổng đơn > 300000, ngược lại DEFAULT_SHIPPING_FEE */
  get shippingFee(): number {
    return this.totalPrice > Order.FREE_SHIPPING_THRESHOLD ? 0 : Order.DEFAULT_SHIPPING_FEE;
  }

  /** Tổng thành tiền = tổng đơn + phí vận chuyển */
  get orderTotal(): number {
    return this.totalPrice + this.shippingFee;
  }

  /** Có phải phương thức thanh toán online (không phải thanh toán khi nhận hàng) hay không */
  get isOnlinePayment(): boolean {
    return !!this.paymentMethod && this.paymentMethod !== 'cod';
  }

  /** Nhãn hiển thị cho phương thức thanh toán đang chọn (dùng trong popup QR) */
  get paymentMethodLabel(): string {
    switch (this.paymentMethod) {
      case 'qr':
        return 'Thanh toán bằng chuyển khoản (QR Code)';
      case 'momo':
        return 'Thanh toán bằng ví MoMo';
      case 'zalopay':
        return 'Thanh toán bằng ví ZaloPay';
      case 'card':
        return 'Thanh toán bằng thẻ quốc tế / Apple Pay';
      case 'atm':
        return 'Thanh toán bằng thẻ ATM nội địa, NAPAS';
      case 'vnpay':
        return 'Thanh toán bằng cổng VNPay';
      case 'cod':
      default:
        return 'Thanh toán tiền mặt khi nhận hàng';
    }
  }

  /** Label hiển thị thời gian nhận hàng đã chọn */
  get deliveryTimeLabel(): string {
    const d = this.deliveryDates[this.selectedDeliveryDateIdx];
    if (!d) return '';
    return `Từ ${this.selectedTimeSlot} ${d.label}`;
  }

  /** Label preview trong popup */
  get tempDeliveryTimeLabel(): string {
    const d = this.deliveryDates[this.tempDateIdx];
    if (!d) return '';
    return `Từ ${this.tempTimeSlot} ${d.label}`;
  }

  /**
   * Tính thời gian nhận hàng dự kiến: +72h từ hiện tại,
   * snap vào giờ hành chính 8:00–18:00.
   */
  private initDeliveryTime(): void {
    const now = new Date();
    const earliest = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    if (earliest.getHours() < 8) {
      earliest.setHours(8, 0, 0, 0);
    } else if (earliest.getHours() >= 18) {
      earliest.setDate(earliest.getDate() + 1);
      earliest.setHours(8, 0, 0, 0);
    } else {
      earliest.setMinutes(0, 0, 0);
    }

    const startDate = new Date(earliest);
    startDate.setHours(0, 0, 0, 0);

    this.deliveryDates = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      this.deliveryDates.push({ date: d, label: this.formatViDate(d) });
    }

    this.selectedDeliveryDateIdx = 0;
    const h = earliest.getHours();
    const slotH = Math.max(8, Math.min(h, 19));
    this.selectedTimeSlot = `${String(slotH).padStart(2, '0')}:00 - ${String(slotH + 1).padStart(2, '0')}:00`;
    this.tempDateIdx = this.selectedDeliveryDateIdx;
    this.tempTimeSlot = this.selectedTimeSlot;
  }

  private formatViDate(date: Date): string {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${days[date.getDay()]}, ${d}/${m}/${y}`;
  }

  openDeliveryTimeModal(): void {
    this.tempDateIdx = this.selectedDeliveryDateIdx;
    this.tempTimeSlot = this.selectedTimeSlot;
    this.showDeliveryTimeModal = true;
    this.cdr.detectChanges();
  }

  closeDeliveryTimeModal(): void {
    this.showDeliveryTimeModal = false;
  }

  confirmDeliveryTime(): void {
    this.selectedDeliveryDateIdx = this.tempDateIdx;
    this.selectedTimeSlot = this.tempTimeSlot;
    this.showDeliveryTimeModal = false;
    this.cdr.detectChanges();
  }

  /** Khách vãng lai (chưa đăng nhập) */
  get isGuest(): boolean {
    return !this.authService.currentUser()?.user_id;
  }

  ngOnInit() {
    document.body.classList.add(this.bodyClass);
    this.initDeliveryTime();
    const user = this.authService.currentUser();
    this.cartLoading = true;

    if (user?.user_id) {
      const u = user as any;
      this.payerName = u.full_name || u.name || '';
      this.payerPhone = u.phone || '';
      this.loadDefaultAddress(user.user_id);
    } else {
      this.payerName = '';
      this.payerPhone = '';
      this.recipientNamePhone = '';
      this.recipientAddress = '';
    }

    this.loadProvinces();

    // Load store locations tree
    this.storeService.getLocations().subscribe({
      next: (data: any[]) => {
        this.allPharmacyLocations = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error loading store locations', err)
    });

    const buyNowItems = this.buyNowService.getItems();
    if (buyNowItems.length > 0) {
      this.isBuyNow = true;
      const items = buyNowItems.map(i => ({
        ...i,
        productName: i.productName || (i as any).name || '',
      })) as CartItem[];
      this.cart = {
        user_id: user?.user_id || 'guest',
        items,
        itemCount: items.length,
        totalQuantity: items.reduce((s, i) => s + (i.quantity || 1), 0),
      };
      const summary = this.buyNowService.getSummary();
      if (summary) {
        this.cartSubtotal = summary.subtotal || 0;
        this.cartDirectDiscount = summary.directDiscount || 0;
        this.cartVoucherDiscount = summary.voucherDiscount || 0;
        this.totalPrice = Math.max(
          0,
          (this.cartSubtotal || 0) - (this.cartDirectDiscount || 0) - (this.cartVoucherDiscount || 0),
        );
      } else {
        // Fallback: tính toán lại nếu không có summary (trường hợp vào /order trực tiếp)
        this.cartSubtotal = items.reduce(
          (s, i) => s + ((i.price || 0) + (i.discount || 0)) * (i.quantity || 1),
          0,
        );
        this.cartDirectDiscount = items.reduce(
          (s, i) => s + (i.discount || 0) * (i.quantity || 1),
          0,
        );
        this.cartVoucherDiscount = 0;
        this.totalPrice = this.cartSubtotal - this.cartDirectDiscount;
      }
      this.cartLoading = false;
      return;
    }

    if (user?.user_id) {
      this.cartService.getCart(user.user_id).subscribe({
        next: res => {
          this.cartLoading = false;
          if (!res.success) return;
          const raw = res as { success: boolean; cart?: Cart; items?: CartItem[]; itemCount?: number; totalQuantity?: number };
          if (raw.cart) {
            this.cart = raw.cart;
          } else {
            this.cart = {
              user_id: user.user_id,
              items: raw.items ?? [],
              itemCount: raw.itemCount ?? 0,
              totalQuantity: raw.totalQuantity ?? 0,
            };
          }
          this.totalPrice = (this.cart?.items || []).reduce(
            (s, i) => s + (i.price || 0) * (i.quantity || 1),
            0
          );
          this.cdr.detectChanges();
        },
        error: () => {
          this.cartLoading = false;
          this.cart = { user_id: user.user_id, items: [], itemCount: 0, totalQuantity: 0 };
          this.cdr.detectChanges();
        },
      });
    } else {
      // Khách vãng lai: lấy giỏ từ localStorage
      const guestItems = this.cartService.getGuestCartItems();
      this.cart = {
        user_id: 'guest',
        items: guestItems,
        itemCount: guestItems.length,
        totalQuantity: guestItems.reduce((s, i) => s + (i.quantity || 1), 0),
      };
      this.totalPrice = (guestItems || []).reduce(
        (s, i) => s + (i.price || 0) * (i.quantity || 1),
        0
      );
      this.cartLoading = false;
      this.cdr.detectChanges();
    }
  }

  /** Tải địa chỉ mặc định từ MongoDB và cache danh sách để popup hiển thị ngay khi mở */
  private loadDefaultAddress(userId: string): void {
    this.http.get<{ success: boolean; items?: AddressItem[] }>('/api/addresses', { params: { user_id: userId } }).subscribe({
      next: res => {
        const items = res.items || [];
        this.addressList = items;
        const defaultAddr = items.find(a => a.isDefault === true || (a as any).is_default === true) || items[0];
        if (defaultAddr) {
          const name = defaultAddr.name || (defaultAddr as any).full_name || '';
          const phone = defaultAddr.phone || '';
          this.recipientNamePhone = name ? `${name} - ${phone}` : phone;
          this.recipientAddress = defaultAddr.fullAddress || (defaultAddr as any).full_address || '';
          this.isDefaultAddress = true;
        } else {
          this.recipientNamePhone = '';
          this.recipientAddress = '';
          this.isDefaultAddress = false;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.addressList = [];
        this.recipientNamePhone = '';
        this.recipientAddress = '';
        this.isDefaultAddress = false;
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy() {
    document.body.classList.remove(this.bodyClass);
    if (this.isBuyNow) {
      this.buyNowService.clear();
    }
  }

  /** Mở popup danh sách địa chỉ: hiển thị ngay từ cache (đã tải khi load trang), refresh nền nếu cần */
  openAddressList(): void {
    const user = this.authService.currentUser();
    if (!user?.user_id) return;
    this.showAddressModal = true;
    this.updateSelectedAddressFromRecipient();
    if (this.addressList.length > 0) {
      this.addressModalLoading = false;
      this.cdr.detectChanges();
      this.refreshAddressListInBackground(user.user_id);
      return;
    }
    this.addressModalLoading = true;
    this.cdr.detectChanges();
    this.http.get<{ success: boolean; items?: AddressItem[] }>('/api/addresses', { params: { user_id: user.user_id } }).subscribe({
      next: res => {
        this.addressModalLoading = false;
        this.addressList = res.items || [];
        this.updateSelectedAddressFromRecipient();
        this.cdr.detectChanges();
      },
      error: () => {
        this.addressModalLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private updateSelectedAddressFromRecipient(): void {
    this.selectedAddressId = null;
    const currentName = this.recipientNamePhone?.split(' - ')[0]?.trim();
    const currentAddr = this.recipientAddress?.trim();
    const match = this.addressList.find(a => {
      const name = a.name || (a as any).full_name || '';
      const phone = a.phone || '';
      const namePhone = name ? `${name} - ${phone}` : phone;
      const fullAddr = a.fullAddress || (a as any).full_address || '';
      return namePhone === this.recipientNamePhone || (fullAddr === currentAddr && (currentName ? name.includes(currentName) : true));
    });
    if (match) this.selectedAddressId = match._id;
  }

  private refreshAddressListInBackground(userId: string): void {
    this.http.get<{ success: boolean; items?: AddressItem[] }>('/api/addresses', { params: { user_id: userId } }).subscribe({
      next: res => {
        this.addressList = res.items || [];
        this.updateSelectedAddressFromRecipient();
        this.cdr.detectChanges();
      },
    });
  }

  closeAddressModal(): void {
    this.showAddressModal = false;
  }

  /** Chọn một địa chỉ trong list (đánh dấu để Xác nhận áp dụng) */
  selectAddress(addr: AddressItem): void {
    this.selectedAddressId = addr._id;
  }

  /** Áp dụng địa chỉ đã chọn và đóng popup */
  confirmAddressSelection(): void {
    const addr = this.addressList.find(a => a._id === this.selectedAddressId);
    if (addr) {
      const name = addr.name || (addr as any).full_name || '';
      const phone = addr.phone || '';
      this.recipientNamePhone = name ? `${name} - ${phone}` : phone;
      this.recipientAddress = addr.fullAddress || (addr as any).full_address || '';
      this.isDefaultAddress = !!addr.isDefault || !!(addr as any).is_default;
    }
    this.closeAddressModal();
    this.cdr.detectChanges();
  }

  /** Mở form thêm địa chỉ mới (đóng list popup trước) */
  openAddressFormCreate(): void {
    this.closeAddressModal();
    this.addressFormMode = 'create';
    this.editingAddressId = null;
    this.resetAddressForm();
    const user = this.authService.currentUser() as any;
    if (user) {
      this.addressForm.name = user.full_name || user.name || '';
      this.addressForm.phone = user.phone || '';
      this.addressForm.email = user.email || '';
    }
    if (this.addressList.length === 0) this.addressForm.isDefault = true;
    this.showAddressFormModal = true;
    this.cdr.detectChanges();
  }

  /** Mở form sửa địa chỉ */
  openAddressFormEdit(addr: AddressItem, e?: Event): void {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    this.closeAddressModal();
    this.addressFormMode = 'edit';
    this.editingAddressId = addr._id;
    this.addressForm = {
      name: addr.name || (addr as any).full_name || '',
      phone: addr.phone || '',
      email: addr.email || '',
      provinceCode: '',
      districtCode: '',
      wardCode: '',
      detail: addr.detail || addr.fullAddress || (addr as any).full_address || '',
      isDefault: !!(addr.isDefault ?? (addr as any).is_default),
    };
    this.districts = [];
    this.wards = [];
    this.showAddressFormModal = true;
    this.cdr.detectChanges();
    const prov = addr.province;
    if (prov) {
      const p = this.provinces.find(x => (x.name_with_type && x.name_with_type === prov) || x.name === prov);
      if (p) {
        this.addressForm.provinceCode = p.code;
        this.http.get<{ success: boolean; items: LocationItem[] }>('/api/locations/districts', { params: { province_code: p.code } }).subscribe({
          next: res => {
            this.districts = res.items || [];
            const dist = addr.district;
            if (dist) {
              const d = this.districts.find(x => (x.name_with_type && x.name_with_type === dist) || x.name === dist);
              if (d) {
                this.addressForm.districtCode = d.code;
                this.http.get<{ success: boolean; items: LocationItem[] }>('/api/locations/wards', { params: { province_code: p.code, district_code: d.code } }).subscribe({
                  next: wr => {
                    this.wards = wr.items || [];
                    const w = addr.ward;
                    if (w) {
                      const wardItem = this.wards.find(x => (x.name_with_type && x.name_with_type === w) || x.name === w);
                      if (wardItem) this.addressForm.wardCode = wardItem.code;
                    }
                    this.cdr.detectChanges();
                  },
                });
              }
            }
            this.cdr.detectChanges();
          },
        });
      }
    }
  }

  closeAddressFormModal(): void {
    this.showAddressFormModal = false;
    this.resetAddressForm();
    this.cdr.detectChanges();
  }

  private resetAddressForm(): void {
    this.addressForm = { name: '', phone: '', email: '', provinceCode: '', districtCode: '', wardCode: '', detail: '', isDefault: false };
    this.districts = [];
    this.wards = [];
  }

  private loadProvinces(): void {
    this.http.get<{ success: boolean; items: LocationItem[] }>('/api/locations/provinces').subscribe({
      next: res => { this.provinces = res.items || []; this.cdr.detectChanges(); },
      error: () => { this.provinces = []; this.cdr.detectChanges(); },
    });
  }

  onAddressFormProvinceChange(code: string): void {
    this.addressForm.provinceCode = code;
    this.addressForm.districtCode = '';
    this.addressForm.wardCode = '';
    this.districts = [];
    this.wards = [];
    if (!code) { this.cdr.detectChanges(); return; }
    this.http.get<{ success: boolean; items: LocationItem[] }>('/api/locations/districts', { params: { province_code: code } }).subscribe({
      next: res => { this.districts = res.items || []; this.cdr.detectChanges(); },
      error: () => { this.districts = []; this.cdr.detectChanges(); },
    });
  }

  onAddressFormDistrictChange(code: string): void {
    this.addressForm.districtCode = code;
    this.addressForm.wardCode = '';
    this.wards = [];
    if (!code || !this.addressForm.provinceCode) { this.cdr.detectChanges(); return; }
    this.http.get<{ success: boolean; items: LocationItem[] }>('/api/locations/wards', { params: { province_code: this.addressForm.provinceCode, district_code: code } }).subscribe({
      next: res => { this.wards = res.items || []; this.cdr.detectChanges(); },
      error: () => { this.wards = []; this.cdr.detectChanges(); },
    });
  }

  // --- Pharmacy / Store Filter Logic ---

  onPharmacyProvinceChange(tinh: string): void {
    this.pharmacyProvince = tinh;
    this.pharmacyDistrict = '';
    this.pharmacyWard = '';
    this.availableDistricts = [];
    this.availableWards = [];
    this.availableStores = [];
    this.selectedStore = null;

    if (tinh) {
      const loc = this.allPharmacyLocations.find(l => l.tinh === tinh);
      if (loc) {
        this.availableDistricts = loc.quans.sort((a: any, b: any) => a.ten.localeCompare(b.ten));
      }
    }
    this.cdr.detectChanges();
    this.loadAvailableStores();
  }

  onPharmacyDistrictChange(quan: string): void {
    this.pharmacyDistrict = quan;
    this.pharmacyWard = '';
    this.availableWards = [];
    this.availableStores = [];
    this.selectedStore = null;

    if (quan && this.availableDistricts.length) {
      const q = this.availableDistricts.find(a => a.ten === quan);
      if (q) {
        this.availableWards = q.phuongs.sort();
      }
    }
    this.cdr.detectChanges();
    this.loadAvailableStores();
  }

  onPharmacyWardChange(phuong: string): void {
    this.pharmacyWard = phuong;
    this.selectedStore = null;
    this.availableStores = [];
    this.cdr.detectChanges();
    this.loadAvailableStores();
  }

  loadAvailableStores(): void {
    if (!this.pharmacyProvince) {
      this.availableStores = [];
      return;
    }

    const filter: StoreFilter = {
      keyword: this.storeSearchKeyword,
      tinh_thanh: this.pharmacyProvince,
      quan_huyen: this.pharmacyDistrict,
      phuong_xa: this.pharmacyWard,
      page: 1,
      limit: 100
    };

    this.storeService.getStores(filter).subscribe({
      next: (res) => {
        this.availableStores = res.data || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load stores for pickup', err)
    });
  }

  selectStore(store: Store): void {
    this.selectedStore = store;
    this.cdr.detectChanges();
  }

  onStoreKeywordChange(): void {
    this.loadAvailableStores();
  }

  /** Ràng buộc SĐT: ít nhất 10 chữ số, chỉ số. Trả về true nếu hợp lệ. */
  validateAddressFormPhone(): boolean {
    const raw = (this.addressForm.phone || '').trim();
    if (raw === '') {
      this.addressFormPhoneError = 'Vui lòng nhập số điện thoại.';
      this.cdr.detectChanges();
      return false;
    }
    const digitsOnly = raw.replace(/\s/g, '');
    if (!/^\d+$/.test(digitsOnly)) {
      this.addressFormPhoneError = 'Số điện thoại chỉ được chứa chữ số.';
      this.cdr.detectChanges();
      return false;
    }
    if (digitsOnly.length < 10) {
      this.addressFormPhoneError = 'Số điện thoại phải có ít nhất 10 chữ số.';
      this.cdr.detectChanges();
      return false;
    }
    this.addressFormPhoneError = '';
    this.cdr.detectChanges();
    return true;
  }

  submitAddressForm(): void {
    if (!this.validateAddressFormPhone()) return;

    const provinceLabel = this.provinces.find(p => p.code === this.addressForm.provinceCode)?.name_with_type || '';
    const districtLabel = this.districts.find(d => d.code === this.addressForm.districtCode)?.name_with_type || '';
    const wardLabel = this.wards.find(w => w.code === this.addressForm.wardCode)?.name_with_type || '';
    const fullAddressParts = [this.addressForm.detail, wardLabel, districtLabel, provinceLabel].filter(Boolean);
    const fullAddress = fullAddressParts.join(', ');

    const user = this.authService.currentUser();
    if (!user?.user_id) return;

    if (this.addressFormMode === 'edit' && this.editingAddressId) {
      this.http.patch<{ success: boolean; item?: AddressItem }>(`/api/addresses/${this.editingAddressId}`, {
        name: this.addressForm.name,
        phone: this.addressForm.phone,
        email: this.addressForm.email || undefined,
        detail: this.addressForm.detail,
        fullAddress,
        province: provinceLabel || undefined,
        district: districtLabel || undefined,
        ward: wardLabel || undefined,
        isDefault: this.addressForm.isDefault,
      }).subscribe({
        next: () => {
          this.toastService.showSuccess('Cập nhật địa chỉ thành công');
          this.closeAddressFormModal();
          this.openAddressList();
          this.cdr.detectChanges();
        },
        error: () => {
          this.toastService.showError('Không thể cập nhật địa chỉ. Vui lòng thử lại.');
        },
      });
      return;
    }

    const isDefault = this.addressForm.isDefault || this.addressList.length === 0;
    this.http.post<{ success: boolean; item?: AddressItem }>('/api/addresses', {
      user_id: user.user_id,
      name: this.addressForm.name,
      phone: this.addressForm.phone,
      email: this.addressForm.email || undefined,
      detail: this.addressForm.detail,
      fullAddress,
      province: provinceLabel || undefined,
      district: districtLabel || undefined,
      ward: wardLabel || undefined,
      isDefault,
    }).subscribe({
      next: () => {
        this.toastService.showSuccess('Thêm địa chỉ mới thành công');
        this.closeAddressFormModal();
        this.openAddressList();
        this.cdr.detectChanges();
      },
      error: () => {
        this.toastService.showError('Không thể lưu địa chỉ mới. Vui lòng thử lại.');
      },
    });
  }

  /** Xóa địa chỉ (trong list popup) - có thể mở rộng gọi API DELETE sau */
  deleteAddress(addr: AddressItem, e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.confirmService.open('Bạn có chắc chắn muốn xóa địa chỉ này?', () => {
      this.http.delete(`/api/addresses/${addr._id}`).subscribe({
        next: () => {
          this.addressList = this.addressList.filter(a => a._id !== addr._id);
          this.toastService.showSuccess('Đã xóa địa chỉ.');
          if (this.selectedAddressId === addr._id) {
            this.selectedAddressId = null;
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.toastService.showError('Không thể xóa địa chỉ.');
          this.cdr.detectChanges();
        },
      });
    });
  }

  goBack() {
    if (this.showOrderSuccess) {
      this.router.navigate(['/']);
      return;
    }
    this.location.back();
  }

  /** Nhãn hiển thị phí vận chuyển: "Miễn phí" hoặc "0₫" khi miễn phí, ngược lại số tiền */
  get shippingFeeLabel(): string {
    return this.shippingFee === 0 ? 'Miễn phí' : (this.shippingFee | 0).toString();
  }

  /** Validate tất cả field bắt buộc trước khi đặt hàng */
  private validateOrder(): boolean {
    this.validationErrors = [];

    if (!this.cart?.items?.length) {
      this.validationErrors.push('Chưa có sản phẩm trong đơn hàng.');
    }

    if (this.deliveryTab === 'home') {
      if (!this.recipientNamePhone.trim()) {
        this.validationErrors.push('Vui lòng nhập tên và SĐT người nhận.');
      }
      if (!this.recipientAddress.trim()) {
        this.validationErrors.push('Vui lòng nhập địa chỉ người nhận.');
      }
    } else {
      if (!this.payerName.trim()) {
        this.validationErrors.push('Vui lòng nhập tên người đặt.');
      }
      if (!this.payerPhone.trim()) {
        this.validationErrors.push('Vui lòng nhập SĐT người đặt.');
      }
      if (!this.pharmacyProvince) {
        this.validationErrors.push('Vui lòng chọn Tỉnh/Thành phố của nhà thuốc.');
      }
      if (!this.selectedStore) {
        this.validationErrors.push('Vui lòng chọn một nhà thuốc để đến nhận hàng.');
      }
    }

    if (!this.paymentMethod) {
      this.validationErrors.push('Vui lòng chọn phương thức thanh toán.');
    }

    this.cdr.detectChanges();
    return this.validationErrors.length === 0;
  }

  /** Đặt hàng: validate → (nếu COD thì gọi API ngay, nếu online thì mở popup QR) */
  placeOrder(): void {
    if (!this.validateOrder()) {
      this.toastService.showError(this.validationErrors[0]);
      return;
    }
    if (this.isSubmitting) return;

    const user = this.authService.currentUser();
    const userId = user?.user_id || null;

    const nameParts = this.recipientNamePhone.split('-').map(s => s.trim());
    const fullName = nameParts[0] || '';
    const phone = nameParts[1] || '';

    const payload: any = {
      user_id: userId,
      paymentMethod: this.paymentMethod,
      statusPayment: this.paymentMethod === 'cod' ? 'unpaid' : 'paid',
      atPharmacy: this.deliveryTab === 'pharmacy',
      pharmacyAddress: this.deliveryTab === 'pharmacy' && this.selectedStore
        ? `${this.selectedStore.ten_cua_hang} - ${this.selectedStore.dia_chi?.dia_chi_day_du}, ${this.selectedStore.dia_chi?.phuong_xa}, ${this.selectedStore.dia_chi?.quan_huyen}, ${this.selectedStore.dia_chi?.tinh_thanh}`
        : '',
      subtotal: this.cartSubtotal, // Original price of all items
      directDiscount: this.cartDirectDiscount,
      voucherDiscount: this.cartVoucherDiscount,
      shippingFee: this.shippingFee,
      shippingDiscount: this.shippingFee === 0 ? Order.DEFAULT_SHIPPING_FEE : 0,
      totalAmount: this.orderTotal,
      status: 'pending',
      note: this.orderNote || '',
      estimatedDelivery: this.deliveryTimeLabel,
      requestInvoice: this.requestInvoice,
      hideProductInfo: this.hideProductInfo,
      item: (this.cart?.items || []).map(i => ({
        _id: i._id,
        sku: i.sku || '',
        productName: i.productName || '',
        quantity: i.quantity || 1,
        price: i.price || 0,
        unit: i.unit || 'Hộp',
        hasPromotion: i.hasPromotion || false,
        image: i.image || '',
        slug: (i as any).slug || '',
      })),
      shippingInfo: this.deliveryTab === 'home' ? {
        fullName,
        phone,
        address: this.recipientAddress,
      } : {
        fullName: this.payerName,
        phone: this.payerPhone,
        address: '',
      },
    };
    // Nếu thanh toán COD: gửi đơn hàng luôn
    if (!this.isOnlinePayment) {
      this.isSubmitting = true;
      this.submitOrderToServer(payload);
      return;
    }

    // Thanh toán online: lưu payload tạm và mở popup QR để user thanh toán
    this.pendingOrderPayload = { ...payload, statusPayment: 'paid' };
    this.showQrPaymentModal = true;
    this.cdr.detectChanges();
  }

  /** User huỷ popup QR, không tạo đơn hàng */
  cancelQrPayment(): void {
    this.showQrPaymentModal = false;
    this.pendingOrderPayload = null;
    this.cdr.detectChanges();
  }

  /** User xác nhận đã thanh toán → gửi đơn hàng lên server */
  confirmQrPayment(): void {
    if (!this.pendingOrderPayload || this.isSubmitting) return;
    this.isSubmitting = true;
    this.showQrPaymentModal = false;
    this.submitOrderToServer(this.pendingOrderPayload);
  }

  /** Gửi đơn hàng lên server và xử lý kết quả chung cho cả COD / online */
  private submitOrderToServer(payload: any): void {
    this.http.post<{ success: boolean; order_id?: string; message?: string }>(
      'http://localhost:3000/api/orders', payload
    ).subscribe({
      next: res => {
        this.isSubmitting = false;
        if (res.success) {
          this.successOrderId = res.order_id || '';
          this.showOrderSuccess = true;
          const currentUser = this.authService.currentUser();
          if (currentUser?.user_id) {
            this.removePurchasedItemsFromCart(currentUser.user_id, payload);
          } else {
            this.clearGuestCartAfterOrder(payload);
          }
          if (this.isBuyNow) {
            this.buyNowService.clear();
          }
          this.cdr.detectChanges();
        } else {
          this.toastService.showError(res.message || 'Đặt hàng thất bại. Vui lòng thử lại.');
        }
      },
      error: (err) => {
        this.isSubmitting = false;
        console.error('[submitOrderToServer] Error:', err);
        this.toastService.showError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Sau khi đặt hàng thành công (khách vãng lai), xoá các sản phẩm đã mua khỏi localStorage.
   */
  private clearGuestCartAfterOrder(orderPayload: any): void {
    const orderItems = Array.isArray(orderPayload?.item) ? orderPayload.item : [];
    if (orderItems.length === 0) return;
    const purchasedIds = new Set(
      orderItems
        .map((i: any) => i?._id)
        .filter((id: any) => typeof id === 'string' && id.trim() !== '')
    );
    if (purchasedIds.size === 0) return;
    const remaining = this.cartService.getGuestCartItems().filter(i => !purchasedIds.has(i._id));
    this.cartService.updateGuestCart(remaining);
  }

  /**
   * Sau khi đặt hàng thành công, xoá các sản phẩm đã mua khỏi giỏ hàng
   * (giữ lại những sản phẩm chưa chọn / chưa mua).
   */
  private removePurchasedItemsFromCart(userId: string, orderPayload: any): void {
    const orderItems = Array.isArray(orderPayload?.item) ? orderPayload.item : [];
    if (orderItems.length === 0) return;

    const purchasedIds = new Set(
      orderItems
        .map((i: any) => i?._id)
        .filter((id: any) => typeof id === 'string' && id.trim() !== '')
    );
    if (purchasedIds.size === 0) return;

    this.cartService.getCart(userId).subscribe({
      next: res => {
        if (!res.success || !res.cart?.items) return;
        const currentItems = res.cart.items;
        const remaining = currentItems.filter(i => !purchasedIds.has(i._id));
        if (remaining.length === currentItems.length) return;
        this.cartService.updateCart(userId, remaining).subscribe({
          next: () => { },
          error: () => { },
        });
      },
      error: () => { },
    });
  }

  closeOrderSuccess(): void {
    this.showOrderSuccess = false;
    this.router.navigate(['/']);
  }

  goToOrders(): void {
    this.showOrderSuccess = false;
    this.router.navigate(['/account'], { queryParams: { menu: 'orders' } });
  }
}
