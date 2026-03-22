import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Mascot + thanh loading (indeterminate hoặc theo % tiến độ).
 * Dùng trong layout admin; CSS chính: styles/admin-mascot-loading.css
 */
@Component({
  selector: 'app-admin-mascot-loading',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-mascot-loading.component.html',
  styleUrl: './admin-mascot-loading.component.css'
})
export class AdminMascotLoadingComponent {
  /** Thông báo dưới logo */
  @Input() message = 'Đang tải dữ liệu…';
  /** true: mascot/thanh chạy lặp; false: dùng progressPercent */
  @Input() indeterminate = true;
  /** 0–100 khi indeterminate === false */
  @Input() progressPercent = 0;
  /** Phủ toàn vùng nội dung (absolute trong .content-body) */
  @Input() overlay = true;
}
