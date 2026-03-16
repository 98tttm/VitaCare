import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

type DatePickerView = 'day' | 'month' | 'year';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.css',
})
export class DatePickerComponent implements OnInit {
  /** Giá trị ngày ở dạng chuỗi ISO yyyy-MM-dd */
  @Input() value: string | null = null;
  /** Placeholder text */
  @Input() placeholder = 'dd/mm/yyyy';
  /** Label hiển thị trên header (nếu muốn override) */
  @Input() label = '';

  @Output() valueChange = new EventEmitter<string | null>();

  showCalendar = false;
  viewYear = 0;
  viewMonth = 0; // 0-11
  viewMode: DatePickerView = 'day';

  weeks: Array<Array<{ day: number | null; dateKey: string | null }>> = [];

  ngOnInit(): void {
    let base = this.value ? new Date(this.value) : new Date();
    if (isNaN(base.getTime())) {
      base = new Date();
    }
    this.viewYear = base.getFullYear();
    this.viewMonth = base.getMonth();
    this.buildCalendar();
  }

  get monthLabel(): string {
    const month = this.viewMonth + 1;
    return `${month.toString().padStart(2, '0')}/${this.viewYear}`;
  }

  toggleCalendar(): void {
    this.showCalendar = !this.showCalendar;
    if (this.showCalendar) {
      this.viewMode = 'day';
    }
  }

  closeCalendar(): void {
    this.showCalendar = false;
  }

  prevMonth(): void {
    if (this.viewMode === 'year') {
      this.viewYear -= 12;
      return;
    }
    if (this.viewMode === 'month') {
      this.viewYear--;
      return;
    }
    if (this.viewMonth === 0) {
      this.viewMonth = 11;
      this.viewYear--;
    } else {
      this.viewMonth--;
    }
    this.buildCalendar();
  }

  nextMonth(): void {
    if (this.viewMode === 'year') {
      this.viewYear += 12;
      return;
    }
    if (this.viewMode === 'month') {
      this.viewYear++;
      return;
    }
    if (this.viewMonth === 11) {
      this.viewMonth = 0;
      this.viewYear++;
    } else {
      this.viewMonth++;
    }
    this.buildCalendar();
  }

  selectDate(cell: { day: number | null; dateKey: string | null }): void {
    if (!cell.dateKey) return;
    this.value = cell.dateKey;
    this.valueChange.emit(this.value);
    this.showCalendar = false;
  }

  selectMonth(monthIndex: number): void {
    this.viewMonth = monthIndex;
    this.viewMode = 'day';
    this.buildCalendar();
  }

  selectYear(year: number): void {
    this.viewYear = year;
    this.viewMode = 'month';
  }

  goToYearMode(): void {
    this.viewMode = 'year';
  }

  goToMonthMode(): void {
    this.viewMode = 'month';
  }

  isSelected(cell: { dateKey: string | null }): boolean {
    return !!cell.dateKey && this.value === cell.dateKey;
  }

  get displayValue(): string {
    if (!this.value) return '';
    const d = new Date(this.value);
    if (isNaN(d.getTime())) return '';
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private buildCalendar(): void {
    const firstDay = new Date(this.viewYear, this.viewMonth, 1);
    const startDay = (firstDay.getDay() + 6) % 7; // convert Sunday=0 -> 6, Monday=1 -> 0
    const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();

    const cells: Array<{ day: number | null; dateKey: string | null }> = [];

    for (let i = 0; i < startDay; i++) {
      cells.push({ day: null, dateKey: null });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(this.viewYear, this.viewMonth, d);
      const yyyy = date.getFullYear();
      const mm = (date.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.toString().padStart(2, '0');
      cells.push({ day: d, dateKey: `${yyyy}-${mm}-${dd}` });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ day: null, dateKey: null });
    }

    this.weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      this.weeks.push(cells.slice(i, i + 7));
    }
  }
}

