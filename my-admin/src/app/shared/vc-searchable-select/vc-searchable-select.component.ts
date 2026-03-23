import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
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
  @Input() options: { value: any; label: string }[] = [];
  @Input() placeholder = '';
  @Input() filterPlaceholder = 'Gõ để tìm…';
  @Input() disabled = false;
  @Input() emptyFilterMessage = 'Không tìm thấy';
  /** true: ô nhập + sổ gợi ý HTML (combobox) */
  @Input() allowCustomValue = false;

  @Output() readonly inputBlur = new EventEmitter<void>();

  value: any = '';
  filterText = '';
  open = false;

  /** Đóng panel sau blur ô combobox (tránh chọn option bị đóng sớm). */
  private vcBlurCloseTimer: ReturnType<typeof setTimeout> | null = null;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef<HTMLElement>) {}

  writeValue(v: any): void {
    this.value = v ?? '';
  }

  registerOnChange(fn: (v: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  get selectedLabel(): string {
    const o = this.options.find((x) => Object.is(x.value, this.value));
    return o?.label ?? '';
  }

  get filteredOptions(): { value: any; label: string }[] {
    const raw = this.allowCustomValue ? String(this.value ?? '') : this.filterText;
    const q = vcNormalizeVnSearch(raw);
    if (!q) return this.options;
    return this.options.filter((o) =>
      this.allowCustomValue
        ? vcNormalizeVnSearch(o.label).includes(q)
        : vcNormalizeVnSearch(o.label).startsWith(q),
    );
  }

  toggle(ev: MouseEvent): void {
    ev.stopPropagation();
    if (this.disabled) return;
    this.clearVcBlurTimer();
    this.open = !this.open;
    if (this.open) {
      if (!this.allowCustomValue) this.filterText = '';
      this.onTouched();
    }
  }

  /** Combobox: giữ focus khi bấm mũi tên */
  onToggleMouseDown(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.disabled) return;
    this.clearVcBlurTimer();
    this.open = !this.open;
    if (this.open) this.onTouched();
  }

  onComboboxValueChange(v: string): void {
    this.value = v;
    this.onChange(v);
  }

  onComboboxFocus(): void {
    this.clearVcBlurTimer();
    this.open = true;
    this.onTouched();
  }

  onComboboxBlur(): void {
    this.clearVcBlurTimer();
    this.vcBlurCloseTimer = setTimeout(() => {
      this.vcBlurCloseTimer = null;
      this.open = false;
      this.inputBlur.emit();
    }, 180);
  }

  private clearVcBlurTimer(): void {
    if (this.vcBlurCloseTimer != null) {
      clearTimeout(this.vcBlurCloseTimer);
      this.vcBlurCloseTimer = null;
    }
  }

  selectOption(opt: { value: any; label: string }, ev: MouseEvent): void {
    ev.stopPropagation();
    this.clearVcBlurTimer();
    this.value = opt.value;
    this.onChange(this.value);
    this.open = false;
    this.filterText = '';
  }

  onOptionMouseDown(opt: { value: any; label: string }, ev: MouseEvent): void {
    ev.preventDefault();
    this.selectOption(opt, ev);
  }

  onFilterInput(ev: Event): void {
    ev.stopPropagation();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.open) return;
    const root = this.host.nativeElement;
    if (root.contains(ev.target as Node)) return;
    this.clearVcBlurTimer();
    this.open = false;
    this.filterText = '';
  }
}
