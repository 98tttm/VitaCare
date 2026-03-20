import { Component, OnInit, ChangeDetectorRef, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiseaseService } from '../../../core/services/disease.service';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { GROUP_BANNER_MAP } from '../disease/disease-icon';

/** Fallback tên hiển thị cho nhóm bệnh thường gặp / theo mùa */
const GROUP_DISPLAY_NAME_FALLBACK: Record<string, string> = {
  'benh-nam-gioi': 'Bệnh nam giới',
  'benh-nu-gioi': 'Bệnh nữ giới',
  'benh-nguoi-gia': 'Bệnh người già',
  'benh-tre-em': 'Bệnh trẻ em',
  'benh-theo-mua': 'Bệnh theo mùa',
};

@Component({
  selector: 'app-disease-group-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './disease-group-details.html',
  styleUrl: './disease-group-details.css',
})
export class DiseaseGroupDetails implements OnInit, OnDestroy {
  diseases: any[] = [];
  loading: boolean = false;
  loadingMore: boolean = false;
  selectedGroup: any = null;
  currentPage: number = 1;
  totalPages: number = 1;
  totalCount: number = 0;
  pageSize: number = 10;

  private routeSub: Subscription | null = null;

  constructor(
    private diseaseService: DiseaseService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) { }

  ngOnInit(): void {
    this.routeSub = this.route.params.subscribe((params: any) => {
      const slug = params['groupSlug'];
      if (slug) {
        this.loadGroupData(slug);
        // Cuộn lên đầu trang sau khi chuyển view
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }, 100);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.routeSub) this.routeSub.unsubscribe();
  }

  loadGroupData(slug: string): void {
    this.loading = true;
    this.diseaseService.getDiseaseGroups().subscribe(groups => {
      this.ngZone.run(() => {
        // Cải thiện logic tìm group: khớp slug hoặc là phần cuối của fullPathSlug
        this.selectedGroup = groups.find((g: any) => {
          const gSlug = g.slug || '';
          const gPath = g.fullPathSlug || '';
          return gSlug === slug || gPath === slug || gPath.endsWith('/' + slug);
        });

        // Nếu không tìm thấy, tạo object giả với name rỗng để kích hoạt fallback
        if (!this.selectedGroup) {
          this.selectedGroup = { slug, name: '' };
        }

        this.fetchDiseases(1);
      });
    });
  }

  fetchDiseases(page: number, append: boolean = false): void {
    if (!this.selectedGroup) return;

    if (append) {
      this.loadingMore = true;
    } else {
      this.loading = true;
      this.diseases = []; // Reset on new group
    }

    this.currentPage = page;
    this.cdr.detectChanges();

    this.diseaseService.getDiseases({
      groupSlug: this.selectedGroup.slug,
      page: page,
      limit: this.pageSize
    }).subscribe({
      next: (res) => {
        this.ngZone.run(() => {
          const newDiseases = res.diseases || [];
          if (append) {
            this.diseases = [...this.diseases, ...newDiseases];
          } else {
            this.diseases = [...newDiseases]; // Ensure new reference
          }
          this.totalCount = res.total || 0;
          this.totalPages = res.totalPages || 1;
          this.loading = false;
          this.loadingMore = false;

          // Force UI repaint with a tiny delay to ensure Zone catches it
          setTimeout(() => {
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          }, 0);
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.loading = false;
          this.loadingMore = false;
          setTimeout(() => {
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          }, 0);
        });
      }
    });
  }

  loadMore(): void {
    if (this.currentPage < this.totalPages) {
      this.fetchDiseases(this.currentPage + 1, true);
    }
  }

  viewDetail(disease: any): void {
    if (!disease) return;
    let raw = disease.slug ?? disease.id ?? disease._id;
    if (raw === undefined || raw === null) return;
    let id = String(raw).trim();
    if (!id) return;
    if (id.startsWith('benh/')) {
      id = id.replace(/^benh\//, '');
    }
    if (id.endsWith('.html')) {
      id = id.replace(/\.html$/, '');
    }
    this.router.navigate(['/benh', id], { state: { disease } });
  }

  /** Tên hiển thị cho nhóm bệnh thường gặp / theo mùa khi API không trả về name */
  getGroupDisplayName(group: any): string {
    if (!group) return '';
    if (group.name && String(group.name).trim()) return group.name.trim();
    return GROUP_DISPLAY_NAME_FALLBACK[group.slug] || group.slug || '';
  }

  getGroupBanner(group: any): string {
    if (!group) return '';
    return GROUP_BANNER_MAP[group.slug] || '';
  }

  goHome(e: Event): void {
    e.preventDefault();
    this.router.navigate(['/']);
  }
}
