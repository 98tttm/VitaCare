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

  isModalOpen = false;
  modalActiveIndex = 0;

  get allImages(): string[] {
    if (!this.product) return [];
    const gallery = this.product.gallery || [];
    return gallery.length > 0 ? gallery : [this.product.image];
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
    this.isModalOpen = true;
    document.body.style.overflow = 'hidden'; // Lock scroll
  }

  closeModal(): void {
    this.isModalOpen = false;
    document.body.style.overflow = ''; // Unlock scroll
  }

  nextImage(e?: Event): void {
    if (e) e.stopPropagation();
    const images = this.allImages;

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
  }
}
