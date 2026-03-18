import {
  Component,
  inject,
  OnInit,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PrescriptionService, Prescription } from '../../../core/services/prescription.service';
import { ConsultationCartService } from '../../../core/services/consultation-cart.service';
import { ToastService } from '../../../core/services/toast.service';

interface Tab {
  id: 'all' | 'pending' | 'waiting' | 'advised' | 'unreachable' | 'cancelled';
  label: string;
  count: number;
}

@Component({
  selector: 'app-prescriptions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './prescriptions.html',
  styleUrl: './prescriptions.css',
})
export class Prescriptions implements OnInit, OnChanges {
  @ViewChild('searchInput') searchInput?: ElementRef;

  private prescriptionService = inject(PrescriptionService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private consultationCartService = inject(ConsultationCartService);

  private readonly API = 'http://localhost:3000/api';

  @Input() userId: string | undefined;

  searchQuery: string = '';
  activeTab: string = 'all'; // Start with all prescriptions
  tabs: Tab[] = [
    { id: 'all', label: 'Tất cả', count: 0 },
    { id: 'pending', label: 'Chờ xử lý', count: 0 },
    { id: 'waiting', label: 'Chờ tư vấn', count: 0 },
    { id: 'advised', label: 'Đã tư vấn', count: 0 },
    { id: 'unreachable', label: 'Chưa thể liên hệ', count: 0 },
    { id: 'cancelled', label: 'Đã hủy', count: 0 },
  ];

  prescriptions: Prescription[] = [];
  expandedPrescriptions: Set<string> = new Set();
  isLoading = true;

  // Detail modal state
  showDetailModal = false;
  selectedPrescription: Prescription | null = null;
  detailSearchQuery: string = '';
  detailFilteredPrescriptions: Prescription[] = [];

  // Cancel confirmation modal state
  showCancelModal = false;
  prescriptionToCancel: Prescription | null = null;

  ngOnInit(): void {
    if (this.userId) {
      this.fetchPrescriptions(this.userId);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && this.userId) {
      this.fetchPrescriptions(this.userId);
    }
  }

  fetchPrescriptions(userId: string): void {
    this.isLoading = true;
    this.prescriptionService.getPrescriptions(userId).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.prescriptions = res.items;
          this.updateTabCounts();
          const prescriptionId = this.route.snapshot.queryParams['prescriptionId'];
          if (prescriptionId && this.prescriptions.length > 0) {
            const prescription = this.prescriptions.find(
              (p) =>
                (p.prescriptionId || (p as any).prescription_id || (p as any)._id) ===
                prescriptionId,
            );
            if (prescription) {
              setTimeout(() => this.viewDetails(prescription), 50);
              this.router.navigate([], {
                relativeTo: this.route,
                queryParams: { menu: 'prescriptions' },
                queryParamsHandling: 'merge',
                replaceUrl: true,
              });
            }
          }
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('PrescriptionsComponent: Failed to fetch prescriptions', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  get filteredPrescriptions(): Prescription[] {
    let filtered = this.prescriptions;

    // Filter by tab
    if (this.activeTab !== 'all') {
      filtered = filtered.filter((p) => p.status === this.activeTab);
    }

    // Filter by search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.prescriptionId?.toLowerCase().includes(query) ||
          p.medicines_requested?.some((m: any) => {
            const name = typeof m === 'string' ? m : (m?.name ?? '');
            return name.toLowerCase().includes(query);
          }),
      );
    }

    return filtered;
  }

  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
  }

  updateTabCounts(): void {
    const all = this.prescriptions;
    this.tabs.forEach((tab) => {
      if (tab.id === 'all') {
        tab.count = all.length;
      } else {
        tab.count = all.filter((p) => p.status === tab.id).length;
      }
    });
  }

  // Status label mapping
  getStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      pending: 'CHỜ XỬ LÝ',
      waiting: 'CHỜ TƯ VẤN',
      advised: 'ĐÃ TƯ VẤN',
      unreachable: 'CHƯA THỂ LIÊN HỆ',
      cancelled: 'ĐÃ HỦY',
    };
    return statusMap[status] || status.toUpperCase();
  }

  // Status class mapping
  getStatusClass(status: string): string {
    const classMap: { [key: string]: string } = {
      pending: 'status-pending',
      waiting: 'status-waiting',
      advised: 'status-advised',
      unreachable: 'status-unreachable',
      cancelled: 'status-cancelled',
    };
    return classMap[status] || 'status-pending';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatDateTime(dateStr: string): string {
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

  getConsultationTypeLabel(type: string | undefined): string {
    if (!type) return 'Đang cập nhật';
    const map: Record<string, string> = {
      phone: 'Tư vấn qua điện thoại',
      call: 'Tư vấn qua điện thoại',
      chat: 'Chat với dược sĩ',
      online: 'Tư vấn trực tuyến',
      store: 'Tư vấn tại nhà thuốc',
    };
    return map[type] || type;
  }

  // Expand/Collapse functionality
  hasMoreMedicines(prescription: Prescription): boolean {
    return (prescription.medicines_requested?.length || 0) > 3;
  }

  isExpanded(prescription: Prescription): boolean {
    return this.expandedPrescriptions.has(prescription._id);
  }

  toggleExpand(prescription: Prescription): void {
    if (this.expandedPrescriptions.has(prescription._id)) {
      this.expandedPrescriptions.delete(prescription._id);
    } else {
      this.expandedPrescriptions.add(prescription._id);
    }
  }

  // Actions
  cancelRequest(prescription: Prescription): void {
    const id = (prescription as any)._id || prescription.prescriptionId;
    this.http
      .patch<{ success: boolean; message?: string }>(`${this.API}/prescriptions/${id}/cancel`, {})
      .subscribe({
        next: () => {
          prescription.status = 'cancelled';
          this.updateTabCounts();
          this.toast.showSuccess('Đã hủy yêu cầu thành công');
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Cancel prescription error:', err);
          prescription.status = 'cancelled';
          this.updateTabCounts();
          this.toast.showSuccess('Đã hủy yêu cầu thành công');
          this.cdr.detectChanges();
        },
      });
  }

  openCancelModal(prescription: Prescription): void {
    this.prescriptionToCancel = prescription;
    this.showCancelModal = true;
  }

  closeCancelModal(): void {
    this.showCancelModal = false;
    this.prescriptionToCancel = null;
  }

  confirmCancelFromModal(): void {
    if (!this.prescriptionToCancel) return;
    const target = this.prescriptionToCancel;
    this.closeCancelModal();
    this.cancelRequest(target);
  }

  /** Bắt đầu tư vấn lại từ một đơn thuốc */
  reconsult(prescription: Prescription): void {
    this.consultationCartService.setFromPrescription({
      contactName: prescription.full_name,
      contactPhone: prescription.phone,
      note: prescription.note,
      products: (prescription.medicines_requested || []).map((m: any) => {
        if (!m) {
          return { productName: 'Thuốc', quantity: 1 };
        }
        if (typeof m === 'string') {
          return { productName: m, quantity: 1 };
        }
        return {
          productName: m.name ?? m.productName ?? 'Thuốc',
          quantity: m.quantity ?? m.quantity_requested ?? 1,
          unit: m.unit ?? 'SP',
          image: m.image ?? m.imageUrl,
          _id: m._id,
        };
      }),
      images: prescription.images || [],
    });
    this.closeDetailModal();
    this.router.navigate(['/consultation']);
  }

  viewDetails(prescription: Prescription): void {
    this.showDetailModal = true;
    this.selectedPrescription = prescription;
    this.detailSearchQuery = '';
    // Hiển thị toàn bộ danh sách đơn thuốc ở cột trái
    this.detailFilteredPrescriptions = [...this.prescriptions];
  }

  selectDetailPrescription(prescription: Prescription): void {
    this.selectedPrescription = prescription;
  }

  onDetailSearchChange(): void {
    const query = this.detailSearchQuery.trim().toLowerCase();
    const all = this.prescriptions;
    if (!query) {
      this.detailFilteredPrescriptions = [...all];
      return;
    }

    this.detailFilteredPrescriptions = all.filter(
      (p) =>
        p.prescriptionId?.toLowerCase().includes(query) ||
        p.full_name?.toLowerCase().includes(query) ||
        p.medicines_requested?.some((m: any) => {
          const name = typeof m === 'string' ? m : (m?.name ?? '');
          return name.toLowerCase().includes(query);
        }),
    );
  }

  closeDetailModal(): void {
    this.showDetailModal = false;
    this.selectedPrescription = null;
    this.detailSearchQuery = '';
    this.detailFilteredPrescriptions = [];
  }

  // Search functionality
  performSearch(): void {
    // Search is handled by filteredPrescriptions getter
  }

  clearSearch(): void {
    this.searchQuery = '';
    setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
  }

  /** Lấy tên thuốc từ medicine (object hoặc string) */
  getMedicineName(medicine: any): string {
    if (!medicine) return '';
    if (typeof medicine === 'string') return medicine;
    return (medicine.name ?? medicine.productName ?? '') || '';
  }

  /** Lấy URL ảnh thuốc nếu có */
  getMedicineImage(medicine: any): string | null {
    if (!medicine || typeof medicine === 'string') return null;
    const url = medicine.image ?? medicine.imageUrl ?? '';
    return url && typeof url === 'string' && url.trim() ? url.trim() : null;
  }

  /** Lấy số lượng thuốc (medicine có thể là string hoặc object) */
  getMedicineQuantity(medicine: any): number {
    if (!medicine || typeof medicine === 'string') return 1;
    const q = medicine.quantity ?? medicine.quantity_requested ?? 1;
    return typeof q === 'number' ? q : 1;
  }
}
