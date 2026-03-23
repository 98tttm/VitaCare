import { Component, OnInit, Inject, HostListener, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  /** Sau 2 lần liên lạc vẫn không liên hệ được — dược sĩ chọn « Tư vấn thất bại » */
  consultationFailedCount = 0;
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
  /** Dropdown tùy chỉnh phân công dược sĩ (thay select native để style được panel). */
  showPharmacistAssignDropdown = false;

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

  /** Sau lần liên lạc lại thứ 2: chọn Hoàn thành tư vấn / Tư vấn thất bại (đơn unreachable). */
  unreachableOutcomeDialog = { show: false };

  private readonly unreachableRetryLsPrefix = 'vc_rx_unreachable_retry:';
  currentRole: 'admin' | 'pharmacist' = 'admin';
  currentPharmacistId = '';
  currentPharmacistName = '';
  currentPharmacistEmail = '';

  /** Từ URL (?prescriptionId=) khi mở từ thông báo phân công — chỉ dược sĩ. */
  focusPrescriptionId = '';

  /** Khóa hàng đang gọi API nhắc nhở (tránh double-click). */
  remindingPrescriptionKey: string | null = null;

  constructor(
    @Inject(ConsultationService) private consultationService: ConsultationService,
    private datePipe: DatePipe,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private destroyRef: DestroyRef
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    this.showFilterDropdown = false;
    this.showSortDropdown = false;
  }

  ngOnInit() {
    this.loadCurrentAccount();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncFocusFromRoute();
        this.loadData();
      });
  }

  private syncFocusFromRoute(): void {
    const id = String(this.route.snapshot.queryParamMap.get('prescriptionId') || '').trim();
    this.focusPrescriptionId = this.isPharmacist ? id : '';
  }

  clearPrescriptionFocus(): void {
    void this.router.navigate(['/admin/consultation-prescription'], { queryParams: {} });
  }

  private prescriptionListQueryArgs(): {
    role: 'admin' | 'pharmacist';
    pharmacistId: string;
    pharmacistEmail: string;
    pharmacistName: string;
    focusId?: string;
  } {
    const focusId =
      this.isPharmacist && this.focusPrescriptionId ? this.focusPrescriptionId : undefined;
    return {
      role: this.currentRole,
      pharmacistId: this.currentPharmacistId,
      pharmacistEmail: this.currentPharmacistEmail,
      pharmacistName: this.currentPharmacistName,
      focusId,
    };
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
      if (this.currentRole === 'pharmacist') {
        const pi = this.filters.status.indexOf('pending');
        if (pi > -1) this.filters.status.splice(pi, 1);
        if (this.currentFilter === 'pending') this.currentFilter = '';
      }
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

  private static readonly REMIND_AFTER_MS = 2 * 60 * 60 * 1000;

  /** Chỉ đơn đang ở trạng thái «Đang tư vấn» (waiting) — cột chuông chỉ áp dụng các dòng này. */
  isPrescriptionRowWaiting(item: any): boolean {
    return String(item?.status ?? '').trim().toLowerCase() === 'waiting';
  }

  /** Mốc bắt đầu lần waiting hiện tại (khớp backend). */
  private getWaitingSinceDate(row: any): Date | null {
    if (!row || !this.isPrescriptionRowWaiting(row)) return null;
    const cur = row.current_status;
    if (cur && typeof cur === 'object' && String(cur.status ?? '').toLowerCase() === 'waiting' && cur.changedAt) {
      const d = new Date(cur.changedAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const h = Array.isArray(row.status_history) ? row.status_history : [];
    for (let i = h.length - 1; i >= 0; i--) {
      const e = h[i];
      if (String(e?.status ?? '').toLowerCase() === 'waiting' && e?.changedAt) {
        const d = new Date(e.changedAt);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    const fb = row.updatedAt || row.createdAt;
    if (fb) {
      const d = new Date(fb);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  /** Dòng phụ dưới badge trạng thái (chỉ waiting): «Thời gian: …». */
  getPrescriptionWaitingElapsedLabel(item: any): string {
    if (!this.isPrescriptionRowWaiting(item)) return '';
    const since = this.getWaitingSinceDate(item);
    if (!since) return '';
    const ms = Date.now() - since.getTime();
    if (ms < 0) return '';
    const minMs = 60 * 1000;
    const hourMs = 60 * minMs;
    const dayMs = 24 * hourMs;
    if (ms >= dayMs) {
      const days = Math.floor(ms / dayMs);
      return `${days} ngày`;
    }
    if (ms >= hourMs) {
      return `${Math.floor(ms / hourMs)} giờ`;
    }
    if (ms >= minMs) {
      return `${Math.floor(ms / minMs)} phút`;
    }
    return 'Vừa xong';
  }

  /** Thời gian chờ (vd. «65 ngày») hoặc `null` — dùng `@if` template một lần gọi. */
  prescriptionWaitingElapsedLine(item: any): string | null {
    const label = this.getPrescriptionWaitingElapsedLabel(item);
    return label ? label : null;
  }

  /** Admin: có hiện ô chuông (chỉ hàng waiting). */
  showAdminRemindBellCell(item: any): boolean {
    return this.isAdmin && this.isPrescriptionRowWaiting(item);
  }

  /** Đủ điều kiện gửi nhắc nhở: waiting + đã phân công + ≥ 2 giờ. */
  canSendPrescriptionReminder(item: any): boolean {
    if (!this.isAdmin || !item || !this.isPrescriptionRowWaiting(item)) return false;
    const pid = String(item.pharmacist_id ?? item.pharmacistId ?? '').trim();
    if (!pid) return false;
    const since = this.getWaitingSinceDate(item);
    if (!since) return false;
    return Date.now() - since.getTime() >= Consultationprescription.REMIND_AFTER_MS;
  }

  prescriptionRemindButtonTitle(item: any): string {
    if (!this.isAdmin || !this.isPrescriptionRowWaiting(item)) return '';
    const pid = String(item.pharmacist_id ?? item.pharmacistId ?? '').trim();
    if (!pid) return 'Chưa phân công dược sĩ — không gửi nhắc nhở được.';
    if (!this.canSendPrescriptionReminder(item)) {
      return 'Sau 2 giờ kể từ lúc phân công mới gửi nhắc nhở tới dược sĩ.';
    }
    return 'Gửi nhắc nhở tới dược sĩ';
  }

  /** Đã tư vấn xong và khách đã chấm 1–5 sao (PATCH /api/prescriptions/:id/review). */
  hasPrescriptionCustomerReview(row: any): boolean {
    if (String(row?.status ?? '').trim().toLowerCase() !== 'advised') return false;
    const r = Math.round(Number(row?.user_prescription_rating));
    return Number.isFinite(r) && r >= 1 && r <= 5;
  }

  getPrescriptionReviewStarCount(row: any): number {
    if (!this.hasPrescriptionCustomerReview(row)) return 0;
    return Math.min(5, Math.max(1, Math.round(Number(row.user_prescription_rating))));
  }

  readonly prescriptionReviewStarSlots: readonly number[] = [1, 2, 3, 4, 5];

  getPrescriptionCustomerReviewText(row: any): string {
    return String(row?.user_prescription_review ?? '').trim();
  }

  isRemindInProgress(item: any): boolean {
    const key = this.prescriptionRemindRowKey(item);
    return !!key && this.remindingPrescriptionKey === key;
  }

  private prescriptionRemindRowKey(item: any): string {
    if (!item) return '';
    return String(item.prescriptionId || item._id || '').trim();
  }

  onRemindPharmacistClick(item: any, event: Event): void {
    event.stopPropagation();
    if (!this.canSendPrescriptionReminder(item)) return;
    const key = this.prescriptionRemindRowKey(item);
    if (!key || this.remindingPrescriptionKey) return;
    const apiId = String(item.prescriptionId || item._id || '').trim();
    if (!apiId) return;
    this.remindingPrescriptionKey = key;
    this.consultationService.remindPrescriptionPharmacist(apiId).subscribe({
      next: (res) => {
        this.remindingPrescriptionKey = null;
        if (res?.success) {
          this.showNotification(res.message || 'Đã gửi nhắc nhở tới dược sĩ.', 'success');
        } else {
          this.showNotification(res?.message || 'Không gửi được nhắc nhở.', 'error');
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.remindingPrescriptionKey = null;
        const msg =
          err?.error?.message ||
          (typeof err?.error === 'string' ? err.error : '') ||
          err?.message ||
          'Không gửi được nhắc nhở.';
        this.showNotification(msg, 'error');
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Đơn đã được phân công / đã vào luồng xử lý (khác pending) → admin không phân công lại.
   * Kiểm tra cả id, tên và trạng thái vì DB có thể thiếu pharmacist_id nhưng vẫn có tên hoặc đã waiting/unreachable/...
   */
  private prescriptionRowHasAssignedPharmacist(row: any): boolean {
    if (!row) return false;
    const id = String(row.pharmacist_id ?? row.pharmacistId ?? row.pharmacistID ?? '').trim();
    if (id && id !== 'undefined' && id !== 'null') return true;
    const nm = String(row.pharmacistName ?? '').trim();
    if (nm) return true;
    const st = String(row.status ?? 'pending').trim().toLowerCase();
    return st !== '' && st !== 'pending';
  }

  /**
   * Admin: đơn đã phân công hoặc không còn pending → chỉ xem; ẩn nút Phân công và không cho sửa khung dược sĩ.
   */
  get isAdminPharmacistAssignmentLocked(): boolean {
    if (!this.selectedPrescription || !this.isAdmin) return false;
    return this.prescriptionRowHasAssignedPharmacist(this.selectedPrescription);
  }

  /** Nhãn hiển thị khi admin xem đơn đã phân công (không dùng select). */
  getAssignedPharmacistDisplayLabel(): string {
    const p = this.selectedPrescription;
    if (!p) return '—';
    const direct = String(p.pharmacistName || '').trim();
    if (direct) return `Dược sĩ ${direct}`;
    const pid = String(p.pharmacist_id ?? p.pharmacistId ?? this.editedPharmacistId ?? '').trim();
    const fromList = pid
      ? this.pharmacists.find((ph) => String(ph._id) === pid)
      : null;
    if (fromList?.pharmacistName) return `Dược sĩ ${fromList.pharmacistName}`;
    const fallback = String(p.pharmacist_name || '').trim();
    if (fallback && fallback !== 'Chưa phân công') {
      return fallback.toLowerCase().includes('dược sĩ') ? fallback : `Dược sĩ ${fallback}`;
    }
    return '—';
  }

  get isPharmacistUnreachableDetail(): boolean {
    return (
      this.isPharmacist &&
      !!this.selectedPrescription &&
      this.selectedPrescription.status === 'unreachable'
    );
  }

  private unreachableRetryStorageKey(prescriptionRowId: string): string {
    return `${this.unreachableRetryLsPrefix}${prescriptionRowId}`;
  }

  private clearUnreachableRetryForPrescription(prescriptionRowId: string): void {
    if (typeof window === 'undefined' || !prescriptionRowId) return;
    try {
      localStorage.removeItem(this.unreachableRetryStorageKey(prescriptionRowId));
    } catch {
      /* ignore */
    }
  }

  private hasUnreachableFirstRecontactRecorded(prescriptionRowId: string): boolean {
    if (typeof window === 'undefined' || !prescriptionRowId) return false;
    try {
      return localStorage.getItem(this.unreachableRetryStorageKey(prescriptionRowId)) === '1';
    } catch {
      return false;
    }
  }

  private recordUnreachableFirstRecontact(prescriptionRowId: string): void {
    if (typeof window === 'undefined' || !prescriptionRowId) return;
    try {
      localStorage.setItem(this.unreachableRetryStorageKey(prescriptionRowId), '1');
    } catch {
      /* ignore */
    }
  }

  loadData() {
    this.isLoading = true;
    const q = this.prescriptionListQueryArgs();
    // Parallel fetch: pharmacists + prescriptions at the same time
    forkJoin({
      pharmacists: this.consultationService.getPharmacists().pipe(catchError(() => of({ data: [] }))),
      prescriptions: this.consultationService
        .getPrescriptionConsultationsByRole(
          q.role,
          q.pharmacistId,
          q.pharmacistEmail,
          q.pharmacistName,
          q.focusId
        )
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
    const q = this.prescriptionListQueryArgs();
    this.consultationService
      .getPrescriptionConsultationsByRole(
        q.role,
        q.pharmacistId,
        q.pharmacistEmail,
        q.pharmacistName,
        q.focusId
      )
      .subscribe({
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
    /** Tư vấn thất bại: status mới + đơn cancelled sau luồng «không liên hệ được» (có unreachable trong lịch sử). */
    this.consultationFailedCount = this.prescriptions.filter((p) =>
      this.isConsultationFailurePrescription(p)
    ).length;
    /** Đã huỷ: khách hủy — cancelled mà không thuộc luồng thất bại ở trên. */
    this.cancelledCount = this.prescriptions.filter((p) => this.isCustomerCancelledPrescription(p)).length;
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

    // Status Filter (Multiple) — consultation_failed / cancelled dựa trên lịch sử, không chỉ raw status
    if (this.filters.status.length > 0) {
      result = result.filter((p) =>
        this.filters.status.some((fk: string) => this.prescriptionMatchesStatusFilter(p, fk))
      );
    } else if (this.currentFilter !== '') {
      result = result.filter((p) => this.prescriptionMatchesStatusFilter(p, this.currentFilter));
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

  /** Đơn từng ở trạng thái không liên hệ được (dùng để phân biệt huỷ do tư vấn vs khách huỷ). */
  prescriptionHadUnreachableInHistory(p: any): boolean {
    const h = p?.status_history;
    if (!Array.isArray(h)) return false;
    return h.some((e: any) => String(e?.status || '').toLowerCase() === 'unreachable');
  }

  /** Tư vấn thất bại: consultation_failed hoặc cancelled sau luồng unreachable (dữ liệu cũ lưu cancelled). */
  isConsultationFailurePrescription(p: any): boolean {
    const s = String(p?.status || '').toLowerCase();
    if (s === 'consultation_failed') return true;
    if (s === 'cancelled' && this.prescriptionHadUnreachableInHistory(p)) return true;
    return false;
  }

  /** Khách / tư vấn hủy đơn không qua luồng «không liên hệ được». */
  isCustomerCancelledPrescription(p: any): boolean {
    const s = String(p?.status || '').toLowerCase();
    return s === 'cancelled' && !this.isConsultationFailurePrescription(p);
  }

  prescriptionMatchesStatusFilter(p: any, filterKey: string): boolean {
    const fk = String(filterKey || '').toLowerCase();
    if (fk === 'consultation_failed') return this.isConsultationFailurePrescription(p);
    if (fk === 'cancelled') return this.isCustomerCancelledPrescription(p);
    return String(p?.status || '') === fk;
  }

  /** Nhãn trạng thái hiển thị trên bảng (phân tách thất bại vs huỷ khi DB vẫn là cancelled). */
  getPrescriptionStatusDisplay(p: any): string {
    if (this.isConsultationFailurePrescription(p)) return 'Tư vấn thất bại';
    if (this.isCustomerCancelledPrescription(p)) return 'Đã huỷ';
    return this.getStatusLabel(String(p?.status || ''));
  }

  /** Class màu tag trạng thái (bảng). */
  getPrescriptionStatusBadgeClass(p: any): string {
    if (this.isConsultationFailurePrescription(p)) return 'rx-status-badge--failed';
    if (this.isCustomerCancelledPrescription(p)) return 'rx-status-badge--cancelled';
    const s = String(p?.status || '').toLowerCase();
    switch (s) {
      case 'pending':
        return 'rx-status-badge--pending';
      case 'waiting':
        return 'rx-status-badge--waiting';
      case 'unreachable':
        return 'rx-status-badge--unreachable';
      case 'advised':
        return 'rx-status-badge--advised';
      case 'consultation_failed':
        return 'rx-status-badge--failed';
      case 'cancelled':
        return 'rx-status-badge--cancelled';
      default:
        return 'rx-status-badge--default';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'pending': return 'Chưa phân công';
      case 'waiting': return this.isPharmacist ? 'Chưa tư vấn' : 'Đang tư vấn';
      case 'unreachable': return 'Chưa thể liên hệ';
      case 'advised': return 'Đã tư vấn';
      case 'consultation_failed': return 'Tư vấn thất bại';
      case 'cancelled': return 'Đã huỷ';
      default: return status;
    }
  }

  /** Một dòng trong lịch sử (modal): bước cuối cancelled sau unreachable → ghi rõ là kết thúc thất bại. */
  getHistoryEntryDisplayLabel(entry: any, index: number, total: number, prescription: any): string {
    const st = String(entry?.status || '').toLowerCase();
    if (
      st === 'cancelled' &&
      index === total - 1 &&
      this.prescriptionHadUnreachableInHistory(prescription)
    ) {
      return 'Tư vấn thất bại (kết thúc sau không liên hệ được)';
    }
    return this.getStatusLabel(st);
  }

  /**
   * Màu nền khung lịch sử modal: pending, waiting, unreachable, failed, success, cancelled, default.
   */
  getStatusHistoryRowTone(entry: any, index: number, total: number, prescription: any): string {
    const st = String(entry?.status || '').toLowerCase();
    if (
      st === 'cancelled' &&
      index === total - 1 &&
      this.prescriptionHadUnreachableInHistory(prescription)
    ) {
      return 'failed';
    }
    switch (st) {
      case 'pending':
        return 'pending';
      case 'waiting':
        return 'waiting';
      case 'unreachable':
        return 'unreachable';
      case 'consultation_failed':
        return 'failed';
      case 'advised':
        return 'success';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'default';
    }
  }

  getStatusHistoryRows(
    prescription: any | null,
  ): { changedAt: string; changedBy: string; label: string; tone: string }[] {
    if (!prescription) return [];
    const h = Array.isArray(prescription.status_history) ? prescription.status_history : [];
    const total = h.length;
    return h.map((e: any, idx: number) => ({
      changedAt: e?.changedAt ?? '',
      changedBy: String(e?.changedBy ?? '—').trim() || '—',
      label: this.getHistoryEntryDisplayLabel(e, idx, total, prescription),
      tone: this.getStatusHistoryRowTone(e, idx, total, prescription),
    }));
  }

  formatDate(dateString: string | Date | undefined | null): string {
    if (dateString == null || dateString === '') return '';
    return this.datePipe.transform(dateString, 'dd/MM/yyyy HH:mm') || '';
  }

  /** Cột bảng «Ngày gửi»: chỉ ngày, gọn cột. */
  formatDateDayOnly(dateString: string | Date | undefined | null): string {
    if (dateString == null || dateString === '') return '';
    return this.datePipe.transform(dateString, 'dd/MM/yyyy') || '';
  }

  openDetailModal(item: any) {
    this.selectedPrescription = { ...item };
    const pid = item.pharmacist_id ?? item.pharmacistId ?? item.pharmacistID ?? '';
    this.editedPharmacistId = String(pid || '').trim();
    this.showPharmacistAssignDropdown = false;
    this.isModalOpen = true;
  }

  closeModal() {
    this.statusDialog.show = false;
    this.unreachableOutcomeDialog.show = false;
    this.isModalOpen = false;
    this.selectedPrescription = null;
    this.showPharmacistAssignDropdown = false;
  }

  pharmacistAssignTriggerLabel(): string {
    const id = String(this.editedPharmacistId || '').trim();
    if (!id) return 'Chọn dược sĩ';
    const p = this.pharmacists.find((ph) => String(ph?._id ?? '') === id);
    return p?.pharmacistName ? `Dược sĩ ${p.pharmacistName}` : 'Chọn dược sĩ';
  }

  togglePharmacistAssignDropdown(event: Event): void {
    event.stopPropagation();
    if (this.isPharmacist) return;
    this.showPharmacistAssignDropdown = !this.showPharmacistAssignDropdown;
  }

  choosePharmacistAssign(pharmacistId: string | undefined): void {
    this.editedPharmacistId = String(pharmacistId ?? '').trim();
    this.showPharmacistAssignDropdown = false;
  }

  isPharmacistAssignOptionSelected(id: string): boolean {
    return String(this.editedPharmacistId || '').trim() === String(id || '').trim();
  }

  isSaving = false;

  /**
   * Lưu đơn tư vấn với trạng thái hiện tại,
   * hoặc ép sang trạng thái mới nếu truyền newStatus.
   */
  savePrescription(
    newStatus?: 'waiting' | 'unreachable' | 'advised' | 'cancelled' | 'consultation_failed',
    successMessage?: string
  ) {
    if (this.isSaving) return;

    if (!this.selectedPrescription) return;
    if (this.isAdminPharmacistAssignmentLocked) return;

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

    // Admin: phân công dược sĩ; nếu đơn đang chưa phân công (pending) thì chuyển sang "Đang tư vấn"
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

      // Đơn còn "Chưa phân công" (pending) → sau phân công phải sang "Đang tư vấn" (kể cả trùng dược sĩ — tránh kẹt pending).
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

    const rowIdBeforeSave = String(this.selectedPrescription.id || '').trim();

    this.consultationService.updatePrescription(this.selectedPrescription.id, payload).subscribe({
      next: (res) => {
        this.isSaving = false;
        const ok = !res || res.success !== false;
        if (!ok) {
          this.showNotification('Lỗi: ' + (res?.message || 'Không thể cập nhật đơn tư vấn'), 'error');
          return;
        }

        if (
          !this.isAdmin &&
          rowIdBeforeSave &&
          (payload.status === 'advised' ||
            payload.status === 'cancelled' ||
            payload.status === 'consultation_failed')
        ) {
          this.clearUnreachableRetryForPrescription(rowIdBeforeSave);
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
    if (this.isAdminPharmacistAssignmentLocked) return;

    if (this.isAdmin) {
      this.savePrescription();
      return;
    }

    // Với trạng thái "Đang tư vấn" thì hỏi tiếp Đã liên hệ / Chưa thể liên hệ
    if (this.selectedPrescription.status === 'waiting') {
      this.statusDialog.show = true;
      return;
    }

    if (this.selectedPrescription.status === 'unreachable') {
      this.showNotification(
        'Vui lòng dùng nút "Liên lạc lại" để ghi nhận và cập nhật kết quả.',
        'warning'
      );
      return;
    }

    if (
      this.selectedPrescription.status === 'advised' ||
      this.selectedPrescription.status === 'cancelled' ||
      this.selectedPrescription.status === 'consultation_failed'
    ) {
      this.showNotification('Đơn đã kết thúc. Không cần cập nhật thêm.', 'warning');
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

  onUnreachableContactAgainClick(): void {
    if (!this.selectedPrescription || !this.isPharmacistUnreachableDetail) return;
    const rowId = String(this.selectedPrescription.id || '').trim();
    if (!rowId) return;

    if (!this.hasUnreachableFirstRecontactRecorded(rowId)) {
      this.recordUnreachableFirstRecontact(rowId);
      this.showNotification(
        'Đã ghi nhận lần liên lạc lại thứ nhất. Sau khi thử liên hệ lần hai, bấm "Liên lạc lại" một lần nữa để chọn kết quả tư vấn.',
        'success'
      );
      return;
    }

    this.unreachableOutcomeDialog.show = true;
  }

  closeUnreachableOutcomeDialog(): void {
    this.unreachableOutcomeDialog.show = false;
  }

  unreachableOutcomeComplete(): void {
    if (!this.selectedPrescription) return;
    this.unreachableOutcomeDialog.show = false;
    this.savePrescription('advised', 'Đã cập nhật: Hoàn thành tư vấn.');
  }

  unreachableOutcomeFailed(): void {
    if (!this.selectedPrescription) return;
    this.unreachableOutcomeDialog.show = false;
    this.savePrescription('consultation_failed', 'Đã đánh dấu tư vấn thất bại (không liên lạc được sau lần 2).');
  }
}
