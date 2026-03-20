import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class BlogQuickViewService {
    private _visible = signal<boolean>(false);
    private _blog = signal<any>(null);

    visible = this._visible.asReadonly();
    blog = this._blog.asReadonly();

    open(blog: any) {
        this._blog.set(blog);
        this._visible.set(true);
    }

    close() {
        this._visible.set(false);
        // Clear blog after animation
        setTimeout(() => {
            if (!this._visible()) {
                this._blog.set(null);
            }
        }, 300);
    }
}
