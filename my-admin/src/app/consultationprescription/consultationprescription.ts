import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsultationService } from '../services/consultation.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-consultationprescription',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe, ConsultationService],
  templateUrl: './consultationprescription.html',
  styleUrl: './consultationprescription.css',
})
export class Consultationprescription implements OnInit {
  prescriptions: any[] = [];
  filteredPrescriptions: any[] = [];
  pharmacists: any[] = [];
  searchText: string = '';
  isLoading: boolean = false;

  totalPrescriptions = 0;
  pendingCount = 0;
  waitingCount = 0;
  unreachableCount = 0;
  advisedCount = 0;
  cancelledCount = 0;

  currentFilter: string = '';
  currentSort: string = 'newest';

  isModalOpen = false;
  selectedPrescription: any | null = null;
  editedPharmacistId: string = '';
  selectAll = false;

  notification = { show: false, message: '', type: 'success' };

  showFilterDropdown = false;
  showSortDropdown = false;

  // Multiple filters support
  filters: any = {
    status: [] as string[],
    pharmacist: [] as string[],
    time: '',
    hasProducts: [] as string[],
    hasImages: [] as string[]
  };

  get activeFilterCount(): number {
    return this.filters.status.length + this.filters.pharmacist.length + (this.filters.time ? 1 : 0) + this.filters.hasProducts.length + this.filters.hasImages.length;
  }

  // Selection
  selectedCount = 0;

  isConfirmModalOpen = false;

  // Dialog cho trạng thái "Đang tư vấn"
  statusDialog = {
    show: false
  };
  currentRole: 'admin' | 'pharmacist' = 'admin';
  currentPharmacistId = '';
  currentPharmacistName = '';
  currentPharmacistEmail = '';

  constructor(
    @Inject(ConsultationService) private consultationService: ConsultationService,
    private datePipe: DatePipe,
    private cdr: ChangeDetectorRef
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    this.showFilterDropdown = false;
    this.showSortDropdown = false;
  }

  ngOnInit() {
    this.loadCurrentAccount();
    this.loadData();
  }

  private loadCurrentAccount() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('admin');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.currentRole = parsed?.accountRole === 'pharmacist' ? 'pharmacist' : 'admin';
      this.currentPharmacistId = String(parsed?._id || parsed?.pharmacist_id || '').trim();
      this.currentPharmacistName = String(parsed?.pharmacistName || parsed?.adminname || '').trim();
      this.currentPharmacistEmail = String(parsed?.pharmacistEmail || parsed?.email || parsed?.adminemail || '').trim().toLowerCase();
    } catch {
      this.currentRole = 'admin';
    }
  }

  get isAdmin(): boolean {
    return this.currentRole === 'admin';
  }

  get isPharmacist(): boolean {
    return this.currentRole === 'pharmacist';
  }

  loadData() {
    this.isLoading = true;
    // Parallel fetch: pharmacists + prescriptions at the same time
    forkJoin({
      pharmacists: this.consultationService.getPharmacists().pipe(catchError(() => of({ data: [] }))),
      prescriptions: this.consultationService
        .getPrescriptionConsultationsByRole(this.currentRole, this.currentPharmacistId)
        .pipe(catchError(() => of({ success: true, data: [] })))
    }).subscribe(({ pharmacists, prescriptions }) => {
      this.pharmacists = (pharmacists && pharmacists.data) ? pharmacists.data : (Array.isArray(pharmacists) ? pharmacists : []);
      const previousId = this.currentPharmacistId;
      this.resolveCurrentPharmacistId();

      let rawData: any[] = [];
      if (prescriptions && prescriptions.success && Array.isArray(prescriptions.data)) {
        rawData = prescriptions.data;
      } else if (Array.isArray(prescriptions)) {
        rawData = prescriptions;
      }

      this.prescriptions = rawData.map((item: any) => ({
        ...item,
        id: item._id || item.id,
        prescriptionId: item.prescriptionId || item.id || 'N/A',
        full_name: item.full_name || 'Khách vãng lai',
        selected: false,
        status: item.status || 'pending',
        pharmacist_name: this.pharmacists.find((ph: any) => ph._id === (item.pharmacist_id || item.pharmacistId))?.pharmacistName || item.pharmacistName || 'Chưa phân công'
      }));

      this.applyFiltersAndSort();
      this.calculateStats();
      this.isLoading = false;
      this.cdr.markForCheck(); // Force immediate view update

      if (this.isPharmacist && this.currentPharmacistId && this.currentPharmacistId !== previousId) {
        this.fetchPrescriptions();
      }
    });
  }

  fetchPrescriptions() {
    this.consultationService.getPrescriptionConsultationsByRole(this.currentRole, this.currentPharmacistId).subscribe({
      next: (conRes) => {
        let rawData: any[] = [];
        if (conRes && conRes.success && Array.isArray(conRes.data)) {
          rawData = conRes.data;
        } else if (Array.isArray(conRes)) {
          rawData = conRes;
        } else if (conRes && Array.isArray(conRes.data)) {
          rawData = conRes.data;
        }
        this.prescriptions = rawData.map((item: any) => ({
          ...item,
          id: item._id || item.id,
          prescriptionId: item.prescriptionId || item.id || 'N/A',
          full_name: item.full_name || 'Khách vãng lai',
          selected: false,
          status: item.status || 'pending',
          pharmacist_name: this.pharmacists.find(ph => ph._id === (item.pharmacist_id || item.pharmacistId))?.pharmacistName || item.pharmacistName || 'Chưa phân công'
        }));
        this.applyFiltersAndSort();
        this.calculateStats();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Lỗi load tư vấn đơn thuốc:', err);
        this.isLoading = false;
      }
    });
  }

  calculateStats() {
    this.totalPrescriptions = this.prescriptions.length;
    this.pendingCount = this.prescriptions.filter(p => p.status === 'pending').length;
    this.waitingCount = this.prescriptions.filter(p => p.status === 'waiting').length;
    this.unreachableCount = this.prescriptions.filter(p => p.status === 'unreachable').length;
    this.advisedCount = this.prescriptions.filter(p => p.status === 'advised').length;
    this.cancelledCount = this.prescriptions.filter(p => p.status === 'cancelled').length;
  }

  onSearchChange() { this.applyFiltersAndSort(); }

  toggleSortDropdown(event: Event) {
    event.stopPropagation();
    this.showSortDropdown = !this.showSortDropdown;
    this.showFilterDropdown = false;
  }

  applySort(sort: string) {
    this.currentSort = sort;
    this.applyFiltersAndSort();
    this.showSortDropdown = false;
  }

  filterByStatus(status: string) {
    if (status === '') {
      this.filters.status = [];
    } else {
      this.filters.status = [status];
    }
    this.currentFilter = status;
    this.applyFiltersAndSort();
  }

  onFilterChange() { this.applyFiltersAndSort(); }
  onSortChange() { this.applyFiltersAndSort(); }

  toggleFilter(type: string, value: string) {
    if (type === 'time') {
      this.filters.time = this.filters.time === value ? '' : value;
    } else {
      const idx = this.filters[type].indexOf(value);
      if (idx > -1) this.filters[type].splice(idx, 1);
      else this.filters[type].push(value);
    }
    this.applyFiltersAndSort();
  }

  isFilterSelected(type: string, value: string): boolean {
    if (type === 'time') return this.filters.time === value;
    return this.filters[type].includes(value);
  }

  clearAllFilters() {
    this.filters = { status: [], pharmacist: [], time: '', hasProducts: [], hasImages: [] };
    this.currentFilter = '';
    this.applyFiltersAndSort();
  }

  toggleFilterDropdown(event: Event) {
    event.stopPropagation();
    this.showFilterDropdown = !this.showFilterDropdown;
    this.showSortDropdown = false;
  }

  applyFiltersAndSort() {
    let result = [...this.prescriptions];

    // Status Filter (Multiple)
    if (this.filters.status.length > 0) {
      result = result.filter(p => this.filters.status.includes(p.status));
    } else if (this.currentFilter !== '') {
      result = result.filter(p => p.status === this.currentFilter);
    }

    // Pharmacist Filter
    if (this.filters.pharmacist.length > 0) {
      result = result.filter(p => this.filters.pharmacist.includes(p.pharmacist_id));
    }

    // Time Filter
    if (this.filters.time) {
      const now = new Date();
      result = result.filter(p => {
        const pDate = new Date(p.createdAt);
        const diffDays = (now.getTime() - pDate.getTime()) / (1000 * 3600 * 24);
        if (this.filters.time === 'today') return diffDays <= 1 && pDate.getDate() === now.getDate();
        if (this.filters.time === 'week') return diffDays <= 7;
        if (this.filters.time === 'month') return diffDays <= 30;
        return true;
      });
    }

    // Product & Image Presence Filter
    if (this.filters.hasProducts.length > 0) {
      result = result.filter(p => {
        const hasProd = p.medicines_requested && p.medicines_requested.length > 0;
        if (this.filters.hasProducts.includes('yes') && hasProd) return true;
        if (this.filters.hasProducts.includes('no') && !hasProd) return true;
        return false;
      });
    }

    if (this.filters.hasImages.length > 0) {
      result = result.filter(p => {
        const hasImg = p.images && p.images.length > 0;
        if (this.filters.hasImages.includes('yes') && hasImg) return true;
        if (this.filters.hasImages.includes('no') && !hasImg) return true;
        return false;
      });
    }

    // Search
    if (this.searchText.trim() !== '') {
      const lowerSearch = this.searchText.toLowerCase();
      result = result.filter((p: any) =>
        p.prescriptionId?.toLowerCase().includes(lowerSearch) ||
        p.full_name?.toLowerCase().includes(lowerSearch) ||
        p.phone?.toLowerCase().includes(lowerSearch) ||
        p.pharmacist_name?.toLowerCase().includes(lowerSearch)
      );
    }
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return this.currentSort === 'newest' ? dateB - dateA : dateA - dateB;
    });
    this.filteredPrescriptions = result;
    this.updateSelectionCount();
  }

  toggleAll(event: any) {
    this.selectAll = event.target.checked;
    this.filteredPrescriptions.forEach(p => p.selected = this.selectAll);
    this.updateSelectionCount();
  }

  checkIfAllSelected() {
    this.selectAll = this.filteredPrescriptions.length > 0 && this.filteredPrescriptions.every(p => p.selected);
    this.updateSelectionCount();
  }

  updateSelectionCount() {
    this.selectedCount = this.filteredPrescriptions.filter(p => p.selected).length;
  }

  onEditClick() {
    const selected = this.filteredPrescriptions.filter(p => p.selected);
    if (selected.length !== 1) {
      this.showNotification('Vui lòng chọn 1 đơn tư vấn đơn thuốc để chỉnh sửa', 'warning');
      return;
    }
    this.openDetailModal(selected[0]);
  }

  onDeleteClick() {
    const selected = this.filteredPrescriptions.filter(p => p.selected);
    if (selected.length === 0) {
      this.showNotification('Chưa chọn đơn tư vấn nào để xóa', 'warning');
      return;
    }
    this.isConfirmModalOpen = true;
    this.cdr.markForCheck();
  }

  closeConfirmModal() {
    this.isConfirmModalOpen = false;
    this.cdr.markForCheck();
  }

  confirmDelete() {
    this.closeConfirmModal();
    const selected = this.filteredPrescriptions.filter(p => p.selected);
    if (selected.length === 0) return;

    const ids = selected.map(p => p.id);
    const selectedSet = new Set(ids);
    this.isLoading = true;
    this.cdr.markForCheck();

    let errors = 0;
    const deleteNext = (index: number) => {
      if (index >= ids.length) {
        this.isLoading = false;
        if (errors === 0) {
          this.showNotification('Đã xóa thành công các đơn tư vấn đã chọn!');
        } else {
          this.showNotification(`Đã xóa ${ids.length - errors} đơn. Lỗi ${errors} đơn.`, 'warning');
        }
        this.prescriptions = this.prescriptions.filter(p => !selectedSet.has(p.id));
        this.applyFiltersAndSort();
        this.calculateStats();
        this.selectedCount = 0;
        this.selectAll = false;
        this.cdr.markForCheck();
        return;
      }

      this.consultationService.deletePrescriptionConsultation(ids[index]).subscribe({
        next: () => deleteNext(index + 1),
        error: () => {
          errors++;
          deleteNext(index + 1);
        }
      });
    };
    deleteNext(0);
  }

  onGroupClick() {
    const selected = this.filteredPrescriptions.filter(p => p.selected);
    this.showNotification(`Đã chọn nhóm ${selected.length} đơn tư vấn. (Tính năng đang phát triển)`, 'success');
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'pending': return 'Chờ xử lý';
      case 'waiting': return 'Đang tư vấn';
      case 'unreachable': return 'Chưa thể liên hệ';
      case 'advised': return 'Đã tư vấn';
      case 'cancelled': return 'Đã huỷ';
      default: return status;
    }
  }

  formatDate(dateString: string | Date | undefined | null): string {
    if (dateString == null || dateString === '') return '';
    return this.datePipe.transform(dateString, 'dd/MM/yyyy HH:mm') || '';
  }

  openDetailModal(item: any) {
    this.selectedPrescription = { ...item };
    this.editedPharmacistId = item.pharmacist_id || item.pharmacistId || '';
    this.isModalOpen = true;
  }

  closeModal() { this.isModalOpen = false; this.selectedPrescription = null; }

  isSaving = false;

  /**
   * Lưu đơn tư vấn với trạng thái hiện tại,
   * hoặc ép sang trạng thái mới nếu truyền newStatus.
   */
  savePrescription(newStatus?: 'waiting' | 'unreachable' | 'advised', successMessage?: string) {
    if (this.isSaving) return;

    if (!this.selectedPrescription) return;

    this.isSaving = true;

    const originalStatus = this.selectedPrescription.status || 'pending';
    const originalHistory = Array.isArray(this.selectedPrescription.status_history)
      ? this.selectedPrescription.status_history
      : [];
    const originalCurrentStatus = this.selectedPrescription.current_status || null;
    const originalPharmacistId = this.selectedPrescription.pharmacist_id || '';
    const originalPharmacistName = this.selectedPrescription.pharmacistName || '';
    const originalPharmacistPhone = this.selectedPrescription.pharmacistPhone || '';

    let payload: any = {
      status: originalStatus,
      pharmacist_id: originalPharmacistId,
      pharmacistId: originalPharmacistId,
      pharmacistName: originalPharmacistName,
      pharmacistPhone: originalPharmacistPhone,
      current_status: originalCurrentStatus,
      status_history: originalHistory
    };

    // Admin: phân công dược sĩ; nếu đơn đang chờ xử lý thì chuyển sang "Đang tư vấn"
    // để dược sĩ có thể cập nhật "Đã tư vấn" / "Chưa thể liên hệ".
    if (this.isAdmin) {
      if (!this.editedPharmacistId) {
        this.isSaving = false;
        this.showNotification('Vui lòng chọn dược sĩ để phân công', 'warning');
        return;
      }
      const pharmacist = this.pharmacists.find(p => p._id === this.editedPharmacistId);
      if (!pharmacist) {
        this.isSaving = false;
        this.showNotification('Không tìm thấy thông tin dược sĩ', 'error');
        return;
      }

      let adminActor = 'Admin';
      try {
        const adminData = localStorage.getItem('admin');
        if (adminData) {
          const admin = JSON.parse(adminData);
          adminActor =
            admin.adminname ||
            admin.adminName ||
            admin.fullname ||
            admin.pharmacistName ||
            'Admin';
        }
      } catch {
        /* ignore */
      }

      const nowIso = new Date().toISOString();

      let nextStatus = originalStatus;
      let nextCurrentStatus = originalCurrentStatus;
      let nextHistory = [...originalHistory];

      // Đơn còn "Chờ xử lý" → sau phân công phải sang "Đang tư vấn" (kể cả trùng dược sĩ — tránh kẹt pending).
      if (originalStatus === 'pending') {
        nextStatus = 'waiting';
        const historyEntry = {
          status: 'waiting' as const,
          changedAt: nowIso,
          changedBy: adminActor,
        };
        nextCurrentStatus = historyEntry;
        nextHistory = [...nextHistory, historyEntry];
      }

      payload = {
        ...payload,
        status: nextStatus,
        current_status: nextCurrentStatus,
        status_history: nextHistory,
        pharmacist_id: this.editedPharmacistId,
        pharmacistId: this.editedPharmacistId,
        pharmacistName: pharmacist.pharmacistName,
        pharmacistPhone: pharmacist.pharmacistPhone,
      };
    } else {
      // Pharmacist: chỉ được cập nhật trạng thái, giữ nguyên người được phân công.
      if (!originalPharmacistId) {
        this.isSaving = false;
        this.showNotification('Đơn thuốc chưa được phân công dược sĩ.', 'warning');
        return;
      }

      let actorName = 'Dược sĩ';
      try {
        const adminData = localStorage.getItem('admin');
        if (adminData) {
          const admin = JSON.parse(adminData);
          actorName =
            admin.pharmacistName ||
            admin.adminname ||
            admin.adminName ||
            admin.fullname ||
            'Dược sĩ';
        }
      } catch (e) { }

      let nextStatus = originalStatus;
      if (newStatus) {
        nextStatus = newStatus;
      } else if (originalStatus === 'pending') {
        // Trường hợp pharmacist nhận xử lý lần đầu.
        nextStatus = 'waiting';
      }

      const historyEntry = {
        status: nextStatus,
        changedAt: new Date().toISOString(),
        changedBy: actorName
      };

      payload = {
        ...payload,
        status: nextStatus,
        current_status: historyEntry,
        status_history: [...originalHistory, historyEntry]
      };
    }

    this.consultationService.updatePrescription(this.selectedPrescription.id, payload).subscribe({
      next: (res) => {
        this.isSaving = false;
        const ok = !res || res.success !== false;
        if (!ok) {
          this.showNotification('Lỗi: ' + (res?.message || 'Không thể cập nhật đơn tư vấn'), 'error');
          return;
        }

        const finalMessage = successMessage ||
          (this.isAdmin
            ? (originalStatus === 'pending' && payload.status === 'waiting'
              ? 'Đã phân công dược sĩ và chuyển đơn sang Đang tư vấn.'
              : 'Đã phân công đơn thuốc cho dược sĩ.')
            : (payload.status === 'waiting'
              ? 'Đã nhận xử lý đơn thuốc.'
              : `Đã cập nhật trạng thái đơn thuốc sang ${this.getStatusLabel(payload.status)}.`));

        this.showNotification(finalMessage);
        this.fetchPrescriptions();
        this.closeModal();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSaving = false;
        this.showNotification('Đã có lỗi xảy ra khi kết nối máy chủ', 'error');
      }
    });
  }

  showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    this.notification = { show: true, message, type };
    setTimeout(() => this.notification.show = false, 3000);
  }

  private resolveCurrentPharmacistId() {
    if (this.currentRole !== 'pharmacist' || !this.pharmacists?.length) return;
    if (this.currentPharmacistId) {
      const byId = this.pharmacists.find((p) => String(p?._id || '') === this.currentPharmacistId);
      if (byId) return;
    }

    const byEmail = this.currentPharmacistEmail
      ? this.pharmacists.find((p) => String(p?.pharmacistEmail || p?.email || '').trim().toLowerCase() === this.currentPharmacistEmail)
      : null;
    if (byEmail?._id) {
      this.currentPharmacistId = String(byEmail._id);
      return;
    }

    const byName = this.currentPharmacistName
      ? this.pharmacists.find((p) => String(p?.pharmacistName || '').trim().toLowerCase() === this.currentPharmacistName.toLowerCase())
      : null;
    if (byName?._id) {
      this.currentPharmacistId = String(byName._id);
    }
  }

  // === Điều khiển nút chính trên modal ===

  get primaryButtonLabel(): string {
    if (!this.selectedPrescription) return 'Lưu';
    if (this.isAdmin) return 'Phân công';
    if (this.selectedPrescription.status === 'pending') return 'Gửi yêu cầu';
    if (this.selectedPrescription.status === 'waiting') return 'Cập nhật trạng thái';
    return 'Lưu thay đổi';
  }

  onPrimaryButtonClick() {
    if (!this.selectedPrescription) return;

    if (this.isAdmin) {
      this.savePrescription();
      return;
    }

    // Với trạng thái "Đang tư vấn" thì hỏi tiếp Đã liên hệ / Chưa thể liên hệ
    if (this.selectedPrescription.status === 'waiting') {
      this.statusDialog.show = true;
      return;
    }

    // Các trạng thái khác dùng luồng lưu mặc định
    this.savePrescription();
  }

  closeStatusDialog() {
    this.statusDialog.show = false;
  }

  markAsContacted() {
    if (!this.selectedPrescription) return;
    this.statusDialog.show = false;
    this.savePrescription('advised', 'Đơn thuốc đã được cập nhật sang trạng thái Đã tư vấn.');
  }

  markAsUnreachable() {
    if (!this.selectedPrescription) return;
    this.statusDialog.show = false;
    this.savePrescription('unreachable', 'Đơn thuốc đã được cập nhật sang trạng thái Chưa thể liên hệ.');
  }
}
