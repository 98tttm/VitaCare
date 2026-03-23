import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class QuickViewService {
  private readonly _visible = signal<boolean>(false);
  private readonly _product = signal<any>(null);
  private readonly _quantity = signal<number>(1);

  readonly visible = this._visible.asReadonly();
  readonly product = this._product.asReadonly();
  readonly quantity = this._quantity.asReadonly();

  open(product: any): void {
    this._product.set(product);
    this._quantity.set(1);
    this._visible.set(true);
  }

  close(): void {
    this._visible.set(false);
    setTimeout(() => {
      if (!this._visible()) {
        this._product.set(null);
      }
    }, 300);
  }

  updateQuantity(val: number): void {
    if (val < 1) return;
    this._quantity.set(val);
  }
}
