import { Injectable, signal, computed } from '@angular/core';

/**
 * Service điều khiển mở/đóng sidebar giỏ hàng.
 * Header (hoặc bất kỳ đâu) gọi open() khi bấm "Giỏ thuốc";
 * component Cart dùng isOpen() để hiển thị sidebar.
 */
@Injectable({ providedIn: 'root' })
export class CartSidebarService {
  private readonly open = signal<boolean>(false);
  /** Request focus một item trong cart (để auto-check + scroll). */
  private readonly focusReq = signal<{ itemId: string; nonce: number } | null>(null);

  isOpen = computed(() => this.open());
  focusRequest = computed(() => this.focusReq());

  openSidebar(): void {
    this.open.set(true);
  }

  openSidebarWithFocus(itemId: string): void {
    const id = String(itemId || '').trim();
    this.open.set(true);
    if (!id) return;
    // dùng nonce để đảm bảo request được nhận ngay cả khi click cùng 1 item nhiều lần
    this.focusReq.set({ itemId: id, nonce: Date.now() });
  }

  closeSidebar(): void {
    this.open.set(false);
  }
}
