import { Component, OnInit, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ProductService } from '../../../core/services/product.service';
import { CartService } from '../../../core/services/cart.service';
import { CartAnimationService } from '../../../core/services/cart-animation.service';
import { BuyNowService } from '../../../core/services/buy-now.service';
import { QuickViewService } from '../../../core/services/quick-view.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './product-list.html',
  styleUrl: './product-list.css',
})
export class ProductList implements OnInit {
  @Input() products: any[] = [];
  @Input() isLoading: boolean = false;
  @Input() total: number = 0;
  @Input() activeSort: string = 'best_seller';
  @Input() activeFilters: any = {};
  @Output() itemClick = new EventEmitter<any>();
  @Output() sortChange = new EventEmitter<string>();
  @Output() loadMore = new EventEmitter<void>();
  @Output() removeFilter = new EventEmitter<any>();
  @Output() clearAllFilters = new EventEmitter<void>();

  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);
  private readonly cartAnimation = inject(CartAnimationService);
  private readonly buyNowService = inject(BuyNowService);
  private readonly router = inject(Router);
  private readonly quickViewService = inject(QuickViewService);

  viewMode: 'grid' | 'list' = 'grid';
  showPriceSortDropdown = false;
  quantity = 1;

  ngOnInit() { }

  setViewMode(mode: 'grid' | 'list') {
    this.viewMode = mode;
  }

  onSort(sortType: string) {
    this.sortChange.emit(sortType);
    this.showPriceSortDropdown = false;
  }

  handleItemClick(product: any, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.quickViewService.open(product);
    this.itemClick.emit(product);
  }

  onLoadMore() {
    this.loadMore.emit();
  }

  get activeFilterTags(): any[] {
    const tags: any[] = [];
    if (!this.activeFilters) return tags;

    const filters = this.activeFilters;

    const addArrayTags = (type: string, values: any) => {
      if (Array.isArray(values)) {
        values.forEach((val: any) => {
          tags.push({ type, value: val, label: val });
        });
      } else if (values && typeof values === 'string') {
        const arr = values.split(',').map(v => v.trim()).filter(v => v);
        arr.forEach(val => {
          tags.push({ type, value: val, label: val });
        });
      }
    };

    addArrayTags('audience', filters.audience);
    addArrayTags('origin', filters.origin);
    addArrayTags('brandOrigin', filters.brandOrigin);
    addArrayTags('brand', filters.brand);
    addArrayTags('indication', filters.indication);
    addArrayTags('flavor', filters.flavor);

    if (filters.minPrice != null || filters.maxPrice != null) {
      let label = 'Giá';
      if (filters.minPrice === 0 && filters.maxPrice === 100000) label = 'Dưới 100.000đ';
      else if (filters.minPrice === 100000 && filters.maxPrice === 300000) label = '100.000đ - 300.000đ';
      else if (filters.minPrice === 300000 && filters.maxPrice === 500000) label = '300.000đ - 500.000đ';
      else if (filters.minPrice === 500000) label = 'Trên 500.000đ';
      tags.push({ type: 'price', value: 'price', label });
    }

    if (filters.consultation) {
      tags.push({ type: 'consultation', value: true, label: 'Cần tư vấn' });
    }

    return tags;
  }

  onRemoveFilter(tag: any) {
    this.removeFilter.emit(tag);
  }

  onClearAll() {
    this.clearAllFilters.emit();
  }

  trackByProduct(index: number, item: any): string {
    return item._id?.$oid || item._id || index.toString();
  }

  getDiscountPercentage(price: number, discount: number): number {
    if (!price || !discount) return 0;
    return Math.round((discount / price) * 100);
  }

  getDiscountedPrice(price: number, discount: number): number {
    if (!price) return 0;
    return price - (discount || 0);
  }

  getCountryFlag(product: any): string {
    if (!product) return '';
    const countryText = (product.country || product.origin || '').toLowerCase();
    if (!countryText) return '';

    const flags: { [key: string]: string } = {
      'việt nam': 'https://img.icons8.com/color/48/vietnam.png',
      'mỹ': 'https://img.icons8.com/color/48/usa.png',
      'usa': 'https://img.icons8.com/color/48/usa.png',
      'úc': 'https://flagcdn.com/w40/au.png',
      'australia': 'https://flagcdn.com/w40/au.png',
      'ý': 'https://img.icons8.com/color/48/italy.png',
      'italy': 'https://img.icons8.com/color/48/italy.png',
      'pháp': 'https://img.icons8.com/color/48/france.png',
      'đức': 'https://img.icons8.com/color/48/germany.png',
      'nhật': 'https://img.icons8.com/color/48/japan.png',
      'hàn': 'https://img.icons8.com/color/48/south-korea.png',
      'nhật bản': 'https://img.icons8.com/color/48/japan.png',
      'hàn quốc': 'https://img.icons8.com/color/48/south-korea.png',
      'thụy sỹ': 'https://img.icons8.com/color/48/switzerland.png',
      'thụy sĩ': 'https://img.icons8.com/color/48/switzerland.png',
      'canada': 'https://img.icons8.com/color/48/canada.png',
      'thái lan': 'https://img.icons8.com/color/48/thailand.png',
      'đan mạch': 'https://img.icons8.com/color/48/denmark.png',
      'hoa kỳ': 'https://img.icons8.com/color/48/usa.png',
      'singapore': 'https://img.icons8.com/color/48/singapore.png',
      'ba lan': 'https://img.icons8.com/color/48/poland.png',
      'tây ban nha': 'https://img.icons8.com/color/48/spain.png',
      'malaysia': 'https://img.icons8.com/color/48/malaysia.png',
      'anh': 'https://img.icons8.com/color/48/great-britain.png',
      'ấn độ': 'https://img.icons8.com/color/48/india.png',
      'new zealand': 'https://img.icons8.com/color/48/new-zealand.png',
      'thụy điển': 'https://img.icons8.com/color/48/sweden.png',
    };

    for (const key in flags) {
      if (countryText.includes(key)) {
        return flags[key];
      }
    }
    return flags['việt nam'];
  }

  handleImageError(event: any) {
    event.target.src = 'assets/img/product-placeholder.png';
  }

  addToCart(product: any, event?: MouseEvent): void {
    this.cartService.addItem({
      _id: product?._id || product?.id,
      sku: product?.sku || '',
      productName: product?.name || product?.productName || '',
      name: product?.name || '',
      image: product?.image || '',
      price: this.getDiscountedPrice(product?.price || 0, product?.discount || 0),
      discount: product?.discount || 0,
      stock: product?.stock || 0,
      unit: product?.unit || 'Hộp',
      slug: this.getProductSlug(product),
    }, 1);

    if (event) {
      const btn = (event.target as HTMLElement).closest('button') || event.target as HTMLElement;
      this.cartAnimation.flyToCart(btn as HTMLElement);
    }
  }

  buyNow(product: any): void {
    if (!product) return;
    const price = this.getDiscountedPrice(product.price, product.discount);
    if (price <= 0) {
      this.router.navigate(['/product', this.getProductSlug(product)]);
    } else {
      this.buyNowService.buyNow(product, 1);
    }
  }

  requestConsultation(product?: any): void {
    const queryParams: any = {};
    if (product) {
      const productId = product._id?.$oid || product._id || product.id;
      if (productId) {
        queryParams.productId = productId;
      }
    }
    this.router.navigate(['/consultation'], { queryParams });
  }

  isNumber(val: any): boolean {
    return !isNaN(parseFloat(val)) && isFinite(val);
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
