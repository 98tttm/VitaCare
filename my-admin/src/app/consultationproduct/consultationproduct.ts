import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsultationService } from '../services/consultation.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-consultationproduct',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe, ConsultationService],
  templateUrl: './consultationproduct.html',
  styleUrl: './consultationproduct.css',
})
export class Consultationproduct implements OnInit {
  products: any[] = [];
  filteredProducts: any[] = [];
  selectedProduct: any | null = null;

  questions: any[] = [];
  filteredQuestions: any[] = [];

  pharmacists: any[] = [];
  searchText: string = '';
  productSearchText: string = '';
  isLoading: boolean = false;

  totalQuestions = 0;
  pendingCount = 0;
  assignedCount = 0;
  answeredCount = 0;

  currentFilter: string = '';
  currentSort: string = 'newest';

  isModalOpen = false;
  selectedQuestion: any | null = null;
  editedPharmacistId: string = '';
  replyContent: string = '';
  selectAll = false;

  notification = { show: false, message: '', type: 'success' };

  showFilterDropdown = false;
  showSortDropdown = false;

  filters = {
    status: [] as string[]
  };
  currentRole: 'admin' | 'pharmacist' = 'admin';
  currentPharmacistId = '';
  currentPharmacistName = '';
  currentPharmacistEmail = '';
  currentDisplayName = 'Admin';

  get activeFilterCount(): number {
    return this.filters.status.length;
  }

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
      const account = JSON.parse(raw);
      this.currentRole = account?.accountRole === 'pharmacist' ? 'pharmacist' : 'admin';
      this.currentPharmacistId = String(account?._id || account?.pharmacist_id || '').trim();
      this.currentPharmacistName = String(account?.pharmacistName || account?.adminname || '').trim();
      this.currentPharmacistEmail = String(account?.pharmacistEmail || account?.email || account?.adminemail || '').trim().toLowerCase();
      this.currentDisplayName = account?.pharmacistName || account?.adminname || account?.fullname || account?.name || 'Admin';
    } catch {
      this.currentRole = 'admin';
      this.currentPharmacistId = '';
      this.currentPharmacistName = '';
      this.currentPharmacistEmail = '';
      this.currentDisplayName = 'Admin';
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
    // Parallel fetch: pharmacists + products at the same time
    forkJoin({
      pharmacists: this.consultationService.getPharmacists().pipe(catchError(() => of({ data: [] }))),
      products: this.consultationService
        .getProductConsultationStatsByRole(this.currentRole, this.currentPharmacistId, this.currentPharmacistEmail, this.currentPharmacistName)
        .pipe(catchError(() => of({ success: true, data: [] })))
    }).subscribe(({ pharmacists, products }) => {
      this.pharmacists = (pharmacists && pharmacists.data) ? pharmacists.data : (Array.isArray(pharmacists) ? pharmacists : []);
      const previousId = this.currentPharmacistId;
      this.resolveCurrentPharmacistId();

      if (products && products.success) {
        this.products = products.data;
        this.applyProductFilters();
        this.calculateGlobalStats();
      }
      this.isLoading = false;
      this.cdr.markForCheck(); // Force immediate view update

      // If pharmacist id was resolved from email/name after loading list, reload scoped data.
      if (this.isPharmacist && this.currentPharmacistId && this.currentPharmacistId !== previousId) {
        this.fetchProducts();
      }
    });
  }

  fetchProducts() {
    this.isLoading = true;
    this.consultationService.getProductConsultationStatsByRole(this.currentRole, this.currentPharmacistId, this.currentPharmacistEmail, this.currentPharmacistName).subscribe({
      next: (res) => {
        if (res.success) {
          this.products = res.data;
          this.applyProductFilters();
          this.calculateGlobalStats();
          this.cdr.markForCheck();
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
      }
    });
  }

  calculateGlobalStats() {
    this.totalQuestions = this.products.reduce((acc, p) => acc + (p.totalQuestions || 0), 0);
    this.pendingCount = this.products.reduce((acc, p) => acc + (p.pendingCount ?? p.unansweredCount ?? 0), 0);
    this.assignedCount = this.products.reduce((acc, p) => acc + (p.assignedCount || 0), 0);
    this.answeredCount = this.totalQuestions - this.pendingCount - this.assignedCount;
  }

  applyProductFilters() {
    let result = [...this.products];

    // Filter by Search Text
    if (this.productSearchText.trim()) {
      const lower = this.productSearchText.toLowerCase();
      result = result.filter(p =>
        p.productName.toLowerCase().includes(lower) ||
        p.sku.toLowerCase().includes(lower)
      );
    }

    // Filter by Status (Stat Cards)
    if (this.currentFilter === 'pending') {
      result = result.filter(p => (p.pendingCount ?? p.unansweredCount ?? 0) > 0);
    } else if (this.currentFilter === 'assigned') {
      result = result.filter(p => (p.assignedCount || 0) > 0);
    } else if (this.currentFilter === 'answered') {
      result = result.filter(p => (p.totalQuestions - (p.pendingCount ?? p.unansweredCount ?? 0)) > 0);
    }

    this.filteredProducts = result;
  }

  selectProduct(product: any) {
    this.selectedProduct = product;
    this.isLoading = true;
    this.consultationService.getProductConsultationsByRole(this.currentRole, this.currentPharmacistId, this.currentPharmacistEmail, this.currentPharmacistName).subscribe({
      next: (res) => {
        if (res.success) {
          const foundProduct = this.findConsultationRowBySku(res.data, product.sku);
          if (foundProduct) {
            const rawQuestions = Array.isArray(foundProduct.questions) ? foundProduct.questions : [];
            this.questions = rawQuestions.map((q: any) => ({
              ...q,
              productSku: foundProduct.sku,
              productName: foundProduct.productName
            }));
            this.applyFiltersAndSort();
          } else {
            this.questions = [];
            this.filteredQuestions = [];
          }
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** SKU trong DB có thể là number hoặc string — so sánh === thường không khớp. */
  private findConsultationRowBySku(rows: any[] | undefined, sku: unknown): any | undefined {
    if (!Array.isArray(rows)) return undefined;
    const want = String(sku ?? '').trim();
    let row = rows.find((p) => String(p?.sku ?? '').trim() === want);
    if (row) return row;
    const n = Number(want);
    if (!Number.isNaN(n) && want !== '') {
      row = rows.find((p) => p?.sku === n || String(p?.sku ?? '').trim() === want);
    }
    return row;
  }

  goBackToProducts() {
    this.selectedProduct = null;
    this.questions = [];
    this.fetchProducts();
  }

  onSearchChange() { this.applyFiltersAndSort(); }

  toggleFilter(type: 'status', value: string) {
    const idx = this.filters[type].indexOf(value);
    if (idx > -1) {
      this.filters[type].splice(idx, 1);
    } else {
      this.filters[type].push(value);
    }
    this.applyFiltersAndSort();
  }

  isFilterSelected(type: 'status', value: string): boolean {
    return this.filters[type].includes(value);
  }

  clearAllFilters() {
    this.filters.status = [];
    this.currentFilter = '';
    this.applyFiltersAndSort();
  }

  toggleFilterDropdown(event: Event) {
    event.stopPropagation();
    this.showFilterDropdown = !this.showFilterDropdown;
    this.showSortDropdown = false;
  }

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
    if (this.selectedProduct) {
      this.applyFiltersAndSort();
    } else {
      this.applyProductFilters();
    }
  }

  onFilterChange() { this.applyFiltersAndSort(); }
  onSortChange() { this.applyFiltersAndSort(); }

  applyFiltersAndSort() {
    if (!this.selectedProduct) return;
    let result = [...(this.questions || [])];

    const getQuestionState = (q: any): 'pending' | 'assigned' | 'answered' => {
      if (q?.status === 'assigned') return 'assigned';
      const hasAnswer = !!(q?.answer && String(q.answer).trim());
      if (hasAnswer) return 'answered';
      if (q?.status === 'answered') return 'answered';
      return 'pending';
    };

    // Status Filter (Multiple)
    if (this.filters.status.length > 0) {
      result = result.filter(q => {
        return this.filters.status.includes(getQuestionState(q));
      });
    } else if (this.currentFilter !== '') {
      result = result.filter(q => {
        return getQuestionState(q) === this.currentFilter;
      });
    }

    if (this.searchText.trim() !== '') {
      const lowerSearch = this.searchText.toLowerCase();
      result = result.filter((p: any) =>
        p.full_name?.toLowerCase().includes(lowerSearch) ||
        p.question?.toLowerCase().includes(lowerSearch)
      );
    }
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return this.currentSort === 'newest' ? dateB - dateA : dateA - dateB;
    });
    this.filteredQuestions = result;
  }

  toggleAll(event: any) {
    this.selectAll = event.target.checked;
    this.filteredQuestions.forEach(p => p.selected = this.selectAll);
  }

  checkIfAllSelected() {
    this.selectAll = this.filteredQuestions.length > 0 && this.filteredQuestions.every(p => p.selected);
  }

  getStatusLabel(status: string): string {
    if (status === 'answered') return 'Đã trả lời';
    if (status === 'assigned') return 'Đã phân công';
    return 'Chờ xử lý'; // pending, unreviewed, or any other = pending
  }

  getQuestionStatusText(item: any): string {
    if (item?.status === 'answered' && item?.answer) return 'Đã trả lời';
    if (item?.status === 'assigned') return 'Đã phân công';
    return 'Đang chờ';
  }

  getQuestionStatusClass(item: any): string {
    if (item?.status === 'answered' && item?.answer) return 'status-answered';
    if (item?.status === 'assigned') return 'status-assigned';
    return 'status-pending';
  }

  formatDate(dateString: any): string {
    if (!dateString) return '';
    return this.datePipe.transform(dateString, 'dd/MM/yyyy') || '';
  }

  openDetailModal(item: any) {
    this.selectedQuestion = { ...item };
    this.replyContent = item.answer || '';
    if (this.isAdmin) {
      const foundPharmacist = this.pharmacists.find(
        p => String(p._id) === String(item.assignedPharmacistId || item.pharmacist_id || item.pharmacistId || '')
      );
      this.editedPharmacistId = foundPharmacist ? foundPharmacist._id : '';
    } else {
      this.editedPharmacistId = this.currentPharmacistId;
    }
    this.isModalOpen = true;
  }

  closeModal() { this.isModalOpen = false; this.selectedQuestion = null; }

  saveQuestion() {
    if (!this.selectedQuestion || !this.selectedProduct) return;

    const trimmedReply = (this.replyContent || '').trim();
    const payload: any = {
      sku: this.selectedProduct.sku,
      questionId: this.selectedQuestion._id,
      actorRole: this.currentRole
    };

    if (this.isAdmin) {
      if (trimmedReply) {
        payload.answer = trimmedReply;
        payload.answeredBy = 'Admin';
      } else {
        if (!this.editedPharmacistId) {
          this.showNotification('Vui lòng chọn dược sĩ để phân công.', 'warning');
          return;
        }
        payload.answer = '';
        payload.assignedPharmacistId = this.editedPharmacistId;
        payload.assignedBy = this.currentDisplayName || 'Admin';
      }
    } else {
      if (!trimmedReply) {
        this.showNotification('Vui lòng nhập nội dung trả lời.', 'warning');
        return;
      }
      payload.answer = trimmedReply;
      payload.answeredBy = this.currentDisplayName || 'Dược sĩ';
    }

    this.consultationService.replyProductQuestion(payload).subscribe({
      next: (res) => {
        if (res.success) {
          const message = res.mode === 'assigned'
            ? 'Đã phân công và gửi email cho dược sĩ thành công.'
            : 'Đã cập nhật câu trả lời thành công.';
          this.showNotification(message);
          this.selectProduct(this.selectedProduct); // Refresh questions
          this.fetchProducts();
          this.closeModal();
        } else {
          this.showNotification('Lỗi khi lưu phản hồi', 'error');
        }
      },
      error: (err) => {
        this.showNotification('Đã có lỗi xảy ra', 'error');
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
}
