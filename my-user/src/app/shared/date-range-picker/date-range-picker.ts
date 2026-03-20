import { Component, EventEmitter, Input, OnInit, Output, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

type DatePickerView = 'day' | 'month' | 'year';

@Component({
    selector: 'app-date-range-picker',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './date-range-picker.html',
    styleUrl: './date-range-picker.css',
})
export class DateRangePickerComponent implements OnInit {
    @Input() startDate: string | null = null;
    @Input() endDate: string | null = null;
    @Input() placeholder = 'Từ ngày - Đến ngày';
    @Input() disabled = false;
    /** Ngày tối thiểu có thể chọn (YYYY-MM-DD). Những ngày trước sẽ bị khóa */
    @Input() minDate: string | null = null;

    @Output() startDateChange = new EventEmitter<string | null>();
    @Output() endDateChange = new EventEmitter<string | null>();

    showCalendar = false;
    viewYear = 0;
    viewMonth = 0;
    viewMode: DatePickerView = 'day';

    hoverDateKey: string | null = null;
    selectingPhase: 'start' | 'end' = 'start';

    weeks: Array<Array<{ day: number | null; dateKey: string | null }>> = [];

    @ViewChild('container') containerRef!: ElementRef;

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.containerRef?.nativeElement.contains(event.target)) {
            this.closeCalendar();
        }
    }

    ngOnInit(): void {
        let base = this.startDate ? new Date(this.startDate) : new Date();
        if (isNaN(base.getTime())) {
            base = new Date();
        }
        this.viewYear = base.getFullYear();
        this.viewMonth = base.getMonth();
        this.buildCalendar();
    }

    get monthLabel(): string {
        const monthStr = (this.viewMonth + 1).toString().padStart(2, '0');
        return `${monthStr}/${this.viewYear}`;
    }

    get displayValue(): string {
        const format = (dStr: string | null) => {
            if (!dStr) return '';
            const parts = dStr.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return dStr;
        };
        if (!this.startDate && !this.endDate) return '';
        const start = format(this.startDate);
        const end = format(this.endDate);
        if (this.startDate && !this.endDate) return `${start} - ...`;
        return `${start} - ${end}`;
    }

    toggleCalendar(): void {
        if (this.disabled) return;
        this.showCalendar = !this.showCalendar;
        if (this.showCalendar) {
            this.viewMode = 'day';
            if (!this.startDate) {
                this.selectingPhase = 'start';
            } else if (!this.endDate) {
                this.selectingPhase = 'end';
            } else {
                this.selectingPhase = 'start'; // reset if both exist
            }
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

    selectMonth(monthIndex: number): void {
        this.viewMonth = monthIndex;
        this.viewMode = 'day';
        this.buildCalendar();
    }

    selectYear(year: number): void {
        this.viewYear = year;
        this.viewMode = 'month';
    }

    goToYearMode(): void { this.viewMode = 'year'; }
    goToMonthMode(): void { this.viewMode = 'month'; }

    onCellHover(dateKey: string | null): void {
        if (!dateKey || this.disabled) return;
        this.hoverDateKey = dateKey;
    }

    onCellLeave(): void {
        this.hoverDateKey = null;
    }

    selectDate(cell: { day: number | null; dateKey: string | null }): void {
        if (this.disabled || !cell.dateKey) return;
        // Khóa ngày trước minDate
        if (this.minDate && cell.dateKey < this.minDate) return;

        if (this.selectingPhase === 'start') {
            this.startDate = cell.dateKey;
            this.startDateChange.emit(this.startDate);
            this.endDate = null;
            this.endDateChange.emit(null);
            this.selectingPhase = 'end';
        } else {
            if (cell.dateKey < this.startDate!) {
                // Clicked before start date, update start date instead
                this.startDate = cell.dateKey;
                this.startDateChange.emit(this.startDate);
            } else {
                this.endDate = cell.dateKey;
                this.endDateChange.emit(this.endDate);
                this.selectingPhase = 'start';
                this.closeCalendar();
            }
        }
    }

    isStart(dateKey: string | null): boolean {
        return !!dateKey && dateKey === this.startDate;
    }

    isEnd(dateKey: string | null): boolean {
        return !!dateKey && dateKey === this.endDate;
    }

    hasEnd(): boolean {
        return !!this.endDate;
    }

    isPast(dateKey: string | null): boolean {
        if (!dateKey || !this.minDate) return false;
        return dateKey < this.minDate;
    }

    inRange(dateKey: string | null): boolean {
        if (!dateKey || !this.startDate || !this.endDate) return false;
        return dateKey > this.startDate && dateKey < this.endDate;
    }

    isSameAsStartAndEnd(dateKey: string | null): boolean {
        return !!dateKey && dateKey === this.startDate && dateKey === this.endDate;
    }

    private buildCalendar(): void {
        const firstDay = new Date(this.viewYear, this.viewMonth, 1);
        const startDay = (firstDay.getDay() + 6) % 7;
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
