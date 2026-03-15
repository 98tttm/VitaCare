import { Injectable, signal } from '@angular/core';

/**
 * Trạng thái popup "Có thể bạn chưa biết?" (Home).
 * Header chỉ hiện 3 popup (nhắc lịch, đơn thuốc, đơn hàng) sau khi popup này đã đóng hoặc user đã xem chi tiết.
 */
@Injectable({ providedIn: 'root' })
export class BlogPopupService {
  readonly dismissed = signal(false);

  setDismissed(): void {
    this.dismissed.set(true);
  }
}
