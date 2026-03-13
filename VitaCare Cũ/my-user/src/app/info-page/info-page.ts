import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-info-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container py-5 text-center" style="min-height: 50vh; display: flex; flex-direction: column; justify-content: center;">
      <i class="bi bi-cone-striped display-1 text-warning mb-4"></i>
      <h2 class="mb-3">Trang đang được xây dựng</h2>
      <p class="text-muted">Tính năng này đang trong quá trình phát triển. Vui lòng quay lại sau.</p>
    </div>
  `,
  styles: []
})
export class InfoPage { }
