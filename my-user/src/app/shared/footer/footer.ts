import { Component, OnInit, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { CategoryService } from '../../core/services/category.service';

type FooterKey = 'about' | 'categories' | 'more' | 'hotline' | 'policy';

/** Danh mục footer → slug (fallback khi API chưa load), đồng bộ với category bar header */
const FOOTER_CATEGORY_SLUG_FALLBACK: Record<string, string> = {
  'Thực phẩm chức năng': 'thuc-pham-chuc-nang',
  'Dược mỹ phẩm': 'duoc-my-pham',
  'Thuốc': 'thuoc',
  'Chăm sóc cá nhân': 'cham-soc-ca-nhan',
  'Trang thiết bị y tế': 'trang-thiet-bi-y-te',
};

export interface FooterCategoryLink {
  name: string;
  route: string[];
}

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [NgFor, RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer implements OnInit {
  private router = inject(Router);
  private categoryService = inject(CategoryService);

  /** Danh mục sản phẩm: link đúng tới product list theo slug (cùng nguồn với category bar) */
  categoryLinks: FooterCategoryLink[] = [];

  ngOnInit(): void {
    this.buildCategoryLinks();
  }

  private buildCategoryLinks(): void {
    const order: string[] = [
      'Thực phẩm chức năng',
      'Dược mỹ phẩm',
      'Thuốc',
      'Chăm sóc cá nhân',
      'Trang thiết bị y tế',
    ];
    const slugMap: Record<string, string> = { ...FOOTER_CATEGORY_SLUG_FALLBACK };

    const applySlugs = () => {
      this.categoryLinks = [
        ...order.map((name) => ({
          name,
          route: ['/category', slugMap[name] || name],
        })),
        { name: 'Đặt thuốc online', route: ['/consultation'] },
      ];
    };
    applySlugs(); // hiển thị ngay với fallback slug

    this.categoryService.getCategories().subscribe({
      next: (categories: any[]) => {
        const roots = (categories || []).filter(
          (c: any) => c.parentId == null || c.parentId === 'null' || !c.parentId
        );
        roots.forEach((r: any) => {
          if (r.name && r.slug) slugMap[r.name] = r.slug;
        });
        // Đồng bộ: header dùng "Thiết bị y tế", footer dùng "Trang thiết bị y tế" → cùng slug
        if (slugMap['Thiết bị y tế'] && !slugMap['Trang thiết bị y tế']) {
          slugMap['Trang thiết bị y tế'] = slugMap['Thiết bị y tế'];
        }
        applySlugs();
      },
      error: applySlugs,
    });
  }
  // Trạng thái mở/đóng cho từng mục
  open: Record<FooterKey, boolean> = {
    about: false,
    categories: false,
    more: false,
    hotline: false,
    policy: false,
  };

  // Toggle chung
  toggle(key: FooterKey): void {
    this.open[key] = !this.open[key];
  }

  // Giữ tương thích với code cũ (nếu HTML đang gọi togglePolicy())
  get policyOpen(): boolean {
    return this.open.policy;
  }
  togglePolicy(): void {
    this.toggle('policy');
  }

  goAbout(): void {
    this.router.navigate(['/about']);
  }

  goStoreSystem(): void {
    this.router.navigate(['/store-system']);
  }

  goBusinessLicense(): void {
    this.router.navigate(['/policy/giay-phep-kinh-doanh']);
  }

  goRegulationBusiness(): void {
    this.router.navigate(['/policy/quy-che-hoat-dong']);
  }

  goPolicyIntro(): void {
    this.router.navigate(['/policy/gioi-thieu']);
  }

  goWarrantyCenters(): void {
    this.router.navigate(['/policy/thong-tin-trung-tam-bao-hanh']);
  }

  goBlog(): void {
    this.router.navigate(['/blog']);
  }

  openDrugLookup(): void {
    window.open('https://dichvucong.dav.gov.vn/congbothuoc/index', '_blank');
  }

  goDiseaseList(): void {
    this.router.navigate(['/disease']);
  }

  // TODO: Chưa có route cụ thể cho:
  // - Bệnh viện
  // - Đội ngũ chuyên môn
  // - Tin tức tuyển dụng
  // - Tin tức sự kiện
  // Khi có yêu cầu/route rõ ràng, có thể map bổ sung tại đây.
}