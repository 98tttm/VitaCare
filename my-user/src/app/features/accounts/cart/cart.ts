import {
  Component,
  inject,
  effect,
  ChangeDetectorRef,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CartService, Cart as CartModel, CartItem } from '../../../core/services/cart.service';
import { CartSidebarService } from '../../../core/services/cart-sidebar.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConsultationCartService } from '../../../core/services/consultation-cart.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { BuyNowService } from '../../../core/services/buy-now.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cart.html',
  styleUrl: './cart.css',
})
export class Cart implements OnInit, OnDestroy {
  private cartService = inject(CartService);
  readonly cartSidebar = inject(CartSidebarService);
  private authService = inject(AuthService);
  private consultationCartService = inject(ConsultationCartService);
  private confirmService = inject(ConfirmService);
  private buyNowService = inject(BuyNowService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private cartUpdatedSub?: Subscription;

  cart = signal<CartModel | null>(null);
  cartSelectedIds = signal<Set<string>>(new Set());
  isSummaryExpanded = signal(true);

  toggleSummary(): void {
    this.isSummaryExpanded.update((v) => !v);
  }

  cartCount = computed(() => this.cart()?.items?.length ?? 0);

  cartTotalPrice = computed(() => {
    const c = this.cart();
    if (!c?.items?.length) return 0;
    let t = 0;
    c.items.forEach((i) => { t += (i.price || 0) * (i.quantity || 1); });
    return t;
  });

  isAllCartSelected = computed(() => {
    const items = this.cart()?.items ?? [];
    const ids = this.cartSelectedIds();
    return items.length > 0 && ids.size === items.length;
  });

  selectedCartItems = computed(() => {
    const c = this.cart();
    const ids = this.cartSelectedIds();
    if (!c?.items?.length) return [];
    return c.items.filter((i) => ids.has(i._id));
  });

  /** Số dòng sản phẩm đang được chọn (không tính theo quantity) */
  selectedItemCount = computed(() => {
    return this.selectedCartItems().length;
  });

  selectedCount = computed(() => {
    const items = this.selectedCartItems();
    return items.reduce((s, i) => s + (i.quantity || 1), 0);
  });

  selectedTotalPrice = computed(() => {
    const items = this.selectedCartItems();
    return items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  });

  selectedSubtotal = computed(() => {
    const items = this.selectedCartItems();
    return items.reduce((s, i) => s + ((i.price || 0) + (i.discount || 0)) * (i.quantity || 1), 0);
  });

  selectedDirectDiscount = computed(() => {
    const items = this.selectedCartItems();
    return items.reduce((s, i) => s + (i.discount || 0) * (i.quantity || 1), 0);
  });

  voucherDiscount = signal(0);

  finalAmount = computed(() => {
    return Math.max(0, this.selectedTotalPrice() - this.voucherDiscount());
  });

  constructor() {
    effect(() => {
      const open = this.cartSidebar.isOpen();
      const user = this.authService.currentUser();
      if (open && user && (user as any).user_id) {
        this.loadCart((user as any).user_id as string);
      } else if (open && !user?.user_id) {
        this.loadGuestCart();
      } else if (!open) {
        this.cart.set(null);
        this.cartSelectedIds.set(new Set());
      }
    });
  }

  loadGuestCart(): void {
    const items = this.cartService.getGuestCartItems();
    const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);
    const cart: CartModel = {
      user_id: 'guest',
      items,
      itemCount: items.length,
      totalQuantity: totalQty,
    };
    this.cart.set(cart);
    this.cartSelectedIds.set(this.getPreselectedIds(items));
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.cartUpdatedSub = this.cartService.cartUpdated$.subscribe(updatedCart => {
      if (updatedCart && this.cartSidebar.isOpen()) {
        this.cart.set(updatedCart as CartModel);
        const items = updatedCart.items ?? [];
        this.cartSelectedIds.set(this.getPreselectedIds(items as any));
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.cartUpdatedSub?.unsubscribe();
  }

  close(): void {
    try {
      // Dọn cấu hình chọn sẵn sau khi đóng giỏ, để lần mở sau (không phải từ Mua lại) quay về hành vi mặc định.
      localStorage.removeItem('repurchase_selection');
    } catch {
      // ignore
    }
    this.cartSidebar.closeSidebar();
  }

  loadCart(userId: string): void {
    this.cartService.getCart(userId).subscribe((res) => {
      if (res.success && res.cart) {
        const c = res.cart;
        let tp = 0;
        if (c.items) {
          c.items.forEach((item) => {
            tp += (item.price || 0) * (item.quantity || 1);
          });
        }
        (c as any).totalPrice = tp;
        this.cart.set(c);
        this.cartSelectedIds.set(this.getPreselectedIds(c.items ?? []));
        this.cdr.markForCheck();
      }
    });
  }

  /** Lấy danh sách _id được chọn dựa trên cấu hình "mua lại" (sku/id) nếu có, ngược lại chọn tất cả. */
  private getPreselectedIds(items: CartItem[]): Set<string> {
    if (!items?.length) return new Set();
    let selection: { skus?: string[]; ids?: string[] } | null = null;
    let hasSelectionFlag = false;
    try {
      const raw = localStorage.getItem('repurchase_selection');
      if (raw) {
        selection = JSON.parse(raw);
        hasSelectionFlag = true;
      }
    } catch {
      selection = null;
    }

    let selected = new Set<string>();
    if (selection && (selection.skus?.length || selection.ids?.length)) {
      const skus = new Set(selection.skus ?? []);
      const ids = new Set(selection.ids ?? []);
      items.forEach((i: any) => {
        const idStr = String((i as any)._id ?? i._id ?? '');
        if ((i.sku && skus.has(i.sku)) || (idStr && ids.has(idStr))) {
          selected.add(idStr);
        }
      });
    }

    // Nếu mở cart bình thường (không phải từ "Mua lại"), mặc định chọn tất cả.
    // Nếu có cờ repurchase_selection nhưng không khớp sản phẩm nào, giữ nguyên (không chọn gì).
    if (!hasSelectionFlag && !selected.size) {
      selected = new Set(items.map((i: any) => String((i as any)._id ?? i._id)));
    }
    return selected;
  }

  onSelectAllCart(checked: boolean): void {
    const c = this.cart();
    if (checked && c?.items?.length) {
      this.cartSelectedIds.set(new Set(c.items.map((i) => i._id)));
    } else {
      this.cartSelectedIds.set(new Set());
    }
    this.cdr.markForCheck();
  }

  isItemSelected(item: CartItem): boolean {
    return this.cartSelectedIds().has(item._id);
  }

  onItemCheck(item: CartItem, checked: boolean): void {
    const ids = new Set(this.cartSelectedIds());
    if (checked) ids.add(item._id);
    else ids.delete(item._id);
    this.cartSelectedIds.set(ids);
    this.cdr.markForCheck();
  }

  cartQtyChange(item: CartItem, delta: number): void {
    if ((item.quantity || 1) === 1 && delta === -1) {
      this.confirmRemoveCartItem(item);
      return;
    }
    const currentQty = item.quantity || 1;
    let newQty = currentQty + delta;

    // Check stock limit when increasing
    if (delta > 0 && item.stock !== undefined && item.stock !== null && newQty > item.stock) {
      newQty = item.stock;
    }

    this.applyQuantityUpdate(item, Math.max(1, newQty));
  }

  onQtyInputChange(item: CartItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    let val = parseInt(input.value, 10);

    if (isNaN(val)) return; // User might be typing, wait for blur or valid number

    if (val < 1) val = 1;
    if (item.stock !== undefined && item.stock !== null && val > item.stock) {
      val = item.stock;
    }

    if (val !== item.quantity) {
      this.applyQuantityUpdate(item, val);
    }
  }

  onQtyBlur(item: CartItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    let val = parseInt(input.value, 10);

    if (isNaN(val) || val < 1) {
      val = 1;
    }
    if (item.stock !== undefined && item.stock !== null && val > item.stock) {
      val = item.stock;
    }

    input.value = String(val);
    if (val !== item.quantity) {
      this.applyQuantityUpdate(item, val);
    }
  }

  private applyQuantityUpdate(item: CartItem, newQty: number): void {
    const user = this.authService.currentUser();
    const c = this.cart();
    if (!c?.items) return;
    const itemId = String((item as any)._id ?? item._id);

    const nextItems = c.items.map((i) => {
      const id = String((i as any)._id ?? i._id);
      return id === itemId ? { ...i, quantity: newQty } : { ...i };
    });

    let tp = 0;
    nextItems.forEach((i) => { tp += (i.price || 0) * (i.quantity || 1); });
    this.cart.set({ ...c, items: nextItems, totalPrice: tp } as CartModel);
    this.cdr.markForCheck();

    if (user?.user_id) {
      const items = nextItems.map((i) => ({ ...i, _id: String((i as any)._id ?? i._id) }));
      this.cartService.updateCart(user.user_id, items).subscribe({
        next: (res) => {
          if (res.success && res.cart) {
            const updated = res.cart;
            let t = 0;
            updated.items?.forEach((i) => { t += (i.price || 0) * (i.quantity || 1); });
            (updated as any).totalPrice = t;
            this.cart.set(updated);
          }
          this.cdr.markForCheck();
        },
        error: () => this.cdr.markForCheck(),
      });
    } else {
      this.cartService.updateGuestCart(nextItems);
      this.cdr.markForCheck();
    }
  }

  confirmRemoveCartItem(item: CartItem): void {
    this.confirmService.open('Xác nhận xoá sản phẩm này?', () => this.cartRemoveItem(item));
  }

  cartRemoveItem(item: CartItem): void {
    const user = this.authService.currentUser();
    const c = this.cart();
    if (!c?.items) return;
    const itemId = String((item as any)._id ?? item._id);
    const items = c.items.filter((i) => String((i as any)._id ?? i._id) !== itemId);
    const ids = new Set(this.cartSelectedIds());
    ids.delete(itemId);

    if (user?.user_id) {
      this.cartService.updateCart(user.user_id, items).subscribe({
        next: (res) => {
          if (res.success && res.cart) {
            const updated = res.cart;
            let t = 0;
            updated.items?.forEach((i) => { t += (i.price || 0) * (i.quantity || 1); });
            (updated as any).totalPrice = t;
            this.cart.set(updated);
            this.cartSelectedIds.set(ids);
          }
          this.cdr.markForCheck();
        },
        error: () => this.cdr.markForCheck(),
      });
    } else {
      this.cartService.updateGuestCart(items);
      this.cart.set({ ...c, items, itemCount: items.length, totalQuantity: items.reduce((s, i) => s + (i.quantity || 1), 0) } as CartModel);
      this.cartSelectedIds.set(ids);
      this.cdr.markForCheck();
    }
  }

  goToOrder(e: Event): void {
    e.preventDefault();
    const items = this.selectedCartItems();
    if (!items.length) {
      return;
    }
    this.buyNowService.setItemsFromCart(items);
    this.close();
    this.router.navigate(['/order']);
  }

  goToConsultation(e: Event): void {
    e.preventDefault();
    this.consultationCartService.setProductsFromCart(this.selectedCartItems());
    this.close();
    this.router.navigate(['/consultation']);
  }

  goToShopping(): void {
    this.close();
    this.router.navigate(['/products']);
  }
}
