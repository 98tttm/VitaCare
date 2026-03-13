import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiseaseService } from '../../services/disease.service';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-disease-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './disease-details.html',
  styleUrl: './disease-details.css',
})
export class DiseaseDetails implements OnInit, OnDestroy {
  disease: any = null;
  loading = true;
  error = false;
  activeSection = '';
  breadcrumbLabel = '';
  // Breadcrumb: nhóm bệnh
  breadcrumbGroup: { name: string; slug: string } | null = null;
  activeImageIndex = 0;

  // Audio player state
  isAudioPlaying = false;
  audioDuration = '';
  audioCurrentTime = '00:00';
  audioProgress = 0;
  @ViewChild('audioRef') audioRef!: ElementRef<HTMLAudioElement>;

  // Content expand/collapse
  isContentExpanded = false;
  @ViewChild('toggleWrap') toggleWrap!: ElementRef<HTMLElement>;

  // Copy status
  isCopied = false;

  // References expand/collapse
  isReferencesExpanded = false;

  // FAQ state
  expandedFaqs: { [key: number]: boolean } = {};

  // Consultation (Q&A) State
  consultationsData: any = { sku: '', questions: [] };
  visibleConsultationsCount = 3;
  selectedConsultationSort: string = 'newest';
  showReviewModal = false;
  isQuestionMode = true; // Always question mode in disease page
  userReviewContent = '';
  replyingToQuestionId: string | null = null;
  consultationReplyContent = '';

  // Video Modal State
  showVideoModal = false;
  safeVideoUrl: SafeResourceUrl | null = null;

  // Section label map (key → nav label)
  private readonly SECTION_LABELS: Record<string, string> = {
    description: 'Tìm hiểu chung',
    symptom: 'Triệu chứng',
    aetiologies: 'Nguyên nhân',
    risk: 'Nguy cơ',
    diagnose_and_treaty: 'Phương pháp chẩn đoán & điều trị',
    living_and_preventive: 'Chế độ sinh hoạt & phòng ngừa',
  };

  private observer: IntersectionObserver | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private diseaseService: DiseaseService,
    private productService: ProductService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) { }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        // Force execution within NgZone to ensure change detection works correctly after navigation
        this.ngZone.run(() => {
          this.loadDisease(id);
        });
      }
    });
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  loadDisease(id: string) {
    // Cleanup old observer before loading a new disease
    if (this.observer) {
      this.observer.disconnect();
    }

    this.loading = true;
    this.error = false;
    this.activeImageIndex = 0;
    this.isAudioPlaying = false;
    this.audioDuration = '';
    this.disease = null;
    this.isContentExpanded = false;
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 100);

    this.diseaseService.getDiseaseById(id).subscribe({
      next: (data) => {
        // Ensure all state updates happen inside NgZone to trigger change detection
        this.ngZone.run(() => {
          if (!data || data.message === 'Not found') {
            this.error = true;
            this.loading = false;
          } else {
            this.disease = data;

            // ====== Finding Breadcrumb Group ("Nhóm bệnh") ======
            this.breadcrumbGroup = null;
            if (data.categories?.length > 0) {
              const groupCat = data.categories.find((c: any) =>
                c.fullPathSlug?.startsWith('benh/nhom-benh/')
              );
              if (groupCat) {
                const groupSlug = groupCat.fullPathSlug.replace('benh/nhom-benh/', '');
                this.breadcrumbGroup = { name: groupCat.name, slug: groupSlug };
              }
            }

            // ====== Badge Label Prioritization (displayed above title) ======
            let label = '';
            if (this.breadcrumbGroup) {
              // Priority 1: Use the same group name as in breadcrumb
              label = this.breadcrumbGroup.name;
            } else if (data.categories?.length > 0) {
              // Priority 2: Use the most specific body part category (longest slug)
              const bodyPartCats = data.categories
                .filter((c: any) => c.fullPathSlug?.includes('xem-theo-bo-phan-co-the'))
                .sort((a: any, b: any) => (b.fullPathSlug?.length || 0) - (a.fullPathSlug?.length || 0));

              const bodyPartCat = bodyPartCats.find((c: any) => c.name !== data.name);
              if (bodyPartCat) {
                label = bodyPartCat.name;
              } else {
                // Priority 3: Fallback to any other relevant category
                const otherCat = data.categories.find((c: any) =>
                  c.name !== data.name &&
                  c.name !== 'Tra cứu bệnh lý' &&
                  !c.fullPathSlug?.includes('tra-cuu-benh')
                );
                if (otherCat) label = otherCat.name;
              }
            }
            this.breadcrumbLabel = label;

            // Active section defaults
            if (data.content_sections?.length > 0) {
              // ====== REORDER SECTIONS ======
              // Swap 'diagnose_and_treaty' and 'living_and_preventive' as requested (Diagnosis before Lifestyle)
              const sections = [...data.content_sections];
              const diagIdx = sections.findIndex(s => s.key === 'diagnose_and_treaty');
              const livingIdx = sections.findIndex(s => s.key === 'living_and_preventive');

              if (diagIdx !== -1 && livingIdx !== -1 && diagIdx > livingIdx) {
                const diagSec = sections.splice(diagIdx, 1)[0];
                const newLivingIdx = sections.findIndex(s => s.key === 'living_and_preventive');
                sections.splice(newLivingIdx, 0, diagSec);
                data.content_sections = sections;
              }
              // ==============================

              this.activeSection = data.content_sections[0].key;
            }

            // Expand first FAQ by default
            this.expandedFaqs = {};
            if (data.faqs?.length > 0) {
              this.expandedFaqs[data.faqs[0].id] = true;
            }

            // Fetch consultations
            this.fetchConsultations(String(data.id));

            // Setup scroll spy after rendering
            setTimeout(() => {
              this.ngZone.run(() => {
                this.setupScrollSpy();
                this.cdr.markForCheck();
                this.cdr.detectChanges();
              });
            }, 1000); // Increased timeout to ensure full content rendering

            this.loading = false;
            this.error = false;
          }
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          console.error('Error loading disease details:', err);
          this.error = true;
          this.loading = false;
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      }
    });
  }

  triggerCDR() {
    window.scrollTo(0, 0);
    this.cdr.detectChanges();
  }

  getSafeHtml(html: string): SafeHtml {
    if (!html) return '';

    // Remove empty paragraphs, multiple line breaks, and empty divs to keep content compact
    let cleanedHtml = html
      .replace(/<p>\s*(?:&nbsp;)*\s*<\/p>/gi, '') // Empty paragraphs
      .replace(/<p><br\s*\/?>\s*<\/p>/gi, '') // Paragraphs with only a break
      .replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>') // Multiple consecutive breaks
      .replace(/<div>\s*<\/div>/gi, '') // Empty divs
      .replace(/\n\s*\n/g, '\n'); // Double newlines

    // Center lone images
    cleanedHtml = cleanedHtml.replace(/<p>\s*(<img[^>]*>)\s*<\/p>/gi,
      '<div class="dd-img-block">$1</div>'
    );

    // Make external benh/ links internal
    const internalizedHtml = cleanedHtml.replace(/href="https:\/\/nhathuoclongchau.com.vn\/benh\/([^"]+).html"/gi, 'href="/benh/$1"');

    const fixedHtml = internalizedHtml.replace(/<h3[^>]*>/gi, '<b style="display: block; margin-top: 25px; margin-bottom: 10px; color: #00589F; font-size: 19px; font-weight: 700;">')
      .replace(/<\/h3>/gi, '</b>');

    return this.sanitizer.bypassSecurityTrustHtml(fixedHtml);
  }

  getSectionLabel(key: string): string {
    return this.SECTION_LABELS[key] ?? key;
  }

  scrollToSection(key: string) {
    this.activeSection = key;

    // Tự động mở rộng nếu đang bị thu gọn
    if (!this.isContentExpanded) {
      this.isContentExpanded = true;
      this.cdr.detectChanges();
    }

    // Thực hiện ngay lập tức
    const el = document.getElementById(`section-${key}`);
    if (el) {
      const offset = 90;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'auto' });
    }
  }

  setupScrollSpy() {
    if (this.observer) {
      this.observer.disconnect();
    }

    const sections = Array.from(document.querySelectorAll<HTMLElement>('.dd-section'));
    if (sections.length === 0) return;

    // Use IntersectionObserver for more accurate and efficient tracking
    this.observer = new IntersectionObserver((entries) => {
      // Find the entry that is most prominent in the viewport
      const visibleEntries = entries.filter(e => e.isIntersecting);

      if (visibleEntries.length > 0) {
        // Sort by intersection ratio (highest first) or pick the first one depending on direction
        // For TOC, we usually want the top-most visible section
        const topMost = visibleEntries.reduce((prev, curr) => {
          return (prev.boundingClientRect.top < curr.boundingClientRect.top) ? prev : curr;
        });

        const id = topMost.target.id.replace('section-', '');
        if (id && id !== this.activeSection) {
          this.ngZone.run(() => {
            this.activeSection = id;
            this.cdr.detectChanges();
          });
        }
      }
    }, {
      rootMargin: '-100px 0px -70% 0px', // Trigger when section hits top 100px
      threshold: [0, 0.1, 0.5]
    });

    sections.forEach(sec => this.observer?.observe(sec));
  }

  // Image gallery controls
  prevImage() {
    const len = this.disease?.slider_images?.length || 0;
    if (len === 0) return;
    this.activeImageIndex = (this.activeImageIndex - 1 + len) % len;
  }

  nextImage() {
    const len = this.disease?.slider_images?.length || 0;
    if (len === 0) return;
    this.activeImageIndex = (this.activeImageIndex + 1) % len;
  }

  setImage(index: number) {
    this.activeImageIndex = index;
  }

  goToDisease(id: number | string) {
    window.scrollTo(0, 0);
    this.router.navigate(['/benh', id]);
  }

  onTagClick(tag: any) {
    if (!tag?.title) return;
    this.router.navigate(['/category/tra-cuu-benh'], { queryParams: { keyword: tag.title } });
  }

  goToDiseaseBySlug(slug: string) {
    if (!slug) return;
    // Clean slug for internal routing
    let cleanSlug = slug;
    if (slug.startsWith('benh/')) cleanSlug = slug.replace(/^benh\//, '');
    if (cleanSlug.endsWith('.html')) cleanSlug = cleanSlug.replace(/\.html$/, '');

    window.scrollTo(0, 0);
    this.router.navigate(['/benh', cleanSlug]);
  }

  goBack() {
    this.router.navigate(['/category/tra-cuu-benh']);
  }

  // ======= CONTENT EXPAND/COLLAPSE =======
  toggleContent() {
    const container = document.querySelector('.dd-content-collapsible') as HTMLElement;
    if (!container) {
      this.isContentExpanded = !this.isContentExpanded;
      return;
    }

    // 1. Ghi lại vị trí bài viết trước khi thay đổi
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const containerTop = container.getBoundingClientRect().top + scrollTop;

    // 2. Chuyển trạng thái ngay lập tức
    this.isContentExpanded = !this.isContentExpanded;

    if (!this.isContentExpanded) {
      // 3. Ép Angular render lại bài viết ở dạng 1000px ngay
      this.cdr.detectChanges();

      // Vị trí đích: Nút xem thêm nằm giữa màn hình
      const targetY = (containerTop + 1000) - (window.innerHeight / 2);

      // 4. Nhảy tức thì (Double jump để triệt tiêu việc browser tự động kéo trang)
      window.scrollTo(0, targetY);

      // Nhảy lại lần nữa ở nhịp tiếp theo để "khóa" vị trí
      setTimeout(() => {
        window.scrollTo(0, targetY);
      }, 0);
    }
  }

  // ======= COPY ARTICLE CONTENT =======
  copyArticle() {
    if (!this.disease || !this.disease.content_sections) return;

    // Lấy toàn bộ nội dung text từ các section
    let fullText = (this.disease.headline || this.disease.name) + '\n\n';

    this.disease.content_sections.forEach((sec: any) => {
      fullText += this.getSectionLabel(sec.key).toUpperCase() + '\n';
      // Loại bỏ tag HTML để lấy text thuần
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = sec.html;
      fullText += (tempDiv.textContent || tempDiv.innerText) + '\n\n';
    });

    // Copy vào clipboard
    navigator.clipboard.writeText(fullText).then(() => {
      this.isCopied = true;
      this.cdr.detectChanges();

      // Reset trạng thái sau 1 giây
      setTimeout(() => {
        this.isCopied = false;
        this.cdr.detectChanges();
      }, 1000);
    });
  }

  // ======= REFERENCES TOGGLE =======
  toggleReferences() {
    this.isReferencesExpanded = !this.isReferencesExpanded;
    this.cdr.detectChanges();
  }

  // ======= FAQ TOGGLE =======
  toggleFaq(id: number) {
    this.expandedFaqs[id] = !this.expandedFaqs[id];
    this.cdr.detectChanges();
  }

  // ======= AUDIO PLAYER =======
  toggleAudio() {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      this.isAudioPlaying = true;
    } else {
      audio.pause();
      this.isAudioPlaying = false;
    }
  }

  onAudioLoaded(event: Event) {
    const audio = event.target as HTMLAudioElement;
    const dur = audio.duration;
    if (!isNaN(dur) && dur > 0) {
      this.audioDuration = this.formatTime(dur);
    }
  }

  onAudioTimeUpdate(event: Event) {
    const audio = event.target as HTMLAudioElement;
    if (!isNaN(audio.duration) && audio.duration > 0) {
      this.audioProgress = (audio.currentTime / audio.duration) * 100;
      this.audioCurrentTime = this.formatTime(audio.currentTime);
    }
  }

  onAudioEnded() {
    this.isAudioPlaying = false;
    this.audioProgress = 0;
    this.audioCurrentTime = '00:00';
  }

  seekAudio(event: MouseEvent) {
    const audio = this.audioRef?.nativeElement;
    if (!audio || !audio.duration) return;
    const track = event.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // ======= CONSULTATION (Q&A) METHODS =======
  fetchConsultations(sku: string) {
    this.productService.getProductConsultations(sku).subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          this.consultationsData = data || { sku, questions: [] };
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        console.error('Error fetching consultations:', err);
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      }
    });
  }

  get filteredConsultations() {
    let list = this.consultationsData.questions || [];
    if (this.selectedConsultationSort === 'newest') {
      list = [...list].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (this.selectedConsultationSort === 'oldest') {
      list = [...list].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (this.selectedConsultationSort === 'helpful') {
      list = [...list].sort((a: any, b: any) => (b.likes?.length || 0) - (a.likes?.length || 0));
    }
    return list.slice(0, this.visibleConsultationsCount);
  }

  filterConsultations(sort: string) {
    this.selectedConsultationSort = sort;
    this.visibleConsultationsCount = 3;
  }

  loadMoreConsultations() {
    this.visibleConsultationsCount += 5;
  }

  collapseConsultations() {
    this.visibleConsultationsCount = 3;
    const element = document.querySelector('.consultations-list');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  openQuestionModal() {
    this.isQuestionMode = true;
    this.showReviewModal = true;
    this.userReviewContent = '';
    document.body.style.overflow = 'hidden';
  }

  closeReviewModal() {
    this.showReviewModal = false;
    document.body.style.overflow = '';
  }

  submitQuestion() {
    if (!this.userReviewContent.trim()) {
      alert('Vui lòng nhập nội dung câu hỏi');
      return;
    }

    const payload = {
      sku: this.disease.slug || String(this.disease.id),
      question: this.userReviewContent,
      full_name: '' // Backend will use default
    };

    this.productService.submitConsultation(payload).subscribe({
      next: (res) => {
        alert('Câu hỏi của bạn đã được gửi thành công! VitaCare sẽ phản hồi sớm nhất có thể.');
        this.closeReviewModal();
        this.fetchConsultations(payload.sku);
      },
      error: (err) => {
        console.error('Submit question error:', err);
        alert('Có lỗi xảy ra khi gửi câu hỏi. Vui lòng thử lại.');
      }
    });
  }

  isConsultationLiked(question: any): boolean {
    const userId = this.getOrCreateUserId();
    return question.likes && question.likes.includes(userId);
  }

  likeConsultation(question: any) {
    const userId = this.getOrCreateUserId();
    this.productService.likeConsultation({
      sku: this.disease.slug || String(this.disease.id),
      questionId: question.id,
      userId: userId
    }).subscribe({
      next: (data) => {
        this.consultationsData = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Like consultation error', err)
    });
  }

  toggleReplyConsultation(question: any) {
    if (this.replyingToQuestionId === question.id) {
      this.replyingToQuestionId = null;
    } else {
      this.replyingToQuestionId = question.id;
      this.consultationReplyContent = '';
    }
  }

  submitReplyConsultation(question: any) {
    if (!this.consultationReplyContent.trim()) {
      alert('Vui lòng nhập nội dung trả lời');
      return;
    }

    const payload = {
      sku: this.disease.slug || String(this.disease.id),
      questionId: question.id,
      content: this.consultationReplyContent,
      fullname: '',
      isAdmin: false
    };

    this.productService.replyToConsultation(payload).subscribe({
      next: (data) => {
        alert('Đã gửi phản hồi thành công!');
        this.consultationsData = data;
        this.replyingToQuestionId = null;
        this.consultationReplyContent = '';
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Reply consultation error:', err);
        alert('Lỗi gửi phản hồi. Vui lòng thử lại.');
      }
    });
  }

  getOrCreateUserId(): string {
    let userId = localStorage.getItem('guest_user_id');
    if (!userId) {
      userId = `GUEST_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      localStorage.setItem('guest_user_id', userId);
    }
    return userId;
  }

  autoResizeTextarea(event: any) {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  // ======= VIDEO MODAL METHODS =======
  openVideoModal() {
    if (!this.disease?.video_url) return;

    const embedUrl = this.convertToEmbedUrl(this.disease.video_url);
    this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.showVideoModal = true;
    document.body.style.overflow = 'hidden';
    this.cdr.detectChanges();
  }

  closeVideoModal() {
    this.showVideoModal = false;
    this.safeVideoUrl = null;
    document.body.style.overflow = '';
    this.cdr.detectChanges();
  }

  private convertToEmbedUrl(url: string): string {
    if (!url) return '';

    // Handle standard watch URL: https://www.youtube.com/watch?v=VIDEO_ID
    if (url.includes('youtube.com/watch')) {
      const videoId = url.split('v=')[1]?.split('&')[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }

    // Handle short URL: https://youtu.be/VIDEO_ID
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1]?.split('?')[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }

    // Handle already embed URL
    if (url.includes('youtube.com/embed/')) {
      return url.includes('?') ? `${url}&autoplay=1` : `${url}?autoplay=1`;
    }

    return url;
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hôm nay';
    if (diffDays < 30) return `${diffDays} ngày trước`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} tháng trước`;
    return `${Math.floor(diffDays / 365)} năm trước`;
  }

  /** Breadcrumb: về trang Tra cứu bệnh */
  navigateToDiseaseList(e: Event) {
    e.preventDefault();
    this.router.navigate(['/disease']);
    this.cdr.detectChanges();
  }

  /** Breadcrumb: về nhóm bệnh cụ thể */
  navigateToGroup(e: Event, groupSlug: string) {
    e.preventDefault();
    this.router.navigate(['/disease'], { queryParams: { groupSlug } });
    this.cdr.detectChanges();
  }
}

