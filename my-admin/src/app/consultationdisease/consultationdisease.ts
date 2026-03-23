import { Component, OnInit, OnDestroy, Inject, HostListener, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, DatePipe, DOCUMENT } from '@angular/common';
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
export class Consultationdisease implements OnInit, OnDestroy {
  @ViewChild('diseaseModalPortal') diseaseModalPortal?: ElementRef<HTMLDivElement>;
  diseases: any[] = [];
  /** Ngữ cảnh bệnh khi mở popup trả lời (chỉ cần sku + tên). */
  selectedDisease: any | null = null;

  /** Toàn bộ câu hỏi (gộp mọi bệnh), nguồn từ GET consultations_disease. */
  questions: any[] = [];
  filteredQuestions: any[] = [];

  pharmacists: any[] = [];
  searchText: string = '';
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

  /** Làm mới danh sách câu hỏi định kỳ khi đang xem chi tiết bệnh (đồng nghiệp trả lời → cập nhật khung xanh). */
  /** Browser `setInterval` trả về `number` (khác NodeJS.Timeout). */
  private questionPollTimer: number | null = null;

  get activeFilterCount(): number {
    return this.filters.status.length;
  }

  constructor(
    @Inject(ConsultationService) private consultationService: ConsultationService,
    private datePipe: DatePipe,
    private cdr: ChangeDetectorRef,
    private hostRef: ElementRef<HTMLElement>,
    @Inject(DOCUMENT) private document: Document
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

  ngOnDestroy(): void {
    this.stopQuestionRowPolling();
    this.restoreDiseaseModalFromBody();
  }

  /** Dược sĩ: chưa có câu trả lời thì được gửi; đã có thì chỉ người đã trả lời (theo id hoặc tên cũ) được sửa. */
  canEditDiseaseReply(): boolean {
    if (!this.selectedQuestion) return false;
    if (this.currentAccountRole !== 'pharmacist') return false;

    const hasAnswer = !!(
      this.selectedQuestion.answer &&
      String(this.selectedQuestion.answer).trim()
    );
    if (!hasAnswer) return true;
    return this.isQuestionAnsweredByCurrentPharmacist(this.selectedQuestion);
  }

  isSelectedQuestionAnsweredByCurrentPharmacist(): boolean {
    return this.isQuestionAnsweredByCurrentPharmacist(this.selectedQuestion);
  }

  private isQuestionAnsweredByCurrentPharmacist(question: any): boolean {
    if (!question) return false;
    const hasAnswer = !!String(question?.answer || '').trim();
    if (!hasAnswer) return false;
    const authorId = String(
      question?.answeredByPharmacistId ??
      question?.answered_by_pharmacist_id ??
      ''
    ).trim();
    if (authorId && this.currentPharmacistId) {
      return this.pharmacistIdsMatch(authorId, this.currentPharmacistId);
    }
    const by = String(question?.answeredBy || '').trim();
    const me = String(this.currentPharmacistName || '').trim();
    return !!(by && me && by.toLowerCase() === me.toLowerCase());
  }

  private pharmacistIdsMatch(a: string, b: string): boolean {
    const sa = String(a ?? '').trim();
    const sb = String(b ?? '').trim();
    if (!sa || !sb) return false;
    if (sa === sb) return true;
    return sa.replace(/\s/g, '') === sb.replace(/\s/g, '');
  }

  private attachDiseaseModalToBody(): void {
    const el = this.diseaseModalPortal?.nativeElement;
    if (!el || el.parentElement === this.document.body) return;
    this.document.body.appendChild(el);
  }

  private restoreDiseaseModalFromBody(): void {
    const el = this.diseaseModalPortal?.nativeElement;
    if (!el || el.parentElement !== this.document.body) return;
    this.hostRef.nativeElement.appendChild(el);
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
        this.questions = this.flattenAllQuestionsFromDetails(details);
        this.applyFiltersAndSort();
        this.calculateGlobalStats();
      }
      this.isLoading = false;
      this.cdr.markForCheck();
      this.startQuestionRowPolling();
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
          this.questions = this.flattenAllQuestionsFromDetails(detailRows);
          this.applyFiltersAndSort();
          this.calculateGlobalStats();
          this.cdr.markForCheck();
        }
        this.isLoading = false;
        this.startQuestionRowPolling();
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

  /** Đồng bộ logic với API stats: pending hoặc chưa có answer coi là cần giải quyết. */
  private diseaseQuestionNeedsReply(q: any): boolean {
    return !q?.answer || q.status === 'unreviewed' || q.status === 'pending';
  }

  /** Template: còn chờ phản hồi chính thức từ dược sĩ. */
  questionAwaitingConsult(q: any): boolean {
    return this.diseaseQuestionNeedsReply(q);
  }

  /** Đã có đồng nghiệp trả lời chính thức — hiển thị khung xanh. */
  questionAlreadyConsulted(q: any): boolean {
    return !this.diseaseQuestionNeedsReply(q);
  }

  consultedByLabel(q: any): string {
    const by = String(q?.answeredBy ?? '').trim();
    if (!by || by === 'Pharmacist') return 'Dược sĩ';
    if (by === 'Admin') return 'Quản trị viên';
    return by;
  }

  /** Gộp mọi câu hỏi từ nhiều document consultations_disease (theo SKU). */
  flattenAllQuestionsFromDetails(detailRows: any[]): any[] {
    const out: any[] = [];
    for (const row of detailRows || []) {
      const sku = row?.sku;
      const resolvedName = this.getDiseaseName(row);
      const categories = Array.isArray(row?.categories) ? row.categories : [];
      const rawQuestions = Array.isArray(row.questions) ? row.questions : [];
      for (const q of rawQuestions) {
        out.push({
          ...q,
          productSku: sku,
          productName: resolvedName || row?.productName,
          _diseaseCategories: categories
        });
      }
    }
    out.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
    return out;
  }

  getQuestionRowCategory(item: any): string {
    const fromQuestion = this.getDiseaseCategory({ categories: item?._diseaseCategories });
    if (fromQuestion && fromQuestion !== 'Chưa phân loại') return fromQuestion;
    const sku = String(item?.productSku || '').trim();
    const disease = this.diseases.find((d: any) => String(d?.sku || '').trim() === sku);
    if (!disease) return fromQuestion;
    return this.getDiseaseCategory(disease);
  }

  /** Link danh mục bệnh (ưu tiên fullPathSlug của level sâu nhất). */
  getQuestionRowCategoryLink(item: any): string {
    const categories = Array.isArray(item?._diseaseCategories) ? item._diseaseCategories : [];
    if (!categories.length) return '';
    const normalized = categories
      .map((c: any) => ({
        level: Number(c?.level ?? c?.category?.level ?? Number.MAX_SAFE_INTEGER),
        fullPathSlug: String(c?.fullPathSlug ?? c?.category?.fullPathSlug ?? '').trim()
      }))
      .filter((c: any) => !!c.fullPathSlug)
      .sort((a: any, b: any) => a.level - b.level);
    if (!normalized.length) return '';
    const slug = normalized[normalized.length - 1].fullPathSlug.replace(/^\/+/, '');
    return `/${slug}`;
  }

  /** Nhãn trạng thái cột chính: Chưa tư vấn / Đã tư vấn. */
  questionStatusMainLabel(q: any): string {
    return this.questionAwaitingConsult(q) ? 'Chưa tư vấn' : 'Đã tư vấn';
  }

  canOpenEditableDetail(item: any): boolean {
    if (this.currentAccountRole !== 'pharmacist') return true;
    const hasAnswer = !!String(item?.answer || '').trim();
    if (!hasAnswer) return true;
    const authorId = String(item?.answeredByPharmacistId ?? item?.answered_by_pharmacist_id ?? '').trim();
    if (authorId && this.currentPharmacistId) {
      return this.pharmacistIdsMatch(authorId, this.currentPharmacistId);
    }
    const by = String(item?.answeredBy || '').trim().toLowerCase();
    const me = String(this.currentPharmacistName || '').trim().toLowerCase();
    return !!(by && me && by === me);
  }

  canShowEditAction(item: any): boolean {
    return this.canOpenEditableDetail(item);
  }

  readonlyPharmacistLabel(item: any): string {
    const by = String(item?.answeredBy || '').trim();
    if (by) return `Dược sĩ ${by}`;
    const me = String(this.currentPharmacistName || '').trim();
    if (me) return `Dược sĩ ${me}`;
    return 'Dược sĩ';
  }

  private startQuestionRowPolling(): void {
    this.stopQuestionRowPolling();
    if (typeof window === 'undefined') return;
    this.questionPollTimer = window.setInterval(() => {
      if (this.isModalOpen) return;
      this.reloadConsultationDataQuiet();
    }, 15000);
  }

  /** Làm mới danh sách không bật spinner (polling). */
  private reloadConsultationDataQuiet(): void {
    forkJoin({
      stats: this.consultationService.getDiseaseConsultationStats().pipe(catchError(() => of({ success: true, data: [] }))),
      details: this.consultationService.getDiseaseConsultations().pipe(catchError(() => of({ success: true, data: [] })))
    }).subscribe({
      next: ({ stats, details }) => {
        if (!stats?.success) return;
        const detailRows = details?.success ? (details.data || []) : [];
        this.diseases = this.mergeDiseaseStatsWithDetails(stats.data || [], detailRows);
        this.questions = this.flattenAllQuestionsFromDetails(detailRows);
        this.applyFiltersAndSort();
        this.calculateGlobalStats();
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  private stopQuestionRowPolling(): void {
    if (this.questionPollTimer != null) {
      clearInterval(this.questionPollTimer);
      this.questionPollTimer = null;
    }
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
    this.applyFiltersAndSort();
  }

  onFilterChange() { this.applyFiltersAndSort(); }
  onSortChange() { this.applyFiltersAndSort(); }

  applyFiltersAndSort() {
    let result = [...(this.questions || [])];

    if (this.filters.status.length > 0) {
      result = result.filter(q => {
        const qStatus = this.diseaseQuestionNeedsReply(q) ? 'pending' : 'answered';
        return this.filters.status.includes(qStatus);
      });
    } else if (this.currentFilter !== '') {
      result = result.filter(q => {
        const qStatus = this.diseaseQuestionNeedsReply(q) ? 'pending' : 'answered';
        return qStatus === this.currentFilter;
      });
    }

    const lowerSearch = this.searchText.trim().toLowerCase();
    if (lowerSearch) {
      result = result.filter((p: any) => {
        const cat = this.getQuestionRowCategory(p).toLowerCase();
        const pname = String(p.productName || '').toLowerCase();
        return (
          (p.full_name || '').toLowerCase().includes(lowerSearch) ||
          (p.question || '').toLowerCase().includes(lowerSearch) ||
          pname.includes(lowerSearch) ||
          cat.includes(lowerSearch)
        );
      });
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
    return 'Cần giải quyết';
  }

  formatDate(dateString: any): string {
    if (!dateString) return '';
    return this.datePipe.transform(dateString, 'dd/MM/yyyy') || '';
  }

  openDetailModal(item: any) {
    this.selectedDisease = {
      sku: item.productSku,
      productName: item.productName,
      unansweredCount: 0,
      totalQuestions: 0
    };
    this.selectedQuestion = { ...item };
    this.replyContent = item.answer || '';
    const foundPharmacist = this.pharmacists.find(p => p.pharmacistName === item.answeredBy);
    const defaultPharmacistId = foundPharmacist?._id || this.getDefaultPharmacistIdForCurrentSession();
    this.editedPharmacistId = defaultPharmacistId || '';
    this.isModalOpen = true;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.attachDiseaseModalToBody();
      this.cdr.markForCheck();
    }, 0);
  }

  closeModal() {
    this.restoreDiseaseModalFromBody();
    this.isModalOpen = false;
    this.selectedQuestion = null;
    this.selectedDisease = null;
  }

  saveQuestion() {
    if (!this.selectedQuestion || !this.selectedDisease) return;
    if (!this.canEditDiseaseReply()) {
      this.showNotification('Bạn chỉ có thể xem phản hồi của đồng nghiệp.', 'warning');
      return;
    }

    const sessionName = String(this.currentPharmacistName || '').trim();
    const answeredByName =
      sessionName || this.consultedByLabel(this.selectedQuestion) || 'Dược sĩ';
    const pharmacistIdStr =
      String(this.getDefaultPharmacistIdForCurrentSession() || '').trim();

    const qid = this.selectedQuestion._id ?? this.selectedQuestion.id;
    const payload = {
      sku: this.selectedDisease.sku,
      questionId: qid != null ? String(qid).trim() : '',
      answer: this.replyContent,
      answeredBy: answeredByName,
      ...(pharmacistIdStr ? { pharmacistId: pharmacistIdStr } : {}),
    };
    if (!payload.questionId) {
      this.showNotification('Không xác định được mã câu hỏi.', 'error');
      return;
    }

    this.consultationService.replyDiseaseQuestion(payload).subscribe({
      next: (res) => {
        if (res.success) {
          this.showNotification('Đã lưu phản hồi — trạng thái: đã trả lời');
          this.fetchDiseases();
          this.closeModal();
        } else {
          this.showNotification('Lỗi khi lưu phản hồi', 'error');
        }
      },
      error: (err) => {
        const msg =
          err?.error?.message ||
          (err?.status === 403
            ? 'Chỉ dược sĩ đã trả lời mới được sửa nội dung.'
            : 'Đã có lỗi xảy ra');
        this.showNotification(msg, 'error');
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
