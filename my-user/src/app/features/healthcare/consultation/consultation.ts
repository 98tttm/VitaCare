import { Component, OnInit, inject, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ConsultationCartService } from '../../../core/services/consultation-cart.service';
import { ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { HOME_URL } from '../../../core/constants/navigation.constants';

export interface ConsultationProduct {
  productName: string;
  quantity?: number;
  unit?: string;
  image?: string;
  fromCart?: boolean;
  _id?: string;
}

@Component({
  selector: 'app-consultation',
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './consultation.html',
  styleUrl: './consultation.css',
})
export class Consultation implements OnInit {
  private consultationCartService = inject(ConsultationCartService);
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private cdr = inject(ChangeDetectorRef);
  readonly authService = inject(AuthService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild('prescriptionFileInput') prescriptionFileInput?: ElementRef<HTMLInputElement>;

  contactName = '';
  contactPhone = '';
  contactNote = '';
  /** Lỗi hiển thị dưới ô Số điện thoại (màu đỏ) */
  contactPhoneError = '';
  /** Ảnh đơn thuốc đã tải (data URL để preview, gửi lên server khi submit) */
  prescriptionImages: string[] = [];

  /** Thuốc/sản phẩm cần tư vấn: từ giỏ hàng (bấm "Tư vấn đơn thuốc") + thêm tay */
  productsForConsultation: ConsultationProduct[] = [];

  /** Popup thêm sản phẩm */
  showAddProductModal = false;
  showPrescriptionUpload = false; // Flag to toggle the upload area
  searchKeyword = '';
  selectedCategorySlug = '';
  selectedMinPrice: number | null = null;
  selectedMaxPrice: number | null = null;
  categories: { _id: string; name: string; slug: string }[] = [];
  searchProducts: any[] = [];
  searchLoading = false;
  selectedPriceRangeIndex = 0;
  priceRanges = [
    { label: 'Tất cả giá', min: null as number | null, max: null as number | null },
    { label: 'Dưới 100.000đ', min: 0, max: 100000 },
    { label: '100.000đ - 300.000đ', min: 100000, max: 300000 },
    { label: '300.000đ - 500.000đ', min: 300000, max: 500000 },
    { label: 'Trên 500.000đ', min: 500000, max: null },
  ];

  /** Popup thông báo tạo đơn thuốc tư vấn thành công */
  showPrescriptionSuccess = false;
  successPrescriptionId = '';
  isSubmitting = false;


  ngOnInit(): void {
    const fromCart = this.consultationCartService.getProductsFromCart();
    if (fromCart?.length) {
      this.productsForConsultation = fromCart.map(i => ({
        productName: i.productName,
        quantity: i.quantity ?? 1,
        unit: i.unit ?? 'SP',
        image: i.image,
        fromCart: true,
        _id: i._id,
      }));
      this.consultationCartService.clear();
    }

    // Prefill từ đơn thuốc (Tư vấn lại)
    const fromPrescription = this.consultationCartService.getFromPrescription();

    const user = this.authService.currentUser();
    if (user) {
      this.contactName = (user.full_name as string) ?? '';
      this.contactPhone = (user.phone as string) ?? '';
    } else {
      this.contactName = '';
      this.contactPhone = '';
    }

    if (fromPrescription) {
      if (fromPrescription.contactName) {
        this.contactName = fromPrescription.contactName;
      }
      if (fromPrescription.contactPhone) {
        this.contactPhone = fromPrescription.contactPhone;
      }
      if (fromPrescription.note) {
        this.contactNote = fromPrescription.note;
      }
      if (Array.isArray(fromPrescription.products) && fromPrescription.products.length) {
        this.productsForConsultation = [
          ...this.productsForConsultation,
          ...fromPrescription.products.map((p) => ({
            productName: p.productName,
            quantity: p.quantity ?? 1,
            unit: p.unit ?? 'SP',
            image: this.normalizeImageUrl(p.image),
            _id: p._id,
          })),
        ];
      }
      if (Array.isArray(fromPrescription.images) && fromPrescription.images.length) {
        this.prescriptionImages = [...fromPrescription.images];
      }
      this.consultationCartService.clearFromPrescription();
    }

    // Lấy query param productId để tự động thêm vào danh sách
    this.route.queryParams.subscribe(params => {
      const productId = params['productId'];
      if (productId) {
        this.autoFetchProductForConsultation(productId);
      }
    });

    this.loadCategories();
    // Tự động tạo ghi chú nếu có sản phẩm từ giỏ hàng hoặc tư vấn lại
    this.updateAutoNote();
  }

  autoFetchProductForConsultation(productId: string): void {
    // Sử dụng ProductService để lấy chi tiết sản phẩm và tự động chuẩn hoá URL
    this.productService.getProductBySlug(productId).subscribe({
      next: (product) => {
        if (product) {
          const exist = this.productsForConsultation.find(p => p._id === (product._id || product.id));
          if (!exist) {
            this.productsForConsultation.push({
              productName: product.name || product.productName || '',
              quantity: 1,
              unit: product.unit || 'Hộp',
              image: this.normalizeImageUrl(product.image),
              _id: product._id || product.id,
            });

            this.updateAutoNote();
            this.cdr.detectChanges();
          }
        }
      },
      error: (err) => console.error('[Consultation] Error auto fetching product:', err)
    });
  }

  updateAutoNote(): void {
    if (this.productsForConsultation.length === 0) {
      if (this.contactNote.startsWith('Tôi cần tư vấn')) {
        this.contactNote = '';
      }
      return;
    }

    // Nếu người dùng đã nhập một nội dung gì đó khác với định dạng auto, chúng ta không đè lên
    // (Kiểm tra đơn giản bằng cách xem nó có bắt đầu bằng "Tôi cần tư vấn" không)
    if (this.contactNote && !this.contactNote.startsWith('Tôi cần tư vấn')) {
      return;
    }

    if (this.productsForConsultation.length === 1) {
      this.contactNote = `Tôi cần tư vấn về sản phẩm ${this.productsForConsultation[0].productName}`;
    } else {
      let note = 'Tôi cần tư vấn về các sản phẩm:\n';
      this.productsForConsultation.forEach(p => {
        note += `- ${p.productName}\n`;
      });
      this.contactNote = note.trim();
    }
    this.cdr.detectChanges();
  }

  private normalizeImageUrl(url?: string): string {
    if (!url) return 'assets/icon/medical_16660084.png';
    if (url.startsWith('http') || url.startsWith('assets/')) return url;
    const base = '';
    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
  }

  loadCategories(): void {
    this.categoryService.getCategoriesLevel1().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.items ?? []);
        this.categories = (list || []).map((c: any) => ({ _id: c._id, name: c.name, slug: c.slug || '' }));
        this.cdr.detectChanges();
      },
      error: () => {
        this.categories = [];
        this.cdr.detectChanges();
      },
    });
  }

  togglePrescriptionUpload(): void {
    this.showPrescriptionUpload = !this.showPrescriptionUpload;
  }

  addPrescriptionImage(): void {
    this.prescriptionFileInput?.nativeElement?.click();
  }

  onPrescriptionFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;
    const maxSize = 5 * 1024 * 1024; // 5MB
    const maxCount = 5;
    for (let i = 0; i < Math.min(files.length, maxCount - this.prescriptionImages.length); i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      if (file.size > maxSize) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        this.prescriptionImages.push(dataUrl);
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
    input.value = '';
  }

  removePrescriptionImage(index: number): void {
    this.prescriptionImages.splice(index, 1);
    this.cdr.detectChanges();
  }

  addMedicine(): void {
    this.showAddProductModal = true;
    this.searchKeyword = '';
    this.selectedCategorySlug = '';
    this.selectedPriceRangeIndex = 0;
    this.onPriceRangeChange();
    this.searchProducts = [];
    this.runSearch();
  }

  closeAddProductModal(): void {
    this.showAddProductModal = false;
  }

  runSearch(): void {
    this.searchLoading = true;
    const filters: any = {
      limit: 24,
      page: 1,
      sort: 'newest',
    };
    if (this.searchKeyword != null && this.searchKeyword.trim() !== '') {
      filters.keyword = this.searchKeyword.trim();
    }
    if (this.selectedCategorySlug != null && this.selectedCategorySlug !== '') {
      filters.categorySlug = this.selectedCategorySlug;
    }
    if (this.selectedMinPrice != null) filters.minPrice = this.selectedMinPrice;
    if (this.selectedMaxPrice != null) filters.maxPrice = this.selectedMaxPrice;

    this.productService.getProducts(filters).subscribe({
      next: (res: any) => {
        this.searchProducts = res?.products ?? [];
        this.searchLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.warn('[Consultation] getProducts error:', err);
        this.searchProducts = [];
        this.searchLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  onPriceRangeChange(): void {
    const r = this.priceRanges[this.selectedPriceRangeIndex];
    if (r) {
      this.selectedMinPrice = r.min;
      this.selectedMaxPrice = r.max;
    }
  }

  onFilterChange(): void {
    this.onPriceRangeChange();
    this.runSearch();
  }

  selectProductForConsultation(product: any): void {
    const name = product.name || product.productName || '';
    if (!name) return;
    this.productsForConsultation.push({
      productName: name,
      quantity: 1,
      unit: product.unit || 'Hộp',
      image: product.image,
      _id: product._id,
    });
    this.updateAutoNote();
    this.toast.showSuccess(`Đã thêm ${name} vào danh sách tư vấn`);
    this.closeAddProductModal();
    this.cdr.detectChanges();
  }

  removeProduct(index: number): void {
    this.productsForConsultation.splice(index, 1);
    this.updateAutoNote();
  }

  /** Ràng buộc SĐT: ít nhất 10 chữ số, chỉ số. Trả về true nếu hợp lệ. */
  validateContactPhone(): boolean {
    const raw = (this.contactPhone || '').trim();
    if (raw === '') {
      this.contactPhoneError = 'Vui lòng nhập số điện thoại.';
      this.cdr.detectChanges();
      return false;
    }
    const digitsOnly = raw.replace(/\s/g, '');
    if (!/^\d+$/.test(digitsOnly)) {
      this.contactPhoneError = 'Số điện thoại chỉ được chứa chữ số.';
      this.cdr.detectChanges();
      return false;
    }
    if (digitsOnly.length < 10) {
      this.contactPhoneError = 'Số điện thoại phải có ít nhất 10 chữ số.';
      this.cdr.detectChanges();
      return false;
    }
    this.contactPhoneError = '';
    this.cdr.detectChanges();
    return true;
  }

  submitConsultation(): void {
    if (!this.contactName.trim()) {
      this.toast.showError('Vui lòng nhập họ tên.');
      return;
    }
    if (!this.validateContactPhone()) return;

    this.isSubmitting = true;

    const user = this.authService.currentUser();
    const userId = (user as any)?.user_id as string | undefined;

    const payload: any = {
      user_id: userId || null,
      full_name: this.contactName.trim(),
      phone: this.contactPhone.trim(),
      note: this.contactNote?.trim() || '',
      consultation_type: 'online',
      images: [...this.prescriptionImages],
      medicines_requested: this.productsForConsultation.map((p) => ({
        id: p._id,
        name: p.productName,
        sku: '',
        image: p.image,
      })),
    };

    this.http
      .post<{ success: boolean; prescriptionId?: string; item?: any; message?: string }>(
        '/api/prescriptions',
        payload,
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.successPrescriptionId = res.prescriptionId || res.item?.prescriptionId || '';
            this.showPrescriptionSuccess = true;
            // Sau khi gửi thành công có thể reset ghi chú, ảnh
            this.contactNote = '';
            this.prescriptionImages = [];
          }
        },
        error: (err) => {
          console.error('[Consultation] submitConsultation error:', err);
          this.toast.showError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
        },
        complete: () => {
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
      });
  }

  closePrescriptionSuccess(): void {
    this.showPrescriptionSuccess = false;
    this.router.navigate([HOME_URL]);
  }

  goToPrescriptions(): void {
    this.showPrescriptionSuccess = false;
    this.router.navigate(['/account'], { queryParams: { menu: 'prescriptions' } });
  }
}
