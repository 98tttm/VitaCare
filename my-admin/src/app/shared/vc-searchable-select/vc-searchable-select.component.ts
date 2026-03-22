import {
  Component,
  ElementRef,
  HostListener,
  Input,
  forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Chuẩn hóa để so khớp tiền tố (bỏ dấu, đ/Đ → d, chữ thường). */
export function vcNormalizeVnSearch(s: string): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

@Component({
  selector: 'vc-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vc-searchable-select.component.html',
  styleUrl: './vc-searchable-select.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => VcSearchableSelectComponent),
      multi: true,
    },
  ],
})
export class VcSearchableSelectComponent implements ControlValueAccessor {
  @Input() options: { value: string; label: string }[] = [];
  @Input() placeholder = '';
  @Input() filterPlaceholder = 'Gõ để tìm…';
  @Input() disabled = false;
  @Input() emptyFilterMessage = 'Không tìm thấy';

  value = '';
  filterText = '';
  open = false;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef<HTMLElement>) {}

  writeValue(v: string | null): void {
    this.value = v ?? '';
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  get selectedLabel(): string {
    const o = this.options.find((x) => x.value === this.value);
    return o?.label ?? '';
  }

  get filteredOptions(): { value: string; label: string }[] {
    const q = vcNormalizeVnSearch(this.filterText);
    if (!q) return this.options;
    return this.options.filter((o) => vcNormalizeVnSearch(o.label).startsWith(q));
  }

  toggle(ev: MouseEvent): void {
    ev.stopPropagation();
    if (this.disabled) return;
    this.open = !this.open;
    if (this.open) {
      this.filterText = '';
      this.onTouched();
    }
  }

  selectOption(opt: { value: string; label: string }, ev: MouseEvent): void {
    ev.stopPropagation();
    this.value = opt.value;
    this.onChange(this.value);
    this.open = false;
    this.filterText = '';
  }

  onFilterInput(ev: Event): void {
    ev.stopPropagation();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.open) return;
    const root = this.host.nativeElement;
    if (root.contains(ev.target as Node)) return;
    this.open = false;
    this.filterText = '';
  }
}
