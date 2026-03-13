import { Component, Input, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

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

  constructor(private el: ElementRef) { }

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
        const headerOffset = 80; // Giảm khoảng cách để khung neo cao hơn, che bớt phần trên

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
    const offset = 80; // Trừ hao cho Sticky Header
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
    const offset = 150;

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
