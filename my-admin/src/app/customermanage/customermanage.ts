import { Component, OnInit, Inject, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CustomerService } from '../services/customer.service';
import { AdminMascotLoadingComponent } from '../shared/admin-mascot-loading/admin-mascot-loading.component';

export type CustomerSortKind = 'name' | 'registerdate' | 'totalspent';

@Component({
  selector: 'app-customermanage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AdminMascotLoadingComponent],
  providers: [CustomerService],
  templateUrl: './customermanage.html',
  styleUrls: ['./customermanage.css']
})
export class Customermanage implements OnInit {
  customers: any[] = [];
  filteredCustomers: any[] = [];
  isLoading = false;
  searchTerm = '';
  selectedCount = 0;
  selectAll = false;

  isFilterOpen: boolean = false;
  advancedFilters: any = {
    tier: { 'Đồng': false, 'Bạc': false, 'Vàng': false },
    customer_group: {} as Record<string, boolean>,
    spending_range: { min: null as number | null, max: null as number | null }
  };

  // Group State (MongoDB collection `customer_groups`)
  isGroupModalOpen = false;
  groupName = '';
  existingGroups: any[] = [];

  notification = {
    show: false,
    message: '',
    type: 'success'
  };

  constructor(
    @Inject(CustomerService) private customerService: CustomerService,
    private router: Router,
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
    this.fetchCustomers();
    this.fetchGroups();
  }

  goCreateCustomer(): void {
    this.router.navigate(['/admin/customers/create']);
  }

  /**
   * ID nhóm cho checkbox lọc — dùng arrow để trackBy của *ngFor không mất `this`
   * (Angular gọi trackBy như hàm thuần, method thường sẽ làm this.groupFilterKey undefined).
   */
  groupFilterKey = (g: { _id?: unknown; id?: unknown }): string => String(g._id ?? g.id ?? '');

  trackByGroupId = (_index: number, g: { _id?: unknown; id?: unknown }): string =>
    String(g._id ?? g.id ?? '');

  tierSlug(tier: string | undefined | null): string {
    const key = (tier ?? '').trim().toLowerCase();
    switch (key) {
      case 'đồng':
        return 'dong';
      case 'bạc':
        return 'bac';
      case 'vàng':
        return 'vang';
      case 'kim cương':
        return 'kimcuong';
      case 'thành viên':
        return 'thanhvien';
      default:
        return 'tier-default';
    }
  }

  fetchGroups() {
    this.customerService.getGroups().subscribe({
      next: (res) => {
        if (!res.success) return;
        this.existingGroups = res.data || [];
        const cg = { ...(this.advancedFilters.customer_group || {}) };
        for (const g of this.existingGroups) {
          const id = String(g._id || g.id || '');
          if (id && !(id in cg)) cg[id] = false;
        }
        this.advancedFilters.customer_group = cg;
        this.syncCustomerGroupMembership();
        if (this.customers.length) this.applyFilters();
      }
    });
  }

  /** Gắn memberGroupIds theo nhóm trong `customer_groups` + customerIds. */
  syncCustomerGroupMembership(): void {
    for (const c of this.customers) {
      const keys = [String(c._id || ''), String(c.user_id || '')].filter(k => k.length > 0);
      const gids: string[] = [];
      for (const g of this.existingGroups) {
        const gid = String(g._id || g.id || '');
        const ids = (g.customerIds || []).map((x: unknown) => String(x));
        if (keys.some(k => ids.includes(k))) gids.push(gid);
      }
      c.memberGroupIds = gids;
    }
  }

  fetchCustomers() {
    this.isLoading = true;
    this.customerService.getCustomers().subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success && res.data) {
          this.customers = res.data.map((c: any) => ({
            ...c,
            selected: false,
            addressString: c.address && c.address.length > 0 ? c.address.join(', ') : 'Chưa cập nhật'
          }));
          this.syncCustomerGroupMembership();
          this.applyFilters();
          this.cdr.markForCheck(); // Force immediate view update
        }
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  applyFilters() {
    let temp = this.customers;

    const term = this.searchTerm ? this.searchTerm.trim().toLowerCase() : '';
    if (term) {
      temp = temp.filter(c =>
        (c.full_name && c.full_name.toLowerCase().includes(term)) ||
        (c.user_id && c.user_id.toLowerCase().includes(term)) ||
        (c.phone && c.phone.toLowerCase().includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        (c.addressString && c.addressString.toLowerCase().includes(term))
      );
    }

    this.filteredCustomers = temp.filter(c => {
      // 1. Tier Filter
      const tierFilters = this.advancedFilters.tier;
      const hasTierFilter = Object.values(tierFilters).some(v => v);
      let matchesTier = true;
      if (hasTierFilter) {
        matchesTier = !!tierFilters[c.tiering];
      }

      // 2. Spending Range Filter
      const sr = this.advancedFilters.spending_range;
      let matchesSpending = true;
      const spending = c.total_spending || c.totalspent || 0;
      if (sr.min !== null || sr.max !== null) {
        if (sr.min !== null && spending < sr.min) matchesSpending = false;
        if (sr.max !== null && spending > sr.max) matchesSpending = false;
      }

      // 3. Nhóm khách (collection customer_groups)
      const gf = this.advancedFilters.customer_group || {};
      const hasGroupFilter = Object.values(gf).some(v => v);
      let matchesGroup = true;
      if (hasGroupFilter) {
        const memberIds: string[] = c.memberGroupIds || [];
        matchesGroup = memberIds.some(gid => gf[gid]);
      }

      return matchesTier && matchesSpending && matchesGroup;
    });

    this.applyCustomerSort();

    this.updateSelection();
  }

  toggleFilterDropdown(event: Event) {
    event.stopPropagation();
    this.isFilterOpen = !this.isFilterOpen;
    this.isSortDropdownOpen = false;
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
    Object.keys(this.advancedFilters).forEach(type => {
      if (type === 'spending_range') {
        if (this.advancedFilters.spending_range.min !== null || this.advancedFilters.spending_range.max !== null) count++;
      } else if (type === 'customer_group') {
        Object.values(this.advancedFilters.customer_group || {}).forEach(v => { if (v) count++; });
      } else {
        Object.values(this.advancedFilters[type]).forEach(v => { if (v) count++; });
      }
    });
    return count;
  }

  clearAllFilters() {
    const cg: Record<string, boolean> = {};
    for (const g of this.existingGroups) {
      const id = String(g._id || g.id || '');
      if (id) cg[id] = false;
    }
    this.advancedFilters = {
      tier: { 'Đồng': false, 'Bạc': false, 'Vàng': false },
      customer_group: cg,
      spending_range: { min: null, max: null }
    };
    this.applyFilters();
  }

  showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    this.notification = { show: true, message, type };
    setTimeout(() => {
      this.notification.show = false;
    }, 3000);
  }


  onSearch(event: any) {
    this.searchTerm = event.target.value;
    this.applyFilters();
  }

  toggleSelectAll(event: any) {
    this.selectAll = event.target.checked;
    this.filteredCustomers.forEach(c => c.selected = this.selectAll);
    this.updateSelection();
  }

  onSelectChange() {
    this.selectAll = this.filteredCustomers.length > 0 && this.filteredCustomers.every(c => c.selected);
    this.updateSelection();
  }

  updateSelection() {
    this.selectedCount = this.filteredCustomers.filter(c => c.selected).length;
  }

  viewDetail(customer: any) {
    const id = customer?._id || customer?.user_id;
    if (!id) {
      this.showNotification('Không tìm thấy mã khách hàng để mở chi tiết', 'warning');
      return;
    }
    this.router.navigate(['/admin/customers/detail', id]);
  }

  // === ACTION BUTTONS ===
  isConfirmModalOpen = false;
  isEditModalOpen = false;
  editingCustomer: any = null;

  onEditClick() {
    const selected = this.filteredCustomers.filter(c => c.selected);
    if (selected.length !== 1) {
      this.showNotification('Vui lòng chọn đúng 1 khách hàng để chỉnh sửa', 'warning');
      return;
    }
    // Deep copy to avoid mutating original until Save
    this.editingCustomer = { ...selected[0] };
    this.isEditModalOpen = true;
  }

  closeEditModal() {
    this.isEditModalOpen = false;
    this.editingCustomer = null;
  }

  saveCustomer() {
    if (!this.editingCustomer) return;
    this.customerService.updateCustomer(this.editingCustomer._id || this.editingCustomer.user_id, this.editingCustomer).subscribe({
      next: (res) => {
        if (res.success) {
          const idx = this.customers.findIndex(c => c._id === this.editingCustomer._id || c.user_id === this.editingCustomer.user_id);
          if (idx !== -1) this.customers[idx] = { ...this.customers[idx], ...this.editingCustomer };

          const fidx = this.filteredCustomers.findIndex(c => c._id === this.editingCustomer._id || c.user_id === this.editingCustomer.user_id);
          if (fidx !== -1) this.filteredCustomers[fidx] = { ...this.filteredCustomers[fidx], ...this.editingCustomer };

          this.closeEditModal();
          this.showNotification('Đã cập nhật thông tin khách hàng!', 'success');
          this.cdr.markForCheck();
        }
      },
      error: () => this.showNotification('Lỗi khi cập nhật khách hàng', 'error')
    });
  }

  onDeleteClick() {
    if (this.selectedCount === 0) {
      this.showNotification('Chưa chọn khách hàng nào để xóa', 'warning');
      return;
    }
    this.isConfirmModalOpen = true;
  }

  confirmDelete() {
    const selected = this.filteredCustomers.filter(c => c.selected);
    this.isLoading = true;

    const deletePromises = selected.map(c => this.customerService.deleteCustomer(c._id || c.user_id).toPromise());

    Promise.all(deletePromises).then(() => {
      this.isConfirmModalOpen = false;
      this.isLoading = false;
      this.customers = this.customers.filter(c => !c.selected);
      this.applyFilters();
      this.showNotification(`Đã xóa thành công khách hàng`, 'success');
      this.cdr.markForCheck();
    }).catch(() => {
      this.isLoading = false;
      this.showNotification('Lỗi khi xóa khách hàng', 'error');
    });
  }

  closeConfirmModal() {
    this.isConfirmModalOpen = false;
  }

  onGroupClick() {
    const selected = this.filteredCustomers.filter(c => c.selected);
    if (selected.length < 2) {
      this.showNotification('Cần chọn ít nhất 2 khách hàng để nhóm', 'warning');
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

    const selectedCustomers = this.filteredCustomers.filter(c => c.selected);
    const selectedIds = selectedCustomers.map(c => c._id || c.user_id);

    const newGroup = {
      group_id: 'CG-' + Date.now().toString().slice(-6),
      name: this.groupName,
      customerIds: selectedIds,
      count: selectedCustomers.length,
      date: new Date().toISOString()
    };

    this.customerService.createGroup(newGroup).subscribe({
      next: (res) => {
        if (res.success) {
          this.existingGroups.unshift(res.data);
          const nid = String(res.data._id || res.data.id || '');
          if (nid) this.advancedFilters.customer_group[nid] = false;
          this.syncCustomerGroupMembership();
          this.isGroupModalOpen = false;
          this.groupName = '';
          this.customers.forEach(c => c.selected = false);
          this.updateSelection();
          this.applyFilters();
          this.showNotification(`Đã tạo nhóm thành công`, 'success');
        } else {
          this.showNotification('Lỗi khi tạo nhóm: ' + (res.message || ''), 'error');
        }
      },
      error: () => this.showNotification('Lỗi khi lưu nhóm', 'error')
    });
  }

  deleteGroup(groupId: any) {
    const id = String(groupId);
    this.customerService.deleteGroup(id).subscribe({
      next: (res) => {
        if (res.success) {
          this.existingGroups = this.existingGroups.filter(g => String(g._id || g.id) !== id);
          delete this.advancedFilters.customer_group[id];
          this.syncCustomerGroupMembership();
          this.applyFilters();
          this.showNotification('Đã xóa nhóm khách hàng', 'success');
          this.cdr.markForCheck();
        } else {
          this.showNotification('Lỗi khi xóa nhóm: ' + (res.message || ''), 'error');
        }
      },
      error: () => this.showNotification('Lỗi khi xóa nhóm', 'error')
    });
  }

  closeGroupModal() {
    this.isGroupModalOpen = false;
    this.groupName = '';
  }

  // === SORT (cùng pattern quản lý sản phẩm) ===
  isSortDropdownOpen = false;
  sortKind: CustomerSortKind = 'registerdate';
  sortDirection: 'asc' | 'desc' = 'desc';

  toggleSortDropdown(event: Event) {
    event.stopPropagation();
    this.isSortDropdownOpen = !this.isSortDropdownOpen;
    this.isFilterOpen = false;
  }

  private defaultDirectionForKind(kind: CustomerSortKind): 'asc' | 'desc' {
    switch (kind) {
      case 'name':
        return 'asc';
      case 'registerdate':
        return 'desc';
      case 'totalspent':
        return 'desc';
      default:
        return 'desc';
    }
  }

  /** Click nhãn hàng: cùng tiêu chí → đảo hướng; khác → hướng mặc định. */
  onSortRowClick(kind: CustomerSortKind): void {
    if (this.sortKind === kind) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKind = kind;
      this.sortDirection = this.defaultDirectionForKind(kind);
    }
    this.applyCustomerSort();
  }

  setSortDirection(kind: CustomerSortKind, direction: 'asc' | 'desc', event?: Event): void {
    event?.stopPropagation();
    this.sortKind = kind;
    this.sortDirection = direction;
    this.applyCustomerSort();
  }

  applyCustomerSort(): void {
    this.filteredCustomers.sort((a, b) => {
      let valA: number | string;
      let valB: number | string;

      switch (this.sortKind) {
        case 'name':
          valA = String(a.full_name || a.fullname || '').toLowerCase();
          valB = String(b.full_name || b.fullname || '').toLowerCase();
          break;
        case 'registerdate':
          valA = new Date(a.registerdate).getTime() || 0;
          valB = new Date(b.registerdate).getTime() || 0;
          break;
        case 'totalspent':
          valA = Number(a.total_spending ?? a.totalspent ?? 0);
          valB = Number(b.total_spending ?? b.totalspent ?? 0);
          break;
        default:
          valA = 0;
          valB = 0;
      }

      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

}
