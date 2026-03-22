import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { BlogService, BlogResponse } from '../services/blog.service';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminMascotLoadingComponent } from '../shared/admin-mascot-loading/admin-mascot-loading.component';

/** Tiêu chí sắp xếp trong UI (map sang field bài viết khi sort client-side) */
type BlogSortKind = 'published' | 'title';

@Component({
  selector: 'app-blogmanage',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, AdminMascotLoadingComponent],
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
  selectedCategoryIds: string[] = [];
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
    this.loadCategories();
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
            authorName: (typeof b.display_author === 'object' ? b.display_author?.fullName : b.display_author) || b.author?.fullName || b.author?.full_name || 'Ẩn danh',
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
      // Main category
      if (b.category && b.category.name) {
        catsMap.set(b.category.id || b.category._id || b.category.name, b.category.name);
      }
      // Categories array
      if (Array.isArray(b.categories)) {
        b.categories.forEach((cat: any) => {
          if (cat && cat.name) {
            catsMap.set(cat.id || cat._id || cat.name, cat.name);
          }
        });
      }
    });
    this.categories = Array.from(catsMap.entries()).map(([id, name]) => ({ id, name }));
  }

  loadCategories() {
    this.blogService.getCategories().subscribe({
      next: (res: any) => {
        if (res && res.success && Array.isArray(res.data)) {
          this.categories = res.data.map((c: any) => ({
            id: c.id || c._id || c.slug || c.name,
            name: c.name,
            slug: c.slug
          }));
          this.cdr.markForCheck();
        }
      },
      error: (err) => console.error('Error loading blog categories', err)
    });
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
        (b.category?.name && b.category.name.toLowerCase().includes(this.searchTerm)) ||
        (Array.isArray(b.categories) && b.categories.some((cat: any) =>
          cat.name && cat.name.toLowerCase().includes(this.searchTerm)
        ))
      );
    }

    if (this.selectedCategoryIds.length > 0) {
      results = results.filter(b => {
        const inMain = this.selectedCategoryIds.includes(b.categoryId) ||
          this.selectedCategoryIds.includes(b.category?.id) ||
          this.selectedCategoryIds.includes(b.category?._id) ||
          this.selectedCategoryIds.includes(b.category?.name);

        const inArray = Array.isArray(b.categories) && b.categories.some((cat: any) =>
          this.selectedCategoryIds.includes(cat.id) ||
          this.selectedCategoryIds.includes(cat._id) ||
          this.selectedCategoryIds.includes(cat.name)
        );

        return inMain || inArray;
      });
    }

    if (this.selectedStatus !== '') {
      const isApproved = this.selectedStatus === 'approved';
      results = results.filter(b => b.isApproved === isApproved);
    }

    this.filteredBlogs = [...results];

    // Sắp xếp (giống logic quản lý sản phẩm: tiêu chí + hướng)
    this.filteredBlogs.sort((a, b) => {
      if (this.sortKind === 'published') {
        const timeA = new Date(a.publishedAt || a.createdAt).getTime() || 0;
        const timeB = new Date(b.publishedAt || b.createdAt).getTime() || 0;
        return this.sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }
      const sA = String(a.title || '').toLowerCase();
      const sB = String(b.title || '').toLowerCase();
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
  /** Mặc định: ngày đăng mới nhất trước */
  sortKind: BlogSortKind = 'published';
  sortDirection: 'asc' | 'desc' = 'desc';

  private defaultDirectionForBlogKind(kind: BlogSortKind): 'asc' | 'desc' {
    switch (kind) {
      case 'published':
        return 'desc';
      case 'title':
        return 'asc';
      default:
        return 'desc';
    }
  }

  /** Click nhãn hàng: cùng tiêu chí → đảo hướng; khác tiêu chí → hướng mặc định */
  onSortRowClick(kind: BlogSortKind): void {
    if (this.sortKind === kind) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKind = kind;
      this.sortDirection = this.defaultDirectionForBlogKind(kind);
    }
    this.filterBlogs();
  }

  /** Click mũi tên: chọn tiêu chí + hướng cụ thể */
  setSortDirection(kind: BlogSortKind, direction: 'asc' | 'desc', event?: Event): void {
    event?.stopPropagation();
    this.sortKind = kind;
    this.sortDirection = direction;
    this.filterBlogs();
  }

  toggleSortDropdown(event?: Event) {
    if (event) event.stopPropagation();
    this.isSortDropdownOpen = !this.isSortDropdownOpen;
    this.isFilterOpen = false;
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
      this.viewDetail(selected._id || selected.id);
    } else {
      this.showNotification('Vui lòng chọn một bài viết để chỉnh sửa!', 'error');
    }
  }

  toggleFilter(event?: Event) {
    if (event) event.stopPropagation();
    this.isFilterOpen = !this.isFilterOpen;
    this.isSortDropdownOpen = false;
  }

  toggleCategory(id: string) {
    const index = this.selectedCategoryIds.indexOf(id);
    if (index === -1) {
      this.selectedCategoryIds.push(id);
    } else {
      this.selectedCategoryIds.splice(index, 1);
    }
    this.filterBlogs();
  }

  onStatusSelect(status: string) {
    this.selectedStatus = status;
    this.filterBlogs();
  }

  clearAllFilters() {
    this.selectedCategoryIds = [];
    this.selectedStatus = '';
    this.searchTerm = '';
    this.filterBlogs();
  }

  /**
   * Tất cả chuyên mục hiển thị trên bảng (không gộp +N).
   */
  blogCategoryRows(b: any): { parentName?: string; name: string }[] {
    const rows: { parentName?: string; name: string }[] = [];
    const seen = new Set<string>();

    const add = (name: string, parentName?: string) => {
      const n = String(name || '').trim();
      if (!n) return;
      const p = parentName ? String(parentName).trim() : '';
      const k = `${p}|${n}`.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      rows.push(p ? { parentName: p, name: n } : { name: n });
    };

    if (Array.isArray(b.categories)) {
      for (const cat of b.categories) {
        if (!cat) continue;
        const nm = cat.name || cat.category?.name || '';
        const p =
          cat.parentCategory?.name ||
          cat.parent?.name ||
          cat.category?.parentCategory?.name ||
          '';
        if (p && nm) {
          add(nm, p);
        } else {
          add(nm);
        }
      }
    }

    const mainName = b.category?.name ? String(b.category.name).trim() : '';
    const mainParent = String(b.parentCategory?.name || '').trim();
    if (mainName) {
      if (mainParent) {
        add(mainName, mainParent);
      } else {
        add(mainName);
      }
    }

    return rows;
  }

  hasBlogCategoryRows(b: any): boolean {
    return this.blogCategoryRows(b).length > 0;
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
