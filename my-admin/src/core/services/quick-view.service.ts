import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class QuickViewService {
    private _visible = signal<boolean>(false);
    private _product = signal<any>(null);
    private _quantity = signal<number>(1);

    visible = this._visible.asReadonly();
    product = this._product.asReadonly();
    quantity = this._quantity.asReadonly();

    open(product: any) {
        this._product.set(product);
        this._quantity.set(1);
        this._visible.set(true);
    }

    close() {
        this._visible.set(false);
        // Optional: clear product after animation
        setTimeout(() => {
            if (!this._visible()) {
                this._product.set(null);
            }
        }, 300);
    }

    updateQuantity(val: number) {
        if (val < 1) return;
        this._quantity.set(val);
    }
}
