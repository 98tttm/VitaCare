import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CartAnimationService {
  flyToCart(_fromElement: HTMLElement): void {
    // Admin quick view reuses user UI; animation is intentionally disabled here.
  }
}
