import { Component, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProductGallery } from '../product-gallery/product-gallery';
import { ProductInfoSummary } from '../product-info-summary/product-info-summary';
import { QuickViewService } from '../../core/services/quick-view.service';
import { ProductService } from '../../core/services/product.service';

@Component({
  selector: 'app-product-quick-view',
  standalone: true,
  imports: [CommonModule, RouterModule, ProductGallery, ProductInfoSummary],
  templateUrl: './product-quick-view.html',
  styleUrl: './product-quick-view.css',
})
export class ProductQuickView {
  readonly quickViewService: QuickViewService = inject(QuickViewService);
  private readonly productService: ProductService = inject(ProductService);
  selectedImage: string = '';
  isGalleryModalOpen: boolean = false;
  detailedProduct: any = null;

  constructor() {
    effect(() => {
      const baseProduct = this.quickViewService.product();

      if (!baseProduct) {
        this.detailedProduct = null;
        return;
      }

      this.detailedProduct = {
        ...baseProduct,
        sold: this.parseSoldValue(baseProduct.sold)
      };

      const slug = this.getProductSlug(baseProduct);
      if (!slug) return;

      this.productService.getProductBySlug(slug).subscribe({
        next: (fullProduct: any) => {
          const current = this.quickViewService.product();
          if (!current || this.getProductSlug(current) !== slug) return;

          this.detailedProduct = {
            ...baseProduct,
            ...fullProduct,
            sold: this.parseSoldValue(fullProduct?.sold ?? baseProduct.sold)
          };
        },
        error: () => {
          // Keep using base product when detail API fails.
        }
      });
    });
  }

  closeQuickView() {
    this.selectedImage = '';
    this.quickViewService.close();
  }

  onImageSelected(img: string) {
    this.selectedImage = img;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('vc_modal_overlay')) {
      this.closeQuickView();
    }
  }

  onQuantityChange(val: number) {
    this.quickViewService.updateQuantity(val);
  }

  getProductSlug(product: any): string {
    if (!product) return '';
    if (product._id) {
      if (typeof product._id === 'string') return product._id;
      if (product._id.$oid) return product._id.$oid;
      if (typeof product._id.toString === 'function') return product._id.toString();
    }
    if (product.slug && product.slug.trim() !== '') return product.slug;
    return '';
  }

  get quickViewProduct(): any {
    return this.detailedProduct || this.quickViewService.product();
  }

  private parseSoldValue(raw: any): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const cleaned = raw.replace(/[^\d.-]/g, '');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
