import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { BlogService, BlogResponse } from '../services/blog.service';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-blogmanage',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  providers: [BlogService],
  templateUrl: './blogmanage.html',
  styleUrl: './blogmanage.css',
})
export class Blogmanage implements OnInit {
  blogs: any[] = [];
  filteredBlogs: any[] = [];
  searchTerm: string = '';
  isLoading: boolean = false;

  currentPage: number = 1;
  totalPages: number = 1;

  selectAll: boolean = false;

  categories: any[] = [];
  selectedCategoryId: string = '';
  selectedStatus: string = '';

  isFilterOpen: boolean = false;
  isConfirmModalOpen: boolean = false;
  blogToDelete: any = null;

  notification = {
    show: false,
    message: '',
    type: 'success'
  };

  constructor(
    @Inject(BlogService) private blogService: BlogService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    this.isFilterOpen = false;
    this.isSortDropdownOpen = false;
  }

  ngOnInit() {
    this.loadBlogs();
  }

  loadBlogs(page: number = 1) {
    this.isLoading = true;
    this.blogService.getBlogs(page, 100).subscribe({
      next: (res: BlogResponse) => {
        if (res.success) {
          const parseMongoDate = (val: any) => {
            if (!val) return null;
            if (typeof val === 'object' && val.$date) return new Date(val.$date).toISOString();
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d.toISOString();
          };

          this.blogs = res.data.map(b => ({
            ...b,
            selected: false,
            publishedAt: parseMongoDate(b.publishedAt) || b.publishedAt,
            createdAt: parseMongoDate(b.createdAt) || b.createdAt
          }));
          this.extractCategories();
          this.filterBlogs();
          this.currentPage = res.pagination.page;
          this.totalPages = res.pagination.totalPages;
          this.cdr.markForCheck(); // Force immediate view update
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading blogs', err);
        this.isLoading = false;
        this.showNotification('Lỗi tải danh sách bài viết!', 'error');
      }
    });
  }

  extractCategories() {
    // Extract unique categories from the current list of blogs
    const catsMap = new Map();
    this.blogs.forEach(b => {
      if (b.category && b.category.name) {
        catsMap.set(b.category.id || b.category._id || b.category.name, b.category.name);
      }
    });
    this.categories = Array.from(catsMap.entries()).map(([id, name]) => ({ id, name }));
  }

  loadCategories() {
    // No longer used, categories are extracted from blogs
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value.toLowerCase();
    this.filterBlogs();
  }

  onCategoryChange() {
    this.filterBlogs();
  }

  filterBlogs() {
    let results = this.blogs;

    if (this.searchTerm) {
      results = results.filter(b =>
        (b.title && b.title.toLowerCase().includes(this.searchTerm)) ||
        (b.author?.fullName && b.author.fullName.toLowerCase().includes(this.searchTerm)) ||
        (b.slug && b.slug.toLowerCase().includes(this.searchTerm)) ||
        (b.category?.name && b.category.name.toLowerCase().includes(this.searchTerm))
      );
    }

    if (this.selectedCategoryId) {
      results = results.filter(b =>
        (b.categoryId === this.selectedCategoryId) ||
        (b.category?.id == this.selectedCategoryId) ||
        (b.category?._id === this.selectedCategoryId) ||
        (b.category?.name === this.selectedCategoryId)
      );
    }

    if (this.selectedStatus !== '') {
      const isApproved = this.selectedStatus === 'approved';
      results = results.filter(b => b.isApproved === isApproved);
    }

    this.filteredBlogs = [...results];

    // Sắp xếp
    this.filteredBlogs.sort((a, b) => {
      const valA = a[this.sortColumn as keyof typeof a] || 0;
      const valB = b[this.sortColumn as keyof typeof b] || 0;
      if (this.sortColumn === 'publishedAt' || this.sortColumn === 'createdAt') {
        const timeA = new Date(valA || a.createdAt).getTime() || 0;
        const timeB = new Date(valB || b.createdAt).getTime() || 0;
        return this.sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }
      const sA = String(valA).toLowerCase();
      const sB = String(valB).toLowerCase();
      return this.sortDirection === 'asc' ? sA.localeCompare(sB) : sB.localeCompare(sA);
    });

    this.cdr.markForCheck();

    this.updateSelectAllState();
  }

  toggleSelectAll(event: any) {
    this.selectAll = event.target.checked;
    this.filteredBlogs.forEach(b => b.selected = this.selectAll);
  }

  onSelectChange() {
    this.updateSelectAllState();
  }

  updateSelectAllState() {
    if (this.filteredBlogs.length === 0) {
      this.selectAll = false;
      return;
    }
    this.selectAll = this.filteredBlogs.every(b => b.selected);
  }

  get selectedCount(): number {
    return this.filteredBlogs.filter(b => b.selected).length;
  }

  isSortDropdownOpen: boolean = false;
  sortColumn: string = 'publishedAt';
  sortDirection: 'asc' | 'desc' = 'desc';

  toggleSortDropdown(event?: Event) {
    if (event) event.stopPropagation();
    this.isSortDropdownOpen = !this.isSortDropdownOpen;
    this.isFilterOpen = false;
  }

  onSortSelect(sortOption: string) {
    if (sortOption === 'publishedAtDesc') {
      this.sortColumn = 'publishedAt';
      this.sortDirection = 'desc';
    } else if (sortOption === 'publishedAtAsc') {
      this.sortColumn = 'publishedAt';
      this.sortDirection = 'asc';
    } else if (sortOption === 'titleDesc') {
      this.sortColumn = 'title';
      this.sortDirection = 'desc';
    } else if (sortOption === 'titleAsc') {
      this.sortColumn = 'title';
      this.sortDirection = 'asc';
    }

    this.filterBlogs();
    this.isSortDropdownOpen = false;
  }

  viewDetail(id: string) {
    if (id) {
      this.router.navigate(['/admin/blogs/detail'], { queryParams: { id: id } });
    }
  }

  createBlog() {
    this.router.navigate(['/admin/blogs/create']);
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.loadBlogs(this.currentPage - 1);
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.loadBlogs(this.currentPage + 1);
    }
  }

  editSelected() {
    const selected = this.filteredBlogs.find(b => b.selected);
    if (selected) {
      this.viewDetail(selected._id);
    } else {
      this.showNotification('Vui lòng chọn một bài viết để chỉnh sửa!', 'error');
    }
  }

  toggleFilter(event?: Event) {
    if (event) event.stopPropagation();
    this.isFilterOpen = !this.isFilterOpen;
    this.isSortDropdownOpen = false;
  }

  onCategorySelect(id: string) {
    this.selectedCategoryId = id;
    this.filterBlogs();
  }

  onStatusSelect(status: string) {
    this.selectedStatus = status;
    this.filterBlogs();
  }

  clearAllFilters() {
    this.selectedCategoryId = '';
    this.selectedStatus = '';
    this.searchTerm = '';
    this.filterBlogs();
  }

  deleteSelected() {
    const selected = this.filteredBlogs.filter(b => b.selected);
    if (selected.length > 0) {
      this.isConfirmModalOpen = true;
    } else {
      this.showNotification('Vui lòng chọn bài viết để xóa!', 'error');
    }
  }

  confirmDelete() {
    const selected = this.filteredBlogs.filter(b => b.selected);
    if (!selected.length) return;

    this.isLoading = true;
    const deletePromises = selected.map(b => this.blogService.deleteBlog(b._id || b.id).toPromise());

    Promise.all(deletePromises)
      .then(() => {
        this.isLoading = false;
        this.isConfirmModalOpen = false;
        this.showNotification(`Đã xóa thành công ${selected.length} bài viết!`, 'success');
        this.loadBlogs(this.currentPage);
      })
      .catch((err) => {
        console.error('Lỗi khi xóa:', err);
        this.isLoading = false;
        this.showNotification('Đã có lỗi xảy ra khi xóa bài viết', 'error');
      });
  }

  closeConfirmModal() {
    this.isConfirmModalOpen = false;
  }

  showNotification(message: string, type: 'success' | 'error' = 'success') {
    this.notification = { show: true, message, type };
    setTimeout(() => {
      if (this.notification.message === message) {
        this.notification.show = false;
      }
    }, 3000);
  }
}
