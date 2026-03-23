import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from '../../core/services/cart.service';
import { CartAnimationService } from '../../core/services/cart-animation.service';
import { BuyNowService } from '../../core/services/buy-now.service';
import { QuickViewService } from '../../core/services/quick-view.service';
import { inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-product-info-summary',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './product-info-summary.html',
  styleUrl: './product-info-summary.css'
})
export class ProductInfoSummary {
  @Input() product: any;
  @Input() categoryPath: any[] = [];
  @Input() quantity: number = 1;
  @Input() reviewStats: any = { average: 0, total: 0 };
  @Input() consultationsData: any = { questions: [] };
  @Output() quantityChange = new EventEmitter<number>();
  @Output() tabScroll = new EventEmitter<string>();
  attentionCartCount = 1;
  attentionViewCount = 1;

  constructor(
    private cartService: CartService,
    private cartAnimation: CartAnimationService,
    private buyNowService: BuyNowService,
    private router: Router
  ) { }

  private readonly quickViewService: QuickViewService = inject(QuickViewService);

  ngOnChanges(): void {
    this.buildAttentionStats();
  }

  updateQuantity(delta: number): void {
    const stock = this.product?.stock !== undefined ? this.product.stock : 99;
    const newQty = this.quantity + delta;
    if (newQty >= 1 && newQty <= stock) {
      this.quantityChange.emit(newQty);
    }
  }

  addToCart(event?: MouseEvent): void {
    if (!this.product) return;
    const p = this.product;
    this.cartService.addItem({
      _id: p._id || p.id,
      sku: p.sku || '',
      productName: p.name || '',
      name: p.name || '',
      image: p.image || '',
      price: this.getCurrentPrice(),
      discount: p.discount || 0,
      stock: p.stock || 0,
      unit: p.unit || 'Hop',
      category: p.category || '',
      slug: p.slug || '',
    }, this.quantity);

    if (event) {
      const btn = (event.target as HTMLElement).closest('button') || event.target as HTMLElement;
      this.cartAnimation.flyToCart(btn as HTMLElement);
    }
  }

  buyNow(): void {
    if (!this.product) return;
    const stock = this.product.stock !== undefined ? this.product.stock : 99;
    const finalQty = Math.min(this.quantity, stock);

    this.buyNowService.buyNow({
      ...this.product,
      price: this.getOldPrice(),
      discount: this.product.discount || 0,
      stock: stock
    }, finalQty);

    // Close the quick view popup after clicking Buy Now
    this.quickViewService.close();
  }

  requestConsultation(): void {
    // Dong popup truoc khi chuyen huong
    this.quickViewService.close();

    const queryParams: any = {};
    if (this.product) {
      const productId = this.product._id?.$oid || this.product._id || this.product.id;
      if (productId) {
        queryParams.productId = productId;
      }
    }

    // Chuyen huong sang trang tu van
    this.router.navigate(['/consultation'], { queryParams });
  }

  onCountryOriginClick(event: Event): void {
    event.preventDefault();

    const origin = String(this.product?.country || this.product?.origin || '').trim();
    if (!origin) return;

    const currentCategorySlug = this.categoryPath?.length
      ? String(this.categoryPath[this.categoryPath.length - 1]?.slug || '')
      : '';

    this.quickViewService.close();

    if (currentCategorySlug) {
      const segments = currentCategorySlug.split('/').filter(Boolean);
      this.router.navigate(['/category', ...segments], {
        queryParams: { origin }
      });
      return;
    }

    this.router.navigate(['/products'], {
      queryParams: { origin }
    });
  }

  viewBusinessLicense(): void {
    // Dong popup truoc khi chuyen huong
    this.quickViewService.close();
    this.router.navigate(['/chinh-sach/giay-phep-kinh-doanh']);
  }

  onTabScroll(tabId: string, event: Event): void {
    event.preventDefault();
    this.tabScroll.emit(tabId);
  }

  getCurrentPrice(): number {
    if (!this.product) return 0;
    const price = this.product.price || 0;
    const discount = this.product.discount || 0;
    return Math.max(0, price - discount);
  }

  getOldPrice(): number {
    if (!this.product) return 0;
    return Math.max(0, this.product.price || 0);
  }

  getDiscountPercent(): number {
    if (!this.product) return 0;
    const price = this.product.price;
    const discount = this.product.discount;

    if (!price || price <= 0) return 0;
    if (!discount || discount <= 0) return 0;

    return Math.round((discount / price) * 100);
  }

  getCountryFlag(): string {
    if (!this.product) return '';
    const countryText = (this.product.country || this.product.origin || '').toLowerCase();
    if (!countryText) return '';
    const flags: { [key: string]: string } = {
      'viet nam': 'https://img.icons8.com/color/48/vietnam.png',
      'hoa ky': 'https://img.icons8.com/color/48/usa.png',
      'my': 'https://img.icons8.com/color/48/usa.png',
      'phap': 'https://img.icons8.com/color/48/france.png',
      'duc': 'https://img.icons8.com/color/48/germany.png',
      'nhat ban': 'https://img.icons8.com/color/48/japan.png',
      'han quoc': 'https://img.icons8.com/color/48/south-korea.png',
      'uc': 'https://flagcdn.com/w40/au.png',
      'australia': 'https://flagcdn.com/w40/au.png',
      'thuy sy': 'https://img.icons8.com/color/48/switzerland.png',
      'thuy si': 'https://img.icons8.com/color/48/switzerland.png',
      'anh': 'https://img.icons8.com/color/48/great-britain.png',
      'trung quoc': 'https://img.icons8.com/color/48/china.png',
      'dai loan': 'https://img.icons8.com/color/48/taiwan.png',
      'thai lan': 'https://img.icons8.com/color/48/thailand.png',
      'an do': 'https://img.icons8.com/color/48/india.png',
      'singapore': 'https://img.icons8.com/color/48/singapore.png',
      'malaysia': 'https://img.icons8.com/color/48/malaysia.png',
      'y': 'https://img.icons8.com/color/48/italy.png',
      'tay ban nha': 'https://img.icons8.com/color/48/spain.png',
      'canada': 'https://img.icons8.com/color/48/canada.png',
      'thuy dien': 'https://img.icons8.com/color/48/sweden.png',
      'dan mach': 'https://img.icons8.com/color/48/denmark.png',
      'ba lan': 'https://img.icons8.com/color/48/poland.png',
      'new zealand': 'https://img.icons8.com/color/48/new-zealand.png',
      'slovenia': 'https://img.icons8.com/color/48/slovenia.png',
      'bi': 'https://img.icons8.com/color/48/belgium.png',
      'ha lan': 'https://img.icons8.com/color/48/netherlands.png',
      'bulgaria': 'https://img.icons8.com/color/48/bulgaria.png',
      'tho nhi ky': 'https://img.icons8.com/color/48/turkey.png',
      'brazil': 'https://img.icons8.com/color/48/brazil.png',
      'indonesia': 'https://img.icons8.com/color/48/indonesia.png',
      'cong hoa sec': 'https://img.icons8.com/color/48/czech-republic.png',
      'hong kong': 'https://img.icons8.com/color/48/hong-kong.png',
      'slovakia': 'https://img.icons8.com/color/48/slovakia.png',
      'sri lanka': 'https://img.icons8.com/color/48/sri-lanka.png',
      'ao': 'https://img.icons8.com/color/48/austria.png'
    };

    // Tim kiem xem trong chuoi countryText co chua ten quoc gia nao khong
    for (const key in flags) {
      if (countryText.includes(key)) {
        return flags[key];
      }
    }

    // Neu khong tim thay, tra ve rong de khong hien sai co
    return '';
  }

  formatSoldCount(sold: any): string {
    const value = Number(sold || 0);
    if (!Number.isFinite(value) || value <= 0) return '0';

    if (value >= 10000) {
      return `${Math.floor(value / 1000)}k`;
    }

    return `${Math.floor(value)}`;
  }

  private buildAttentionStats(): void {
    const productSeed = this.getProductSeed();
    this.attentionCartCount = this.hashToRange(`${productSeed}-cart`, 1, 400);
    this.attentionViewCount = this.hashToRange(`${productSeed}-view`, 1, 400);
  }

  private getProductSeed(): string {
    if (!this.product) return `fallback-${Date.now()}`;
    const productId = this.product._id?.$oid || this.product._id || this.product.id || '';
    return String(productId || this.product.sku || this.product.slug || this.product.name || 'product');
  }

  private hashToRange(seed: string, min: number, max: number): number {
    const safeSeed = String(seed || '');
    let hash = 0;
    for (let i = 0; i < safeSeed.length; i++) {
      hash = ((hash << 5) - hash) + safeSeed.charCodeAt(i);
      hash |= 0;
    }
    const span = max - min + 1;
    return min + (Math.abs(hash) % span);
  }
}
