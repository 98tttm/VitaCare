import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-product-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-gallery.html',
  styleUrl: './product-gallery.css'
})
export class ProductGallery implements OnChanges {
  @Input() product: any;
  @Input() selectedImage: string = '';
  @Output() imageSelected = new EventEmitter<string>();
  @Output() modalToggled = new EventEmitter<boolean>();

  isModalOpen = false;
  modalActiveIndex = 0;
  zoomLevel = 1;

  // Panning state
  isDragging = false;
  startX = 0;
  startY = 0;
  translateX = 0;
  translateY = 0;

  get allImages(): string[] {
    if (!this.product) return [];
    const gallery = this.product.gallery || [];
    return gallery.length > 0 ? gallery : [this.product.image];
  }

  get galleryThumbnails(): { url: string; isMore: boolean; moreCount: number; index: number }[] {
    const images = this.allImages;
    if (images.length <= 4) {
      return images.map((url, index) => ({ url, isMore: false, moreCount: 0, index }));
    }
    const visible = images.slice(0, 3).map((url, index) => ({ url, isMore: false, moreCount: 0, index }));
    visible.push({
      url: images[3],
      isMore: true,
      moreCount: images.length - 3,
      index: 3
    });
    return visible;
  }

  get visibleThumbnails(): string[] {
    return this.allImages.slice(0, 5);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && this.product && !this.selectedImage) {
      this.selectedImage = this.product.image;
    }
  }

  selectImage(img: string): void {
    this.selectedImage = img;
    this.imageSelected.emit(img);
  }

  openModal(): void {
    const images = this.allImages;
    this.modalActiveIndex = images.indexOf(this.selectedImage);
    if (this.modalActiveIndex === -1) this.modalActiveIndex = 0;
    this.resetZoomAndPan();
    this.isModalOpen = true;
    this.modalToggled.emit(true);
    document.body.style.overflow = 'hidden'; // Lock scroll
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.modalToggled.emit(false);
    document.body.style.overflow = ''; // Unlock scroll
    this.isDragging = false;
  }

  resetZoomAndPan(): void {
    this.zoomLevel = 1;
    this.translateX = 0;
    this.translateY = 0;
  }

  onWheel(event: WheelEvent): void {
    if (!this.isModalOpen) return;

    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.2 : 0.2;
    const oldZoom = this.zoomLevel;
    this.zoomLevel = Math.min(Math.max(1, this.zoomLevel + delta), 3);

    if (this.zoomLevel === 1) {
      this.translateX = 0;
      this.translateY = 0;
    }
  }

  // Panning Methods
  startDragging(event: MouseEvent): void {
    if (this.zoomLevel <= 1) return;
    this.isDragging = true;
    this.startX = event.clientX - this.translateX;
    this.startY = event.clientY - this.translateY;
    event.preventDefault();
  }

  onDragging(event: MouseEvent): void {
    if (!this.isDragging) return;
    this.translateX = event.clientX - this.startX;
    this.translateY = event.clientY - this.startY;
  }

  stopDragging(): void {
    this.isDragging = false;
  }

  nextImage(e?: Event): void {
    if (e) e.stopPropagation();
    const images = this.allImages;
    this.resetZoomAndPan();

    if (this.isModalOpen) {
      this.modalActiveIndex = (this.modalActiveIndex + 1) % images.length;
    } else {
      const currentIndex = images.indexOf(this.selectedImage);
      const nextIndex = (currentIndex + 1) % images.length;
      this.selectImage(images[nextIndex]);
    }
  }

  prevImage(e?: Event): void {
    if (e) e.stopPropagation();
    const images = this.allImages;
    this.resetZoomAndPan();

    if (this.isModalOpen) {
      this.modalActiveIndex = (this.modalActiveIndex - 1 + images.length) % images.length;
    } else {
      const currentIndex = images.indexOf(this.selectedImage);
      const prevIndex = (currentIndex - 1 + images.length) % images.length;
      this.selectImage(images[prevIndex]);
    }
  }

  selectModalImage(index: number): void {
    this.modalActiveIndex = index;
    this.resetZoomAndPan();
  }
}
