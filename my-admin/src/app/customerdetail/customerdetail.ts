import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CustomerService } from '../services/customer.service';
import { AdminMascotLoadingComponent } from '../shared/admin-mascot-loading/admin-mascot-loading.component';
import { VcSearchableSelectComponent } from '../shared/vc-searchable-select/vc-searchable-select.component';

interface PendingAddress {
  name: string;
  phone: string;
  email: string;
  detail: string;
  fullAddress: string;
  province: string;
  district: string;
  ward: string;
  isDefault: boolean;
}

interface LocationItem {
  code: string;
  name: string;
  name_with_type: string;
}

@Component({
  selector: 'app-customerdetail',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminMascotLoadingComponent, VcSearchableSelectComponent],
  templateUrl: './customerdetail.html',
  styleUrls: ['./customerdetail.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Customerdetail implements OnInit {
  private readonly backendOrigin = 'http://localhost:3000';

  customer: any;
  orders: any[] = [];
  loadedAddresses: any[] = [];
  isLoading = false;
  isLoadingRelated = false;
  avatarBroken = false;

  cachedAddressList: string[] = ['Chưa cập nhật'];
  cachedTotalOrders: number = 0;

  /** Chế độ /admin/customers/create */
  isCreateMode = false;
  saving = false;
  saveError = '';
  /** Mật khẩu tùy chọn; để trống → server dùng mật khẩu tạm chuẩn */
  tempPassword = '';
  pendingAddresses: PendingAddress[] = [];

  showAddressModal = false;
  provinces: LocationItem[] = [];
  districts: LocationItem[] = [];
  wards: LocationItem[] = [];
  addressForm = {
    name: '',
    phone: '',
    email: '',
    provinceCode: '',
    districtCode: '',
    wardCode: '',
    detail: '',
    isDefault: false,
  };
  addressFormPhoneError = '';

  /** Custom select (không dùng select mặc định của trình duyệt) */
  activeSelect: string | null = null;
  readonly genderOptions = ['Nam', 'Nữ', 'Khác'];
  readonly tierOptions = ['Đồng', 'Bạc', 'Vàng'];
  readonly calWeekdayHeaders = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  private readonly calMonthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ];

  /** Lịch ngày sinh (một ô + popup) */
  showBirthCalendar = false;
  calYear = new Date().getFullYear();
  calMonth = 0;

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement;
    if (t.closest('.vc-birth-picker')) return;
    if (this.showBirthCalendar) {
      this.showBirthCalendar = false;
      this.cdr.markForCheck();
    }
    if (t.closest('vc-searchable-select')) return;
    if (t.closest('.vc-custom-select')) return;
    if (this.activeSelect) {
      this.activeSelect = null;
      this.cdr.markForCheck();
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private customerService: CustomerService,
    private location: Location,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path || '';
    this.isCreateMode = path === 'customers/create';
    if (this.isCreateMode) {
      this.initCreateMode();
      this.loadProvinces();
      return;
    }
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadCustomerDetail(id);
    }
  }

  initCreateMode(): void {
    this.showBirthCalendar = false;
    this.activeSelect = null;
    this.customer = {
      full_name: '',
      email: '',
      phone: '',
      gender: 'Khác',
      birthday: '',
      tiering: 'Đồng',
      user_id: '…',
      registerdate: new Date().toISOString(),
      totalspent: 0,
    };
    this.tempPassword = '';
    this.pendingAddresses = [];
    this.orders = [];
    this.loadedAddresses = [];
    this.cachedAddressList = [];
    this.cachedTotalOrders = 0;
    this.cachedLastOrderDate = null;
    this.avatarBroken = false;
    this.isLoading = false;
    this.saveError = '';
    this.customerService.previewNextCustomerId().subscribe({
      next: (r) => {
        if (r?.success && r?.user_id) this.customer.user_id = r.user_id;
        this.cdr.markForCheck();
      },
      error: () => {
        this.customer.user_id = '—';
        this.cdr.markForCheck();
      },
    });
    this.cdr.markForCheck();
  }

  toggleSelect(key: string, ev: MouseEvent): void {
    ev.stopPropagation();
    this.activeSelect = this.activeSelect === key ? null : key;
    this.cdr.markForCheck();
  }

  pickGender(v: string, ev: MouseEvent): void {
    ev.stopPropagation();
    this.customer.gender = v;
    this.activeSelect = null;
    this.cdr.markForCheck();
  }

  pickTier(v: string, ev: MouseEvent): void {
    ev.stopPropagation();
    this.customer.tiering = v;
    this.activeSelect = null;
    this.cdr.markForCheck();
  }

  openBirthCalendar(ev: MouseEvent): void {
    ev.stopPropagation();
    if (this.showBirthCalendar) {
      this.showBirthCalendar = false;
      this.cdr.markForCheck();
      return;
    }
    this.activeSelect = null;
    const b = this.customer?.birthday;
    const m = b ? String(b).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
    if (m) {
      this.calYear = +m[1];
      this.calMonth = +m[2] - 1;
    } else {
      const n = new Date();
      this.calYear = n.getFullYear() - 25;
      this.calMonth = n.getMonth();
    }
    this.showBirthCalendar = true;
    this.cdr.markForCheck();
  }

  canCalPrevMonth(): boolean {
    return this.calYear > 1920 || (this.calYear === 1920 && this.calMonth > 0);
  }

  canCalNextMonth(): boolean {
    const now = new Date();
    return this.calYear < now.getFullYear() || (this.calYear === now.getFullYear() && this.calMonth < now.getMonth());
  }

  calPrevMonth(ev: MouseEvent): void {
    ev.stopPropagation();
    if (!this.canCalPrevMonth()) return;
    if (this.calMonth === 0) {
      this.calMonth = 11;
      this.calYear--;
    } else {
      this.calMonth--;
    }
    this.cdr.markForCheck();
  }

  calNextMonth(ev: MouseEvent): void {
    ev.stopPropagation();
    if (!this.canCalNextMonth()) return;
    if (this.calMonth === 11) {
      this.calMonth = 0;
      this.calYear++;
    } else {
      this.calMonth++;
    }
    this.cdr.markForCheck();
  }

  pickCalendarDay(cell: { day: number; inMonth: boolean }, ev: MouseEvent): void {
    ev.stopPropagation();
    if (!cell.inMonth) return;
    if (this.isFutureCalDay(cell.day)) return;
    const mm = String(this.calMonth + 1).padStart(2, '0');
    const dd = String(cell.day).padStart(2, '0');
    this.customer.birthday = `${this.calYear}-${mm}-${dd}`;
    this.showBirthCalendar = false;
    this.cdr.markForCheck();
  }

  clearBirthday(ev: MouseEvent): void {
    ev.stopPropagation();
    this.customer.birthday = '';
    this.showBirthCalendar = false;
    this.cdr.markForCheck();
  }

  isFutureCalDay(day: number): boolean {
    const t = new Date(this.calYear, this.calMonth, day, 23, 59, 59, 999);
    return t.getTime() > Date.now();
  }

  get birthdayDisplayLabel(): string {
    const b = this.customer?.birthday;
    if (!b) return '';
    const m = String(b).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  get calTitle(): string {
    return `${this.calMonthNames[this.calMonth]} ${this.calYear}`;
  }

  get calRows(): { day: number; inMonth: boolean; isSelected: boolean }[][] {
    const y = this.calYear;
    const mo = this.calMonth;
    const firstDow = new Date(y, mo, 1).getDay();
    const lead = (firstDow + 6) % 7;
    const dim = new Date(y, mo + 1, 0).getDate();
    const prevDim = new Date(y, mo, 0).getDate();
    const cells: { day: number; inMonth: boolean; isSelected: boolean }[] = [];
    for (let i = 0; i < lead; i++) {
      cells.push({ day: prevDim - lead + i + 1, inMonth: false, isSelected: false });
    }
    for (let d = 1; d <= dim; d++) {
      cells.push({ day: d, inMonth: true, isSelected: this.isBirthDateSelected(y, mo, d) });
    }
    const rem = 42 - cells.length;
    for (let i = 1; i <= rem; i++) {
      cells.push({ day: i, inMonth: false, isSelected: false });
    }
    const rows: { day: number; inMonth: boolean; isSelected: boolean }[][] = [];
    for (let r = 0; r < 6; r++) {
      rows.push(cells.slice(r * 7, r * 7 + 7));
    }
    return rows;
  }

  private isBirthDateSelected(y: number, mo: number, d: number): boolean {
    const b = this.customer?.birthday;
    if (!b) return false;
    const m = String(b).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return false;
    return +m[1] === y && +m[2] === mo + 1 && +m[3] === d;
  }

  get addrProvinceOptions(): { value: string; label: string }[] {
    return this.provinces.map((p) => ({ value: p.code, label: p.name_with_type }));
  }

  get addrDistrictOptions(): { value: string; label: string }[] {
    return this.districts.map((d) => ({ value: d.code, label: d.name_with_type }));
  }

  get addrWardOptions(): { value: string; label: string }[] {
    return this.wards.map((w) => ({ value: w.code, label: w.name_with_type }));
  }

  loadProvinces(): void {
    this.http.get<{ success: boolean; items: LocationItem[] }>(`${this.backendOrigin}/api/locations/provinces`).subscribe({
      next: (res) => {
        this.provinces = res.items || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.provinces = [];
        this.cdr.markForCheck();
      }
    });
  }

  onProvinceChange(code: string): void {
    this.addressForm.districtCode = '';
    this.addressForm.wardCode = '';
    this.districts = [];
    this.wards = [];
    if (!code) return;
    this.http
      .get<{ success: boolean; items: LocationItem[] }>(`${this.backendOrigin}/api/locations/districts`, {
        params: { province_code: code },
      })
      .subscribe({
        next: (res) => {
          this.districts = res.items || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.districts = [];
          this.cdr.markForCheck();
        },
      });
  }

  onDistrictChange(code: string): void {
    this.addressForm.wardCode = '';
    this.wards = [];
    if (!code || !this.addressForm.provinceCode) return;
    this.http
      .get<{ success: boolean; items: LocationItem[] }>(`${this.backendOrigin}/api/locations/wards`, {
        params: { province_code: this.addressForm.provinceCode, district_code: code },
      })
      .subscribe({
        next: (res) => {
          this.wards = res.items || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.wards = [];
          this.cdr.markForCheck();
        },
      });
  }

  openAddressModal(): void {
    this.activeSelect = null;
    this.showBirthCalendar = false;
    this.addressForm = {
      name: this.customer?.full_name || '',
      phone: this.customer?.phone || '',
      email: this.customer?.email || '',
      provinceCode: '',
      districtCode: '',
      wardCode: '',
      detail: '',
      isDefault: this.pendingAddresses.length === 0,
    };
    this.districts = [];
    this.wards = [];
    this.addressFormPhoneError = '';
    this.showAddressModal = true;
    this.cdr.markForCheck();
  }

  closeAddressModal(): void {
    this.showAddressModal = false;
    this.activeSelect = null;
    this.showBirthCalendar = false;
    this.cdr.markForCheck();
  }

  private validateAddressPhone(): boolean {
    const raw = (this.addressForm.phone || '').trim();
    if (!raw) {
      this.addressFormPhoneError = 'Vui lòng nhập số điện thoại.';
      return false;
    }
    const digits = raw.replace(/\s/g, '');
    if (!/^\d+$/.test(digits) || digits.length < 10) {
      this.addressFormPhoneError = 'Số điện thoại ít nhất 10 chữ số.';
      return false;
    }
    this.addressFormPhoneError = '';
    return true;
  }

  submitAddressModal(): void {
    if (!this.validateAddressPhone()) {
      this.cdr.markForCheck();
      return;
    }
    if (!this.addressForm.provinceCode || !this.addressForm.districtCode || !this.addressForm.wardCode) {
      this.addressFormPhoneError = 'Chọn đủ Tỉnh / Quận-Huyện / Phường-Xã.';
      this.cdr.markForCheck();
      return;
    }
    if (!(this.addressForm.detail || '').trim()) {
      this.addressFormPhoneError = 'Nhập địa chỉ chi tiết (số nhà, đường…).';
      this.cdr.markForCheck();
      return;
    }
    const pL = this.provinces.find((x) => x.code === this.addressForm.provinceCode)?.name_with_type || '';
    const dL = this.districts.find((x) => x.code === this.addressForm.districtCode)?.name_with_type || '';
    const wL = this.wards.find((x) => x.code === this.addressForm.wardCode)?.name_with_type || '';
    const fullAddress = [this.addressForm.detail.trim(), wL, dL, pL].filter(Boolean).join(', ');

    if (this.addressForm.isDefault) {
      this.pendingAddresses.forEach((a) => { a.isDefault = false; });
    }

    this.pendingAddresses.push({
      name: (this.addressForm.name || '').trim() || 'Người nhận',
      phone: this.addressForm.phone.trim(),
      email: (this.addressForm.email || '').trim(),
      detail: this.addressForm.detail.trim(),
      fullAddress,
      province: pL,
      district: dL,
      ward: wL,
      isDefault: this.addressForm.isDefault,
    });

    this.closeAddressModal();
    this.cdr.markForCheck();
  }

  removePendingAddress(i: number): void {
    this.pendingAddresses.splice(i, 1);
    this.cdr.markForCheck();
  }

  private validateCreateForm(): boolean {
    if (!(this.customer?.full_name || '').trim()) {
      this.saveError = 'Nhập họ tên khách hàng.';
      return false;
    }
    const ph = String(this.customer.phone || '').replace(/\D/g, '');
    if (ph.length < 9 || ph.length > 11) {
      this.saveError = 'Số điện thoại không hợp lệ.';
      return false;
    }
    this.customer.phone = ph;
    const pwd = (this.tempPassword || '').trim();
    if (pwd && !this.isValidAdminPassword(pwd)) {
      this.saveError = 'Mật khẩu: ít nhất 8 ký tự, 1 chữ hoa, 1 ký tự đặc biệt (hoặc để trống để dùng mật khẩu tạm).';
      return false;
    }
    this.saveError = '';
    return true;
  }

  private isValidAdminPassword(p: string): boolean {
    return (
      p.length >= 8 &&
      /[A-Z]/.test(p) &&
      /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)
    );
  }

  saveCreateCustomer(): void {
    if (!this.validateCreateForm()) {
      this.cdr.markForCheck();
      return;
    }
    this.saving = true;
    this.saveError = '';
    const body: Record<string, unknown> = {
      full_name: this.customer.full_name.trim(),
      email: (this.customer.email || '').trim(),
      phone: this.customer.phone,
      gender: this.customer.gender,
      birthday: (this.customer.birthday || '').trim() || null,
      tiering: this.customer.tiering || 'Đồng',
    };
    const pwd = (this.tempPassword || '').trim();
    if (pwd) body['password'] = pwd;

    this.customerService.createCustomer(body).subscribe({
      next: (res) => {
        if (!res?.success || !res.data) {
          this.saving = false;
          this.saveError = res?.message || 'Không tạo được khách hàng.';
          this.cdr.markForCheck();
          return;
        }
        const uid = res.data.user_id;
        const mongoId = res.data._id != null ? String(res.data._id) : uid;
        this.savePendingAddressesThenNavigate(uid, mongoId);
      },
      error: (err) => {
        this.saving = false;
        this.saveError = err?.error?.message || 'Lỗi khi tạo khách hàng.';
        this.cdr.markForCheck();
      },
    });
  }

  private savePendingAddressesThenNavigate(user_id: string, navigateId: string): void {
    if (this.pendingAddresses.length === 0) {
      this.saving = false;
      this.router.navigate(['/admin/customers/detail', navigateId]);
      return;
    }
    const reqs = this.pendingAddresses.map((a) =>
      this.customerService
        .createAddress({
          user_id,
          name: a.name,
          phone: a.phone,
          email: a.email || undefined,
          detail: a.detail,
          fullAddress: a.fullAddress,
          province: a.province,
          district: a.district,
          ward: a.ward,
          isDefault: a.isDefault,
        })
        .pipe(catchError(() => of(null)))
    );
    forkJoin(reqs).subscribe({
      next: () => {
        this.saving = false;
        this.router.navigate(['/admin/customers/detail', navigateId]);
      },
      error: () => {
        this.saving = false;
        this.router.navigate(['/admin/customers/detail', navigateId]);
      },
    });
  }

  loadCustomerDetail(id: string) {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.customerService.getCustomerProfile(id).subscribe({
      next: (res) => {
        try {
          if (res && res.success && res.data) {
            this.avatarBroken = false;
            this.customer = res.data.customer;
            this.orders = Array.isArray(res.data.orders) ? res.data.orders : [];
            this.loadedAddresses = Array.isArray(res.data.addresses) ? res.data.addresses : [];
            this.updateLastOrderDate();
            this.updateCachedAddressList();
            this.cachedTotalOrders = this.orders?.length || 0;
          } else {
            console.error('Customer not found or success is false', res);
            this.customer = null;
          }
        } catch (e) {
          console.error('Error processing customer data', e);
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('getCustomerById error:', err);
        this.customer = null;
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  getOrderDate(order: any): any {
    return order?.route?.pending || order?.created_at || order?.createdAt || null;
  }

  getOrderItems(order: any): any[] {
    return Array.isArray(order?.item) ? order.item : (Array.isArray(order?.items) ? order.items : []);
  }

  getOrderAddress(order: any): string {
    const addr = order?.delivery_address || order?.shipping_address || order?.address || {};
    if (typeof addr === 'string') return addr;
    if (Array.isArray(addr)) return addr.filter(Boolean).join(', ');
    return [addr?.detail || addr?.fullAddress, addr?.ward, addr?.district, addr?.province].filter(Boolean).join(', ');
  }

  goBack() {
    this.location.back();
  }

  tierSlug(tier: string | undefined | null): string {
    const key = (tier ?? '').trim().toLowerCase();
    switch (key) {
      case 'đồng':
        return 'dong';
      case 'bạc':
        return 'bac';
      case 'vàng':
        return 'vang';
      case 'kim cương':
        return 'kimcuong';
      case 'thành viên':
        return 'thanhvien';
      default:
        return 'tier-default';
    }
  }

  goToOrderDetail(order: any) {
    if (!order) return;
    const raw = order.id ?? order._id ?? order.order_id;
    if (raw == null || raw === '') return;
    const idStr =
      typeof raw === 'object' && raw !== null && '$oid' in raw
        ? String((raw as { $oid: string }).$oid)
        : String(raw);
    this.router.navigate(['/admin/orders/detail', idStr]);
  }

  get customerAvatarUrl(): string {
    const c = this.customer;
    if (!c) return '';
    let raw: unknown =
      c.avatar ??
      c.profileImage ??
      c.photoUrl ??
      c.photo ??
      c.image ??
      (c.profile && (c.profile.avatar || c.profile.image));
    if (raw && typeof raw === 'object') {
      raw = (raw as { src?: string; url?: string }).src ?? (raw as { url?: string }).url;
    }
    if (raw == null || typeof raw !== 'string') return '';
    const v = raw.trim();
    if (!v) return '';
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    if (v.startsWith('data:')) return v;
    if (v.startsWith('/')) return `${this.backendOrigin}${v}`;
    return v;
  }

  onAvatarError() {
    this.avatarBroken = true;
    this.cdr.markForCheck();
  }

  private updateCachedAddressList() {
    if (this.loadedAddresses && this.loadedAddresses.length > 0) {
      this.cachedAddressList = this.loadedAddresses.map(a => {
        const parts = [a.fullAddress || a.detail, a.ward, a.district, a.province].filter(Boolean);
        return parts.join(', ') || a.name || 'Địa chỉ không rõ';
      });
      return;
    }
    if (this.customer?.address && Array.isArray(this.customer.address)) {
      if (this.customer.address.length > 0) {
        this.cachedAddressList = [this.customer.address.join(', ')];
        return;
      }
    }
    if (this.customer?.address && typeof this.customer.address === 'string') {
      this.cachedAddressList = [this.customer.address];
      return;
    }
    this.cachedAddressList = ['Chưa cập nhật'];
  }

  get addressList(): string[] {
    return this.cachedAddressList;
  }

  get totalOrders(): number {
    return this.cachedTotalOrders;
  }

  cachedLastOrderDate: Date | null = null;

  updateLastOrderDate() {
    if (this.orders && this.orders.length > 0) {
      const validOrders = this.orders.filter(o => o.route && o.route.pending);
      if (validOrders.length > 0) {
        const sorted = [...validOrders].sort((a, b) => {
          const timeA = new Date(a.route.pending).getTime();
          const timeB = new Date(b.route.pending).getTime();
          return timeB - timeA;
        });
        if (sorted[0] && sorted[0].route) {
          this.cachedLastOrderDate = new Date(sorted[0].route.pending);
          return;
        }
      }
    }
    this.cachedLastOrderDate = null;
  }
}
