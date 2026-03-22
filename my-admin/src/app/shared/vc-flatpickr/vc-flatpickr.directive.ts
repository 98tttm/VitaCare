import {
  AfterViewInit,
  DestroyRef,
  Directive,
  ElementRef,
  OnDestroy,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgControl } from '@angular/forms';
import flatpickr from 'flatpickr';
import { Vietnamese } from 'flatpickr/dist/l10n/vn';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';

/**
 * Thay native `<input type="date">` bằng Flatpickr — popup tùy chỉnh qua `vitacare-datepicker.css`.
 * Dùng với `[(ngModel)]` chuỗi `yyyy-MM-dd`.
 */
@Directive({
  selector: '[vcFlatpickr]',
  standalone: true,
  host: {
    autocomplete: 'off',
  },
})
export class VcFlatpickrDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private fp: FlatpickrInstance | null = null;

  ngAfterViewInit(): void {
    const input = this.el.nativeElement;
    const ctrl = this.ngControl?.control;
    const initial = (ctrl?.value ?? input.value ?? '') as string;

    this.fp = flatpickr(input, {
      dateFormat: 'Y-m-d',
      locale: Vietnamese,
      /** Lịch nằm trong `.flatpickr-wrapper` cạnh ô — cuộn modal thì bám theo ô, không lệch xuống body. */
      static: true,
      allowInput: true,
      disableMobile: true,
      defaultDate: initial?.trim() ? initial.trim() : undefined,
      onChange: (_dates: Date[], dateStr: string) => {
        if (ctrl) {
          ctrl.setValue(dateStr, { emitEvent: true });
          ctrl.markAsDirty();
        } else {
          input.value = dateStr;
        }
      },
    });

    ctrl?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      if (!this.fp) return;
      const str = v == null || v === '' ? '' : String(v).trim();
      const sel = this.fp.selectedDates[0];
      const cur = sel ? this.fp.formatDate(sel, 'Y-m-d') : '';
      if (str !== cur) {
        if (str) {
          this.fp.setDate(str, false);
        } else {
          this.fp.clear(false);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.fp?.destroy();
    this.fp = null;
  }
}
