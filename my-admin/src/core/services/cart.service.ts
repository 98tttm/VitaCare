import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CartService {
  addItem(_item: any, _quantity: number): void {
    // Admin quick view reuses user UI; cart action is intentionally no-op here.
  }
}
