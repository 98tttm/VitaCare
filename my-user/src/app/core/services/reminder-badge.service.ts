import { Injectable, signal, computed } from '@angular/core';

const REMINDER_ACK_KEY = 'vc_reminder_ack';

/**
 * Service dùng chung giữa Header và Floating-actions:
 * - Header cập nhật số lời nhắc và trạng thái "đã đóng popup"
 * - Floating-actions hiển thị icon viên thuốc + số thông báo khi popup đã đóng nhưng còn lời nhắc
 */
@Injectable({ providedIn: 'root' })
export class ReminderBadgeService {
  /** Số lời nhắc uống thuốc (từ API notices, type medication_reminder) */
  readonly reminderDueCount = signal(0);

  /** Mỗi phần tử: một dòng tóm tắt (giờ + thuốc) cho tooltip FAB viên thuốc */
  readonly reminderDueLines = signal<string[]>([]);

  /** Popup nhắc lịch đã được user đóng (session) */
  readonly popupAcked = signal(false);

  /** Hiển thị badge viên thuốc: đã đóng popup và còn ít nhất 1 lời nhắc */
  readonly showReminderBadge = computed(
    () => this.popupAcked() && this.reminderDueCount() > 0
  );

  setReminderDueCount(count: number, lines: string[] = []): void {
    this.reminderDueCount.set(count);
    this.reminderDueLines.set(lines);
  }

  setPopupAcked(): void {
    this.popupAcked.set(true);
  }

  /** Đọc từ sessionStorage (gọi khi Floating-actions init) */
  initPopupAckedFromSession(): void {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(REMINDER_ACK_KEY) === '1') {
      this.popupAcked.set(true);
    }
  }
}
