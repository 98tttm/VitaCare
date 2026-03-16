import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProductGallery } from '../product-gallery/product-gallery';
import { ProductInfoSummary } from '../product-info-summary/product-info-summary';
import { QuickViewService } from '../../../core/services/quick-view.service';

@Component({
  selector: 'app-product-quick-view',
  standalone: true,
  imports: [CommonModule, RouterModule, ProductGallery, ProductInfoSummary],
  templateUrl: './product-quick-view.html',
  styleUrl: './product-quick-view.css',
})
export class ProductQuickView {
  readonly quickViewService = inject(QuickViewService);
  selectedImage: string = '';
  isGalleryModalOpen: boolean = false;

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
}
