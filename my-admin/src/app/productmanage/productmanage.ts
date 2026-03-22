import { Component, OnInit, OnDestroy, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ProductService } from '../services/product.service';
import { FormsModule } from '@angular/forms';
import { QuillEditorComponent } from 'ngx-quill';
import { ActivatedRoute } from '@angular/router';
import { getProductCategoryIconSrc } from './productmanage-icon';

/** Khóa sắp xếp trong UI (map sang field Mongo khi gọi API) */
type SortKind = 'updated' | 'price' | 'name' | 'stock' | 'sold';

interface Product {
  _id?: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  /** Lượt bán — dùng sắp xếp Bán chạy */
  sold?: number;
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
  imports: [CommonModule, FormsModule, QuillEditorComponent],
  providers: [ProductService],
  templateUrl: './productmanage.html',
  styleUrl: './productmanage.css',
})
export class Productmanage implements OnInit, OnDestroy {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  searchTerm: string = '';
  isLoading: boolean = false;
  /** Chỉ dùng khi bấm Lưu trong modal — tránh dùng chung isLoading (ẩn cả trang, dễ lệch trạng thái popup). */
  isSavingProduct: boolean = false;

  /** Chiều cao tối thiểu vùng soạn thảo (Quill) trong modal */
  readonly quillEditorStyles = { minHeight: '130px', fontSize: '14px' };

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
  /** Mở từ bảng/thẻ (xem chi tiết): form khóa; toolbar "Chỉnh sửa" → mở khóa ngay */
  isDetailViewLocked: boolean = false;
  private detailFormSnapshot: {
    newProduct: any;
    modalL1Id: string;
    modalL2Id: string;
    modalL3Id: string;
  } | null = null;

  /** Form chi tiết đang ở chế độ chỉ xem (chưa bấm Chỉnh sửa thông tin) */
  get productModalFieldsLocked(): boolean {
    return this.isEditMode && this.isDetailViewLocked;
  }

  // Delete Modal State
  isConfirmModalOpen: boolean = false;

  // Advanced Filter
  isFilterOpen: boolean = false;
  private filterDropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  advancedFilters: any = {
    categoryL1: {} as { [key: string]: boolean },
    categoryL2: {} as { [key: string]: boolean },
    categoryL3: {} as { [key: string]: boolean },
    unit: { 'Hộp': false, 'Vỉ': false, 'Viên': false, 'Chai': false, 'Tuýp': false, 'Gói': false, 'Lọ': false },
    price_range: { min: null as number | null, max: null as number | null },
    stock: { out_of_stock: false, low_stock: false, in_stock: false },
    /** HSD: còn hạn (>10 ngày), sắp hết hạn (trong 10 ngày tới), quá hạn */
    expiry: { valid_long: false, expiring_soon: false, expired: false },
  };

  isSortDropdownOpen: boolean = false;
  isPriceToolbarOpen: boolean = false;
  /** Mặc định: cập nhật gần đây nhất (updatedAt desc) */
  sortKind: SortKind = 'updated';
  sortDirection: 'desc' | 'asc' = 'desc';

  /** Lọc SP cần tư vấn (kê đơn / prescription) — gửi needConsultation lên API */
  filterNeedConsultation: boolean = false;

  /** list = thẻ chi tiết 2 cột (product-feed); table = bảng HTML như đơn hàng */
  viewMode: 'list' | 'table' = 'table';

  get isToolbarSoldActive(): boolean {
    return !this.filterNeedConsultation && this.sortKind === 'sold' && this.sortDirection === 'desc';
  }

  get isToolbarConsultActive(): boolean {
    return this.filterNeedConsultation;
  }

  get isToolbarPriceActive(): boolean {
    return !this.filterNeedConsultation && this.sortKind === 'price';
  }

  // Nhóm / phân loại: nhóm KM (product_groups) + gán categoryId (L1 → L2 → L3)
  isGroupModalOpen = false;
  groupModalL1Id = '';
  groupModalL2Id = '';
  groupModalL3Id = '';
  isGroupModalApplying = false;
  productGroups: any[] = [];
  groupModalNewName = '';
  groupModalSelectedGroupId = '';
  isCreatingProductGroup = false;
  /** Đang gọi API xóa nhóm (khóa nút X theo dòng). */
  deletingGroupId = '';

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

  /**
   * Lọc danh mục qua thanh ngang + mega-menu (cùng API /api/categories với storefront).
   * Một id bất kỳ (L1/L2/L3): backend mở rộng toàn bộ nhánh con khi gọi GET /api/admin/products.
   */
  categoryNavId: string | null = null;
  categoryMegaL1Id: string | null = null;
  categoryMegaHoveredL2Id: string | null = null;
  private categoryMegaCloseTimer: ReturnType<typeof setTimeout> | null = null;

  /** Thứ tự L2 cho nhánh TPCN — khớp HeaderComponent (my-user). */
  private readonly orderedL2Names = [
    'Vitamin & Khoáng chất',
    'Sinh lý - Nội tiết tố',
    'Tăng cường chức năng',
    'Hỗ trợ điều trị',
    'Hỗ trợ tiêu hóa',
    'Thần kinh não',
    'Hỗ trợ làm đẹp',
    'Sức khoẻ tim mạch',
    'Dinh dưỡng',
  ];

  constructor(
    @Inject(ProductService) private productService: ProductService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) { }

  /** Đóng panel Lọc khi chạm/click ra ngoài (class riêng — tránh nhầm với dropdown-container khác). */
  private closeFilterIfPointerOutside(target: EventTarget | null): void {
    let el: HTMLElement | null = null;
    if (target instanceof HTMLElement) el = target;
    else if (target instanceof Node && target.parentElement) el = target.parentElement;
    if (!el) {
      this.cancelFilterDropdownLeaveTimer();
      this.isFilterOpen = false;
      this.cdr.markForCheck();
      return;
    }
    if (!el.closest('.pm-filter-dropdown-wrap')) {
      this.cancelFilterDropdownLeaveTimer();
      this.isFilterOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (this.isFilterOpen) {
      this.closeFilterIfPointerOutside(event.target);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    this.closeFilterIfPointerOutside(target);
    if (
      !target.closest('.dropdown-container') &&
      !target.closest('.dropdown-popup') &&
      !target.closest('.pm-price-dropdown-wrap')
    ) {
      this.isSortDropdownOpen = false;
      this.isPriceToolbarOpen = false;
    }
    if (!target.closest('.pm-cat-nav-scope')) {
      this.closeMegaNow();
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
        this.applySortKindFromQuery(params['sortColumn']);
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
  }

  ngOnDestroy(): void {
    this.cancelCloseMega();
    this.cancelFilterDropdownLeaveTimer();
  }

  private cancelFilterDropdownLeaveTimer(): void {
    if (this.filterDropdownLeaveTimer !== null) {
      clearTimeout(this.filterDropdownLeaveTimer);
      this.filterDropdownLeaveTimer = null;
    }
  }

  /** Mở panel lọc khi hover (và hủy hẹn giờ đóng nếu đang chạy) */
  onFilterDropdownMouseEnter(): void {
    this.cancelFilterDropdownLeaveTimer();
    this.isFilterOpen = true;
    this.isSortDropdownOpen = false;
  }

  /** Đóng khi rời khỏi nút + vùng menu (delay ngắn để kịp di vào submenu bên trái) */
  onFilterDropdownMouseLeave(): void {
    this.cancelFilterDropdownLeaveTimer();
    this.filterDropdownLeaveTimer = globalThis.setTimeout(() => {
      this.isFilterOpen = false;
      this.filterDropdownLeaveTimer = null;
      this.cdr.markForCheck();
    }, 120);
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

  /**
   * Cây danh mục từ /api/categories — cùng dữ liệu với category bar + mega-menu trang chủ my-user
   * (xem HeaderComponent.fetchCategoriesAndBuildMenu: L1 pill → L2 cột trái → L3 nhóm phải).
   * categoryId trên sản phẩm: nên là _id danh mục lá (thường L3) để hiển thị/ lọc đúng trên storefront.
   */
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

    // Danh sách sản phẩm có thể đã tải xong trước khi có categoryMap — cập nhật lại đường dẫn danh mục
    this.refreshProductCategoryPaths();
  }

  /** Gọi sau khi categoryMap đã sẵn sàng (tránh race với loadProducts). */
  private refreshProductCategoryPaths(): void {
    if (!this.products?.length) return;
    this.products = this.products.map((p) => {
      const existing = (p as any).categoryPath;
      if (Array.isArray(existing) && existing.length > 0) {
        return {
          ...p,
          categoryName: existing.join(' > '),
        };
      }
      let catId = (p as any).categoryId;
      if (catId && typeof catId === 'object' && (catId as any).$oid) catId = (catId as any).$oid;
      else if (catId && typeof catId === 'object' && (catId as any)._id) catId = (catId as any)._id;
      const pathSteps = this.getCategoryPathSteps(String(catId || ''));
      return {
        ...p,
        categoryPath: pathSteps,
        categoryName: pathSteps.join(' > ') || 'Chưa phân loại'
      };
    });
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

  /** L3 con của L2 — sắp tên cho dễ chọn trong modal nhóm. */
  getSortedL3ForL2(l2Id: string): any[] {
    if (!l2Id) return [];
    return [...this.getSubCategories(l2Id)].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'vi')
    );
  }

  private resetGroupModalCategoryIds(): void {
    this.groupModalL1Id = '';
    this.groupModalL2Id = '';
    this.groupModalL3Id = '';
  }

  private resetGroupModalForm(): void {
    this.resetGroupModalCategoryIds();
    this.groupModalNewName = '';
    this.groupModalSelectedGroupId = '';
  }

  private loadProductGroupsForModal(): void {
    this.productService.getGroups().subscribe({
      next: (res: any) => {
        this.productGroups = res?.success ? res.data || [] : [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.productGroups = [];
        this.cdr.markForCheck();
      },
    });
  }

  groupRowId(g: any): string {
    return String(g?._id ?? g?.id ?? '').trim();
  }

  groupRowName(g: any): string {
    const n = String(g?.name ?? '').trim();
    return n || 'Không tên';
  }

  groupProductCount(g: any): number {
    const raw = g?.productIds ?? g?.products ?? g?.product_ids ?? g?.items;
    return Array.isArray(raw) ? raw.length : 0;
  }

  groupModalCanSubmit(): boolean {
    const hasCat = !!this.resolvedGroupCategoryId();
    const hasSel = !!String(this.groupModalSelectedGroupId || '').trim();
    const hasNew = !!String(this.groupModalNewName || '').trim();
    return hasCat || hasSel || hasNew;
  }

  onGroupModalL1Change(): void {
    this.groupModalL2Id = '';
    this.groupModalL3Id = '';
  }

  onGroupModalL2Change(): void {
    this.groupModalL3Id = '';
  }

  /** Danh mục đích: ưu tiên cấp sâu nhất đang chọn. */
  resolvedGroupCategoryId(): string | null {
    const l3 = String(this.groupModalL3Id || '').trim();
    if (l3) return l3;
    const l2 = String(this.groupModalL2Id || '').trim();
    if (l2) return l2;
    const l1 = String(this.groupModalL1Id || '').trim();
    return l1 || null;
  }

  /** L2 con của L1; TPCN sắp xếp giống trang user. */
  getSortedL2ForL1(l1Id: string | null): any[] {
    if (!l1Id) return [];
    const l2 = this.getSubCategories(l1Id);
    const l1 = this.categoryMap[l1Id];
    if (l1?.name === 'Thực phẩm chức năng') {
      return [...l2].sort((a, b) => {
        const idxA = this.orderedL2Names.indexOf(a.name);
        const idxB = this.orderedL2Names.indexOf(b.name);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
    }
    return l2;
  }

  /**
   * Ảnh mega-menu: ưu tiên map local `productmanage-icon.ts` (đúng theo nhánh L1),
   * vì nhiều bản ghi API dùng chung URL placeholder (icon răng). Chỉ dùng `icon` API khi không có map.
   */
  categoryNavIconForCategory(cat: { name?: string; icon?: string } | null | undefined): string | null {
    if (!cat) return null;
    const l1Name = this.categoryMegaL1Id
      ? this.categoryMap[this.categoryMegaL1Id]?.name
      : undefined;
    const mapped = getProductCategoryIconSrc(l1Name, cat.name);
    if (mapped) return mapped;

    const raw = cat.icon;
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t) return t;
    }
    return null;
  }

  /** nodeId có nằm trong nhánh gốc ancestorId (hoặc chính ancestorId) không. */
  isUnderCategory(ancestorId: string, nodeId: string | null): boolean {
    if (!ancestorId || !nodeId) return false;
    let cur: any = this.categoryMap[nodeId];
    while (cur) {
      if (String(cur._id) === String(ancestorId)) return true;
      cur = cur.parentId ? this.categoryMap[String(cur.parentId)] : null;
    }
    return false;
  }

  isL1PillActive(l1Id: string): boolean {
    if (this.categoryMegaL1Id === l1Id) return true;
    if (this.categoryNavId && this.isUnderCategory(l1Id, this.categoryNavId)) return true;
    return false;
  }

  onCategoryNavMouseEnter(): void {
    this.cancelCloseMega();
  }

  onCategoryNavMouseLeave(): void {
    this.scheduleCloseMega();
  }

  private scheduleCloseMega(): void {
    this.cancelCloseMega();
    this.categoryMegaCloseTimer = setTimeout(() => {
      this.categoryMegaL1Id = null;
      this.categoryMegaHoveredL2Id = null;
      this.categoryMegaCloseTimer = null;
      this.cdr.markForCheck();
    }, 240);
  }

  private cancelCloseMega(): void {
    if (this.categoryMegaCloseTimer) {
      clearTimeout(this.categoryMegaCloseTimer);
      this.categoryMegaCloseTimer = null;
    }
  }

  private closeMegaNow(): void {
    this.cancelCloseMega();
    this.categoryMegaL1Id = null;
    this.categoryMegaHoveredL2Id = null;
  }

  openMegaForL1(l1Id: string): void {
    this.cancelCloseMega();
    this.categoryMegaL1Id = l1Id;
    const l2 = this.getSortedL2ForL1(l1Id);
    this.categoryMegaHoveredL2Id = l2.length ? l2[0]._id : null;
    this.cdr.markForCheck();
  }

  onL1PillClick(l1: { _id: string }, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.categoryMegaL1Id === l1._id) {
      this.closeMegaNow();
    } else {
      this.openMegaForL1(l1._id);
    }
  }

  selectCategoryFromNav(id: string): void {
    this.categoryNavId = id;
    this.advancedFilters.categoryL1 = {};
    this.advancedFilters.categoryL2 = {};
    this.advancedFilters.categoryL3 = {};
    this.closeMegaNow();
    this.loadProducts(1);
  }

  clearCategoryNav(): void {
    this.categoryNavId = null;
    this.closeMegaNow();
    this.loadProducts(1);
  }

  get categoryNavPath(): string[] {
    if (!this.categoryNavId || !this.categoryMap[this.categoryNavId]) return [];
    return this.getCategoryPathSteps(this.categoryNavId);
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
      expiryStatus: Object.keys(this.advancedFilters.expiry).filter(k => this.advancedFilters.expiry[k]),
      sortColumn: this.apiSortColumn(),
      sortDirection: this.sortDirection,
      needConsultation: this.filterNeedConsultation,
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

            const fromApi = item.categoryPath;
            const pathSteps =
              Array.isArray(fromApi) && fromApi.length > 0
                ? [...fromApi]
                : this.getCategoryPathSteps(String(catId || ''));
            return {
              ...item,
              image: item.image || (item.gallery && item.gallery.length > 0 ? item.gallery[0] : ''),
              categoryPath: pathSteps,
              categoryName: pathSteps.length ? pathSteps.join(' > ') : 'Chưa phân loại',
              importDate: parseMongoDate(item.created_at) || parseMongoDate(item.createDate) || new Date(),
              expiryDate: parseMongoDate(item.expiryDate) || parseMongoDate(item.expiredDate) || null,
              sold: Number(item?.sold ?? 0),
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
    if (this.categoryNavId) return this.categoryNavId;
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

  /** Map SortKind → tên field gửi lên GET /api/admin/products */
  private apiSortColumn(): string {
    switch (this.sortKind) {
      case 'updated': return 'updatedAt';
      case 'price': return 'price';
      case 'name': return 'name';
      case 'stock': return 'stock';
      case 'sold': return 'sold';
      default: return 'updatedAt';
    }
  }

  /** Lần đầu chọn một tiêu chí: hướng mặc định hợp lý */
  private defaultDirectionForKind(kind: SortKind): 'asc' | 'desc' {
    switch (kind) {
      case 'updated': return 'desc';
      case 'sold': return 'desc';
      case 'stock': return 'desc';
      case 'price': return 'asc';
      case 'name': return 'asc';
      default: return 'desc';
    }
  }

  private applySortKindFromQuery(col: string): void {
    const c = col.trim();
    if (c === 'updated' || c === 'updatedAt' || c === 'importDate' || c === 'created_at') {
      this.sortKind = 'updated';
      return;
    }
    if (c === 'price' || c === 'name' || c === 'stock' || c === 'sold') {
      this.sortKind = c;
    }
  }

  /**
   * Click hàng trong menu: cùng tiêu chí → đổi tăng/giảm; khác tiêu chí → áp dụng hướng mặc định.
   */
  onSortRowClick(kind: SortKind): void {
    if (this.sortKind === kind) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKind = kind;
      this.sortDirection = this.defaultDirectionForKind(kind);
    }
    this.loadProducts(1);
  }

  /**
   * Click mũi tên cụ thể: chọn tiêu chí + hướng (tăng / giảm).
   */
  setSortDirection(kind: SortKind, direction: 'asc' | 'desc', event?: Event): void {
    event?.stopPropagation();
    this.filterNeedConsultation = false;
    this.sortKind = kind;
    this.sortDirection = direction;
    this.loadProducts(1);
  }

  applyToolbarSortSold(event?: Event): void {
    event?.stopPropagation();
    this.filterNeedConsultation = false;
    this.isPriceToolbarOpen = false;
    this.sortKind = 'sold';
    this.sortDirection = 'desc';
    this.loadProducts(1);
  }

  applyToolbarSortConsult(event?: Event): void {
    event?.stopPropagation();
    this.isPriceToolbarOpen = false;
    this.filterNeedConsultation = true;
    this.sortKind = 'updated';
    this.sortDirection = 'desc';
    this.loadProducts(1);
  }

  togglePriceToolbarDropdown(event: Event): void {
    event.stopPropagation();
    this.isPriceToolbarOpen = !this.isPriceToolbarOpen;
    this.isFilterOpen = false;
    this.isSortDropdownOpen = false;
  }

  applyToolbarPriceSort(direction: 'asc' | 'desc', event?: Event): void {
    event?.stopPropagation();
    this.filterNeedConsultation = false;
    this.isPriceToolbarOpen = false;
    this.sortKind = 'price';
    this.sortDirection = direction;
    this.loadProducts(1);
  }

  setViewMode(mode: 'list' | 'table', event?: Event): void {
    event?.stopPropagation();
    this.viewMode = mode;
  }

  /** Badge tồn kho (màu giống cột trạng thái đơn hàng) */
  productStockBadgeClass(p: Product): string {
    if (p.stock === 0) return 'status-red';
    if (p.stock > 0 && p.stock < 10) return 'status-yellow';
    return 'status-green';
  }

  productStockBadgeLabel(p: Product): string {
    if (p.stock === 0) return 'Hết hàng';
    if (p.stock > 0 && p.stock < 10) return 'Sắp hết';
    return 'Còn hàng';
  }

  /** Cùng ngưỡng bộ lọc Tồn kho (low_stock): 0 < stock < 10 */
  isLowStockProduct(p: Pick<Product, 'stock'>): boolean {
    const n = Number(p?.stock);
    return n > 0 && n < 10;
  }

  sortResults() { } // Handled by server or can be added as query param later

  // --- Filter Actions ---
  toggleFilterDropdown(event: Event) {
    event.stopPropagation();
    this.cancelFilterDropdownLeaveTimer();
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

  /** Mục menu Lọc đang có tiêu chí bật — highlight + hover xanh đậm hơn. */
  isFilterSectionActive(section: 'unit' | 'price' | 'stock' | 'expiry'): boolean {
    switch (section) {
      case 'unit':
        return Object.values(this.advancedFilters.unit).some((v) => !!v);
      case 'price':
        return (
          this.advancedFilters.price_range.min !== null ||
          this.advancedFilters.price_range.max !== null
        );
      case 'stock':
        return Object.values(this.advancedFilters.stock).some((v) => !!v);
      case 'expiry':
        return Object.values(this.advancedFilters.expiry).some((v) => !!v);
      default:
        return false;
    }
  }

  get activeFilterCount(): number {
    let count = 0;
    // Check categories (count as 1 if any category is selected)
    const hasCategory =
      !!this.categoryNavId ||
      Object.values(this.advancedFilters.categoryL1).some(v => v) ||
      Object.values(this.advancedFilters.categoryL2).some(v => v) ||
      Object.values(this.advancedFilters.categoryL3).some(v => v);
    if (hasCategory) count++;

    // Check others
    if (this.advancedFilters.price_range.min !== null || this.advancedFilters.price_range.max !== null) count++;
    Object.values(this.advancedFilters.unit).forEach(v => { if (v) count++; });
    Object.values(this.advancedFilters.stock).forEach(v => { if (v) count++; });
    Object.values(this.advancedFilters.expiry).forEach(v => { if (v) count++; });

    return count;
  }

  clearAllFilters() {
    this.filterNeedConsultation = false;
    this.categoryNavId = null;
    this.closeMegaNow();
    this.advancedFilters = {
      categoryL1: {},
      categoryL2: {},
      categoryL3: {},
      unit: { 'Hộp': false, 'Vỉ': false, 'Viên': false, 'Chai': false, 'Tuýp': false, 'Gói': false, 'Lọ': false },
      price_range: { min: null, max: null },
      stock: { out_of_stock: false, low_stock: false, in_stock: false },
      expiry: { valid_long: false, expiring_soon: false, expired: false },
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
      this.showNotification('Vui lòng chọn ít nhất 2 sản phẩm để phân loại nhóm', 'warning');
      return;
    }
    this.resetGroupModalForm();
    this.loadProductGroupsForModal();
    this.isGroupModalOpen = true;
  }

  onDeleteProductGroupClick(g: any, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    const id = this.groupRowId(g);
    if (!id || this.isGroupModalApplying) return;
    const name = this.groupRowName(g);
    if (
      !confirm(
        `Xóa nhóm "${name}"?\nSản phẩm đang gắn nhóm này sẽ được gỡ khỏi nhóm (không xóa sản phẩm).`,
      )
    ) {
      return;
    }
    this.deletingGroupId = id;
    this.productService.deleteGroup(id).subscribe({
      next: (res: any) => {
        this.deletingGroupId = '';
        if (!res?.success) {
          this.showNotification(res?.message || 'Không xóa được nhóm', 'error');
          return;
        }
        if (String(this.groupModalSelectedGroupId || '').trim() === id) {
          this.groupModalSelectedGroupId = '';
        }
        this.loadProductGroupsForModal();
        this.showNotification('Đã xóa nhóm.', 'success');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.deletingGroupId = '';
        this.showNotification(err?.error?.message || 'Lỗi khi xóa nhóm', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  onCreateProductGroupClick(): void {
    const name = String(this.groupModalNewName || '').trim();
    if (!name) {
      this.showNotification('Nhập tên nhóm mới', 'warning');
      return;
    }
    this.isCreatingProductGroup = true;
    this.productService.createGroup({ name }).subscribe({
      next: (res: any) => {
        this.isCreatingProductGroup = false;
        const gid = res?.data?._id != null ? String(res.data._id) : '';
        if (!res?.success || !gid) {
          this.showNotification(res?.message || 'Không tạo được nhóm', 'error');
          return;
        }
        this.loadProductGroupsForModal();
        this.groupModalSelectedGroupId = gid;
        this.groupModalNewName = '';
        this.showNotification('Đã tạo nhóm. Bấm Áp dụng để gán các sản phẩm đã chọn vào nhóm.', 'success');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isCreatingProductGroup = false;
        this.showNotification(err?.error?.message || 'Lỗi tạo nhóm', 'error');
      },
    });
  }

  confirmGroup() {
    const categoryId = this.resolvedGroupCategoryId();
    const productIds = Array.from(this.selectedIds);
    const selectedGid = String(this.groupModalSelectedGroupId || '').trim();
    const newName = String(this.groupModalNewName || '').trim();
    const hasCategory = !!categoryId;
    const hasGroupPick = !!selectedGid;
    const hasNewName = !!newName;

    if (!hasCategory && !hasGroupPick && !hasNewName) {
      this.showNotification(
        'Chọn nhóm có sẵn, hoặc nhập tên nhóm mới, hoặc chọn danh mục (ít nhất một mục).',
        'warning',
      );
      return;
    }

    this.isGroupModalApplying = true;

    const finishOk = (msg: string) => {
      this.isGroupModalApplying = false;
      this.showNotification(msg, 'success');
      this.isGroupModalOpen = false;
      this.resetGroupModalForm();
      this.unselectAll();
      this.loadProducts(this.currentPage);
      this.cdr.markForCheck();
    };

    const fail = (msg: string) => {
      this.isGroupModalApplying = false;
      this.showNotification(msg, 'error');
      this.cdr.markForCheck();
    };

    const runCategory = (onDone: () => void) => {
      if (!hasCategory || !categoryId) {
        onDone();
        return;
      }
      this.productService.bulkUpdateProductCategory(productIds, categoryId).subscribe({
        next: (res) => {
          if (!res.success) {
            fail(res.message || 'Không cập nhật được phân loại.');
            return;
          }
          onDone();
        },
        error: (err) => fail(err?.error?.message || 'Lỗi khi cập nhật phân loại'),
      });
    };

    const runBulkGroup = (gid: string, onDone: () => void) => {
      this.productService.bulkAssignProductGroup(productIds, gid).subscribe({
        next: (res) => {
          if (!res.success) {
            fail(res.message || 'Không gán được nhóm sản phẩm.');
            return;
          }
          onDone();
        },
        error: (err) => fail(err?.error?.message || 'Lỗi khi gán nhóm sản phẩm'),
      });
    };

    if (hasGroupPick) {
      runBulkGroup(selectedGid, () =>
        runCategory(() => {
          const parts: string[] = [];
          parts.push('Đã gán nhóm khuyến mãi');
          if (hasCategory) parts.push('và cập nhật phân loại danh mục');
          finishOk(`${parts.join(' ')}.`);
        }),
      );
      return;
    }

    if (hasNewName) {
      this.productService.createGroup({ name: newName }).subscribe({
        next: (res: any) => {
          const gid = res?.data?._id != null ? String(res.data._id) : '';
          if (!res?.success || !gid) {
            fail(res?.message || 'Không tạo được nhóm');
            return;
          }
          runBulkGroup(gid, () =>
            runCategory(() => {
              const parts: string[] = ['Đã tạo nhóm và gán sản phẩm'];
              if (hasCategory) parts.push('đồng thời cập nhật phân loại');
              finishOk(`${parts.join(', ')}.`);
            }),
          );
        },
        error: (err) => fail(err?.error?.message || 'Lỗi tạo nhóm'),
      });
      return;
    }

    runCategory(() => finishOk('Đã cập nhật phân loại danh mục.'));
  }

  closeGroupModal() {
    this.isGroupModalOpen = false;
    this.resetGroupModalForm();
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
    this.isDetailViewLocked = false;
    this.detailFormSnapshot = null;
    this.isSavingProduct = false;
    this.resetForm();
    this.isProductModalOpen = true;
  }

  /**
   * Luôn gọi API getProductById để lấy bản mới nhất từ server (đồng bộ MongoDB).
   * @param startLocked true khi mở từ tên SP/thẻ (chỉ xem); false khi mở từ toolbar Chỉnh sửa.
   */
  private loadProductModalFromApi(id: string, startLocked: boolean) {
    this.isLoading = true;
    this.isSavingProduct = false;
    this.detailFormSnapshot = null;

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

          this.normalizeRichTextFields(this.newProduct);

          this.isEditMode = true;
          this.currentProductId = id;
          this.isDetailViewLocked = startLocked;
          this.isProductModalOpen = true;
          this.cdr.markForCheck();
        }
      },
      error: () => {
        this.isLoading = false;
        this.showNotification('Lỗi tải thông tin sản phẩm', 'error');
      }
    });
  }

  /** Plain text / HTML lẫn lộn từ DB → HTML hợp lệ cho Quill */
  private normalizeRichTextFields(p: any): void {
    for (const key of ['description', 'usage', 'ingredients', 'warnings'] as const) {
      p[key] = this.plainTextToQuillHtml(p[key]);
    }
  }

  private plainTextToQuillHtml(raw: unknown): string {
    if (raw == null) return '';
    const s = String(raw).trim();
    if (!s) return '';
    if (/^<\s*[a-z!/]/i.test(s)) return String(raw);
    const esc = (t: string) =>
      t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const normalized = s.replace(/\r\n/g, '\n');
    const blocks = normalized.split(/\n\n+/).filter(Boolean);
    const html = blocks.map((block) => `<p>${esc(block).replace(/\n/g, '<br>')}</p>`).join('');
    return html || '';
  }

  openEditProductModal() {
    if (this.selectedIds.size !== 1) {
      this.showNotification('Vui lòng chọn đúng 1 sản phẩm để chỉnh sửa', 'warning');
      return;
    }
    const id = String(Array.from(this.selectedIds)[0]);
    this.loadProductModalFromApi(id, false);
  }

  closeProductModal() {
    this.isProductModalOpen = false;
    this.isDetailViewLocked = false;
    this.detailFormSnapshot = null;
    this.isSavingProduct = false;
    this.cdr.markForCheck();
  }

  openProductDetail(product: any, event: MouseEvent) {
    // If user clicked inside a checkbox or another button, don't trigger row click
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('button')) return;
    if (!product?._id) return;

    this.selectedIds.clear();
    this.selectedIds.add(String(product._id));
    this.updateSelectionCount();
    this.products.forEach(p => p.selected = (String(p._id) === String(product._id)));
    this.loadProductModalFromApi(String(product._id), true);
  }

  private openProductDetailById(id: string) {
    if (!id) return;
    this.selectedIds.clear();
    this.selectedIds.add(String(id));
    this.updateSelectionCount();
    this.products.forEach(p => p.selected = (String(p._id) === String(id)));
    this.loadProductModalFromApi(String(id), true);
  }

  startDetailEdit() {
    this.detailFormSnapshot = {
      newProduct: JSON.parse(JSON.stringify(this.newProduct)),
      modalL1Id: this.modalL1Id,
      modalL2Id: this.modalL2Id,
      modalL3Id: this.modalL3Id,
    };
    this.isDetailViewLocked = false;
    this.cdr.markForCheck();
  }

  cancelDetailEdit() {
    if (this.detailFormSnapshot) {
      const s = this.detailFormSnapshot;
      this.newProduct = JSON.parse(JSON.stringify(s.newProduct));
      this.modalL1Id = s.modalL1Id;
      this.modalL2Id = s.modalL2Id;
      this.modalL3Id = s.modalL3Id;
      this.detailFormSnapshot = null;
    }
    this.isDetailViewLocked = true;
    this.cdr.markForCheck();
  }

  openEditProductFromCard(product: any, event: Event) {
    event.stopPropagation();
    if (!product?._id) return;
    this.openProductDetailById(String(product._id));
  }

  promptDeleteProduct(product: any, event: Event) {
    event.stopPropagation();
    if (!product?._id) return;
    this.selectedIds.clear();
    this.selectedIds.add(String(product._id));
    this.updateSelectionCount();
    this.isConfirmModalOpen = true;
  }

  saveProduct() {
    if (this.isEditMode && this.isDetailViewLocked) {
      this.showNotification('Nhấn "Chỉnh sửa thông tin" để có thể lưu thay đổi', 'warning');
      return;
    }
    // Validate
    if (!this.newProduct.name || !this.newProduct.sku) {
      this.showNotification('Vui lòng nhập tên và SKU', 'warning');
      return;
    }

    this.isSavingProduct = true;
    if (this.isEditMode && this.currentProductId) {
      this.productService.updateProduct(this.currentProductId, this.newProduct).subscribe({
        next: () => {
          this.pendingOpenProductId = null;
          this.detailFormSnapshot = null;
          this.showNotification('Cập nhật sản phẩm thành công');
          this.closeProductModal();
          this.fetchProducts();
        },
        error: (err) => {
          this.isSavingProduct = false;
          this.showNotification('Lỗi cập nhật: ' + (err?.error?.message || err?.message || 'Không xác định'), 'error');
          this.cdr.markForCheck();
        }
      });
    } else {
      this.productService.createProduct(this.newProduct).subscribe({
        next: () => {
          this.pendingOpenProductId = null;
          this.showNotification('Thêm sản phẩm thành công');
          this.closeProductModal();
          this.goToPage(1); // Go to page 1 to see the newly added product
        },
        error: (err) => {
          this.isSavingProduct = false;
          this.showNotification('Lỗi thêm mới: ' + (err?.error?.message || err?.message || 'Không xác định'), 'error');
          this.cdr.markForCheck();
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
    if (this.productModalFieldsLocked) return;
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
    if (this.productModalFieldsLocked) return;
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
    if (this.productModalFieldsLocked) return;
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
