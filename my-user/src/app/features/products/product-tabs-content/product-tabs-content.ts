import { Component, Input, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-product-tabs-content',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-tabs-content.html',
  styleUrl: './product-tabs-content.css'
})
export class ProductTabsContent {
  @Input() product: any;
  activeSection: string = 'mo-ta';
  isExpanded: boolean = false;

  constructor(private el: ElementRef, private sanitizer: DomSanitizer) { }

  /**
   * Chuyển đổi các link từ Long Châu sang link nội bộ VitaCare
   */
  transformInternalLinks(html: string): SafeHtml {
    if (!html) return '';

    // Regex to match links targeting nhathuoclongchau.com.vn
    const regex = /href=\"https:\/\/nhathuoclongchau\.com\.vn([^\"]*)\"/g;

    const transformedHtml = html.replace(regex, (match, path) => {
      let newLink = match;

      // Strip .html for cleaner processing, but keep track if it was a product link
      const isProductLink = path.endsWith('.html') &&
        !path.startsWith('/bai-viet/') &&
        !path.startsWith('/benh/') &&
        !path.startsWith('/thanh-phan/');

      const cleanPath = path.replace(/\.html$/, '');

      if (isProductLink) {
        // Extract product slug: e.g. /thuc-pham-chuc-nang/phe-khang-hai-thuong-vuong-32700.html -> phe-khang-hai-thuong-vuong-32700
        const segments = cleanPath.split('/');
        let slug = segments[segments.length - 1];

        // Normalization: Strip trailing numeric ID (common in Long Chau URLs)
        // e.g. phe-khang-hai-thuong-vuong-3x10-32700 -> phe-khang-hai-thuong-vuong-3x10
        const cleanSlug = slug.replace(/-\d+$/, '');

        // If it's referring to the current product, use the current product's slug
        if (this.product?.slug && (this.product.slug.includes(cleanSlug) || cleanSlug.includes(this.product.slug))) {
          slug = this.product.slug;
        } else {
          slug = cleanSlug;
        }

        newLink = `href=\"/product/${slug}\"`;
      } else if (path.startsWith('/bai-viet/')) {
        const slug = cleanPath.replace('/bai-viet/', '');
        newLink = `href=\"/bai-viet/${slug}\"`;
      } else if (path.startsWith('/benh/')) {
        const slug = cleanPath.replace('/benh/', '');
        newLink = `href=\"/benh/${slug}\"`;
      } else if (path.startsWith('/thuong-hieu/')) {
        const slug = cleanPath.replace('/thuong-hieu/', '');
        newLink = `href=\"/category?brand=${slug}\"`;
      } else if (path.startsWith('/thanh-phan/')) {
        const slug = cleanPath.replace('/thanh-phan/', '');
        newLink = `href=\"/bai-viet/${slug}\"`;
      } else if (
        path.startsWith('/thuc-pham-chuc-nang') ||
        path.startsWith('/duoc-my-pham') ||
        path.startsWith('/thuoc') ||
        path.startsWith('/cham-soc-ca-nhan') ||
        path.startsWith('/thiet-bi-y-te')
      ) {
        newLink = `href=\"/category${cleanPath}\"`;
      } else if (path === '' || path === '/') {
        newLink = `href=\"/\"`;
      }

      return newLink;
    });

    return this.sanitizer.bypassSecurityTrustHtml(transformedHtml);
  }

  getIngredientsList(): any[] {
    if (!this.product?.ingredients) return [];
    return this.product.ingredients.split(', ').map((ing: string) => {
      const parts = ing.split('(');
      return {
        name: parts[0]?.trim(),
        dosage: parts[1]?.replace(')', '')?.trim() || 'N/A'
      };
    });
  }

  scrollToSection(id: string) {
    this.activeSection = id;
    const element = document.getElementById(id);
    const container = this.el.nativeElement.querySelector('.vc_content_body');

    if (element && container) {
      if (this.isExpanded) {
        // Nếu đã mở rộng, scroll window
        this.performScroll(element);
      } else {
        // Nếu chưa mở rộng, chỉ scroll nội bộ container
        const relativeTop = element.offsetTop;

        // 1. Scroll nội dung trong khung (buffer 80px để thoáng hơn)
        container.scrollTo({
          top: relativeTop - 80,
          behavior: 'smooth'
        });

        // 2. Kiểm tra nếu phần đầu khung container bị khuất bởi Header trang web => Scroll Window để kéo khung xuống
        const containerRect = container.getBoundingClientRect();
        const headerOffset = 175; // Khớp với CSS top: 175px của left nav

        if (containerRect.top < headerOffset) {
          const bodyRect = document.body.getBoundingClientRect().top;
          const containerAbsoluteTop = containerRect.top - bodyRect;

          window.scrollTo({
            top: containerAbsoluteTop - headerOffset,
            behavior: 'smooth'
          });
        }
      }
    }
  }

  private performScroll(element: HTMLElement) {
    const offset = 175; // Trừ hao cho Sticky Header và Nav (175px)
    const bodyRect = document.body.getBoundingClientRect().top;
    const elementRect = element.getBoundingClientRect().top;
    const elementPosition = elementRect - bodyRect;
    const offsetPosition = elementPosition - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }

  @HostListener('window:scroll')
  onScroll() {
    // Chỉ kích hoạt ScrollSpy khi đã mở rộng nội dung
    if (!this.isExpanded) return;

    const sections = ['mo-ta', 'thanh-phan', 'cong-dung', 'cach-dung', 'tac-dung-phu', 'luu-y', 'bao-quan'];

    // Offset cho sticky header + padding (khoảng 150px để active sớm hơn)
    const offset = 195; // Trigger active sớm hơn một chút (175 + 20px buffer)

    for (const sectionId of sections) {
      const element = document.getElementById(sectionId);
      if (element) {
        const rect = element.getBoundingClientRect();

        // Logic kiểm tra:
        // 1. Element chạm đỉnh (trừ offset)
        // 2. Element vẫn còn trong vùng nhìn (bottom > offset)
        if (rect.top <= offset && rect.bottom > offset) {
          this.activeSection = sectionId;
          break; // Tìm thấy section đầu tiên thỏa mãn thì dừng lại
        }
      }
    }
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
  }
}
