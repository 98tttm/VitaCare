import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoinService } from '../../core/services/coin.service';

@Component({
  selector: 'app-coin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './coin.html',
  styleUrl: './coin.css',
})
export class Coin {
  public coinService = inject(CoinService);
  isImgError = signal(false);

  balance = computed(() => this.coinService.coinData().balance);

  // Chỉ dịch chuyển dọc (giữ nguyên cột phải)
  dx = signal(0);
  dy = signal(0);
  isDragging = signal(false);

  private dragStartY = 0;
  private dragStartDy = 0;
  private dragDyMin = 0;
  private dragDyMax = 0;

  onPointerDown(e: PointerEvent): void {
    // Chỉ kéo bằng chuột trái (với touch/pen thì vẫn cho phép)
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const container = e.currentTarget as HTMLElement | null;
    if (!container) return;

    if (typeof window === 'undefined') return;

    const rect = container.getBoundingClientRect();
    const baseTop = rect.top;
    const coinHeight = rect.height || 62;

    // Luôn khóa dịch ngang: reset dx về 0 khi bắt đầu kéo
    this.dx.set(0);

    // Clamp dọc để không kéo ra khỏi màn hình
    const paddingTop = 12;
    const paddingBottom = 12;
    const minDy = paddingTop - baseTop;
    const maxDy = window.innerHeight - paddingBottom - (baseTop + coinHeight);
    this.dragDyMin = minDy;
    this.dragDyMax = Math.max(minDy, maxDy);

    this.dragStartY = e.clientY;
    this.dragStartDy = this.dy();
    this.isDragging.set(true);
    e.preventDefault();

    const onMove = (ev: PointerEvent): void => {
      if (!this.isDragging()) return;
      const deltaY = ev.clientY - this.dragStartY;
      const nextDy = this.dragStartDy + deltaY;
      const clampedDy = Math.max(this.dragDyMin, Math.min(this.dragDyMax, nextDy));
      this.dy.set(clampedDy);
    };

    const onUp = (): void => {
      this.isDragging.set(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }


  onImgError(): void {
    this.isImgError.set(true);
  }
}
