import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BuyNowService {
  buyNow(_item: any, _quantity: number): void {
    // Admin quick view reuses user UI; buy-now action is intentionally no-op.
  }
}
