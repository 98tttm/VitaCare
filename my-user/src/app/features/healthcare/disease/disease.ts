import { Component, OnInit, ChangeDetectorRef, NgZone, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiseaseService } from '../../../core/services/disease.service';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  BODY_PART_ICONS,
  GROUP_ICON_MAP,
  GROUP_ICON_DEFAULT,
  GROUP_BANNER_MAP,
  BODY_IMAGE,
  ICON_FALLBACK
} from './disease-icon';

interface BodyPart {
  name: string;
  slug: string;
  icon: string;
  pos3d?: THREE.Vector3;
  screenX?: number;
  screenY?: number;
}

@Component({
  selector: 'app-disease',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './disease.html',
  styleUrl: './disease.css',
})
export class Disease implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('threeContainer') threeContainer!: ElementRef;
  @ViewChild('revealElement') revealElement!: ElementRef;
  @ViewChild('revealElementMain') revealElementMain!: ElementRef;
  @ViewChild('revealCards') revealCards!: ElementRef;
  @ViewChild('revealGroups') revealGroups!: ElementRef;

  // === 3D Anatomy State ===
  loading3D: boolean = true;
  isDetailVisible: boolean = false; // Mới: kiểm soát việc dịch con người sang trái
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private anatomyModel: THREE.Group | null = null;
  private animationId: number | null = null;
  // === STATE 1: Tra cứu theo bộ phận (Trang chính) ===
  bodyDiseases: any[] = [];
  bodyLoading: boolean = false;
  selectedBodyPart: string = 'dau';
  bodyCurrentPage: number = 1;
  bodyTotalPages: number = 1;
  bodyTotalCount: number = 0;

  // === UI & Shared ===
  diseaseGroups: any[] = [];
  visibleGroupLimit: number = 8; /* Số lượng nhóm hiển thị ban đầu */
  totalGroupsCount: number = 0;
  pageSize: number = 20;
  bodyImage = BODY_IMAGE;
  iconFallback = ICON_FALLBACK;
  bodyParts: BodyPart[] = BODY_PART_ICONS.map(p => ({ ...p }));

  get bodyPagination(): (number | string)[] {
    const current = this.bodyCurrentPage;
    const total = this.bodyTotalPages;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, 4, '...', total];
    if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  private routeSub: Subscription | null = null;
  private observer: IntersectionObserver | null = null;

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
    this.fetchBodyDiseases(1, 'dau');
  }

  ngAfterViewInit(): void {
    // Init 3D immediately
    this.initThreeJS();

    // Scroll Reveal Intersection Observer
    this.initScrollReveal();

    // Use window scroll listener since we removed the double scroll container
    window.addEventListener('scroll', () => {
      const header = document.querySelector('.vc_header');
      if (header) {
        // If scrolled down even a little bit on the window, compact the header
        if (window.scrollY > 50) {
          header.classList.add('vc_header_compact');
          (window as any).isDiseaseAnatomyView = true;
        } else {
          header.classList.remove('vc_header_compact');
          (window as any).isDiseaseAnatomyView = false;
        }
      }
    });

    // Auto-scroll to Session 2 when the user scrolls past Session 1
    let hasAutoScrolled = false;
    const heroSection = document.querySelector('.vc_hero_session');
    const anatomySection = document.getElementById('anatomy-session');
    if (heroSection && anatomySection) {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          // When hero is less than 20% visible (scrolled past it) -- auto jump to anatomy
          if (!hasAutoScrolled && entry.intersectionRatio < 0.2 && window.scrollY > 100) {
            hasAutoScrolled = true;
            anatomySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Re-enable after 2s so coming back works
            setTimeout(() => { hasAutoScrolled = false; }, 2000);
          }
        },
        { threshold: [0, 0.2, 0.5, 1.0] }
      );
      observer.observe(heroSection);
    }

  }


  // ==========================================
  // LOGIC 3D ANATOMY (THREE.JS)
  // ==========================================

  private initThreeJS(): void {
    const container = this.threeContainer.nativeElement;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 600;

    // 1. Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = null;

    const fov = 45;
    const aspect = width / height;
    const near = 0.1;
    const far = 1000;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.set(0, 0.9, 3.8); // Pull back to see the full body (head to toe)

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0); // Đảm bảo trong suốt để thấy nền CSS
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // 3. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    this.scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(-5, 5, -5);
    this.scene.add(backLight);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = false;
    this.controls.enabled = false;
    this.controls.target.set(0, 0.9, 0); // Center on the mid-body for whole-person view

    // Auto Motion
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 2.5; // Tăng tốc độ quay
    this.controls.enablePan = false; // Khóa di chuyển ngang để giữ model ở giữa

    // 5. Initialize Marker Positions (Estimated based on 1.8m model)
    this.setupMarkerPoints();

    // 6. Load Model
    this.loadAnatomyModel();

    // 7. Listeners
    window.addEventListener('resize', this.onWindowResize.bind(this));
    this.renderer.domElement.addEventListener('click', this.onCanvasClick.bind(this));

    // Enable zoom only when mouse is directly over the 3D model - otherwise let page scroll
    this.renderer.domElement.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.anatomyModel || !this.camera || !this.controls) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const hoverMouse = new THREE.Vector2(mouseX, mouseY);
      this.raycaster.setFromCamera(hoverMouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.anatomyModel.children, true);
      // Enable zoom and controls only when hovering the 3D model
      this.controls.enableZoom = intersects.length > 0;
      this.controls.enabled = intersects.length > 0;
    });

    // Re-enable controls when mouse leaves the canvas
    this.renderer.domElement.addEventListener('mouseleave', () => {
      if (this.controls) {
        this.controls.enableZoom = false;
        this.controls.enabled = false; // Disable all controls when not hovering model
      }
    });

    this.animate();
  }

  private setupMarkerPoints(): void {
    const markerMap: { [key: string]: THREE.Vector3 } = {
      'Đầu': new THREE.Vector3(0, 1.68, 0.08),
      'Cổ': new THREE.Vector3(0, 1.50, 0.10),
      'Ngực': new THREE.Vector3(0, 1.32, 0.12),
      'Bụng': new THREE.Vector3(-0.04, 1.10, 0.12),
      'Sinh dục': new THREE.Vector3(-0.04, 0.88, 0.15),
      'Tứ chi': new THREE.Vector3(0.45, 0.95, 0.08),
      'Da': new THREE.Vector3(-0.42, 1.15, 0.1),
    };

    this.bodyParts.forEach(part => {
      (part as any).pos3d = markerMap[part.name] || new THREE.Vector3(0, 0, 0);
      (part as any).screenX = 0;
      (part as any).screenY = 0;
    });
  }

  private loadAnatomyModel(): void {
    const loader = new GLTFLoader();
    const modelPath = 'assets/models/body-human.glb';

    console.log('Starting to load model from:', modelPath);
    loader.load(
      modelPath,
      (gltf: GLTF) => {
        console.log('Model loaded successfully:', gltf);
        const loadedModel = gltf.scene;
        this.anatomyModel = loadedModel;

        // Căn chỉnh mô hình chuyên nghiệp: Tự động zoom vừa khít khung hình
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // 1. Đưa mô hình về trung tâm hệ tọa độ (x=0, z=0) và đặt chân tại y=0
        loadedModel.position.x = -center.x;
        loadedModel.position.z = -center.z;
        loadedModel.position.y = -box.min.y;

        // 2. Xoay mô hình sang trái một chút giống ảnh mẫu (khoảng -30 độ)
        loadedModel.rotation.y = -Math.PI / 6;

        // 3. Phóng to và căn chỉnh theo không gian mới (vì đã xóa text)
        // Nâng target lên một chút (từ 0.45 lên 0.5) để tâm nhìn cao hơn, tránh cắt đầu
        const modelCenterY = size.y * 0.5;
        this.controls.target.set(0, modelCenterY, 0);

        // Thu nhỏ mô hình một chút (giảm từ 1.0 xuống 0.85) để không bị chạm sát mép
        const fov = this.camera.fov;
        const heightToFit = size.y / 0.85;
        const distance = (heightToFit / 2) / Math.tan((fov * Math.PI) / 360);

        // Giữ góc camera ổn định
        const angleDown = 25 * Math.PI / 180;
        this.camera.position.set(0, modelCenterY + distance * Math.sin(angleDown), distance * Math.cos(angleDown));
        this.camera.updateProjectionMatrix();
        this.controls.update();


        this.scene.add(loadedModel);
        this.loading3D = false;
        this.cdr.detectChanges();
      },
      undefined,
      (error: unknown) => {
        console.error('Error loading 3D model:', error);
        this.loading3D = false;
        this.cdr.detectChanges();
      }
    );
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));

    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
      this.updateMarkers();
    }
  }

  private updateMarkers(): void {
    if (!this.camera || !this.renderer) return;

    let markersUpdated = false;
    this.bodyParts.forEach(part => {
      const p = part as any;
      if (p.pos3d) {
        const vector = p.pos3d.clone();
        vector.project(this.camera);

        const x = (vector.x * 0.5 + 0.5) * 100;
        const y = (1 - (vector.y * 0.5 + 0.5)) * 100;

        // Chỉ hiện nếu marker ở phía trước camera
        if (vector.z < 1) {
          if (p.screenX !== x || p.screenY !== y) {
            p.screenX = x;
            p.screenY = y;
            markersUpdated = true;
          }
        } else {
          if (p.screenX !== undefined) {
            p.screenX = undefined;
            markersUpdated = true;
          }
        }
      }
    });

    if (markersUpdated) {
      this.cdr.detectChanges();
    }
  }

  scrollToSession2(): void {
    const session2 = document.getElementById('anatomy-session');
    if (session2) {
      session2.scrollIntoView({ behavior: 'smooth' });
      // Force header compact immediately on click
      const header = document.querySelector('.vc_header');
      if (header) {
        header.classList.add('vc_header_compact');
        (window as any).isDiseaseAnatomyView = true;
      }
    }
  }

  scrollToSession3(): void {
    const session3 = document.getElementById('specialties-session');
    if (session3) {
      session3.scrollIntoView({ behavior: 'smooth' });
      const header = document.querySelector('.vc_header');
      if (header) {
        header.classList.add('vc_header_compact');
        (window as any).isDiseaseAnatomyView = true;
      }
    }
  }

  private onWindowResize(): void {
    if (!this.camera || !this.renderer || !this.threeContainer) return;
    const container = this.threeContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private onCanvasClick(event: MouseEvent): void {
    if (!this.renderer || !this.camera || !this.anatomyModel) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.anatomyModel.children, true);

    if (intersects.length > 0) {
      // Dừng auto rotate khi user can thiệp
      this.controls.autoRotate = false;

      const clickedObject = intersects[0].object;
      this.handle3DPartClick(clickedObject.name);
    }
  }

  private handle3DPartClick(meshName: string): void {
    const name = meshName.toLowerCase();
    let slug = '';

    if (name.includes('head') || name.includes('skull') || name.includes('brain')) {
      slug = 'dau';
    } else if (name.includes('neck')) {
      slug = 'co';
    } else if (name.includes('chest') || name.includes('lung') || name.includes('heart')) {
      slug = 'nguc';
    } else if (name.includes('abdomen') || name.includes('stomach') || name.includes('belly') || name.includes('intestine')) {
      slug = 'bung';
    } else if (name.includes('genital') || name.includes('pelvis')) {
      slug = 'sinh-duc';
    } else if (name.includes('arm') || name.includes('leg') || name.includes('hand') || name.includes('foot') || name.includes('limb')) {
      slug = 'tu-chi';
    } else if (name.includes('skin')) {
      slug = 'da';
    }

    if (slug) {
      const part = this.bodyParts.find(p => p.slug === slug);
      if (part) this.onBodyPartSelect(part);
    }
  }

  // ==========================================
  // LOGIC BỘ PHẬN CƠ THỂ (TRANG CHÍNH)
  // ==========================================

  onBodyPartSelect(part: BodyPart): void {
    if (this.selectedBodyPart === part.slug && this.bodyDiseases.length > 0) return;

    this.selectedBodyPart = part.slug;
    this.bodyCurrentPage = 1;
    this.fetchBodyDiseases(1, part.slug);
  }

  closeDetailView(): void {
    this.isDetailVisible = false;
  }

  fetchBodyDiseases(page: number, slug?: string): void {
    if (slug) {
      this.selectedBodyPart = slug;
    }
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


  // Đã xóa các method của focused mode cũ

  // ==========================================
  // SHARED HELPERS
  // ==========================================

  fetchDiseaseGroups(): void {
    this.diseaseService.getDiseaseGroups().subscribe(groups => {
      this.ngZone.run(() => {
        this.diseaseGroups = groups.map(g => ({ ...g, diseaseCount: 0 }));
        this.totalGroupsCount = groups.length;

        // Fetch real counts for each group
        this.diseaseGroups.forEach(group => {
          this.diseaseService.getDiseases({ groupSlug: group.slug, limit: 1 }).subscribe(res => {
            group.diseaseCount = res.total;
            this.cdr.detectChanges();
          });
        });

        this.cdr.detectChanges();
        setTimeout(() => this.initScrollReveal(), 500);
      });
    });
  }

  get visibleGroups(): any[] {
    return this.diseaseGroups.slice(0, this.visibleGroupLimit);
  }

  onGroupSelect(groupSlug: string): void {
    if (!groupSlug) return;
    this.router.navigate(['/category/tra-cuu-benh', groupSlug]);
  }

  onLoadMoreGroups(): void {
    const totalRemaining = this.totalGroupsCount - this.visibleGroupLimit;
    const increment = Math.min(4, totalRemaining);
    this.visibleGroupLimit += increment;

    // Smooth reveal for new items
    setTimeout(() => this.initScrollReveal(), 100);
  }

  get remainingGroupsToLoad(): number {
    return Math.max(0, this.totalGroupsCount - this.visibleGroupLimit);
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

  goToDetail(id: any): void {
    if (!id) return;
    this.router.navigate(['/benh', id]);
  }

  viewDetail(disease: any): void {
    if (!disease) return;
    let raw = disease.slug ?? disease.id ?? disease._id;
    if (raw === undefined || raw === null) return;
    let id = String(raw).trim();
    if (!id) return;
    // Chuẩn hoá slug giống logic trong DiseaseDetails.goToDiseaseBySlug
    if (id.startsWith('benh/')) {
      id = id.replace(/^benh\//, '');
    }
    if (id.endsWith('.html')) {
      id = id.replace(/\.html$/, '');
    }
    this.router.navigate(['/benh', id], { state: { disease } });
  }

  goHome(e: Event): void {
    e.preventDefault();
    this.router.navigate(['/']);
  }

  initScrollReveal(): void {
    const options = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    if (this.observer) this.observer.disconnect();

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.ngZone.run(() => {
            entry.target.classList.add('active');
          });
        }
      });
    }, options);

    if (this.revealElement) this.observer.observe(this.revealElement.nativeElement);
    if (this.revealElementMain) this.observer.observe(this.revealElementMain.nativeElement);

    // Hero Cards
    if (this.revealCards) {
      const cards = this.revealCards.nativeElement.querySelectorAll('.vc_reveal_element');
      cards.forEach((card: HTMLElement, index: number) => {
        card.style.transitionDelay = `${index * 0.15}s`;
        this.observer?.observe(card);
      });
    }

    // Disease Group Cards
    if (this.revealGroups) {
      const gCards = this.revealGroups.nativeElement.querySelectorAll('.vc_reveal_element');
      gCards.forEach((card: HTMLElement, index: number) => {
        // Avoid resetting delay of already revealed cards if possible, 
        // but simple delay based on index is fine for this bouncy effect
        const baseIndex = index % 8;
        card.style.transitionDelay = `${baseIndex * 0.1}s`;
        this.observer?.observe(card);
      });
    }
  }

  scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  }
}
