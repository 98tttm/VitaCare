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
    this.loadData();
  }

  loadData() {
    this.isLoading = true;
    forkJoin({
      pharmacists: this.consultationService.getPharmacists().pipe(catchError(() => of({ data: [] }))),
      diseases: this.consultationService.getDiseaseConsultationStats().pipe(catchError(() => of({ success: true, data: [] })))
    }).subscribe(({ pharmacists, diseases }) => {
      this.pharmacists = (pharmacists && pharmacists.data) ? pharmacists.data : (Array.isArray(pharmacists) ? pharmacists : []);

      if (diseases && diseases.success) {
        this.diseases = diseases.data;
        this.applyDiseaseFilters();
        this.calculateGlobalStats();
      }
      this.isLoading = false;
      this.cdr.markForCheck();
    });
  }

  fetchDiseases() {
    this.isLoading = true;
    this.consultationService.getDiseaseConsultationStats().subscribe({
      next: (res) => {
        if (res.success) {
          this.diseases = res.data;
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
        d.productName.toLowerCase().includes(lower) ||
        d.sku.toLowerCase().includes(lower)
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
          const foundDisease = res.data.find((d: any) => d.sku === disease.sku);
          if (foundDisease) {
            this.questions = foundDisease.questions.map((q: any) => ({
              ...q,
              productSku: foundDisease.sku,
              productName: foundDisease.productName
            }));
            this.applyFiltersAndSort();
          }
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
      }
    });
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
    this.editedPharmacistId = foundPharmacist ? foundPharmacist._id : '';
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
}
