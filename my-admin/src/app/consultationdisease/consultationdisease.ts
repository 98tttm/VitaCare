import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsultationService } from '../services/consultation.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-consultationdisease',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe, ConsultationService],
  templateUrl: './consultationdisease.html',
  styleUrl: './consultationdisease.css',
})
export class Consultationdisease implements OnInit {
  diseases: any[] = [];
  filteredDiseases: any[] = [];
  selectedDisease: any | null = null;

  questions: any[] = [];
  filteredQuestions: any[] = [];

  pharmacists: any[] = [];
  searchText: string = '';
  diseaseSearchText: string = '';
  isLoading: boolean = false;

  totalQuestions = 0;
  pendingCount = 0;
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
  currentAccountRole: 'admin' | 'pharmacist' = 'admin';
  currentPharmacistId: string = '';
  currentPharmacistName: string = '';
  currentPharmacistEmail: string = '';

  filters = {
    status: [] as string[]
  };

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

  loadData() {
    this.isLoading = true;
    forkJoin({
      pharmacists: this.consultationService.getPharmacists().pipe(catchError(() => of({ data: [] }))),
      diseases: this.consultationService.getDiseaseConsultationStats().pipe(catchError(() => of({ success: true, data: [] }))),
      diseaseDetails: this.consultationService.getDiseaseConsultations().pipe(catchError(() => of({ success: true, data: [] })))
    }).subscribe(({ pharmacists, diseases, diseaseDetails }) => {
      this.pharmacists = (pharmacists && pharmacists.data) ? pharmacists.data : (Array.isArray(pharmacists) ? pharmacists : []);
      this.resolveCurrentPharmacistId();

      if (diseases && diseases.success) {
        const details = diseaseDetails?.success ? (diseaseDetails.data || []) : [];
        this.diseases = this.mergeDiseaseStatsWithDetails(diseases.data || [], details);
        this.applyDiseaseFilters();
        this.calculateGlobalStats();
      }
      this.isLoading = false;
      this.cdr.markForCheck();
    });
  }

  fetchDiseases() {
    this.isLoading = true;
    forkJoin({
      stats: this.consultationService.getDiseaseConsultationStats().pipe(catchError(() => of({ success: true, data: [] }))),
      details: this.consultationService.getDiseaseConsultations().pipe(catchError(() => of({ success: true, data: [] })))
    }).subscribe({
      next: ({ stats, details }) => {
        if (stats.success) {
          const detailRows = details?.success ? (details.data || []) : [];
          this.diseases = this.mergeDiseaseStatsWithDetails(stats.data || [], detailRows);
          this.applyDiseaseFilters();
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
    this.totalQuestions = this.diseases.reduce((acc, d) => acc + (d.totalQuestions || 0), 0);
    this.pendingCount = this.diseases.reduce((acc, d) => acc + (d.unansweredCount || 0), 0);
    this.answeredCount = this.totalQuestions - this.pendingCount;
  }

  applyDiseaseFilters() {
    let result = [...this.diseases];

    if (this.diseaseSearchText.trim()) {
      const lower = this.diseaseSearchText.toLowerCase();
      result = result.filter(d =>
        this.getDiseaseName(d).toLowerCase().includes(lower) ||
        this.getDiseaseCategory(d).toLowerCase().includes(lower)
      );
    }

    if (this.currentFilter === 'pending') {
      result = result.filter(d => d.unansweredCount > 0);
    } else if (this.currentFilter === 'answered') {
      result = result.filter(d => (d.totalQuestions - d.unansweredCount) > 0);
    }

    this.filteredDiseases = result;
  }

  selectDisease(disease: any) {
    this.selectedDisease = disease;
    this.isLoading = true;
    this.consultationService.getDiseaseConsultations().subscribe({
      next: (res) => {
        if (res.success) {
          const foundDisease = this.findDiseaseRowBySku(res.data, disease.sku);
          if (foundDisease) {
            const resolvedName =
              disease?.productName ||
              disease?.name ||
              foundDisease.productName ||
              foundDisease.name;
            this.selectedDisease = {
              ...disease,
              productName: resolvedName,
              name: disease?.name || resolvedName
            };
            const rawQuestions = Array.isArray(foundDisease.questions) ? foundDisease.questions : [];
            this.questions = rawQuestions.map((q: any) => ({
              ...q,
              productSku: foundDisease.sku,
              productName: resolvedName || foundDisease.productName
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

  /** SKU bệnh có thể khác nhẹ (string/number hoặc hậu tố .html) so với bản trong API. */
  private findDiseaseRowBySku(rows: any[] | undefined, sku: unknown): any | undefined {
    if (!Array.isArray(rows)) return undefined;
    const norm = (v: unknown) =>
      String(v ?? '')
        .trim()
        .toLowerCase()
        .replace(/\.html$/i, '');
    const want = norm(sku);
    let row = rows.find((d) => norm(d?.sku) === want);
    if (row) return row;
    const s = String(sku ?? '').trim();
    row = rows.find((d) => String(d?.sku ?? '').trim() === s);
    if (row) return row;
    const n = Number(s);
    if (!Number.isNaN(n) && s !== '') {
      row = rows.find((d) => d?.sku === n || String(d?.sku ?? '').trim() === s);
    }
    return row;
  }

  goBackToDiseases() {
    this.selectedDisease = null;
    this.questions = [];
    this.fetchDiseases();
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
    if (this.selectedDisease) {
      this.applyFiltersAndSort();
    } else {
      this.applyDiseaseFilters();
    }
  }

  onFilterChange() { this.applyFiltersAndSort(); }
  onSortChange() { this.applyFiltersAndSort(); }

  applyFiltersAndSort() {
    if (!this.selectedDisease) return;
    let result = [...(this.questions || [])];

    const isPending = (q: any) => !q.answer || q.status === 'unreviewed' || q.status === 'pending';

    if (this.filters.status.length > 0) {
      result = result.filter(q => {
        const qStatus = isPending(q) ? 'pending' : 'answered';
        return this.filters.status.includes(qStatus);
      });
    } else if (this.currentFilter !== '') {
      result = result.filter(q => {
        const qStatus = isPending(q) ? 'pending' : 'answered';
        return qStatus === this.currentFilter;
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
    return 'Chờ xử lý';
  }

  formatDate(dateString: any): string {
    if (!dateString) return '';
    return this.datePipe.transform(dateString, 'dd/MM/yyyy') || '';
  }

  openDetailModal(item: any) {
    this.selectedQuestion = { ...item };
    this.replyContent = item.answer || '';
    const foundPharmacist = this.pharmacists.find(p => p.pharmacistName === item.answeredBy);
    const defaultPharmacistId = foundPharmacist?._id || this.getDefaultPharmacistIdForCurrentSession();
    this.editedPharmacistId = defaultPharmacistId || '';
    this.isModalOpen = true;
  }

  closeModal() { this.isModalOpen = false; this.selectedQuestion = null; }

  saveQuestion() {
    if (!this.selectedQuestion || !this.selectedDisease) return;

    const pharmacist = this.pharmacists.find(p => p._id === this.editedPharmacistId);

    const payload = {
      sku: this.selectedDisease.sku,
      questionId: this.selectedQuestion._id,
      answer: this.replyContent,
      answeredBy: pharmacist ? pharmacist.pharmacistName : 'Admin'
    };

    this.consultationService.replyDiseaseQuestion(payload).subscribe({
      next: (res) => {
        if (res.success) {
          this.showNotification('Đã lưu phản hồi thành công');
          this.selectDisease(this.selectedDisease);
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

  getDiseaseName(disease: any): string {
    const looksLikePathOrSlug = (s: string) => {
      const t = String(s || '').trim();
      return /\.html(\s|$)/i.test(t) || /^benh\//i.test(t) || t.includes('/');
    };

    const candidates = [
      disease?.productName,
      disease?.name,
      disease?.diseaseName,
      disease?.title
    ].map((x) => String(x || '').trim());

    const readable = candidates.find((t) => t && !looksLikePathOrSlug(t));
    if (readable) return readable;

    const anyName = candidates.find((t) => !!t);
    if (anyName) return anyName;

    return 'Chưa cập nhật';
  }

  getDiseaseCategory(disease: any): string {
    const fromCategories = this.buildCategoryPathFromLevels(disease?.categories);
    if (fromCategories) return fromCategories;
    return String(
      disease?.category ||
      disease?.categoryName ||
      disease?.groupName ||
      disease?.diseaseGroup ||
      'Chưa phân loại'
    );
  }

  private mergeDiseaseStatsWithDetails(stats: any[], details: any[]): any[] {
    const detailBySku = new Map<string, any>();
    for (const row of details || []) {
      const sku = String(row?.sku || '').trim();
      if (sku) detailBySku.set(sku, row);
    }

    return (stats || []).map((stat: any) => {
      const sku = String(stat?.sku || '').trim();
      const detail = detailBySku.get(sku);
      return {
        ...stat,
        // Ưu tiên tên từ stats (đã join bảng bệnh), tránh ghi đè bằng productName cũ trong consultations_disease
        name: stat?.productName || stat?.name || detail?.productName || detail?.name,
        productName: stat?.productName || stat?.name || detail?.productName || detail?.name,
        categories: Array.isArray(detail?.categories) ? detail.categories : stat?.categories
      };
    });
  }

  private buildCategoryPathFromLevels(categories: any): string {
    if (!Array.isArray(categories) || categories.length === 0) return '';

    const normalized = categories
      .map((item: any) => ({
        name: String(item?.name || item?.category?.name || '').trim(),
        level: Number(item?.level ?? item?.category?.level ?? Number.MAX_SAFE_INTEGER)
      }))
      .filter((item: any) => !!item.name);

    if (!normalized.length) return '';

    normalized.sort((a: any, b: any) => a.level - b.level);
    const uniquePath: string[] = [];
    for (const item of normalized) {
      if (!uniquePath.includes(item.name)) uniquePath.push(item.name);
    }
    return uniquePath.join(' > ');
  }

  private loadCurrentAccount() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('admin');
      if (!raw) return;
      const account = JSON.parse(raw);
      this.currentAccountRole = account?.accountRole === 'pharmacist' ? 'pharmacist' : 'admin';
      this.currentPharmacistId = String(account?._id || account?.pharmacist_id || '').trim();
      this.currentPharmacistName = String(account?.pharmacistName || account?.adminname || '').trim();
      this.currentPharmacistEmail = String(account?.pharmacistEmail || account?.email || account?.adminemail || '').trim().toLowerCase();
    } catch (_) {
      this.currentAccountRole = 'admin';
    }
  }

  private resolveCurrentPharmacistId() {
    if (this.currentAccountRole !== 'pharmacist' || !this.pharmacists?.length) return;
    if (this.currentPharmacistId) {
      const byId = this.pharmacists.find(p => String(p?._id || '') === this.currentPharmacistId);
      if (byId) return;
    }

    const byEmail = this.currentPharmacistEmail
      ? this.pharmacists.find(p => String(p?.pharmacistEmail || p?.email || '').trim().toLowerCase() === this.currentPharmacistEmail)
      : null;
    if (byEmail?._id) {
      this.currentPharmacistId = String(byEmail._id);
      return;
    }

    const byName = this.currentPharmacistName
      ? this.pharmacists.find(p => String(p?.pharmacistName || '').trim().toLowerCase() === this.currentPharmacistName.toLowerCase())
      : null;
    if (byName?._id) {
      this.currentPharmacistId = String(byName._id);
    }
  }

  private getDefaultPharmacistIdForCurrentSession(): string {
    if (this.currentAccountRole !== 'pharmacist') return '';
    if (this.currentPharmacistId) return this.currentPharmacistId;
    this.resolveCurrentPharmacistId();
    return this.currentPharmacistId;
  }
}
