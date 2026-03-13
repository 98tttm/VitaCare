import { Component, OnInit, ChangeDetectorRef, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiseaseService } from '../services/disease.service';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  BODY_PART_ICONS,
  GROUP_ICON_MAP,
  GROUP_ICON_DEFAULT,
  GROUP_BANNER_MAP,
  BODY_IMAGE,
  ICON_FALLBACK
} from './disease-icon';

@Component({
  selector: 'app-disease',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './disease.html',
  styleUrl: './disease.css',
})
export class Disease implements OnInit, OnDestroy {
  // === STATE 1: Tra cứu theo bộ phận (Trang chính) ===
  bodyDiseases: any[] = [];
  bodyLoading: boolean = false;
  selectedBodyPart: string = 'Đầu';
  bodyCurrentPage: number = 1;
  bodyTotalPages: number = 1;
  bodyTotalCount: number = 0;

  // === UI & Shared ===
  diseaseGroups: any[] = [];
  visibleGroupLimit: number = 8; /* Số lượng nhóm hiển thị ban đầu */
  pageSize: number = 20;
  bodyImage = BODY_IMAGE;
  iconFallback = ICON_FALLBACK;
  bodyParts = BODY_PART_ICONS.map(p => ({ ...p }));

  private routeSub: Subscription | null = null;

  constructor(
    private diseaseService: DiseaseService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) { }

  ngOnInit(): void {
    // Luôn load danh sách nhóm bệnh ở dưới
    this.fetchDiseaseGroups();
    // Load dữ liệu bộ phận cơ thể mặc định
    this.fetchBodyDiseases(1);
  }

  ngOnDestroy(): void {
    if (this.routeSub) this.routeSub.unsubscribe();
  }

  // ==========================================
  // LOGIC BỘ PHẬN CƠ THỂ (TRANG CHÍNH)
  // ==========================================

  onBodyPartSelect(partName: string): void {
    if (this.selectedBodyPart === partName && this.bodyDiseases.length > 0) return;

    this.selectedBodyPart = partName;
    this.bodyCurrentPage = 1;
    this.fetchBodyDiseases(1);
  }

  fetchBodyDiseases(page: number): void {
    this.bodyLoading = true;
    this.bodyCurrentPage = page;
    this.cdr.detectChanges(); // Hiện loading ngay

    this.diseaseService.getDiseases({
      bodyPart: this.selectedBodyPart,
      page: page,
      limit: this.pageSize
    }).subscribe({
      next: (res) => {
        this.ngZone.run(() => {
          this.bodyDiseases = res.diseases || [];
          this.bodyTotalCount = res.total || 0;
          this.bodyTotalPages = res.totalPages || 1;
          this.bodyLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.bodyLoading = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  onBodyPageChange(page: number): void {
    if (page < 1 || page > this.bodyTotalPages) return;
    this.fetchBodyDiseases(page);
  }

  // ==========================================
  // LOGIC NHÓM BỆNH (TRANG TẬP TRUNG)
  // ==========================================

  onGroupSelect(group: any): void {
    // Điểm đến: Route /category/tra-cuu-benh/:groupSlug (Component mới)
    this.router.navigate(['/category/tra-cuu-benh', group.slug]);
  }

  // Đã xóa các method của focused mode cũ

  // ==========================================
  // SHARED HELPERS
  // ==========================================

  fetchDiseaseGroups(): void {
    this.diseaseService.getDiseaseGroups().subscribe(groups => {
      this.ngZone.run(() => {
        this.diseaseGroups = groups;
        this.cdr.detectChanges();
      });
    });
  }

  get visibleGroups(): any[] {
    return this.diseaseGroups.slice(0, this.visibleGroupLimit);
  }

  onLoadMoreGroups(): void {
    this.visibleGroupLimit += 8;
  }

  get remainingGroupsCount(): number {
    return Math.max(0, this.diseaseGroups.length - this.visibleGroupLimit);
  }

  getGroupIcon(group: any): string {
    if (!group) return GROUP_ICON_DEFAULT;
    return GROUP_ICON_MAP[group.slug] ?? GROUP_ICON_DEFAULT;
  }

  getGroupBanner(group: any): string {
    if (!group) return '';
    return GROUP_BANNER_MAP[group.slug] ?? '';
  }

  // Helper cho phân trang (dùng chung logic)
  buildPages(current: number, total: number): (number | 'dots')[] {
    if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | 'dots')[] = [];
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('dots'); pages.push(total);
    } else if (current >= total - 3) {
      pages.push(1); pages.push('dots');
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1); pages.push('dots');
      pages.push(current - 1); pages.push(current); pages.push(current + 1);
      pages.push('dots'); pages.push(total);
    }
    return pages;
  }

  viewDetail(disease: any): void {
    this.router.navigate(['/benh', disease.id]);
  }

  goHome(e: Event): void {
    e.preventDefault();
    this.router.navigate(['/']);
  }
}
