import { Component, OnInit, Inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionService } from '../services/promotion.service';
import { OrderService } from '../services/order.service';
import { ProductService } from '../services/product.service';
import { CustomerService } from '../services/customer.service';
import { forkJoin } from 'rxjs';

interface Promotion {
  _id?: string;
  promotion_id?: string;
  code: string;
  name: string;
  description: string;
  type: string;
  scope: string;
  discount_type: string;
  discount_value: number;
  min_order_value: number;
  max_discount_value: number;
  start_date: string;
  end_date: string;
  usage_limit: number;
  user_limit: number;
  is_first_order_only: boolean;
  usage_count?: number;
  status: string;
  statusTitle?: string;
  statusClass?: string;
  updated_at: string;
  selected?: boolean;
  customer_group_id?: string;
  product_group_id?: string;
  target_category_id?: string;
  images?: string[];
  typeBanner?: string;
}

@Component({
  selector: 'app-promotionmanage',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  providers: [PromotionService, OrderService, ProductService, CustomerService],
  templateUrl: './promotionmanage.html',
  styleUrl: './promotionmanage.css'
})
export class Promotionmanage implements OnInit {
  promotions: Promotion[] = [];
  filteredPromotions: Promotion[] = [];
  searchTerm: string = '';
  isLoading: boolean = false;

  selectAll: boolean = false;
  selectedCount: number = 0;

  summary = { total: 0, ended: 0, ongoing: 0, upcoming: 0 };
  isModalOpen: boolean = false;
  isEditMode: boolean = false;
  currentPromotion: any = {};

  notification = { show: false, message: '', type: 'success' };
  isFilterDropdownOpen: boolean = false;
  isSortDropdownOpen: boolean = false;
  isDeleteConfirmModalOpen: boolean = false;

  filterStatus: string = 'all';
  sortCriteria: string = 'date';
  sortDirection: 'desc' | 'asc' = 'desc';

  // Target Options
  bannerSlots: any[] = [
    { id: 'none', name: 'Không hiển thị' },
    { id: 'main_1', name: 'Banner chính 1' },
    { id: 'main_2', name: 'Banner chính 2' },
    { id: 'main_3', name: 'Banner chính 3' },
    { id: 'sub_1', name: 'Banner phụ 1' },
    { id: 'sub_2', name: 'Banner phụ 2' },
    { id: 'sub_3', name: 'Banner phụ 3' }
  ];
  customerGroups: any[] = [];
  productGroups: any[] = [];
  categories: any[] = [];
  formattedCategories: any[] = [];
  imageInput: string = '';

  constructor(
    @Inject(PromotionService) private promotionService: PromotionService,
    @Inject(OrderService) private orderService: OrderService,
    @Inject(ProductService) private productService: ProductService,
    @Inject(CustomerService) private customerService: CustomerService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.fetchData();
    this.fetchGroups();
  }

  fetchGroups() {
    this.customerService.getGroups().subscribe({
      next: (res) => { if (res.success) this.customerGroups = res.data; }
    });
    this.productService.getGroups().subscribe({
      next: (res) => { if (res.success) this.productGroups = res.data; }
    });
    this.productService.getCategories().subscribe({
      next: (res) => { 
        const cats = res.success ? res.data : (Array.isArray(res) ? res : []);
        this.categories = cats;
        this.formattedCategories = this.formatCategoryTree(cats);
      }
    });
  }

  formatCategoryTree(allCats: any[]): any[] {
    const map = new Map();
    allCats.forEach(cat => map.set(cat._id, { ...cat, children: [] }));
    
    const roots: any[] = [];
    allCats.forEach(cat => {
      const item = map.get(cat._id);
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId).children.push(item);
      } else {
        roots.push(item);
      }
    });

    const result: any[] = [];
    const flatten = (nodes: any[], level: number) => {
      nodes.forEach(node => {
        result.push({
          ...node,
          displayName: '—'.repeat(level) + (level > 0 ? ' ' : '') + node.name
        });
        if (node.children && node.children.length > 0) {
          flatten(node.children, level + 1);
        }
      });
    };
    flatten(roots, 0);
    return result;
  }



  fetchData() {
    this.isLoading = true;

    // Fetch both promotions and orders to calculate usage correctly
    forkJoin({
      promos: this.promotionService.getPromotions(),
      orders: this.orderService.getOrders()
    }).subscribe({
      next: (result) => {
        const promoRes = result.promos;
        const orderRes = result.orders;

        let rawPromos = [];
        if (promoRes && promoRes.success && Array.isArray(promoRes.data)) {
          rawPromos = promoRes.data;
        } else if (Array.isArray(promoRes)) {
          rawPromos = promoRes;
        }

        let rawOrders = [];
        if (orderRes && orderRes.success && Array.isArray(orderRes.data)) {
          rawOrders = orderRes.data;
        } else if (Array.isArray(orderRes)) {
          rawOrders = orderRes;
        }

        // Map usage counts from orders
        const usageMap: { [key: string]: number } = {};
        rawOrders.forEach((order: any) => {
          if (order.code) {
            usageMap[order.code] = (usageMap[order.code] || 0) + 1;
          }
        });

        this.promotions = rawPromos.map((p: any) => {
          if (!p) return null;
          let statusStr = 'ongoing';
          let sTitle = 'Đang diễn ra';
          let sClass = 'active';

          try {
            const now = new Date();
            const startStr = p.start_date || p.startDate || new Date().toISOString();
            const endStr = p.end_date || p.endDate || new Date(now.getTime() + 30 * 86400000).toISOString();

            const startDate = new Date(startStr);
            const endDate = new Date(endStr);

            if (now > endDate) {
              statusStr = 'ended';
              sTitle = 'Đã kết thúc';
              sClass = 'ended';
            } else if (now < startDate) {
              statusStr = 'upcoming';
              sTitle = 'Sắp diễn ra';
              sClass = 'upcoming';
            }
          } catch (e) {
            console.warn('Lỗi phân tích ngày cho KM:', p.code || p._id);
          }

          return {
            ...p,
            code: p.code || 'NO_CODE',
            name: p.name || 'Khuyến mãi không tên',
            status: statusStr,
            statusTitle: sTitle,
            statusClass: sClass,
            type: (p.type || 'order').toLowerCase() === 'product' ? 'product' : (p.type === 'category' ? 'category' : 'customer'),
            scope: (p.scope || 'order').toLowerCase(),
            usage_count: usageMap[p.code] || 0, // Real usage from orders
            usage_limit: p.usage_limit || 0,
            start_date: p.start_date || p.startDate,
            end_date: p.end_date || p.endDate,
            selected: false
          };
        }).filter((p: any) => p !== null);

        this.calculateSummary();
        this.applyFiltersAndSort();
        this.isLoading = false;
        this.cdr.markForCheck(); // Force immediate view update
      },
      error: (err) => {
        console.error('Data load error:', err);
        this.isLoading = false;
        this.showNotification('Lỗi tải dữ liệu', 'error');
      }
    });
  }

  calculateSummary() {
    this.summary.total = this.promotions.length;
    this.summary.ended = this.promotions.filter(p => p.status === 'ended').length;
    this.summary.ongoing = this.promotions.filter(p => p.status === 'ongoing').length;
    this.summary.upcoming = this.promotions.filter(p => p.status === 'upcoming').length;
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value.toLowerCase();
    this.applyFiltersAndSort();
  }

  applyFiltersAndSort() {
    let list = this.promotions;
    if (this.filterStatus !== 'all') {
      list = list.filter(p => p.status === this.filterStatus);
    }
    if (this.searchTerm) {
      list = list.filter(p =>
        (p.name && p.name.toLowerCase().includes(this.searchTerm)) ||
        (p.code && p.code.toLowerCase().includes(this.searchTerm))
      );
    }
    list.sort((a, b) => {
      let valA, valB;
      if (this.sortCriteria === 'date') {
        valA = new Date(a.start_date).getTime();
        valB = new Date(b.start_date).getTime();
      } else {
        valA = a.usage_count || 0;
        valB = b.usage_count || 0;
      }
      return this.sortDirection === 'asc' ? (valA - valB) : (valB - valA);
    });
    this.filteredPromotions = [...list];
    this.updateSelectionCount();
  }

  toggleSelectAll(event: any) {
    this.selectAll = event.target.checked;
    this.filteredPromotions.forEach(p => p.selected = this.selectAll);
    this.updateSelectionCount();
  }

  onSelectChange() {
    this.updateSelectionCount();
    this.selectAll = this.filteredPromotions.length > 0 && this.filteredPromotions.every(p => p.selected);
  }

  updateSelectionCount() {
    this.selectedCount = this.filteredPromotions.filter(p => p.selected).length;
  }

  // Operations
  filterByStatus(status: string) {
    this.filterStatus = status;
    this.applyFiltersAndSort();
    this.cdr.markForCheck();
  }

  toggleFilterDropdown() { this.isFilterDropdownOpen = !this.isFilterDropdownOpen; }
  toggleSortDropdown() { this.isSortDropdownOpen = !this.isSortDropdownOpen; }

  applyFilter() { this.applyFiltersAndSort(); this.isFilterDropdownOpen = false; }
  applySort() { this.applyFiltersAndSort(); this.isSortDropdownOpen = false; }

  onDeleteClick() {
    if (this.selectedCount === 0) {
      this.showNotification('Chưa chọn khuyến mãi nào để xóa', 'warning');
      return;
    }
    this.isDeleteConfirmModalOpen = true;
  }

  confirmDelete() {
    const selectedIds = this.filteredPromotions.filter(p => p.selected).map(p => p._id);
    if (selectedIds.length === 0) return;
    
    this.isLoading = true;
    const requests = selectedIds.map(id => this.promotionService.deletePromotion(id!));

    forkJoin(requests).subscribe({
      next: () => {
        this.showNotification('Đã xóa thành công');
        this.fetchData();
        this.isDeleteConfirmModalOpen = false;
        // Selection state will be reset in fetchData map
      },
      error: (err) => {
        this.isLoading = false;
        this.showNotification('Lỗi khi xóa khuyến mãi', 'error');
        console.error('Delete error:', err);
      }
    });
  }

  closeDeleteConfirmModal() { this.isDeleteConfirmModalOpen = false; }

  openAddPromotionModal() { this.isEditMode = false; this.resetForm(); this.isModalOpen = true; }

  openEditPromotionModal() {
    const selected = this.filteredPromotions.filter(p => p.selected);
    if (selected.length !== 1) {
      this.showNotification('Vui lòng chọn 1 khuyến mãi để chỉnh sửa', 'warning');
      return;
    }
    this.isEditMode = true;
    this.currentPromotion = { ...selected[0] };
    if (this.currentPromotion.start_date) this.currentPromotion.start_date = new Date(this.currentPromotion.start_date).toISOString().split('T')[0];
    if (this.currentPromotion.end_date) this.currentPromotion.end_date = new Date(this.currentPromotion.end_date).toISOString().split('T')[0];
    if (!this.currentPromotion.images) this.currentPromotion.images = [];
    if (!this.currentPromotion.typeBanner) this.currentPromotion.typeBanner = 'none';
    if (this.currentPromotion.image && this.currentPromotion.images.length === 0) {
      this.currentPromotion.images = [this.currentPromotion.image];
    }
    delete this.currentPromotion.image;
    this.isModalOpen = true;
  }

  closeModal() { this.isModalOpen = false; }

  savePromotion() {
    if (!this.currentPromotion.code || !this.currentPromotion.name) {
      this.showNotification('Vui lòng nhập đầy đủ Mã và Tên', 'warning');
      return;
    }
    this.isLoading = true;
    if (!this.currentPromotion.promotion_id) {
      this.currentPromotion.promotion_id = 'PRM-' + Date.now().toString().slice(-8);
    }

    // Clean up UI/Calculated fields before saving to DB
    const dataToSave = { ...this.currentPromotion };
    delete dataToSave.id;
    delete (dataToSave as any).selected;
    delete (dataToSave as any).status;
    delete (dataToSave as any).statusClass;
    delete (dataToSave as any).statusTitle;
    delete (dataToSave as any).targets;
    delete (dataToSave as any).usages;
    delete (dataToSave as any).usage_count;

    const action = this.isEditMode
      ? this.promotionService.updatePromotion(this.currentPromotion._id, dataToSave)
      : this.promotionService.createPromotion(dataToSave);

    action.subscribe({
      next: () => {
        this.showNotification(this.isEditMode ? 'Cập nhật thành công' : 'Thêm mới thành công');
        this.fetchData();
        this.isModalOpen = false;
      },
      error: () => {
        this.isLoading = false;
        this.showNotification('Lỗi lưu dữ liệu', 'error');
      }
    });
  }

  resetForm() {
    this.currentPromotion = {
      promotion_id: '',
      code: '', name: '', description: '', type: 'customer', scope: 'order',
      discount_type: 'percent', discount_value: 0, min_order_value: 0,
      max_discount_value: 0, start_date: '', end_date: '', usage_limit: 0,
      user_limit: 0, is_first_order_only: false,
      customer_group_id: '', product_group_id: '', target_category_id: '',
      images: [], typeBanner: 'none'
    };
    this.imageInput = '';
  }

  selectBannerSlot(slotId: string) {
    this.currentPromotion.typeBanner = slotId;
  }

  isBannerSlotSelected(slotId: string): boolean {
    return this.currentPromotion.typeBanner === slotId;
  }

  showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    this.notification = { show: true, message, type };
    setTimeout(() => this.notification.show = false, 3000);
  }

  // Image Library Methods
  addImage() {
    if (this.imageInput && this.imageInput.trim()) {
      if (!this.currentPromotion.images) this.currentPromotion.images = [];
      this.currentPromotion.images.push(this.imageInput.trim());
      this.imageInput = '';
      this.showNotification('Đã thêm ảnh vào thư viện');
    }
  }

  removeImage(index: number) {
    if (this.currentPromotion.images) {
      this.currentPromotion.images.splice(index, 1);
    }
  }

  onFileUpload(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        if (!this.currentPromotion.images) this.currentPromotion.images = [];
        this.currentPromotion.images.push(e.target.result);
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    }
  }
}
