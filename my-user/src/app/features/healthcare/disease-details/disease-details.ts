import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, NgZone, HostListener } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiseaseService } from '../../../core/services/disease.service';
import { ProductService } from '../../../core/services/product.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { LoadingShippingComponent } from '../../../shared/loading-shipping/loading-shipping';

@Component({
  selector: 'app-disease-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingShippingComponent],
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
  guestDisplayName = '';
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

  private prefilledDisease: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private diseaseService: DiseaseService,
    private productService: ProductService,
    readonly authService: AuthService,
    private toastService: ToastService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) { }

  ngOnInit() {
    // Lấy sẵn dữ liệu bệnh được truyền qua router state (từ trang danh sách/nhóm)
    this.prefilledDisease = (window.history.state && (window.history.state as any).disease) || null;

    this.route.paramMap.subscribe((params: any) => {
      const id = params.get('id');
      if (id) {
        const hasPrefill = !!this.prefilledDisease;
        if (hasPrefill && !this.disease) {
          this.disease = this.prefilledDisease;
          this.loading = false;
          this.error = false;
          if (this.disease?.content_sections?.length > 0) {
            this.activeSection = this.disease.content_sections[0].key;
          }
        }
        // Force execution within NgZone to ensure change detection works correctly after navigation
        this.ngZone.run(() => {
          this.loadDisease(id, hasPrefill);
        });
      }
    });
  }

  ngOnDestroy() { }

  @HostListener('window:scroll')
  onWindowScroll() {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.dd-section'));
    if (sections.length === 0) return;

    // Kích hoạt khi tiêu đề mục lướt qua GIỮA màn hình
    const TRIGGER = Math.round(window.innerHeight / 2);
    let activeId = sections[0].id.replace('section-', '');

    for (const sec of sections) {
      if (sec.getBoundingClientRect().top <= TRIGGER) {
        activeId = sec.id.replace('section-', '');
      }
    }

    if (activeId !== this.activeSection) {
      this.activeSection = activeId;
    }
  }

  loadDisease(id: string, hasPrefill: boolean = false) {
    // Luôn cuộn về đầu trang khi load bệnh mới
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (!hasPrefill) {
      this.loading = true;
      this.error = false;
      this.activeImageIndex = 0;
      this.isAudioPlaying = false;
      this.audioDuration = '';
      this.disease = null;
      this.isContentExpanded = false;
    }

    this.diseaseService.getDiseaseById(id).subscribe({
      next: (data) => {
        // Ensure all state updates happen inside NgZone to trigger change detection
        this.ngZone.run(() => {
          if (!data || data.message === 'Not found') {
            if (!this.disease) {
              this.error = true;
            }
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

            // Setup scroll spy: no setup needed, using @HostListener

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
          if (!this.disease) {
            this.error = true;
          }
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

    // Make external links internal (both diseases and blog posts)
    const internalizedHtml = cleanedHtml
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/benh\/([^"]+).html"/gi, 'href="/benh/$1"')
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/bai-viet\/([^"]+).html"/gi, 'href="/bai-viet/$1"')
      .replace(/href="https:\/\/nhathuoclongchau.com.vn\/([^"]+).html"/gi, 'href="/bai-viet/$1"');

    const fixedHtml = internalizedHtml.replace(/<h3[^>]*>/gi, '<b style="display: block; margin-top: 25px; margin-bottom: 10px; color: #00589F; font-size: 19px; font-weight: 700;">')
      .replace(/<\/h3>/gi, '</b>');

    return this.sanitizer.bypassSecurityTrustHtml(fixedHtml);
  }

  /** Chuyển slug/URL bất kỳ thành path nội bộ sạch */
  public getInternalUrl(raw: string, type: string): string {
    if (!raw) return '/';
    let slug = raw;

    // Nếu là URL tuyệt đối, lấy phần sau domain
    if (slug.includes('nhathuoclongchau.com.vn/')) {
      slug = slug.split('nhathuoclongchau.com.vn/')[1];
    } else if (slug.startsWith('http')) {
      // Trường hợp link ngoài khác, trả về gốc hoặc giữ nguyên nếu bạn muốn mở tab mới (nhưng ở đây ưu tiên nội bộ)
      return slug;
    }

    // Xóa dấu / ở đầu nếu có
    if (slug.startsWith('/')) slug = slug.substring(1);

    // Xóa prefix dư thừa (cả có và không có / ở đầu)
    slug = slug.replace(/^benh\//i, '').replace(/^bai-viet\//i, '');
    // Xóa lần nữa nếu vẫn còn (trường hợp /bai-viet/bai-viet/...)
    slug = slug.replace(/^benh\//i, '').replace(/^bai-viet\//i, '');

    // Xóa đuôi .html
    slug = slug.replace(/\.html$/i, '');

    return `/${type}/${slug}`;
  }

  @HostListener('click', ['$event'])
  onComponentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');

    if (anchor) {
      const href = anchor.getAttribute('href');
      // Chỉ intercept nếu là link nội bộ hoặc link longchau đã được biến đổi
      if (href && (href.startsWith('/') || href.includes('nhathuoclongchau.com.vn'))) {
        event.preventDefault();

        let targetUrl = href;
        if (href.includes('/benh/')) targetUrl = this.getInternalUrl(href, 'benh');
        else if (href.includes('/bai-viet/')) targetUrl = this.getInternalUrl(href, 'bai-viet');

        window.scrollTo(0, 0);
        this.router.navigateByUrl(targetUrl);
      }
    }
  }

  getSectionLabel(key: string): string {
    return this.SECTION_LABELS[key] ?? key;
  }

  scrollToSection(key: string) {
    this.activeSection = key;
    this.cdr.detectChanges();

    // Tự động mở rộng nếu đang bị thu gọn
    if (!this.isContentExpanded) {
      this.isContentExpanded = true;
      this.cdr.detectChanges();
    }

    setTimeout(() => {
      const el = document.getElementById(`section-${key}`);
      if (el) {
        // Scroll để tiêu đề mục nằm giữa trang (giữa viewport)
        const offset = Math.round(window.innerHeight / 2);
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }, 50);
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
    if (id === undefined || id === null) return;
    let clean = String(id).trim();
    if (!clean) return;
    if (clean.startsWith('benh/')) {
      clean = clean.replace(/^benh\//, '');
    }
    if (clean.endsWith('.html')) {
      clean = clean.replace(/\.html$/, '');
    }
    window.scrollTo(0, 0);
    this.router.navigate(['/benh', clean]);
  }

  onTagClick(tag: any) {
    if (!tag?.title) return;
    this.router.navigate(['/category/tra-cuu-benh'], { queryParams: { keyword: tag.title } });
  }

  goToDiseaseBySlug(slug: string) {
    const url = this.getInternalUrl(slug, 'benh');
    window.scrollTo(0, 0);
    this.router.navigateByUrl(url);
  }

  goToBlogBySlug(slug: string) {
    const url = this.getInternalUrl(slug, 'bai-viet');
    window.scrollTo(0, 0);
    this.router.navigateByUrl(url);
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
    this.diseaseService.getConsultations(sku).subscribe({
      next: (questions) => {
        this.ngZone.run(() => {
          this.consultationsData = { sku, questions };
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

    if (!this.authService.currentUser()) {
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      this.guestDisplayName = `Khách vãng lai ${randomCode}`;
    } else {
      this.guestDisplayName = '';
    }

    document.body.style.overflow = 'hidden';
  }

  closeReviewModal() {
    this.showReviewModal = false;
    document.body.style.overflow = '';
  }

  submitQuestion() {
    if (!this.userReviewContent.trim()) {
      this.toastService.showError('Vui lòng nhập nội dung câu hỏi');
      return;
    }
    const user = this.authService.currentUser();
    let fullName = '';
    let userId = '';

    if (user) {
      fullName = user.full_name || user.phone || 'Người dùng';
      userId = user.user_id;
    } else {
      // Identity logic as requested: "Khách vãng lai" + 3 random digits
      if (this.guestDisplayName?.trim()) {
        fullName = this.guestDisplayName.trim();
      } else {
        const randomDigits = Math.floor(100 + Math.random() * 900); // 100-999
        fullName = `Khách vãng lai ${randomDigits}`;
      }
      userId = '';
    }

    const payload = {
      sku: this.disease.slug || String(this.disease.id),
      productName: this.disease.name,
      question: this.userReviewContent,
      user_id: userId,
      full_name: fullName
    };

    this.diseaseService.postConsultation(payload).subscribe({
      next: (res) => {
        this.toastService.showSuccess('Câu hỏi của bạn đã được gửi thành công! VitaCare sẽ phản hồi sớm nhất có thể.');
        this.closeReviewModal();
        this.fetchConsultations(payload.sku);
      },
      error: (err) => {
        console.error('Submit question error:', err);
        this.toastService.showError('Có lỗi xảy ra khi gửi câu hỏi. Vui lòng thử lại.');
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
      this.toastService.showError('Vui lòng nhập nội dung trả lời');
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
        this.toastService.showSuccess('Đã gửi phản hồi thành công!');
        this.consultationsData = data;
        this.replyingToQuestionId = null;
        this.consultationReplyContent = '';
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Reply consultation error:', err);
        this.toastService.showError('Lỗi gửi phản hồi. Vui lòng thử lại.');
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
    this.router.navigate(['/category/tra-cuu-benh', groupSlug]);
    this.cdr.detectChanges();
  }
}

