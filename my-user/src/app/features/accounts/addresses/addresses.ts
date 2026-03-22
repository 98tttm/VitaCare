import { Component, OnInit, inject, effect, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { VcSearchableSelectComponent } from '../../../shared/vc-searchable-select/vc-searchable-select.component';

const API = '/api';

interface AddressDto {
  _id: string;
  user_id?: string;
  name?: string;
  full_name?: string;
  detail?: string;
  phone?: string;
  email?: string;
  fullAddress?: string;
  full_address?: string;
  province?: string;
  district?: string;
  ward?: string;
  isDefault?: boolean;
  is_default?: boolean;
}

interface LocationItem {
  code: string;
  name: string;
  name_with_type: string;
}

interface Address {
  id: string;
  name: string;
  fullAddress: string;
  phone: string;
  email?: string;
  isDefault: boolean;
  /** Tên hiển thị Tỉnh/Thành phố (từ API) */
  province?: string;
  district?: string;
  ward?: string;
  detail?: string;
}

@Component({
  selector: 'app-addresses',
  standalone: true,
  imports: [CommonModule, FormsModule, VcSearchableSelectComponent],
  templateUrl: './addresses.html',
  styleUrl: './addresses.css',
})
export class Addresses implements OnInit {
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  addresses: Address[] = [];
  loading = false;
  loadError: string | null = null;

  // Danh sách địa giới hành chính
  provinces: LocationItem[] = [];
  districts: LocationItem[] = [];
  wards: LocationItem[] = [];

  // Modal state
  isDialogOpen = false;
  dialogMode: 'create' | 'edit' = 'create';
  editingAddress: Address | null = null;


  // Form model for modal
  form = {
    name: '',
    phone: '',
    email: '',
    provinceCode: '',
    districtCode: '',
    wardCode: '',
    detail: '',
    isDefault: false,
  };
  /** Lỗi SĐT form (hiển thị màu đỏ) */
  formPhoneError = '';

  // Tự động fetch lại danh sách địa chỉ mỗi khi user hiện tại thay đổi (kể cả sau refresh)
  private readonly userEffect = effect(() => {
    const user = this.authService.currentUser();
    const userId = user ? ((user as any).user_id ?? (user as any).userId ?? '') : '';
    if (!userId) {
      this.addresses = [];
      return;
    }
    this.fetchAddresses(userId);
  });

  ngOnInit(): void {
    this.loadProvinces();
  }

  get provinceSelectOptions(): { value: string; label: string }[] {
    return this.provinces.map((p) => ({ value: p.code, label: p.name_with_type }));
  }

  get districtSelectOptions(): { value: string; label: string }[] {
    return this.districts.map((d) => ({ value: d.code, label: d.name_with_type }));
  }

  get wardSelectOptions(): { value: string; label: string }[] {
    return this.wards.map((w) => ({ value: w.code, label: w.name_with_type }));
  }

  /** Gọi lại khi user bấm "Thử lại" sau lỗi tải */
  retryLoad(): void {
    const user = this.authService.currentUser();
    const userId = user ? ((user as any).user_id ?? (user as any).userId ?? '') : '';
    if (userId) {
      this.loadError = null;
      this.fetchAddresses(userId);
    }
  }

  private mapDtoToAddress(dto: AddressDto): Address {
    const fullAddress =
      dto.fullAddress ||
      dto.full_address ||
      [dto.detail, dto.ward, dto.district, dto.province].filter(Boolean).join(', ');

    return {
      id: (dto._id as string) || (dto as any).id || '',
      name: dto.name || dto.full_name || '',
      phone: dto.phone || '',
      email: dto.email,
      fullAddress,
      isDefault: Boolean(dto.isDefault ?? dto.is_default),
      province: dto.province,
      district: dto.district,
      ward: dto.ward,
      detail: dto.detail,
    };
  }

  private fetchAddresses(user_id: string): void {
    this.loading = true;
    this.loadError = null;
    this.cdr.detectChanges();
    this.http.get<{ success: boolean; items: AddressDto[] }>(`${API}/addresses`, { params: { user_id } }).subscribe({
      next: (res: any) => {
        const items = res.items || [];
        this.addresses = items.map((dto: AddressDto) => this.mapDtoToAddress(dto));
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Load addresses error', err);
        this.loadError = 'Không tải được danh sách địa chỉ.';
        this.addresses = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private loadProvinces(): void {
    this.http.get<{ success: boolean; items: LocationItem[] }>(`${API}/locations/provinces`).subscribe({
      next: (res) => {
        this.provinces = res.items || [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Load provinces error', err);
        this.provinces = [];
        this.cdr.detectChanges();
      },
    });
  }

  private resetForm() {
    this.form = {
      name: '',
      phone: '',
      email: '',
      provinceCode: '',
      districtCode: '',
      wardCode: '',
      detail: '',
      isDefault: false,
    };
    this.editingAddress = null;
    this.districts = [];
    this.wards = [];
  }

  openCreateDialog(): void {
    this.dialogMode = 'create';
    this.resetForm();
    // Mặc định điền sẵn thông tin user hiện tại, người dùng có thể chỉnh sửa
    const user = this.authService.currentUser();
    if (user) {
      this.form.name = user.full_name ?? '';
      this.form.phone = user.phone ?? '';
      this.form.email = user.email ?? '';
    }
    // Địa chỉ đầu tiên luôn được mặc định là địa chỉ mặc định
    if (this.addresses.length === 0) {
      this.form.isDefault = true;
    }
    this.isDialogOpen = true;
  }

  openEditDialog(address: Address): void {
    this.dialogMode = 'edit';
    this.editingAddress = address;
    this.form = {
      name: address.name,
      phone: address.phone,
      email: address.email ?? '',
      provinceCode: '',
      districtCode: '',
      wardCode: '',
      detail: address.detail ?? address.fullAddress ?? '',
      isDefault: address.isDefault,
    };
    this.districts = [];
    this.wards = [];
    this.isDialogOpen = true;

    // Khôi phục Tỉnh/Quận/Phường đã chọn: tìm code từ tên rồi load dropdown
    if (address.province) {
      const p = this.provinces.find(
        (x) => (x.name_with_type && x.name_with_type === address.province) || x.name === address.province
      );
      if (p) {
        this.form.provinceCode = p.code;
        this.http
          .get<{ success: boolean; items: LocationItem[] }>(`${API}/locations/districts`, {
            params: { province_code: p.code },
          })
          .subscribe({
            next: (res) => {
              this.districts = res.items || [];
              if (address.district) {
                const d = this.districts.find(
                  (x) =>
                    (x.name_with_type && x.name_with_type === address.district) || x.name === address.district
                );
                if (d) {
                  this.form.districtCode = d.code;
                  this.http
                    .get<{ success: boolean; items: LocationItem[] }>(`${API}/locations/wards`, {
                      params: { province_code: p.code, district_code: d.code },
                    })
                    .subscribe({
                      next: (wr) => {
                        this.wards = wr.items || [];
                        if (address.ward) {
                          const w = this.wards.find(
                            (x) =>
                              (x.name_with_type && x.name_with_type === address.ward) || x.name === address.ward
                          );
                          if (w) this.form.wardCode = w.code;
                        }
                      },
                    });
                }
              }
            },
          });
      }
    }
  }

  closeDialog(): void {
    this.isDialogOpen = false;
    this.resetForm();
  }

  /** Ràng buộc SĐT: ít nhất 10 chữ số, chỉ số. Trả về true nếu hợp lệ. */
  validateFormPhone(): boolean {
    const raw = (this.form.phone || '').trim();
    if (raw === '') {
      this.formPhoneError = 'Vui lòng nhập số điện thoại.';
      this.cdr.detectChanges();
      return false;
    }
    const digitsOnly = raw.replace(/\s/g, '');
    if (!/^\d+$/.test(digitsOnly)) {
      this.formPhoneError = 'Số điện thoại chỉ được chứa chữ số.';
      this.cdr.detectChanges();
      return false;
    }
    if (digitsOnly.length < 10) {
      this.formPhoneError = 'Số điện thoại phải có ít nhất 10 chữ số.';
      this.cdr.detectChanges();
      return false;
    }
    this.formPhoneError = '';
    this.cdr.detectChanges();
    return true;
  }

  submitDialog(): void {
    if (!this.validateFormPhone()) return;

    const provinceLabel =
      this.provinces.find((p) => p.code === this.form.provinceCode)?.name_with_type || '';
    const districtLabel =
      this.districts.find((d) => d.code === this.form.districtCode)?.name_with_type || '';
    const wardLabel =
      this.wards.find((w) => w.code === this.form.wardCode)?.name_with_type || '';

    const fullAddressParts = [this.form.detail, wardLabel, districtLabel, provinceLabel].filter(
      Boolean
    );

    const fullAddress = fullAddressParts.join(', ');

    if (this.dialogMode === 'edit' && this.editingAddress) {
      const editId = this.editingAddress.id;
      this.http
        .patch<{ success: boolean; item?: AddressDto }>(`${API}/addresses/${editId}`, {
          name: this.form.name,
          phone: this.form.phone,
          email: this.form.email || undefined,
          detail: this.form.detail,
          fullAddress,
          province: provinceLabel || undefined,
          district: districtLabel || undefined,
          ward: wardLabel || undefined,
          isDefault: this.form.isDefault,
        })
        .subscribe({
          next: (res) => {
            if (res.item) {
              const updated = this.mapDtoToAddress(res.item);
              if (updated.isDefault) {
                this.addresses.forEach((addr) => (addr.isDefault = false));
              }
              this.addresses = this.addresses.map((addr) =>
                addr.id === editId ? updated : addr
              );
            } else {
              if (this.form.isDefault) {
                this.addresses.forEach((addr) => (addr.isDefault = false));
              }
              this.addresses = this.addresses.map((addr) =>
                addr.id === editId
                  ? {
                    ...addr,
                    name: this.form.name,
                    phone: this.form.phone,
                    email: this.form.email || undefined,
                    fullAddress,
                    isDefault: this.form.isDefault,
                  }
                  : addr
              );
            }
            this.toastService.showSuccess('Cập nhật địa chỉ thành công');
            this.closeDialog();
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Update address error', err);
            this.toastService.showError('Không thể cập nhật địa chỉ. Vui lòng thử lại.');
            this.cdr.detectChanges();
          },
        });
      return;
    }

    // ===== TẠO ĐỊA CHỈ MỚI & LƯU MONGODB =====
    const user = this.authService.currentUser();
    if (!user) {
      this.toastService.showError('Bạn cần đăng nhập để thêm địa chỉ.');
      return;
    }

    const isDefault = this.form.isDefault || this.addresses.length === 0;

    this.http
      .post<{ success: boolean; item?: AddressDto }>(`${API}/addresses`, {
        user_id: user.user_id,
        name: this.form.name,
        phone: this.form.phone,
        email: this.form.email || undefined,
        detail: this.form.detail,
        fullAddress,
        province: provinceLabel || undefined,
        district: districtLabel || undefined,
        ward: wardLabel || undefined,
        isDefault,
      })
      .subscribe({
        next: (res) => {
          const dto = res.item;
          if (dto) {
            if (isDefault) {
              this.addresses.forEach((addr) => (addr.isDefault = false));
            }
            const mapped = this.mapDtoToAddress(dto);
            this.addresses = [mapped, ...this.addresses];
          }
          this.toastService.showSuccess('Thêm địa chỉ mới thành công');
          this.closeDialog();
        },
        error: (err) => {
          console.error('Create address error', err);
          this.toastService.showError('Không thể lưu địa chỉ mới. Vui lòng thử lại.');
        },
      });
  }

  editAddress(id: string): void {
    const address = this.addresses.find(a => a.id === id);
    if (!address) {
      return;
    }
    this.openEditDialog(address);
  }

  deleteAddress(id: string): void {
    this.confirmService.open('Bạn có chắc chắn muốn xóa địa chỉ này?', () => {
      this.http.delete<{ success: boolean }>(`${API}/addresses/${id}`).subscribe({
        next: () => {
          this.addresses = this.addresses.filter((addr) => addr.id !== id);
          this.toastService.showSuccess('Đã xóa địa chỉ.');
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Delete address error', err);
          this.toastService.showError('Không thể xóa địa chỉ. Vui lòng thử lại.');
          this.cdr.detectChanges();
        },
      });
    });
  }

  setDefaultAddress(id: string): void {
    this.http
      .patch<{ success: boolean; item?: AddressDto }>(`${API}/addresses/${id}`, { isDefault: true })
      .subscribe({
        next: () => {
          this.addresses.forEach((addr) => (addr.isDefault = addr.id === id));
          this.toastService.showSuccess('Đã đặt làm địa chỉ mặc định.');
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Set default address error', err);
          this.toastService.showError('Không thể cập nhật địa chỉ mặc định. Vui lòng thử lại.');
          this.cdr.detectChanges();
        },
      });
  }

  addNewAddress(): void {
    this.openCreateDialog();
  }

  // ========= HANDLERS LOCATION =========

  onProvinceChange(code: string): void {
    this.form.provinceCode = code;
    this.form.districtCode = '';
    this.form.wardCode = '';
    this.districts = [];
    this.wards = [];
    if (!code) return;

    this.http.get<{ success: boolean; items: LocationItem[] }>(`${API}/locations/districts`, { params: { province_code: code } }).subscribe({
      next: (res) => {
        this.districts = res.items || [];
      },
      error: (err) => {
        console.error('Load districts error', err);
        this.districts = [];
      },
    });
  }

  onDistrictChange(code: string): void {
    this.form.districtCode = code;
    this.form.wardCode = '';
    this.wards = [];
    if (!code || !this.form.provinceCode) return;

    this.http
      .get<{ success: boolean; items: LocationItem[] }>(`${API}/locations/wards`, {
        params: { province_code: this.form.provinceCode, district_code: code },
      })
      .subscribe({
        next: (res) => {
          this.wards = res.items || [];
        },
        error: (err) => {
          console.error('Load wards error', err);
          this.wards = [];
        },
      });
  }
}
