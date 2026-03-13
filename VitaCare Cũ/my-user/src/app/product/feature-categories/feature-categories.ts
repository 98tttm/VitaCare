import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-feature-categories',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './feature-categories.html',
  styleUrl: './feature-categories.css',
})
export class FeatureCategories implements AfterViewInit, OnChanges {
  @Input() subCategories: any[] = [];
  @Input() layoutMode: 'slider' | 'grid' = 'slider';
  @Output() categorySelected = new EventEmitter<any>();
  @ViewChild('sliderContainer') sliderContainer!: ElementRef;

  showPrev = false;
  showNext = true;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['subCategories'] && !changes['subCategories'].firstChange) {
      setTimeout(() => this.checkScroll(), 100);
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.checkScroll();
    }, 100);
  }

  checkScroll() {
    const el = this.sliderContainer.nativeElement;
    this.showPrev = el.scrollLeft > 0;
    // Tolerance of 1px for float calculations
    this.showNext = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  }

  scrollRight() {
    this.sliderContainer.nativeElement.scrollBy({ left: 300, behavior: 'smooth' });
  }

  scrollLeft() {
    this.sliderContainer.nativeElement.scrollBy({ left: -300, behavior: 'smooth' });
  }

  onSelect(sub: any) {
    this.categorySelected.emit(sub);
  }
}
