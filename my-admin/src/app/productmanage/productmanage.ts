import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ProductService } from '../services/product.service';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

interface Product {
  _id?: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  category: string;
  categoryId?: string;
  categoryName?: string;
  categoryPath?: string[];
  image?: string;
  gallery?: string[];
  importDate: Date;
  expiryDate: Date | null;
  selected?: boolean;
  status?: string; // For display status if needed
}

@Component({
  selector: 'app-productmanage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [ProductService],
  templateUrl: './productmanage.html',
  styleUrl: './productmanage.css',
})
export class Productmanage implements OnInit {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  searchTerm: string = '';
  isLoading: boolean = false;

  // Pagination
  currentPage: number = 1;
  totalPages: number = 1;
  totalItems: number = 0;
  readonly ITEMS_PER_PAGE = 20;

  selectedIds: Set<string> = new Set(); // To persist selection across pages

  // Modal State
  isProductModalOpen: boolean = false;
  isEditMode: boolean = false;
  currentProductId: string | null = null;

  // Delete Modal State
  isConfirmModalOpen: boolean = false;

  // Advanced Filter
  isFilterOpen: boolean = false;
  advancedFilters: any = {
    categoryL1: {} as { [key: string]: boolean },
    categoryL2: {} as { [key: string]: boolean },
    categoryL3: {} as { [key: string]: boolean },
    unit: { 'Hộp': false, 'Vỉ': false, 'Viên': false, 'Chai': false, 'Tuýp': false, 'Gói': false, 'Lọ': false },
    price_range: { min: null as number | null, max: null as number | null },
    stock: { out_of_stock: false, low_stock: false, in_stock: false }
  };

  isSortDropdownOpen: boolean = false;
  sortColumn: string = 'importDate';
  sortDirection: 'desc' | 'asc' = 'desc';

  // Group State
  isGroupModalOpen = false;
  groupName = '';
  existingGroups: any[] = [
    { id: 1, name: 'Nhóm Vitamin Tổng Hợp', count: 12, date: '2024-01-20' },
    { id: 2, name: 'Sản phẩm bán chạy T2', count: 8, date: '2024-02-15' },
    { id: 3, name: 'Danh mục xả kho 2024', count: 25, date: '2024-03-01' }
  ];

  // Selection
  selectAll: boolean = false;
  selectedCount: number = 0;

  // New Product Data (Form Model)
  newProduct: any = {
    name: '',
    sku: '',
    origin: '',
    brand: '',
    categoryId: '',
    stock: 0,
    sold: 0,
    rating: 0,
    unit: 'Hộp',
    description: '',
    usage: '',
    ingredients: '',
    warnings: '',
    prescription: false,
    status: 'active',
    manufactureDate: '',
    expiryDate: '',
    activeIngredient: '',
    herbal: '',
    image: '',
    gallery: [],
    costPrice: 0,
    price: 0,
    promoPrice: 0
  };

  // Notification State
  notification = {
    show: false,
    message: '',
    type: 'success'
  };

  // Dropdown Options
  categoriesL1: any[] = [];
  categoriesL2: any[] = []; // All L2
  categoriesL3: any[] = []; // All L3
  allCategories: any[] = []; // Raw flat list from API
  categoryMap: { [key: string]: any } = {};
  units = ['Hộp', 'Vỉ', 'Viên', 'Chai', 'Tuýp', 'Gói', 'Lọ'];
  countries = ['Việt Nam', 'Mỹ', 'Nhật Bản', 'Hàn Quốc', 'Pháp'];
  brands = ['Vinapharma', 'Dược Hậu Giang', 'Traphaco', 'Pfizer'];

  // Modal Level IDs for sequential selection
  modalL1Id: string = '';
  modalL2Id: string = '';
  modalL3Id: string = '';

  // Filter UI State
  filterStep: number = 0;
  currentFilterParentId: string | null = null;
  expandedL1Ids: Set<string> = new Set();
  expandedL2Ids: Set<string> = new Set();
  private pendingOpenProductId: string | null = null;

  constructor(
    @Inject(ProductService) private productService: ProductService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown-container') && !target.closest('.dropdown-popup')) {
      this.isFilterOpen = false;
      this.isSortDropdownOpen = false;
    }
  }

  ngOnInit(): void {
    this.fetchCategories();
    this.route.queryParams.subscribe((params) => {
      this.pendingOpenProductId = params['openProductId'] || null;
      if (typeof params['search'] === 'string') {
        this.searchTerm = params['search'].toLowerCase();
      }
      if (typeof params['sortColumn'] === 'string') {
        this.sortColumn = params['sortColumn'];
      }
      if (typeof params['sortDirection'] === 'string' && (params['sortDirection'] === 'asc' || params['sortDirection'] === 'desc')) {
        this.sortDirection = params['sortDirection'];
      }
      if (typeof params['stockStatus'] === 'string') {
        const statuses = params['stockStatus'].split(',').map((s: string) => s.trim());
        this.advancedFilters.stock = {
          out_of_stock: statuses.includes('out_of_stock'),
          low_stock: statuses.includes('low_stock'),
          in_stock: statuses.includes('in_stock')
        };
      }
      this.loadProducts(1);
    });
    this.fetchGroups();
  }

  fetchGroups() {
    this.productService.getGroups().subscribe({
      next: (res) => {
        if (res.success) this.existingGroups = res.data;
      }
    });
  }

  fetchCategories() {
    this.productService.getCategories().subscribe({
      next: (res: any) => {
        this.allCategories = Array.isArray(res) ? res : (res.data || []);
        this.buildCategoryTree();
        this.cdr.markForCheck();
      }
    });
  }

  buildCategoryTree() {
    const normalizeId = (value: any): string => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      return String(value.$oid || value._id || value.id || value);
    };

    this.categoryMap = {};
    this.allCategories.forEach(cat => {
      const normalizedId = normalizeId(cat._id);
      const normalizedParentId = normalizeId(cat.parentId);
      cat._id = normalizedId;
      cat.parentId = normalizedParentId || null;
      this.categoryMap[normalizedId] = cat;
    });

    this.categoriesL1 = this.allCategories.filter(c => !c.parentId);
    const l1Ids = new Set(this.categoriesL1.map(c => c._id));
    this.categoriesL2 = this.allCategories.filter(c => c.parentId && l1Ids.has(c.parentId));
    const l2Ids = new Set(this.categoriesL2.map(c => c._id));
    this.categoriesL3 = this.allCategories.filter(c => c.parentId && l2Ids.has(c.parentId));
  }

  getCategoryPathSteps(catId: string): string[] {
    if (!catId || !this.categoryMap[catId]) return [];
    const path: string[] = [];
    let current = this.categoryMap[catId];
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? this.categoryMap[current.parentId] : null;
    }
    return path;
  }

  getSubCategories(parentId: string): any[] {
    return this.allCategories.filter(c => c.parentId === parentId);
  }

  loadProducts(page: number = 1) {
    this.isLoading = true;
    this.currentPage = page;

    // Convert frontend filters to backend params
    const selectedCatIds = this.getSelectedCategoryId();
    const filterParams: any = {
      search: this.searchTerm,
      categoryIds: selectedCatIds,
      minPrice: this.advancedFilters.price_range.min,
      maxPrice: this.advancedFilters.price_range.max,
      units: Object.keys(this.advancedFilters.unit).filter(k => this.advancedFilters.unit[k]),
      stockStatus: Object.keys(this.advancedFilters.stock).filter(k => this.advancedFilters.stock[k]),
      sortColumn: this.sortColumn === 'importDate' ? 'created_at' : (this.sortColumn === 'expiryDate' ? 'expiryDate' : this.sortColumn),
      sortDirection: this.sortDirection
    };

    this.productService.getProducts(this.currentPage, this.ITEMS_PER_PAGE, filterParams).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.products = res.data.map((item: any) => {
            const parseMongoDate = (val: any) => {
              if (!val) return null;
              if (typeof val === 'object' && val.$date) return new Date(val.$date);
              const d = new Date(val);
              return isNaN(d.getTime()) ? null : d;
            };

            let safeId = item._id;
            if (safeId && typeof safeId === 'object') {
              safeId = safeId.$oid || String(safeId);
            } else {
              safeId = String(safeId || '');
            }

            let catId = item.categoryId;
            if (catId && typeof catId === 'object' && catId.$oid) catId = catId.$oid;
            else if (catId && typeof catId === 'object' && catId._id) catId = catId._id;

            const pathSteps = this.getCategoryPathSteps(String(catId || ''));
            return {
              ...item,
              image: item.image || (item.gallery && item.gallery.length > 0 ? item.gallery[0] : ''),
              categoryPath: pathSteps,
              categoryName: pathSteps.join(' > ') || 'Chưa phân loại',
              importDate: parseMongoDate(item.created_at) || parseMongoDate(item.createDate) || new Date(),
              expiryDate: parseMongoDate(item.expiryDate) || parseMongoDate(item.expiredDate) || null,
              selected: this.selectedIds.has(safeId),
              _id: safeId
            };
          });
          this.totalItems = res.totalItems || (res.pagination ? res.pagination.total : 0);
          this.totalPages = res.totalPages || (res.pagination ? res.pagination.totalPages : 1);
          if (this.pendingOpenProductId) {
            const idToOpen = this.pendingOpenProductId;
            this.pendingOpenProductId = null;
            this.openProductDetailById(idToOpen);
          }
          this.cdr.markForCheck();
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading products', err);
        this.isLoading = false;
        this.showNotification('Lỗi tải danh sảch sản phẩm!', 'error');
      }
    });
  }

  getSelectedCategoryId(): string {
    // Keep hierarchy by only sending the deepest selected category in each branch.
    const selectedL1 = Object.keys(this.advancedFilters.categoryL1).filter(k => this.advancedFilters.categoryL1[k]);
    const selectedL2 = Object.keys(this.advancedFilters.categoryL2).filter(k => this.advancedFilters.categoryL2[k]);
    const selectedL3 = Object.keys(this.advancedFilters.categoryL3).filter(k => this.advancedFilters.categoryL3[k]);

    const excluded = new Set<string>();

    selectedL3.forEach((l3Id) => {
      const l3 = this.categoryMap[l3Id];
      if (l3?.parentId) {
        excluded.add(String(l3.parentId));
        const l2 = this.categoryMap[String(l3.parentId)];
        if (l2?.parentId) excluded.add(String(l2.parentId));
      }
    });

    selectedL2.forEach((l2Id) => {
      if (excluded.has(l2Id)) return;
      const l2 = this.categoryMap[l2Id];
      if (l2?.parentId) excluded.add(String(l2.parentId));
    });

    const effectiveL1 = selectedL1.filter(id => !excluded.has(id));
    const effectiveL2 = selectedL2.filter(id => !excluded.has(id));
    const effectiveL3 = selectedL3.filter(id => !excluded.has(id));

    return [...effectiveL3, ...effectiveL2, ...effectiveL1].join(',');
  }

  // Keep fetchProducts for backward compatibility
  fetchProducts() { this.loadProducts(this.currentPage); }
  fetchCategoriesAndProducts() { this.loadProducts(1); }
  handleProductsResponse(products: any) { /* no-op */ }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.loadProducts(page);
  }

  prevPage() {
    if (this.currentPage > 1) this.goToPage(this.currentPage - 1);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) this.goToPage(this.currentPage + 1);
  }

  // --- Search & Filter ---
  onSearch(event: any) {
    this.searchTerm = event.target.value.toLowerCase();
    this.loadProducts(1);
  }

  applyFilters() {
    this.loadProducts(1); // Server handles logic now
  }

  onSortSelect(column: string, direction: 'asc' | 'desc') {
    this.sortColumn = column;
    this.sortDirection = direction;
    this.loadProducts(1);
    this.isSortDropdownOpen = false;
  }

  sortResults() { } // Handled by server or can be added as query param later

  // --- Filter Actions ---
  toggleFilterDropdown(event: Event) {
    event.stopPropagation();
    this.isFilterOpen = !this.isFilterOpen;
    this.isSortDropdownOpen = false;
  }

  toggleSortDropdown(event: Event) {
    event.stopPropagation();
    this.isSortDropdownOpen = !this.isSortDropdownOpen;
    this.isFilterOpen = false;
  }



  toggleExpandL1(id: string) {
    if (this.expandedL1Ids.has(id)) this.expandedL1Ids.delete(id);
    else this.expandedL1Ids.add(id);
  }

  toggleExpandL2(id: string) {
    if (this.expandedL2Ids.has(id)) this.expandedL2Ids.delete(id);
    else this.expandedL2Ids.add(id);
  }

  toggleAdvancedFilter(type: string, value: string) {
    this.advancedFilters[type][value] = !this.advancedFilters[type][value];
    this.applyFilters();
  }

  isFilterSelected(type: string, value: string): boolean {
    return !!this.advancedFilters[type][value];
  }

  get activeFilterCount(): number {
    let count = 0;
    // Check categories (count as 1 if any category is selected)
    const hasCategory =
      Object.values(this.advancedFilters.categoryL1).some(v => v) ||
      Object.values(this.advancedFilters.categoryL2).some(v => v) ||
      Object.values(this.advancedFilters.categoryL3).some(v => v);
    if (hasCategory) count++;

    // Check others
    if (this.advancedFilters.price_range.min !== null || this.advancedFilters.price_range.max !== null) count++;
    Object.values(this.advancedFilters.unit).forEach(v => { if (v) count++; });
    Object.values(this.advancedFilters.stock).forEach(v => { if (v) count++; });

    return count;
  }

  clearAllFilters() {
    this.advancedFilters = {
      categoryL1: {},
      categoryL2: {},
      categoryL3: {},
      unit: { 'Hộp': false, 'Vỉ': false, 'Viên': false, 'Chai': false, 'Tuýp': false, 'Gói': false, 'Lọ': false },
      price_range: { min: null, max: null },
      stock: { out_of_stock: false, low_stock: false, in_stock: false }
    };
    this.loadProducts(1);
  }

  // --- Selection Logic ---
  toggleSelectAll(event: any) {
    const checked = event.target.checked;
    this.selectAll = checked;
    this.products.forEach(p => {
      p.selected = checked;
      if (checked) this.selectedIds.add(p._id!);
      else this.selectedIds.delete(p._id!);
    });
    this.updateSelectionCount();
  }

  onSelectChange(product: any) {
    if (product.selected) this.selectedIds.add(product._id);
    else this.selectedIds.delete(product._id);
    this.updateSelectionCount();
    this.selectAll = this.products.every(p => p.selected);
  }

  updateSelectionCount() {
    this.selectedCount = this.selectedIds.size;
  }

  // --- Actions: Group, Delete ---

  onGroupClick() {
    if (this.selectedIds.size < 2) {
      this.showNotification('Vui lòng chọn ít nhất 2 sản phẩm để tạo nhóm', 'warning');
      return;
    }
    this.groupName = '';
    this.isGroupModalOpen = true;
  }

  confirmGroup() {
    if (!this.groupName.trim()) {
      this.showNotification('Vui lòng nhập tên nhóm', 'warning');
      return;
    }

    const newGroup = {
      group_id: 'PG-' + Date.now().toString().slice(-6),
      name: this.groupName,
      productIds: Array.from(this.selectedIds),
      count: this.selectedIds.size,
      date: new Date().toISOString()
    };

    this.productService.createGroup(newGroup).subscribe({
      next: (res) => {
        if (res.success) {
          this.existingGroups.unshift(res.data);
          this.showNotification(`Đã tạo nhóm "${this.groupName}" với ${this.selectedIds.size} sản phẩm!`, 'success');
          this.isGroupModalOpen = false;
          this.groupName = '';
          this.selectedIds.clear();
          this.applyFilters();
        }
      },
      error: () => this.showNotification('Lỗi khi lưu nhóm', 'error')
    });
  }

  deleteGroup(groupId: string) {
    this.productService.deleteGroup(groupId).subscribe({
      next: (res) => {
        if (res.success) {
          this.existingGroups = this.existingGroups.filter(g => g._id !== groupId);
          this.showNotification('Đã xóa nhóm sản phẩm', 'success');
        }
      },
      error: () => this.showNotification('Lỗi khi xóa nhóm', 'error')
    });
  }

  closeGroupModal() {
    this.isGroupModalOpen = false;
    this.groupName = '';
  }

  onDeleteClick() {
    if (this.selectedCount === 0) {
      this.showNotification('Chưa chọn sản phẩm nào để xóa', 'warning');
      return;
    }
    this.isConfirmModalOpen = true;
  }

  confirmDelete() {
    this.closeConfirmModal();
    const selectedIds = Array.from(this.selectedIds);
    const selectedSet = new Set(selectedIds);

    this.isLoading = true;
    let completed = 0;
    let errors = 0;

    const deleteNext = (index: number) => {
      if (index >= selectedIds.length) {
        this.isLoading = false;
        if (errors === 0) {
          this.showNotification('Đã xóa thành công các sản phẩm chọn!');
          // Remove deleted items from local array immediately
          this.products = this.products.filter(p => p._id && !selectedSet.has(p._id));
          this.cdr.markForCheck();
        } else {
          this.showNotification(`Đã xóa ${selectedIds.length - errors} sản phẩm. Lỗi ${errors}.`, 'warning');
        }
        this.fetchProducts();
        this.unselectAll();
        return;
      }

      this.productService.deleteProduct(selectedIds[index]!).subscribe({
        next: () => {
          completed++;
          deleteNext(index + 1);
        },
        error: () => {
          errors++;
          deleteNext(index + 1);
        }
      });
    };
    deleteNext(0);
  }

  closeConfirmModal() {
    this.isConfirmModalOpen = false;
  }

  unselectAll() {
    this.selectAll = false;
    this.selectedIds.clear();
    this.products.forEach(p => p.selected = false);
    this.selectedCount = 0;
  }

  // --- Modal: Add / Edit ---

  openAddProductModal() {
    this.isEditMode = false;
    this.currentProductId = null;
    this.resetForm();
    this.isProductModalOpen = true;
  }

  openEditProductModal() {
    if (this.selectedIds.size !== 1) {
      this.showNotification('Vui lòng chọn đúng 1 sản phẩm để chỉnh sửa', 'warning');
      return;
    }
    this.isLoading = true;
    const id = Array.from(this.selectedIds)[0];

    this.productService.getProductById(id).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (res.success) {
          const gallery = Array.isArray(res.data.gallery) ? res.data.gallery : (res.data.image ? [res.data.image] : []);
          this.newProduct = {
            ...res.data,
            gallery: gallery,
            image: res.data.image || (gallery.length > 0 ? gallery[0] : ''),
            sold: Number(res.data.sold ?? 0),
            rating: Number(res.data.rating ?? 0)
          };
          const catId = res.data.categoryId || '';
          this.newProduct.categoryId = catId;

          // Determine initial Level selections for editing
          this.modalL1Id = '';
          this.modalL2Id = '';
          this.modalL3Id = '';

          if (catId && this.categoryMap[catId]) {
            let cat = this.categoryMap[catId];
            if (this.categoriesL3.find(c => c._id === catId)) {
              this.modalL3Id = catId;
              this.modalL2Id = cat.parentId;
              this.modalL1Id = this.categoryMap[cat.parentId]?.parentId;
            } else if (this.categoriesL2.find(c => c._id === catId)) {
              this.modalL2Id = catId;
              this.modalL1Id = cat.parentId;
            } else {
              this.modalL1Id = catId;
            }
          }

          if (this.newProduct.manufactureDate) this.newProduct.manufactureDate = new Date(this.newProduct.manufactureDate).toISOString().split('T')[0];
          if (this.newProduct.expiryDate) this.newProduct.expiryDate = new Date(this.newProduct.expiryDate).toISOString().split('T')[0];

          this.isEditMode = true;
          this.currentProductId = id;
          this.isProductModalOpen = true;
          this.cdr.markForCheck(); // Force immediate modal render
        }
      },
      error: () => {
        this.isLoading = false;
        this.showNotification('Lỗi tải thông tin sản phẩm', 'error');
      }
    });
  }

  closeProductModal() {
    this.isProductModalOpen = false;
  }

  openProductDetail(product: any, event: MouseEvent) {
    // If user clicked inside a checkbox or another button, don't trigger row click
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('button')) return;

    this.selectedIds.clear();
    this.selectedIds.add(product._id);
    this.updateSelectionCount();
    this.products.forEach(p => p.selected = (p._id === product._id));
    this.openEditProductModal();
  }

  private openProductDetailById(id: string) {
    if (!id) return;
    this.selectedIds.clear();
    this.selectedIds.add(String(id));
    this.updateSelectionCount();
    this.products.forEach(p => p.selected = (String(p._id) === String(id)));
    this.openEditProductModal();
  }

  saveProduct() {
    // Validate
    if (!this.newProduct.name || !this.newProduct.sku) {
      this.showNotification('Vui lòng nhập tên và SKU', 'warning');
      return;
    }

    this.isLoading = true;
    if (this.isEditMode && this.currentProductId) {
      this.productService.updateProduct(this.currentProductId, this.newProduct).subscribe({
        next: (res: any) => {
          this.isLoading = false;
          this.showNotification('Cập nhật sản phẩm thành công');
          this.closeProductModal();
          this.fetchProducts();
        },
        error: (err) => {
          this.isLoading = false;
          this.showNotification('Lỗi cập nhật: ' + err.message, 'error');
        }
      });
    } else {
      this.productService.createProduct(this.newProduct).subscribe({
        next: (res: any) => {
          this.isLoading = false;
          this.showNotification('Thêm sản phẩm thành công');
          this.closeProductModal();
          this.goToPage(1); // Go to page 1 to see the newly added product
        },
        error: (err) => {
          this.isLoading = false;
          this.showNotification('Lỗi thêm mới: ' + err.message, 'error');
        }
      });
    }
  }

  resetForm() {
    this.modalL1Id = '';
    this.modalL2Id = '';
    this.modalL3Id = '';
    this.newProduct = {
      name: '',
      sku: '',
      origin: '',
      brand: '',
      categoryId: '',
      stock: 0,
      sold: 0,
      rating: 0,
      unit: 'Hộp',
      description: '',
      usage: '',
      ingredients: '',
      warnings: '',
      prescription: false,
      status: 'active',
      manufactureDate: '',
      expiryDate: '',
      activeIngredient: '',
      herbal: '',
      image: '',
      gallery: [],
      costPrice: 0,
      price: 0,
      promoPrice: 0
    };
  }

  // Sequential selection handlers
  onL1Change() {
    this.modalL2Id = '';
    this.modalL3Id = '';
    this.newProduct.categoryId = this.modalL1Id;
  }

  onL2Change() {
    this.modalL3Id = '';
    this.newProduct.categoryId = this.modalL2Id || this.modalL1Id;
  }

  onL3Change() {
    this.newProduct.categoryId = this.modalL3Id || this.modalL2Id || this.modalL1Id;
  }

  // --- Notification ---
  showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    this.notification = { show: true, message, type };
    setTimeout(() => {
      this.notification.show = false;
    }, 3000);
  }



  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const url = e.target.result;
        if (!this.newProduct.gallery) this.newProduct.gallery = [];
        // Find the empty slot index from triggerGallerySlot or add to end
        const slotIndex = (event.target as any)._slotIndex;
        if (typeof slotIndex === 'number' && slotIndex < this.newProduct.gallery.length) {
          this.newProduct.gallery[slotIndex] = url;
        } else {
          this.newProduct.gallery.push(url);
        }
        // Keep primary image in sync with gallery[0]
        this.newProduct.image = this.newProduct.gallery[0] || '';
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    event.target.value = '';
  }

  triggerFileInput() {
    const fileInput = document.getElementById('imageUploadInput') as HTMLElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  triggerGallerySlot(index: number) {
    const fileInput = document.getElementById('imageUploadInput') as HTMLInputElement;
    if (fileInput) {
      (fileInput as any)._slotIndex = index;
      fileInput.value = '';
      fileInput.click();
    }
  }

  triggerGalleryAdd() {
    const fileInput = document.getElementById('imageUploadInput') as HTMLInputElement;
    if (fileInput) {
      (fileInput as any)._slotIndex = undefined;
      fileInput.value = '';
      fileInput.click();
    }
  }

  removeGalleryImage(index: number) {
    if (!this.newProduct.gallery) return;
    this.newProduct.gallery.splice(index, 1);
    this.newProduct.image = this.newProduct.gallery[0] || '';
    this.cdr.markForCheck();
  }

  get gallerySlots(): (string | null)[] {
    const gallery = this.newProduct.gallery || [];
    // Always show 4 slots, fill with nulls
    const slots: (string | null)[] = [...gallery.slice(0, 4)];
    while (slots.length < 4) slots.push(null);
    return slots;
  }
}
