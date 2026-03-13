import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ReviewProduct {
    id: string;
    productName: string;
    productImage?: string;
    category: string;
    rating?: number | null;
    reviewText?: string | null;
    images?: (string | null)[];
    sku?: string;
}

@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="review-modal-backdrop">
      <div class="review-modal-overlay" (click)="onClose()"></div>

      <div class="review-modal-panel card bg-white">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4 review-modal-header">
          <h2 class="review-modal-title">
            Đánh giá đơn hàng
          </h2>
          <button type="button" class="icon-btn icon-btn-sm" (click)="onClose()">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="review-modal-body">
          <div
            *ngFor="let product of localProducts; let i = index"
            class="mb-6 border-bottom pb-4"
          >
            <!-- Product info -->
            <div class="flex gap-4 mb-3">
              <div class="flex-shrink-0">
                <img
                  [src]="product.productImage"
                  [alt]="product.productName"
                  class="review-product-img"
                  onerror="this.src='assets/icon/no-order.png'"
                />
              </div>
              <div class="flex flex-column justify-between">
                <div>
                  <h3 class="text-base font-semibold mb-1">
                    {{ product.productName }}
                  </h3>
                  <p class="text-sm text-secondary m-0">
                    {{ product.category }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Rating -->
            <div class="mb-3">
              <div class="text-sm font-semibold mb-1">Đánh giá</div>
              <div class="flex items-center gap-2">
                <ng-container *ngFor="let star of stars; let s = index">
                  <i
                    class="bi"
                    [ngClass]="{
                      'bi-star-fill review-star-active cursor-pointer': s + 1 <= (product.rating || 0),
                      'bi-star review-star-inactive cursor-pointer': s + 1 > (product.rating || 0)
                    }"
                    (click)="setRating(i, s + 1)"
                  ></i>
                </ng-container>
                <span class="text-sm text-secondary" *ngIf="product.rating">
                  {{ getRatingLabel(product.rating) }}
                </span>
              </div>
            </div>

            <!-- Review text -->
            <div class="mb-3">
              <div class="text-sm font-semibold mb-1">Nhận xét của bạn</div>
              <textarea
                class="input review-textarea"
                rows="3"
                maxlength="500"
                placeholder="Chia sẻ cảm nhận của bạn về sản phẩm này..."
                [(ngModel)]="localProducts[i].reviewText"
              ></textarea>
              <div class="text-xs text-secondary text-right mt-1">
                {{ (localProducts[i].reviewText || '').length }}/500
              </div>
            </div>

            <!-- Images -->
            <div class="mb-2">
              <div class="text-sm font-semibold mb-1">Thêm hình ảnh</div>
              <div class="flex gap-2 justify-between">
                <label
                  *ngFor="let slot of imageSlots; let slotIndex = index"
                  class="review-image-slot cursor-pointer"
                >
                  <ng-container
                    *ngIf="
                      localProducts[i].images &&
                      localProducts[i].images![slotIndex]
                    ; else emptySlot
                    "
                  >
                    <img
                      [src]="localProducts[i].images![slotIndex]!"
                      alt="Hình đánh giá"
                    />
                  </ng-container>
                  <ng-template #emptySlot>
                    <span class="plus-icon">+</span>
                  </ng-template>
                  <input
                    type="file"
                    accept="image/*"
                    (change)="onImageSelected($event, i, slotIndex)"
                    hidden
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="review-modal-footer">
          <button
            type="button"
            class="btn btn-sm review-btn-cancel"
            (click)="onClose()"
          >
            Hủy
          </button>
          <button
            type="button"
            class="btn btn-sm review-btn-submit"
            [disabled]="!canSubmit()"
            (click)="onSubmitClicked()"
          >
            Gửi đánh giá
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .review-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .review-modal-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
      }

      .review-modal-panel {
        position: relative;
        max-width: 520px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        z-index: calc(var(--z-modal) + 1);
      }

      .review-modal-body {
        margin-top: 8px;
        flex: 1;
        overflow-y: auto;
      }

      .review-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--spacing-3);
        margin-top: var(--spacing-4);
      }

      .review-modal-title {
        font-family: var(--font-family-title);
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-primary);
        margin: 0;
      }

      .review-product-img {
        width: 72px;
        height: 72px;
        border-radius: var(--radius-md);
        object-fit: cover;
        border: 1px solid var(--color-neutral-40);
      }

      .review-textarea {
        resize: vertical;
        min-height: 80px;
      }

      .review-image-slot {
        width: 72px;
        height: 72px;
        border-radius: var(--radius-md);
        border: 1px dashed var(--color-neutral-40);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background-color: var(--color-neutral-20);
        overflow: hidden;
      }

      .review-image-slot img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .plus-icon {
        font-size: 24px;
        color: var(--color-neutral-60);
      }

      .border-bottom {
        border-bottom: 1px solid var(--color-neutral-30);
      }

      /* Stars use primary brand color instead of default yellow */
      .review-star-active {
        color: var(--color-primary);
      }

      .review-star-inactive {
        color: var(--color-neutral-50);
      }

      /* Buttons in footer */
      .review-btn-cancel,
      .review-btn-submit {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        padding: 10px 20px;
        min-height: 40px;
      }

      /* Hủy: nền trắng, viền xanh #00589F */
      .review-btn-cancel {
        background-color: var(--color-neutral-10);
        color: var(--color-primary);
        border: 1px solid var(--color-primary);
        min-width: 90px;
      }

      .review-btn-cancel:hover {
        background-color: var(--color-primary-bg);
      }

      /* Gửi đánh giá: nền xanh, viền trắng */
      .review-btn-submit {
        background-color: var(--color-primary);
        color: var(--color-text-inverse);
        border: 1px solid var(--color-neutral-10);
      }

      .review-btn-submit:hover:not(:disabled) {
        background-color: var(--color-primary-hover);
      }

      .review-btn-submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,
  ],
})
export class ReviewFormComponent implements OnChanges {
  @Input() products: ReviewProduct[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<ReviewProduct[]>();

  localProducts: ReviewProduct[] = [];

  stars = [1, 2, 3, 4, 5];
  imageSlots = [0, 1, 2, 3, 4];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['products']) {
      this.localProducts =
        (this.products || []).map((p) => {
          const images = (p.images ? [...p.images] : []) as (string | null)[];
          // Đảm bảo mảng images có đủ slot để binding không bị chậm
          while (images.length < this.imageSlots.length) {
            images.push(null);
          }
          return {
            ...p,
            rating: p.rating ?? 5,
            reviewText: p.reviewText ?? '',
            images,
          };
        }) ?? [];
      this.cdr.detectChanges();
    }
  }

  onClose(): void {
    this.close.emit();
  }

  setRating(productIndex: number, rating: number): void {
    if (!this.localProducts[productIndex]) return;
    this.localProducts[productIndex].rating = rating;
  }

  getRatingLabel(rating?: number | null): string {
    const r = rating || 0;
    if (r >= 5) return 'Rất hài lòng';
    if (r === 4) return 'Hài lòng';
    if (r === 3) return 'Bình thường';
    if (r === 2) return 'Không hài lòng';
    if (r === 1) return 'Rất tệ';
    return '';
  }

  async onImageSelected(
    event: Event,
    productIndex: number,
    slotIndex: number
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    const base64 = await this.fileToBase64(file);

    if (!this.localProducts[productIndex]) return;
    if (!this.localProducts[productIndex].images) {
      this.localProducts[productIndex].images = [];
    }
    // Đảm bảo mảng đủ độ dài để gán theo index
    while (this.localProducts[productIndex].images!.length <= slotIndex) {
      this.localProducts[productIndex].images!.push(null);
    }
    this.localProducts[productIndex].images![slotIndex] = base64;

    input.value = '';
    // Force detect để ảnh hiển thị ngay
    this.cdr.detectChanges();
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  canSubmit(): boolean {
    if (this.localProducts.length === 0) return false;
    return this.localProducts.every((p) => !!p.rating && p.rating > 0);
  }

  onSubmitClicked(): void {
    if (!this.canSubmit()) return;
    this.submit.emit(this.localProducts);
  }
}
