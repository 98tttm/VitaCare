import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { OrderService } from '../services/order.service';
import { FormsModule } from '@angular/forms';

interface Order {
  id: string; // The real _id or order_id
  code: string;
  date: Date;
  customer: string;
  status: string;
  statusText: string;
  paymentStatus: string;
  paymentStatusText: string;
  deliveryStatus: string;
  deliveryStatusText: string;
  total: number;
  // Giữ lại trạng thái gốc từ backend để lọc chính xác
  rawStatus?: string;
  selected?: boolean; // Checkbox selection
}

@Component({
  selector: 'app-ordermanage',
  imports: [CommonModule, CurrencyPipe, DatePipe, DecimalPipe, FormsModule],
  providers: [OrderService],
  templateUrl: './ordermanage.html',
  styleUrl: './ordermanage.css',
})
export class Ordermanage implements OnInit {
  orders: Order[] = [];
  filteredOrders: Order[] = [];
  searchTerm: string = '';
  currentStatusFilter: string = 'all';
  isLoading: boolean = false;
  isAddOrderModalOpen: boolean = false;
  selectAll: boolean = false;

  // Notification State
  notification = {
    show: false,
    message: '',
    type: 'success' // success | error | warning
  };

  // Advanced Filter
  isFilterOpen: boolean = false;
  advancedFilters = {
    status: { pending: false, confirmed: false, cancelled: false, shipping: false, delivered: false },
    payment: { paid: false, unpaid: false },
    delivery: { shipping: false, delivered: false },
    time: { today: false, week: false, month: false },
    total_range: { min: null as number | null, max: null as number | null }
  };

  isEditMode: boolean = false;
  editingOrderId: string | null = null;

  // Selection
  selectedCount: number = 0;

  // Dummy form data for the new order
  newOrder: any = {
    shippingInfo: {
      fullName: '',
      phone: '',
      address: '',
      city: '',
      district: '',
      ward: ''
    },
    item: [
      {
        product: '',
        quantity: 1,
        price: 0
      }
    ],
    paymentMethod: 'COD',
    totalAmount: 0
  };

  stats = {
    total: 0,
    pending: 0,
    confirmed: 0,
    shipping: 0,
    delivered: 0,
    unpaid: 0,
    cancelled: 0,
    refunded: 0,
    processing_return: 0
  };

  // Location Data
  locationsTree: any[] = []; // Raw tree data
  cities: any[] = [];
  districts: any[] = [];
  wards: any[] = [];

  constructor(
    private router: Router,
    @Inject(OrderService) private orderService: OrderService,
    private cdr: ChangeDetectorRef
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Check if click is outside of dropdown containers
    if (!target.closest('.dropdown-container') && !target.closest('.dropdown-popup')) {
      this.isFilterOpen = false;
      this.isSortDropdownOpen = false;
    }
  }

  ngOnInit() {
    this.fetchOrders();
    this.fetchLocations();
  }

  showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    this.notification.message = message;
    this.notification.type = type;
    this.notification.show = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.notification.show = false;
      this.cdr.markForCheck();
    }, 3000);
  }

  fetchLocations() {
    this.orderService.getLocations().subscribe({
      next: (res: any) => {
        const treeData = res.success ? res.data : res;
        const provincesObject = Array.isArray(treeData) ? treeData[0] : treeData;

        this.cities = Object.values(provincesObject)
          .map((province: any) => {
            const districts: any[] = [];

            if (province['quan-huyen']) {
              Object.values(province['quan-huyen']).forEach((district: any) => {
                const wards: any[] = [];

                if (district['xa-phuong']) {
                  Object.values(district['xa-phuong']).forEach((ward: any) => {
                    if (ward && ward.name && ward.name.trim() !== '') {
                      wards.push({
                        code: ward.code || '',
                        name_with_type: ward.name_with_type || ward.name || '',
                        name: ward.name || ''
                      });
                    }
                  });
                }

                if (district && district.name && district.name.trim() !== '') {
                  districts.push({
                    code: district.code || '',
                    name_with_type: district.name_with_type || district.name || '',
                    name: district.name || '',
                    'xa-phuong': wards.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
                  });
                }
              });
            }

            if (province && province.name && province.name.trim() !== '') {
              return {
                code: province.code || '',
                name_with_type: province.name_with_type || province.name || '',
                name: province.name || '',
                'quan-huyen': districts.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
              };
            }
            return null;
          })
          .filter((province: any) => province !== null)
          .sort((a: any, b: any) => a.name.localeCompare(b.name, 'vi'));
      },
      error: (err) => console.error('Error loading locations:', err)
    });
  }

  onCityChange() {
    const cityName = this.newOrder.shippingInfo.city;
    const city = this.cities.find(c => c.name_with_type === cityName);
    if (city && city['quan-huyen']) {
      this.districts = city['quan-huyen'];
    } else {
      this.districts = [];
    }
    this.wards = [];
    this.newOrder.shippingInfo.district = '';
    this.newOrder.shippingInfo.ward = '';
  }

  onDistrictChange() {
    const districtName = this.newOrder.shippingInfo.district;
    const dist = this.districts.find(d => d.name_with_type === districtName);
    if (dist && dist['xa-phuong']) {
      this.wards = dist['xa-phuong'];
    } else {
      this.wards = [];
    }
    this.newOrder.shippingInfo.ward = '';
  }

  toggleSelectAll() {
    this.filteredOrders.forEach(order => order.selected = this.selectAll);
    this.updateSelectionCount();
  }

  checkAllSelected() {
    this.selectAll = this.filteredOrders.length > 0 && this.filteredOrders.every(order => order.selected);
    this.updateSelectionCount();
  }

  updateSelectionCount() {
    this.selectedCount = this.filteredOrders.filter(o => o.selected).length;
  }

  fetchOrders() {
    this.isLoading = true;
    this.orderService.getOrders().subscribe({
      next: (res) => {
        if (res.success) {
          this.orders = res.data.map((item: any) => this.mapOrder(item));
          this.applyFilters();
          this.calculateStats();
          this.cdr.markForCheck(); // Force immediate view update
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching orders:', err);
        this.isLoading = false;
      }
    });
  }

  // --- Actions ---

  openAddOrderModal() {
    this.router.navigate(['/admin/orders/create']);
  }

  closeAddOrderModal() {
    this.isAddOrderModalOpen = false;
    this.resetForm();
  }

  resetForm() {
    this.newOrder = {
      shippingInfo: { fullName: '', phone: '', address: '', city: '', district: '', ward: '' },
      item: [{ product: '', quantity: 1, price: 0 }],
      paymentMethod: 'COD',
      totalAmount: 0
    };
    this.districts = [];
    this.wards = [];
  }

  saveNewOrder() {
    if (!this.newOrder.shippingInfo.fullName || !this.newOrder.shippingInfo.phone) {
      this.showNotification('Vui lòng nhập tên và số điện thoại!', 'warning');
      return;
    }
    this.newOrder.totalAmount = this.newOrder.item[0].quantity * this.newOrder.item[0].price;

    this.isLoading = true;

    if (this.isEditMode && this.editingOrderId) {
      // Update Logic
      this.orderService.updateOrder(this.editingOrderId, this.newOrder).subscribe({
        next: (res) => {
          if (res.success) {
            this.showNotification('Cập nhật đơn hàng thành công!');
            this.closeAddOrderModal();
            this.fetchOrders();
          } else {
            this.showNotification(res.message || 'Lỗi cập nhật', 'error');
          }
          this.isLoading = false;
        },
        error: (err) => {
          this.showNotification('Lỗi server khi cập nhật', 'error');
          this.isLoading = false;
        }
      });
    } else {
      // Create Logic
      this.orderService.createOrder(this.newOrder).subscribe({
        next: (res) => {
          if (res.success) {
            this.showNotification('Thêm đơn hàng thành công!');
            this.closeAddOrderModal();
            this.fetchOrders();
          } else {
            this.showNotification(res.message || 'Lỗi thêm mới', 'error');
          }
          this.isLoading = false;
        },
        error: (err) => {
          this.showNotification('Lỗi server khi thêm mới', 'error');
          this.isLoading = false;
        }
      });
    }
  }

  // Edit Action
  onEditClick() {
    const selected = this.filteredOrders.filter(o => o.selected);
    if (selected.length !== 1) {
      this.showNotification('Vui lòng chọn 1 đơn hàng để chỉnh sửa', 'warning');
      return;
    }
    const orderItem = selected[0];
    this.router.navigate(['/admin/orders/edit', orderItem.id]);
  }

  // Delete Action
  isConfirmModalOpen: boolean = false;

  onDeleteClick() {
    const selected = this.filteredOrders.filter(o => o.selected);
    if (selected.length === 0) {
      this.showNotification('Chưa chọn đơn hàng nào để xóa', 'warning');
      return;
    }
    this.isConfirmModalOpen = true;
  }

  closeConfirmModal() {
    this.isConfirmModalOpen = false;
    this.cdr.markForCheck();
  }

  confirmDelete() {
    this.closeConfirmModal();
    const selected = this.filteredOrders.filter(o => o.selected);
    this.isLoading = true;
    this.cdr.markForCheck();
    const ids = selected.map(o => o.id);
    const selectedSet = new Set(ids);

    let completed = 0;
    let errors = 0;

    const deleteNext = (index: number) => {
      if (index >= ids.length) {
        this.isLoading = false;
        if (errors === 0) {
          this.showNotification('Đã xóa thành công các đơn hàng chọn!');
        } else {
          this.showNotification(`Đã xóa ${ids.length - errors} đơn. Lỗi ${errors} đơn.`, 'warning');
        }
        // Remove deleted items from local array immediately
        this.orders = this.orders.filter(o => !selectedSet.has(o.id));
        this.applyFilters();
        this.calculateStats();
        this.selectedCount = 0;
        this.selectAll = false;
        this.cdr.markForCheck();
        return;
      }

      this.orderService.deleteOrder(ids[index]).subscribe({
        next: () => {
          completed++;
          deleteNext(index + 1);
        },
        error: () => {
          completed++;
          errors++;
          deleteNext(index + 1);
        }
      });
    };
    deleteNext(0);
  }

  toggleFilterDropdown(event: Event) {
    event.stopPropagation();
    this.isFilterOpen = !this.isFilterOpen;
    this.isSortDropdownOpen = false;
  }

  toggleAdvancedFilter(type: string, value: string) {
    const filters = (this.advancedFilters as any)[type];
    if (type === 'time') {
      // Radio behavior for time
      const alreadyChecked = filters[value];
      Object.keys(filters).forEach(k => filters[k] = false);
      filters[value] = !alreadyChecked;
    } else {
      filters[value] = !filters[value];
    }
    this.applyFilters();
    this.cdr.markForCheck();
  }

  isFilterSelected(type: string, value: string): boolean {
    const filters = (this.advancedFilters as any)[type];
    return !!filters[value];
  }

  get activeFilterCount(): number {
    let count = 0;
    Object.values(this.advancedFilters.status).forEach(v => { if (v) count++; });
    Object.values(this.advancedFilters.payment).forEach(v => { if (v) count++; });
    Object.values(this.advancedFilters.delivery).forEach(v => { if (v) count++; });
    Object.values(this.advancedFilters.time).forEach(v => { if (v) count++; });
    if (this.advancedFilters.total_range.min !== null || this.advancedFilters.total_range.max !== null) count++;
    return count;
  }

  clearAllFilters() {
    this.advancedFilters = {
      status: { pending: false, confirmed: false, cancelled: false, shipping: false, delivered: false },
      payment: { paid: false, unpaid: false },
      delivery: { shipping: false, delivered: false },
      time: { today: false, week: false, month: false },
      total_range: { min: null, max: null }
    };
    this.currentStatusFilter = 'all';
    this.applyFilters();
  }

  onGroupClick() {
    const selected = this.filteredOrders.filter(o => o.selected);
    if (selected.length < 2) {
      this.showNotification('Vui lòng chọn từ 2 đơn hàng trở lên để nhóm', 'warning');
      return;
    }
    this.showNotification(`Đã chọn nhóm ${selected.length} đơn hàng. (Tính năng đang phát triển)`, 'success');
  }


  // Sort Action
  // Sort Action
  isSortDropdownOpen: boolean = false;
  sortColumn: string = 'date';
  sortDirection: 'desc' | 'asc' = 'desc';

  toggleSortDropdown(event: Event) {
    event.stopPropagation();
    this.isSortDropdownOpen = !this.isSortDropdownOpen;
    this.isFilterOpen = false;
  }

  onSortSelect(column: string, direction: 'asc' | 'desc') {
    this.sortColumn = column;
    this.sortDirection = direction;

    this.filteredOrders.sort((a, b) => {
      let valA: any = a[this.sortColumn as keyof typeof a] || 0;
      let valB: any = b[this.sortColumn as keyof typeof b] || 0;

      if (this.sortColumn === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (this.sortColumn === 'total') {
        valA = Number(valA);
        valB = Number(valB);
      }

      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    let sortLabel = '';
    if (column === 'date') sortLabel = direction === 'desc' ? 'Mới nhất' : 'Cũ nhất';
    else sortLabel = direction === 'desc' ? 'Tổng tiền cao nhất' : 'Tổng tiền thấp nhất';

    this.showNotification(`Đã sắp xếp theo: ${sortLabel}`);
    this.isSortDropdownOpen = false;
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value.toLowerCase();
    this.applyFilters();
  }

  filterByStatus(status: string) {
    this.currentStatusFilter = status;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  applyFilters() {
    this.filteredOrders = this.orders.filter(order => {
      // 1. Search Logic
      const term = this.searchTerm;
      const matchesSearch =
        (order.code && order.code.toLowerCase().includes(term)) ||
        (order.customer && order.customer.toLowerCase().includes(term)) ||
        (order.statusText && order.statusText.toLowerCase().includes(term)) ||
        (order.paymentStatusText && order.paymentStatusText.toLowerCase().includes(term)) ||
        (order.deliveryStatusText && order.deliveryStatusText.toLowerCase().includes(term)) ||
        (order.total && order.total.toString().includes(term));

      // 2. Tab Filter Logic
      let matchesStatus = true;
      if (this.currentStatusFilter !== 'all') {
        if (this.currentStatusFilter === 'pending') matchesStatus = order.status === 'pending';
        else if (this.currentStatusFilter === 'confirmed') matchesStatus = order.status === 'confirmed';
        else if (this.currentStatusFilter === 'shipping') matchesStatus = (order.deliveryStatus === 'shipping' || order.status === 'shipping');
        else if (this.currentStatusFilter === 'delivered') matchesStatus = (order.deliveryStatus === 'delivered' || order.status === 'delivered');
        else if (this.currentStatusFilter === 'unpaid') matchesStatus = order.paymentStatus === 'unpaid';
        else if (this.currentStatusFilter === 'cancelled') matchesStatus = order.status === 'cancelled';
        else if (this.currentStatusFilter === 'processing_return') {
          // Lọc đúng các đơn đang ở bước yêu cầu trả hàng/hoàn tiền
          matchesStatus = order.rawStatus === 'processing_return' || order.rawStatus === 'return_processing';
        }
      }

      // 3. Advanced Filter Logic
      // Status Checkboxes
      const s = this.advancedFilters.status as any;
      const hasStatusFilter = s.pending || s.confirmed || s.cancelled || s.shipping || s.delivered;
      let matchesAdvStatus = true;
      if (hasStatusFilter) {
        matchesAdvStatus =
          (s.pending && order.status === 'pending') ||
          (s.confirmed && order.status === 'confirmed') ||
          (s.shipping && order.deliveryStatus === 'shipping') ||
          (s.delivered && order.deliveryStatus === 'delivered') ||
          (s.cancelled && order.status === 'cancelled');
      }

      // Payment Checkboxes
      const p = this.advancedFilters.payment;
      const hasPaymentFilter = p.paid || p.unpaid;
      let matchesAdvPayment = true;
      if (hasPaymentFilter) {
        matchesAdvPayment = (p.paid && order.paymentStatus === 'paid') ||
          (p.unpaid && order.paymentStatus === 'unpaid');
      }

      // Time Filter (exclusive)
      const t = this.advancedFilters.time;
      let matchesTime = true;
      if (t.today || t.week || t.month) {
        const now = new Date();
        const orderDate = new Date(order.date);
        const diffMs = now.getTime() - orderDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (t.today) matchesTime = diffDays <= 1 && orderDate.getDate() === now.getDate();
        if (t.week) matchesTime = diffDays <= 7;
        if (t.month) matchesTime = diffDays <= 30;
      }

      // Total Amount Filter
      const tl = this.advancedFilters.total_range;
      let matchesTotal = true;
      if (tl.min !== null || tl.max !== null) {
        if (tl.min !== null && order.total < tl.min) matchesTotal = false;
        if (tl.max !== null && order.total > tl.max) matchesTotal = false;
      }

      return matchesSearch && matchesStatus && matchesAdvStatus && matchesAdvPayment && matchesTime && matchesTotal;
    });

    // Default sort: newest first
    this.filteredOrders.sort((a, b) => {
      const valA = a[this.sortColumn as keyof typeof a];
      const valB = b[this.sortColumn as keyof typeof b];
      if (this.sortColumn === 'date') {
        const timeA = valA ? new Date(valA as any).getTime() : 0;
        const timeB = valB ? new Date(valB as any).getTime() : 0;
        return this.sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }
      return this.sortDirection === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });

    this.updateSelectionCount();
  }

  mapOrder(item: any): Order {
    const rawStatus = item.status;
    let status = 'pending';
    let statusText = 'Chờ xác nhận';
    let deliveryStatus = 'pending';
    let deliveryStatusText = 'Chưa giao';

    // 1. Trạng thái đơn hàng (Cột 1) - Chỉ hiển thị 4 loại nhãn rút gọn
    if (item.status === 'pending') {
      status = 'pending'; statusText = 'Chờ xác nhận';
    } else if (['confirmed', 'shipping', 'delivered', 'unreview', 'reviewed'].includes(item.status)) {
      status = 'confirmed'; // Sử dụng confirmed làm gốc cho nhóm đã xác nhận
      statusText = 'Đã xác nhận';
    } else if (item.status === 'cancelled') {
      status = 'cancelled'; statusText = 'Đã hủy';
    } else if (['returned', 'refunded', 'returning', 'processing_return', 'return_processing', 'rejected'].includes(item.status)) {
      status = 'returned'; // Sử dụng returned làm gốc cho nhóm hoàn trả
      statusText = 'Hoàn trả';
    } else {
      status = 'pending';
      statusText = 'Chờ xác nhận';
    }

    // 2. Trạng thái Giao hàng (Cột 3) - Phân loại theo 5 nhóm yêu cầu: Đang giao, Đã giao, Đang hoàn, Đã hoàn, Đã hủy
    if (item.status === 'shipping') {
      deliveryStatus = 'shipping'; deliveryStatusText = 'Đang giao';
    } else if (['delivered', 'unreview', 'reviewed'].includes(item.status)) {
      deliveryStatus = 'delivered'; deliveryStatusText = 'Đã giao';
    } else if (item.status === 'returning') {
      deliveryStatus = 'returning'; deliveryStatusText = 'Đang hoàn';
    } else if (item.status === 'returned' || item.status === 'refunded') {
      deliveryStatus = 'returned'; deliveryStatusText = 'Đã hoàn';
    } else if (item.status === 'cancelled' || item.status === 'rejected') {
      deliveryStatus = 'cancelled'; deliveryStatusText = 'Đã hủy';
    } else {
      deliveryStatus = 'pending'; deliveryStatusText = 'Chưa giao';
    }

    // 3. Trạng thái Thanh toán (Cột 2)
    const paymentStatus = item.statusPayment === 'paid' ? 'paid' : 'unpaid';
    const paymentStatusText = item.statusPayment === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';

    // Fix Date: Use route.pending from data
    const rawDate = item.route?.pending || item.createdAt || item.date;
    const dateObj = rawDate ? new Date(rawDate) : new Date(0);

    return {
      // Prioritize _id for reliable deletion
      id: item._id || item.code || item.order_id,
      code: item.order_id || item.code || 'ORD_UNK', // Priority: order_id
      date: dateObj,
      customer: item.shippingInfo?.fullName || 'Khách lẻ',
      status: status,
      statusText: statusText,
      paymentStatus: paymentStatus,
      paymentStatusText: paymentStatusText,
      deliveryStatus: deliveryStatus,
      deliveryStatusText: deliveryStatusText,
      total: item.totalAmount || 0,
      rawStatus: rawStatus,
      selected: false
    };
  }

  calculateStats() {
    this.stats.total = this.orders.length;
    this.stats.pending = this.orders.filter(o => o.status === 'pending').length;
    this.stats.confirmed = this.orders.filter(o => o.status === 'confirmed').length;
    this.stats.shipping = this.orders.filter(o => o.deliveryStatus === 'shipping').length;
    this.stats.delivered = this.orders.filter(o => o.deliveryStatus === 'delivered').length;
    this.stats.unpaid = this.orders.filter(o => o.paymentStatus === 'unpaid').length;
    this.stats.cancelled = this.orders.filter(o => o.status === 'cancelled').length;
    // Đếm đúng các đơn đang ở bước yêu cầu trả hàng/hoàn tiền
    this.stats.processing_return = this.orders.filter(
      o => o.rawStatus === 'processing_return' || o.rawStatus === 'return_processing'
    ).length;
  }

  goToDetail(id: string) {
    this.router.navigate(['/admin/orders/detail', id]);
  }

  getStatusClass(status: string) {
    switch (status) {
      case 'confirmed':
      case 'delivered':
      case 'unreview':
      case 'reviewed':
      case 'shipping':
        return 'status-green'; // Nhóm Đã xác nhận / Đang giao / Đã giao
      case 'returned':
      case 'returning':
      case 'processing_return':
      case 'return_processing':
      case 'pending':
        return 'status-yellow'; // Nhóm Chờ xác nhận / Hoàn trả
      case 'cancelled':
      case 'rejected':
      case 'failed':
        return 'status-red';
      default:
        return 'status-yellow';
    }
  }

  getPaymentClass(status: string) {
    return status === 'paid' ? 'status-green' : 'status-red';
  }

  getDeliveryClass(status: string) {
    switch (status) {
      case 'delivered':
      case 'returned':
        return 'status-green';
      case 'shipping':
      case 'returning':
        return 'status-blue';
      case 'cancelled':
      case 'rejected':
        return 'status-red';
      default:
        return 'status-red'; // 'Chưa giao' or similar defaults to red
    }
  }
}
