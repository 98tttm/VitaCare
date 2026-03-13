import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-product-info-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-info-summary.html',
  styleUrl: './product-info-summary.css'
})
export class ProductInfoSummary {
  @Input() product: any;
  @Input() categoryPath: any[] = [];
  @Input() quantity: number = 1;
  @Output() quantityChange = new EventEmitter<number>();

  updateQuantity(delta: number): void {
    const newQty = this.quantity + delta;
    if (newQty >= 1) {
      this.quantityChange.emit(newQty);
    }
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
    if (!this.product || !this.product.country) return '';

    const countryText = this.product.country.toLowerCase();
    const flags: { [key: string]: string } = {
      'việt nam': 'https://img.icons8.com/color/48/vietnam.png',
      'hoa kỳ': 'https://img.icons8.com/color/48/usa.png',
      'mỹ': 'https://img.icons8.com/color/48/usa.png',
      'pháp': 'https://img.icons8.com/color/48/france.png',
      'đức': 'https://img.icons8.com/color/48/germany.png',
      'nhật bản': 'https://img.icons8.com/color/48/japan.png',
      'hàn quốc': 'https://img.icons8.com/color/48/south-korea.png',
      'úc': 'https://img.icons8.com/color/48/australia-flag.png',
      'uc': 'https://img.icons8.com/color/48/australia-flag.png',
      'australia': 'https://img.icons8.com/color/48/australia-flag.png',
      'thụy sỹ': 'https://img.icons8.com/color/48/switzerland.png',
      'thụy sĩ': 'https://img.icons8.com/color/48/switzerland.png',
      'anh': 'https://img.icons8.com/color/48/great-britain.png',
      'trung quốc': 'https://img.icons8.com/color/48/china.png',
      'đài loan': 'https://img.icons8.com/color/48/taiwan.png',
      'thái lan': 'https://img.icons8.com/color/48/thailand.png',
      'ấn độ': 'https://img.icons8.com/color/48/india.png',
      'singapore': 'https://img.icons8.com/color/48/singapore.png',
      'malaysia': 'https://img.icons8.com/color/48/malaysia.png',
      'ý': 'https://img.icons8.com/color/48/italy.png',
      'tây ban nha': 'https://img.icons8.com/color/48/spain.png',
      'canada': 'https://img.icons8.com/color/48/canada.png',
      'thụy điển': 'https://img.icons8.com/color/48/sweden.png',
      'đan mạch': 'https://img.icons8.com/color/48/denmark.png',
      'ba lan': 'https://img.icons8.com/color/48/poland.png',
      'new zealand': 'https://img.icons8.com/color/48/new-zealand.png',
      'slovenia': 'https://img.icons8.com/color/48/slovenia.png',
      'bỉ': 'https://img.icons8.com/color/48/belgium.png',
      'hà lan': 'https://img.icons8.com/color/48/netherlands.png',
      'bulgaria': 'https://img.icons8.com/color/48/bulgaria.png',
      'thổ nhĩ kỳ': 'https://img.icons8.com/color/48/turkey.png',
      'brazil': 'https://img.icons8.com/color/48/brazil.png',
      'indonesia': 'https://img.icons8.com/color/48/indonesia.png',
      'cộng hòa séc': 'https://img.icons8.com/color/48/czech-republic.png',
      'hồng kông': 'https://img.icons8.com/color/48/hong-kong.png',
      'slovakia': 'https://img.icons8.com/color/48/slovakia.png',
      'sri lanka': 'https://img.icons8.com/color/48/sri-lanka.png',
      'áo': 'https://img.icons8.com/color/48/austria.png'
    };

    // Tìm kiếm xem trong chuỗi countryText có chứa tên quốc gia nào không
    for (const key in flags) {
      if (countryText.includes(key)) {
        return flags[key];
      }
    }

    // Nếu không tìm thấy, trả về rỗng để không hiện sai cờ
    return '';
  }
}
