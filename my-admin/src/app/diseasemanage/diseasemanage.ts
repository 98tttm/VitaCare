import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DiseaseService, DiseaseResponse } from '../services/disease.service';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminMascotLoadingComponent } from '../shared/admin-mascot-loading/admin-mascot-loading.component';

/** Tiêu chí sắp xếp UI → map sang sortColumn API (created_at | name) */
type DiseaseSortKind = 'date' | 'title';

@Component({
  selector: 'app-diseasemanage',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, AdminMascotLoadingComponent],
  providers: [DiseaseService],
  templateUrl: './diseasemanage.html',
  styleUrl: './diseasemanage.css',
})
export class Diseasemanage implements OnInit {
  diseases: any[] = [];
  filteredDiseases: any[] = [];
  searchTerm: string = '';
  isLoading: boolean = false;

  currentPage: number = 1;
  totalPages: number = 1;
  totalItems: number = 0;
  selectAll: boolean = false;

  groups: any[] = [];
  selectedGroupIds: string[] = [];
  /** Map checkbox id (_id) -> group slug (used in disease categories.fullPathSlug). */
  groupIdToSlug = new Map<string, string>();
  selectedStatus: string = '';

  isFilterOpen: boolean = false;
  isSortDropdownOpen: boolean = false;
  /** Mặc định: mới đăng trước */
  sortKind: DiseaseSortKind = 'date';
  sortDirection: 'asc' | 'desc' = 'desc';

  isConfirmModalOpen: boolean = false;
  notification = { show: false, message: '', type: 'success' };

  constructor(
    @Inject(DiseaseService) private diseaseService: DiseaseService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    this.isFilterOpen = false;
    this.isSortDropdownOpen = false;
  }

  ngOnInit() {
    this.loadDiseases();
    this.loadGroups();
  }

  loadDiseases(page: number = 1) {
    this.isLoading = true;
    const filters = {
      search: this.searchTerm,
      groupIds: this.selectedGroupIds.join(','),
      status: this.selectedStatus,
      sortColumn: this.diseaseSortApiColumn(),
      sortDirection: this.sortDirection
    };
    this.diseaseService.getDiseases(page, 20, filters).subscribe({
      next: (res: DiseaseResponse) => {
        if (res.success) {
          this.filteredDiseases = res.data.map(d => ({
            ...d,
            selected: false,
            imageUrl: d.primary_image?.url || d.primaryImage?.url || d.image?.url || (typeof d.image === 'string' ? d.image : ''),
            authorName: (typeof d.display_author === 'object' ? d.display_author?.fullName : d.display_author) || d.author?.name || d.author?.full_name || 'Ẩn danh',
            categoryName: [
              d.group?.name,
              ...((d.categories || d.subjects)?.map((c: any) => c.name) || [])
            ].filter(Boolean).join(' > ') || 'Chưa phân loại',
            publishDate: d.published_at || d.publishedAt || (d.created_at || d.createdAt)
          }));
          this.diseases = [...this.filteredDiseases];
          this.currentPage = res.pagination.page;
          this.totalPages = res.pagination.totalPages;
          this.totalItems = res.pagination.total;
          this.updateSelectAllState();
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading diseases', err);
        this.isLoading = false;
        this.showNotification('Lỗi tải danh sách bệnh!', 'error');
      }
    });
  }

  loadGroups() {
    this.diseaseService.getGroups().subscribe({
      next: (res) => {
        if (res && res.success) {
          this.groups = res.data;
          this.groupIdToSlug.clear();
          for (const g of this.groups) {
            const id = String(g?._id || g?.id || '').trim();
            const slug = String(g?.slug || '').trim();
            if (id && slug) this.groupIdToSlug.set(id, slug);
          }
        }
      }
    });
  }

  onSearch(event: any) {
    this.searchTerm = String(event.target.value || '').trim();
    this.loadDiseases(1);
  }

  filterDiseases() {
    this.loadDiseases(1);
  }

  get pagedDiseases(): any[] {
    return this.filteredDiseases;
  }

  get displayTotalPages(): number {
    return Math.max(1, this.totalPages);
  }

  get displayPageNumbers(): number[] {
    const total = this.displayTotalPages;
    const current = this.currentPage;
    const pages: number[] = [];
    const delta = 2;
    for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
      pages.push(i);
    }
    return pages;
  }

  prevDisplayPage() {
    this.prevPage();
  }

  nextDisplayPage() {
    this.nextPage();
  }

  goToDisplayPage(page: number) {
    if (page >= 1 && page <= this.displayTotalPages) this.loadDiseases(page);
  }

  toggleSelectAll(event: any) {
    this.selectAll = event.target.checked;
    this.filteredDiseases.forEach(d => d.selected = this.selectAll);
  }

  onSelectChange() {
    this.updateSelectAllState();
  }

  updateSelectAllState() {
    if (this.filteredDiseases.length === 0) {
      this.selectAll = false;
      return;
    }
    this.selectAll = this.filteredDiseases.every(d => d.selected);
  }

  get selectedCount(): number {
    return this.filteredDiseases.filter(d => d.selected).length;
  }

  toggleFilter(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.isFilterOpen = !this.isFilterOpen;
    this.isSortDropdownOpen = false;
  }

  toggleSortDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.isSortDropdownOpen = !this.isSortDropdownOpen;
    this.isFilterOpen = false;
  }

  private diseaseSortApiColumn(): string {
    return this.sortKind === 'date' ? 'created_at' : 'name';
  }

  private defaultDirectionForDiseaseKind(kind: DiseaseSortKind): 'asc' | 'desc' {
    switch (kind) {
      case 'date':
        return 'desc';
      case 'title':
        return 'asc';
      default:
        return 'desc';
    }
  }

  onSortRowClick(kind: DiseaseSortKind): void {
    if (this.sortKind === kind) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKind = kind;
      this.sortDirection = this.defaultDirectionForDiseaseKind(kind);
    }
    this.loadDiseases(1);
  }

  setSortDirection(kind: DiseaseSortKind, direction: 'asc' | 'desc', event?: Event): void {
    event?.stopPropagation();
    this.sortKind = kind;
    this.sortDirection = direction;
    this.loadDiseases(1);
  }

  toggleGroup(id: string) {
    const index = this.selectedGroupIds.indexOf(id);
    if (index === -1) {
      this.selectedGroupIds.push(id);
    } else {
      this.selectedGroupIds.splice(index, 1);
    }
    this.loadDiseases(1);
  }

  onStatusSelect(status: string) {
    this.selectedStatus = status;
    this.loadDiseases(1);
  }

  clearAllFilters() {
    this.selectedGroupIds = [];
    this.selectedStatus = '';
    this.searchTerm = '';
    this.loadDiseases(1);
  }

  viewDetail(id: string) {
    this.router.navigate(['/admin/diseases/detail'], { queryParams: { id: id } });
  }

  createDisease() {
    this.router.navigate(['/admin/diseases/create']);
  }

  editSelected() {
    const selected = this.filteredDiseases.find(d => d.selected);
    if (selected) {
      this.viewDetail(selected._id || selected.id);
    } else {
      this.showNotification('Vui lòng chọn một bệnh để chỉnh sửa!', 'error');
    }
  }

  prevPage() {
    if (this.currentPage > 1) this.loadDiseases(this.currentPage - 1);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) this.loadDiseases(this.currentPage + 1);
  }

  deleteSelected() {
    const selected = this.filteredDiseases.filter(d => d.selected);
    if (selected.length > 0) this.isConfirmModalOpen = true;
    else this.showNotification('Vui lòng chọn bệnh để xóa!', 'error');
  }

  confirmDelete() {
    const selected = this.filteredDiseases.filter(d => d.selected);
    if (!selected.length) return;

    this.isLoading = true;
    const deletePromises = selected.map(d => this.diseaseService.deleteDisease(d._id || d.id).toPromise());

    Promise.all(deletePromises)
      .then(() => {
        this.isLoading = false;
        this.isConfirmModalOpen = false;
        this.showNotification(`Đã xóa thành công ${selected.length} bệnh!`, 'success');
        this.loadDiseases(this.currentPage);
      })
      .catch((err) => {
        console.error('Lỗi khi xóa:', err);
        this.isLoading = false;
        this.showNotification('Đã có lỗi xảy ra khi xóa', 'error');
      });
  }

  closeConfirmModal() {
    this.isConfirmModalOpen = false;
  }

  showNotification(message: string, type: 'success' | 'error' = 'success') {
    this.notification = { show: true, message, type };
    setTimeout(() => this.notification.show = false, 3000);
  }
}
