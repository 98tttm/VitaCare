import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  HostListener,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { DateRangePickerComponent } from '../../../shared/date-range-picker/date-range-picker';
import { AuthService } from '../../../core/services/auth.service';
import {
  ReminderService,
  Reminder,
  ReminderCreate,
} from '../../../core/services/reminder.service';
import { ToastService } from '../../../core/services/toast.service';
import { CoinService } from '../../../core/services/coin.service';

const WEEK_DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function formatDateForDisplay(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Khớp chuẩn ngày với backend (2026-3-20 → 2026-03-20) */
function normalizeCalendarYmd(s: string | null | undefined): string {
  const m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return String(s || '').slice(0, 10);
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function pruneSkippedDatesInRange(
  skipped: string[] | undefined,
  startKey: string,
  endKey: string
): string[] {
  return (skipped || [])
    .map((x) => normalizeCalendarYmd(String(x)))
    .filter((x) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= startKey && x <= endKey);
}

function compareDateKey(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Kiểm tra xem một lời nhắc có áp dụng cho ngày cụ thể không (gồm dải ngày và tần suất) */
function reminderAppliesOnDate(r: Reminder, dateObj: Date): boolean {
  const start = new Date(r.start_date);
  const end = new Date(r.end_date);
  // Zero out time for precise day comparison
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  // Strictly within [start, end]
  if (d < s || d > e) return false;

  const dk = toDateKey(dateObj);
  const skipNorm = (x: string) => normalizeCalendarYmd(String(x));
  if ((r.skipped_dates || []).some((x) => skipNorm(x) === dk)) {
    return false;
  }

  // Calculate day difference for frequency logic
  const diffDays = Math.round((d.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));

  switch (r.frequency) {
    case 'Once':
      return diffDays === 0;
    case 'Every 2 days':
      return diffDays % 2 === 0;
    case 'Weekly':
      return diffDays % 7 === 0;
    case 'Monthly':
      return d.getDate() === s.getDate();
    case 'Daily':
    default:
      return true;
  }
}

const WHEEL_ITEM_HEIGHT = 36;
const WHEEL_VISIBLE_HEIGHT = 180;

@Component({
  selector: 'app-remind',
  standalone: true,
  imports: [CommonModule, FormsModule, DateRangePickerComponent],
  templateUrl: './remind.html',
  styleUrl: './remind.css',
})
export class Remind implements OnInit, AfterViewChecked {
  private auth = inject(AuthService);
  private reminderApi = inject(ReminderService);
  private toast = inject(ToastService);
  private coinService = inject(CoinService);
  private http = inject(HttpClient);

  reminders = signal<Reminder[]>([]);
  loading = signal(true);
  loadError = signal<string | null>(null);

  /** Ngày đang được chọn (dùng cho popup tạo / chi tiết) */
  selectedDate = signal<Date>(new Date());
  dateKey = computed(() => toDateKey(this.selectedDate()));

  /** Tháng đang hiển thị trên calendar (set về ngày 1 để dễ tính toán) */
  currentMonth = signal<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  showCreatePopup = signal(false);
  showDetailPopup = signal<Reminder | null>(null);
  showDiaryPopup = signal(false);
  diarySelectedDate = signal<string>(toDateKey(new Date()));
  showDeleteConfirm = signal(false);
  showRewardMissionPopup = signal(false);
  rewardMissionMessage = signal('');
  rewardMissionTargetDate = signal<string | null>(null);
  deleteTarget = signal<Reminder | null>(null);
  deleteContextDate = signal<string | null>(null);
  /** Khi chỉnh từ Nhật ký (contextDate), khóa start_date không cho chọn trước contextDate */
  editMinStartDate = signal<string | null>(null);
  /** Lưu key nút bút đang active trong popup Nhật ký */
  activeDiaryEditKey = signal<string | null>(null);
  isEditMode = signal(false);
  editingId = signal<string | null>(null);
  uploadingImage = signal(false);
  imageUploadError = signal<string | null>(null);

  /** Thưởng xu hiển thị trong nhật ký: khớp lịch chính (6 ngày) khi có preview, không thì fallback. */
  nextRewardAmount = computed(() => {
    const dk = this.diarySelectedDate();
    return this.coinService.getCalendarCoinPreview(dk) ?? this.coinService.getRewardForDate(dk);
  });
  showFlyingCoin = signal(false);
  showClaimCelebration = signal(false);
  claimCelebrationAmount = signal(0);
  claimInProgress = signal(false);
  lastClaimedAmount = signal(0);
  // Tọa độ bay (dùng CSS vars)
  flyStartX = signal(0);
  flyStartY = signal(0);
  flyMidX = signal(0);
  flyPeakY = signal(0);
  flyMid2Y = signal(0);
  flyEndX = signal(0);
  flyEndY = signal(0);
  flyOffsetPath = signal<string>("path('M 0px 0px Q 0px 0px 0px 0px')");
  /** Đủ điều kiện bấm nhận xu (đã tick hết hoặc không có lịch — điểm danh). */
  canClaimDailyReward = computed(() => {
    const dk = this.diarySelectedDate();
    if (!this.isTodayKey(dk)) return false;
    if (this.coinService.coinData().lastCompletedDate === dk) return false;
    const items = this.diaryRemindersForDate();
    if (items.length === 0) return true; /* Hôm nay không có lịch: vẫn điểm danh nhận xu */
    return items.every((i) => i.completed);
  });

  /** Hiện khung/nút nhận xu: hôm nay + chưa nhận xu (có thể xám khi chưa tick hết). */
  showDiaryClaimRow = computed(() => {
    const dk = this.diarySelectedDate();
    if (!this.isTodayKey(dk)) return false;
    if (this.coinService.coinData().lastCompletedDate === dk) return false;
    return true;
  });

  formModel = signal<Partial<ReminderCreate>>({
    med_name: '',
    dosage: '',
    unit: '',
    route: '',
    instruction: '',
    reminder_times: ['08:00'],
    frequency: '',
    start_date: '',
    end_date: '',
    note: '',
    image_url: null,
    tag_label: null,
    tag_color: null,
  });

  diaryRemindersForDate = computed(() => {
    const dk = this.diarySelectedDate();
    const list = this.reminders();
    const [y, m, day] = dk.split('-').map(Number);
    const dateObj = new Date(y, m - 1, day);
    const result: { reminder: Reminder; time: string; completed: boolean }[] = [];
    for (const r of list) {
      if (!reminderAppliesOnDate(r, dateObj)) continue;
      for (const t of r.reminder_times || []) {
        const completed =
          (r.completion_log || []).some((c) => c.date === dk && c.time === t) ?? false;
        result.push({ reminder: r, time: t, completed });
      }
    }
    result.sort((a, b) => a.time.localeCompare(b.time));
    return result;
  });

  /** Hôm nay, chưa nhận thưởng, không có lịch nhắc → hiện khung điểm danh. */
  showDiaryCheckInFrame = computed(() => {
    const dk = this.diarySelectedDate();
    if (!this.isTodayKey(dk)) return false;
    if (this.coinService.coinData().lastCompletedDate === dk) return false;
    return this.diaryRemindersForDate().length === 0;
  });

  get currentUserDisplayName(): string {
    const u = this.auth.currentUser() as any;
    return (u?.full_name || u?.name || u?.phone || '').toString();
  }

  readonly TAG_COLORS: { key: string; label: string; hex: string }[] = [
    // Pastel palette (gần giống Google Calendar)
    { key: 'red', label: 'Đỏ', hex: '#f28b82' },
    { key: 'orange', label: 'Cam', hex: '#fbbc04' },
    { key: 'yellow', label: 'Vàng', hex: '#fff475' },
    { key: 'green', label: 'Xanh lá', hex: '#ccff90' },
    { key: 'teal', label: 'Xanh ngọc', hex: '#a7ffeb' },
    { key: 'blue', label: 'Xanh dương', hex: '#aecbfa' },
    { key: 'purple', label: 'Tím', hex: '#d7aefb' },
    { key: 'gray', label: 'Xám', hex: '#dadce0' },
  ];

  readonly TAG_LABELS: string[] = [
    'Thuốc ho',
    'Thuốc cảm',
    'Đau đầu',
    'Huyết áp',
    'Vitamin',
    'Kháng sinh',
    'Dạ dày',
    'Khác',
  ];

  private static TAG_CONFIGS_LS_KEY = 'vc_reminder_tag_configs_v1';

  tagManagerOpen = signal(false);
  tagConfigs = signal<{ id: string; label: string; color: string }[]>([]);
  /** Màu chọn cho nhãn mới (khi bấm Thêm nhãn) */
  newTagColor = signal('blue');

  tagPickerOpen = signal(false);
  private tagPickerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  /** Time wheel (kiểu iPhone): mở cho ô giờ thứ mấy */
  timeWheelOpen = signal(false);
  timeWheelEditingIndex = signal<number | null>(null);
  wheelHourCenter = signal(8);
  wheelMinuteCenter = signal(0);
  private timeWheelCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private timeWheelScrollInitDone = false;
  /** Bỏ qua xử lý scroll khi đang set scrollTop bằng code (tránh scroll event gây cập nhật model + lag) */
  private timeWheelProgrammaticScroll = false;

  /** Frequency Dropdown (Tần suất) */
  frequencyDropdownOpen = signal(false);
  readonly frequencyOptions = [
    { value: 'Once', label: 'Không lặp lại' },
    { value: 'Daily', label: 'Hàng ngày' },
    { value: 'Every 2 days', label: 'Cách ngày' },
    { value: 'Weekly', label: 'Hàng tuần' },
    { value: 'Monthly', label: 'Hàng tháng' },
  ];

  /** Instruction Dropdown (Chỉ dẫn) */
  instructionDropdownOpen = signal(false);
  readonly instructionOptions = [
    { value: 'Trước ăn', label: 'Trước ăn' },
    { value: 'Trong bữa ăn', label: 'Trong bữa ăn' },
    { value: 'Sau ăn', label: 'Sau ăn' },
    { value: 'Không phụ thuộc bữa ăn', label: 'Không phụ thuộc bữa ăn' },
  ];

  private frequencyCloseTimer: any = null;
  private instructionCloseTimer: any = null;

  @ViewChild('hourWheelColumn') hourWheelColumn?: ElementRef<HTMLDivElement>;
  @ViewChild('minuteWheelColumn') minuteWheelColumn?: ElementRef<HTMLDivElement>;
  @ViewChild('claimBurstBtn') claimBurstBtn?: ElementRef<HTMLButtonElement>;

  get selectedTagColorKey(): string {
    return (this.formModel().tag_color ?? 'blue') || 'blue';
  }

  get selectedTagColorHex(): string {
    return this.TAG_COLORS.find((x) => x.key === this.selectedTagColorKey)?.hex ?? '#1967d2';
  }

  tagColorHex(key: string | null | undefined): string {
    const k = (key ?? '').toString() || 'blue';
    return this.TAG_COLORS.find((x) => x.key === k)?.hex ?? '#1967d2';
  }

  toggleTagPicker(): void {
    this.clearTagPickerCloseTimer();
    this.tagPickerOpen.set(!this.tagPickerOpen());
  }

  closeTagPicker(): void {
    this.clearTagPickerCloseTimer();
    this.tagPickerOpen.set(false);
  }

  onTagPickerMouseEnter(): void {
    this.clearTagPickerCloseTimer();
  }

  onTagPickerMouseLeave(): void {
    if (!this.tagPickerOpen()) return;
    this.clearTagPickerCloseTimer();
    // Chỉ đóng khi rời khỏi vùng trigger/popover, tránh tắt đột ngột.
    this.tagPickerCloseTimer = setTimeout(() => {
      this.tagPickerOpen.set(false);
      this.tagPickerCloseTimer = null;
    }, 120);
  }

  openTagManager(): void {
    this.tagManagerOpen.set(true);
    this.closeTagPicker();
  }

  /** Chọn một tag (nhãn + màu) cho form */
  selectTag(t: { label: string; color: string }): void {
    this.formModel.update((m) => ({ ...m, tag_label: t.label || null, tag_color: t.color || null }));
  }

  /** Kiểm tra tag đang được chọn trong form */
  isTagSelected(t: { label: string; color: string }): boolean {
    const m = this.formModel();
    return (m.tag_label ?? '') === (t.label ?? '') && (m.tag_color ?? '') === (t.color ?? '');
  }

  closeTagManager(): void {
    this.tagManagerOpen.set(false);
    this.persistTagConfigs();
  }

  private initTagConfigs(): void {
    try {
      const raw = localStorage.getItem(Remind.TAG_CONFIGS_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .filter((x) => x && typeof x === 'object')
            .map((x: any) => ({
              id: String(x.id || crypto?.randomUUID?.() || Math.random()),
              label: String(x.label || '').trim(),
              color: String(x.color || 'blue'),
            }))
            .filter((x) => x.label.length > 0);
          if (cleaned.length) {
            this.tagConfigs.set(cleaned);
            return;
          }
        }
      }
    } catch (_) { }

    this.tagConfigs.set(
      this.TAG_LABELS.map((label, idx) => ({
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : String(Date.now() + idx),
        label,
        color: (['red', 'green', 'orange', 'purple', 'blue', 'teal', 'yellow', 'gray'] as const)[idx % 8],
      }))
    );
    this.persistTagConfigs();
  }

  private persistTagConfigs(): void {
    try {
      localStorage.setItem(Remind.TAG_CONFIGS_LS_KEY, JSON.stringify(this.tagConfigs()));
    } catch (_) { }
  }

  updateTagConfigLabel(id: string, label: string): void {
    this.tagConfigs.update((list) =>
      list.map((x) => (x.id === id ? { ...x, label } : x))
    );
  }

  cycleTagConfigColor(id: string): void {
    const keys = this.TAG_COLORS.map((c) => c.key);
    this.tagConfigs.update((list) =>
      list.map((x) => {
        if (x.id !== id) return x;
        const i = Math.max(0, keys.indexOf(x.color));
        const next = keys[(i + 1) % keys.length];
        return { ...x, color: next };
      })
    );
  }

  removeTagConfig(id: string): void {
    this.tagConfigs.update((list) => list.filter((x) => x.id !== id));
  }

  addTagConfig(): void {
    const color = this.newTagColor() || 'blue';
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : String(Date.now());
    this.tagConfigs.update((list) => [...list, { id, label: 'Nhãn mới', color }]);
  }

  setNewTagColor(colorKey: string): void {
    this.newTagColor.set(colorKey);
  }

  private clearTagPickerCloseTimer(): void {
    if (this.tagPickerCloseTimer) {
      clearTimeout(this.tagPickerCloseTimer);
      this.tagPickerCloseTimer = null;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.remind-tagpicker')) return;
    if (!target.closest('.remind-gcal-freq-wrap') && !target.closest('.remind-gcal-instruction-wrap')) {
      this.closeFrequencyDropdown();
      this.closeInstructionDropdown();
    }
    this.closeTagPicker();
  }

  toggleFrequencyDropdown(): void {
    this.frequencyDropdownOpen.set(!this.frequencyDropdownOpen());
  }

  closeFrequencyDropdown(): void {
    this.frequencyDropdownOpen.set(false);
  }

  selectFrequency(value: string): void {
    this.updateFormField('frequency', value);
    this.closeFrequencyDropdown();
  }

  getFrequencyLabel(value: string | undefined): string {
    const opt = this.frequencyOptions.find(o => o.value === value);
    return opt ? opt.label : '---Chọn tần suất---';
  }

  onFrequencyMouseEnter(): void {
    if (this.frequencyCloseTimer) {
      clearTimeout(this.frequencyCloseTimer);
      this.frequencyCloseTimer = null;
    }
  }

  onFrequencyMouseLeave(): void {
    if (!this.frequencyDropdownOpen()) return;
    this.frequencyCloseTimer = setTimeout(() => {
      this.frequencyDropdownOpen.set(false);
    }, 200);
  }

  toggleInstructionDropdown(): void {
    this.instructionDropdownOpen.set(!this.instructionDropdownOpen());
  }

  closeInstructionDropdown(): void {
    this.instructionDropdownOpen.set(false);
  }

  selectInstruction(value: string): void {
    this.updateFormField('instruction', value);
    this.closeInstructionDropdown();
  }

  getInstructionLabel(value: string | undefined): string {
    const opt = this.instructionOptions.find(o => o.value === value);
    return opt ? opt.label : '--Chọn chỉ dẫn--';
  }

  onInstructionMouseEnter(): void {
    if (this.instructionCloseTimer) {
      clearTimeout(this.instructionCloseTimer);
      this.instructionCloseTimer = null;
    }
  }

  onInstructionMouseLeave(): void {
    if (!this.instructionDropdownOpen()) return;
    this.instructionCloseTimer = setTimeout(() => {
      this.instructionDropdownOpen.set(false);
    }, 200);
  }

  readonly WEEK_DAYS = WEEK_DAYS;

  /** Dùng trong template để format ngày đang chọn */
  formatDateForDisplayFn(d: Date): string {
    return formatDateForDisplay(d);
  }

  /** Ngày đã trôi qua (so với hôm nay, theo YYYY-MM-DD) */
  isPastDay(d: Date): boolean {
    const todayKey = toDateKey(new Date());
    return compareDateKey(toDateKey(d), todayKey) < 0;
  }

  /** Ngày chưa đến (so với hôm nay, theo YYYY-MM-DD) */
  isFutureDay(d: Date): boolean {
    const todayKey = toDateKey(new Date());
    return compareDateKey(toDateKey(d), todayKey) > 0;
  }

  /** Ngày mai (lịch) */
  isTomorrowDate(d: Date): boolean {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return toDateKey(d) === toDateKey(t);
  }

  /** Bấm chip +xu trên lịch: ngày tương lai → thông báo (không đổi ngày đang chọn nếu chặn bubble). */
  onMainCalendarCoinClick(event: Event, d: Date): void {
    if (!this.isFutureDay(d) || !this.showCalendarCoinPill(d)) return;
    event.stopPropagation();
    const amount = this.getCoinRewardForDate(d);
    const msg = this.isTomorrowDate(d)
      ? `Bạn cần hoàn thành nhiệm vụ vào ngày mai để nhận ${amount} xu nhé.`
      : `Bạn cần hoàn thành nhiệm vụ các ngày trước để nhận ${amount} xu nhé.`;
    this.rewardMissionTargetDate.set(toDateKey(d));
    this.rewardMissionMessage.set(msg);
    this.showRewardMissionPopup.set(true);
  }

  /** Kiểm tra khóa ngày YYYY-MM-DD có phải hôm nay không */
  isTodayKey(dk: string): boolean {
    return dk === toDateKey(new Date());
  }

  /** Kiểm tra khóa ngày YYYY-MM-DD có phải quá khứ không */
  isPastDayKey(dk: string): boolean {
    const todayKey = toDateKey(new Date());
    return compareDateKey(dk, todayKey) < 0;
  }

  /** Kiểm tra khóa ngày YYYY-MM-DD có phải tương lai không */
  isFutureDayKey(dk: string): boolean {
    const todayKey = toDateKey(new Date());
    return compareDateKey(dk, todayKey) > 0;
  }

  /** Kiểm tra xem đã đến giờ để tích chưa */
  isTimeReached(time: string): boolean {
    const now = new Date();
    const [h, m] = time.split(':').map(Number);
    // Chỉ giới hạn nếu là ngày hôm nay
    const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    return now >= scheduled;
  }

  /** Cập nhật 1 field trong formModel (dùng cho ngModelChange) */
  updateFormField(key: string, value: unknown): void {
    this.formModel.update((m) => ({
      ...m,
      [key]: value,
    }));
  }

  /** Cập nhật 1 ô giờ uống thuốc theo index */
  updateReminderTime(index: number, value: string): void {
    this.formModel.update((m) => {
      const base = m.reminder_times && m.reminder_times.length > 0 ? m.reminder_times : ['08:00'];
      const arr = [...base];
      arr[index] = value;
      return { ...m, reminder_times: arr };
    });
  }

  /** Mảng giờ 00–23 cho dropdown */
  readonly TIME_HOURS: string[] = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  /** Mảng phút 00, 15, 30, 45 cho dropdown */
  readonly TIME_MINUTES: string[] = ['00', '15', '30', '45'];
  /** Phút 00–59 cho bánh xe giờ (kiểu iPhone) */
  readonly WHEEL_MINUTES: number[] = Array.from({ length: 60 }, (_, i) => i);
  readonly WHEEL_HOURS: number[] = Array.from({ length: 24 }, (_, i) => i);
  readonly WHEEL_MINUTES_LOOP: number[] = [...this.WHEEL_MINUTES, ...this.WHEEL_MINUTES, ...this.WHEEL_MINUTES];
  readonly WHEEL_HOURS_LOOP: number[] = [...this.WHEEL_HOURS, ...this.WHEEL_HOURS, ...this.WHEEL_HOURS];
  readonly WHEEL_ITEM_HEIGHT_PX = WHEEL_ITEM_HEIGHT;
  readonly WHEEL_VISIBLE_HEIGHT_PX = WHEEL_VISIBLE_HEIGHT;

  getTimeHour(timeStr: string | undefined): string {
    if (!timeStr) return '08';
    const [h] = timeStr.split(':');
    const n = parseInt(h, 10);
    if (Number.isNaN(n) || n < 0 || n > 23) return '08';
    return n.toString().padStart(2, '0');
  }

  getTimeMinute(timeStr: string | undefined): string {
    if (!timeStr) return '00';
    const parts = timeStr.split(':');
    const m = parseInt(parts[1] ?? '0', 10);
    if (Number.isNaN(m) || m < 0 || m > 59) return '00';
    const rounded = Math.floor(m / 15) * 15;
    return rounded.toString().padStart(2, '0');
  }

  /** Cập nhật giờ/phút cho reminder_times[i] và chuẩn hóa về HH:mm */
  updateReminderTimeHMS(index: number, hour: string, minute: string): void {
    const h = hour.length === 1 ? '0' + hour : hour;
    const m = minute.length === 1 ? '0' + minute : minute;
    this.updateReminderTime(index, `${h}:${m}`);
  }

  /** Phút thô 0–59 từ chuỗi HH:mm (dùng cho bánh xe) */
  getTimeMinuteRaw(timeStr: string | undefined): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const m = parseInt(parts[1] ?? '0', 10);
    return Number.isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
  }

  openTimeWheel(index: number): void {
    this.clearTimeWheelCloseTimer();
    this.timeWheelEditingIndex.set(index);
    const times = this.formModel().reminder_times ?? ['08:00'];
    const t = times[index] ?? '08:00';
    const h = parseInt(this.getTimeHour(t), 10);
    const m = this.getTimeMinuteRaw(t);
    this.wheelHourCenter.set(Number.isNaN(h) ? 8 : Math.max(0, Math.min(23, h)));
    this.wheelMinuteCenter.set(m);
    this.timeWheelScrollInitDone = false;
    this.timeWheelOpen.set(true);
  }

  closeTimeWheel(): void {
    this.clearTimeWheelCloseTimer();
    this.timeWheelOpen.set(false);
    this.timeWheelEditingIndex.set(null);
  }

  clearTimeWheelCloseTimer(): void {
    if (this.timeWheelCloseTimer) {
      clearTimeout(this.timeWheelCloseTimer);
      this.timeWheelCloseTimer = null;
    }
  }

  onTimeWheelAreaLeave(): void {
    if (!this.timeWheelOpen()) return;
    this.clearTimeWheelCloseTimer();
    this.timeWheelCloseTimer = setTimeout(() => {
      this.closeTimeWheel();
      this.timeWheelCloseTimer = null;
    }, 150);
  }

  /** Gọi sau khi view render để set scrollTop cho hai cột bánh xe */
  initTimeWheelScroll(): void {
    if (this.timeWheelScrollInitDone || !this.timeWheelOpen() || this.hourWheelColumn?.nativeElement == null || this.minuteWheelColumn?.nativeElement == null) {
      return;
    }
    const idx = this.timeWheelEditingIndex();
    if (idx == null) return;
    const times = this.formModel().reminder_times ?? ['08:00'];
    const t = times[idx] ?? '08:00';
    const h = parseInt(this.getTimeHour(t), 10);
    const minuteIndex = this.getTimeMinuteRaw(t);
    const hourIndex = Number.isNaN(h) ? 8 : Math.max(0, Math.min(23, h));
    this.timeWheelProgrammaticScroll = true;
    this.hourWheelColumn.nativeElement.scrollTo({ top: (hourIndex + this.WHEEL_HOURS.length) * WHEEL_ITEM_HEIGHT, behavior: 'instant' });
    this.minuteWheelColumn.nativeElement.scrollTo({ top: (minuteIndex + this.WHEEL_MINUTES.length) * WHEEL_ITEM_HEIGHT, behavior: 'instant' });
    this.timeWheelScrollInitDone = true;
    setTimeout(() => { this.timeWheelProgrammaticScroll = false; }, 200);
  }

  /** Index ô đang nằm ở giữa viewport (có pad 72px phía trên) */
  private getWheelCenterIndex(scrollTop: number): number {
    return Math.floor((scrollTop + 18) / WHEEL_ITEM_HEIGHT);
  }

  onWheelScroll(column: 'hour' | 'minute', e: Event): void {
    if (this.timeWheelProgrammaticScroll) return;
    const el = e.target as HTMLDivElement;
    const idx = this.timeWheelEditingIndex();
    if (idx == null) return;
    const index = this.getWheelCenterIndex(el.scrollTop);
    if (column === 'hour') {
      const base = this.WHEEL_HOURS.length;
      const loopLen = this.WHEEL_HOURS_LOOP.length;
      const wrapped = ((index % base) + base) % base;
      this.wheelHourCenter.set(wrapped);
      const times = this.formModel().reminder_times ?? ['08:00'];
      const cur = times[idx] ?? '08:00';
      const minuteStr = this.getTimeMinuteRaw(cur).toString().padStart(2, '0');
      this.updateReminderTimeHMS(idx, wrapped.toString().padStart(2, '0'), minuteStr);

      const adjust = (): void => {
        if (index < Math.floor(base / 2)) {
          el.scrollTop += base * WHEEL_ITEM_HEIGHT;
        } else if (index > loopLen - Math.floor(base / 2)) {
          el.scrollTop -= base * WHEEL_ITEM_HEIGHT;
        }
      };
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(adjust);
      } else {
        adjust();
      }
    } else {
      const base = this.WHEEL_MINUTES.length;
      const loopLen = this.WHEEL_MINUTES_LOOP.length;
      const wrapped = ((index % base) + base) % base;
      this.wheelMinuteCenter.set(wrapped);
      const times = this.formModel().reminder_times ?? ['08:00'];
      const cur = times[idx] ?? '08:00';
      this.updateReminderTimeHMS(idx, this.getTimeHour(cur), wrapped.toString().padStart(2, '0'));

      const adjust = (): void => {
        if (index < Math.floor(base / 2)) {
          el.scrollTop += base * WHEEL_ITEM_HEIGHT;
        } else if (index > loopLen - Math.floor(base / 2)) {
          el.scrollTop -= base * WHEEL_ITEM_HEIGHT;
        }
      };
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(adjust);
      } else {
        adjust();
      }
    }
  }

  /** Style opacity/scale cho từng ô trong bánh xe (giống iPhone) */
  getWheelItemStyle(index: number, centerIndex: number): { opacity: number; transform: string } {
    const d = Math.abs(index - centerIndex);
    const opacity = d === 0 ? 1 : Math.max(0.25, 1 - d * 0.35);
    const scale = d === 0 ? 1 : Math.max(0.7, 1 - d * 0.12);
    return { opacity, transform: `scale(${scale})` };
  }

  onImageFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.imageUploadError.set(null);
    this.uploadingImage.set(true);
    this.reminderApi.uploadImage(file).subscribe({
      next: (res) => {
        if (res.success && res.url) {
          this.formModel.update((m) => ({ ...m, image_url: res.url || null }));
        } else {
          this.imageUploadError.set('Tải ảnh thất bại. Vui lòng thử lại.');
        }
        this.uploadingImage.set(false);
      },
      error: () => {
        this.imageUploadError.set('Tải ảnh thất bại. Vui lòng thử lại.');
        this.uploadingImage.set(false);
      },
    });
  }

  ngOnInit(): void {
    const user = this.auth.currentUser();
    const userId = user?.user_id ?? '';
    if (!userId) {
      this.loading.set(false);
      this.loadError.set('Vui lòng đăng nhập.');
      return;
    }
    this.initFormDates();
    this.initTagConfigs();
    this.loadReminders(userId);
    this.selectedDate.set(new Date());
  }

  ngAfterViewChecked(): void {
    this.initTimeWheelScroll();
  }

  /** Các ngày trong tháng (không render ô ngoài tháng). */
  calendarCells = computed(() => {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const mon = month.getMonth();
    const start = new Date(year, mon, 1);
    const daysInMonth = new Date(year, mon + 1, 0).getDate();
    const todayKey = toDateKey(new Date());
    const cells: { date: Date; isToday: boolean }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, mon, day);
      cells.push({ date: d, isToday: toDateKey(d) === todayKey });
    }
    return {
      startDay: start.getDay(), // 0 (CN) - 6 (T7)
      cells,
    };
  });

  /** Nhãn tháng/năm cho header calendar */
  get monthLabel(): string {
    const m = this.currentMonth();
    return m.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  }

  changeMonth(offset: number): void {
    const cur = this.currentMonth();
    const next = new Date(cur.getFullYear(), cur.getMonth() + offset, 1);
    this.currentMonth.set(next);
  }

  selectDateCell(date: Date): void {
    this.selectedDate.set(date);
    // Click ngày trên lịch: mở Nhật ký để xem tất cả lời nhắc của ngày đó
    this.diarySelectedDate.set(toDateKey(date));
    this.showCreatePopup.set(false);
    this.showDetailPopup.set(null);
    this.showDiaryPopup.set(true);
  }

  resetForm(): void {
    const d = this.selectedDate();
    this.formModel.set({
      med_name: '',
      dosage: '',
      unit: '',
      route: '',
      instruction: '',
      reminder_times: ['08:00'],
      frequency: '',
      start_date: toDateKey(d),
      end_date: toDateKey(new Date(d.getTime() + 30 * 24 * 60 * 60 * 1000)),
      note: '',
      image_url: null,
    });
    this.editMinStartDate.set(null);
    this.activeDiaryEditKey.set(null);
    this.isEditMode.set(false);
    this.editingId.set(null);
  }

  openCreate(): void {
    if (this.showDiaryPopup() && this.isPastDayKey(this.diarySelectedDate())) {
      this.toast.showInfo('Không thể thêm lịch nhắc cho ngày đã qua.');
      return;
    }
    this.resetForm();
    this.showDiaryPopup.set(false);
    this.showCreatePopup.set(true);
  }

  /** Lấy các lời nhắc cho một ngày cụ thể (dùng trong mỗi ô calendar) */
  getRemindersForDate(date: Date): { reminder: Reminder; time: string; completed: boolean }[] {
    const list = this.reminders();
    const dk = toDateKey(date);
    const result: { reminder: Reminder; time: string; completed: boolean }[] = [];
    for (const r of list) {
      if (!reminderAppliesOnDate(r, date)) continue;
      for (const t of r.reminder_times || []) {
        const completed =
          (r.completion_log || []).some((c) => c.date === dk && c.time === t) ?? false;
        result.push({ reminder: r, time: t, completed });
      }
    }
    result.sort((a, b) => a.time.localeCompare(b.time));
    return result;
  }

  private initFormDates(): void {
    const today = new Date();
    const end = new Date(today);
    end.setMonth(end.getMonth() + 1);
    this.formModel.update((m) => ({
      ...m,
      start_date: toDateKey(today),
      end_date: toDateKey(end),
    }));
  }

  private loadReminders(userId: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.reminderApi.getByUser(userId).subscribe({
      next: (res) => {
        if (res.success && res.reminders) {
          this.reminders.set(res.reminders);
        } else {
          this.reminders.set([]);
        }
        this.loading.set(false);
        this.loadError.set(null);
      },
      error: (err) => {
        this.loading.set(false);
        const status = err?.status ?? err?.statusCode;
        const isConnectionError = status === 0 || err?.message?.includes('Http failure');
        this.loadError.set(
          isConnectionError
            ? 'Không kết nối được máy chủ. Vui lòng chạy backend: cd backend && npm start'
            : 'Không tải được lời nhắc.'
        );
      },
    });
  }

  // remindersForDateAndSection no longer used in calendar layout

  /* openCreate logic moved above and consolidated */

  openDetail(r: Reminder): void {
    // Giữ popup Nhật ký phía sau (popup chi tiết sẽ đè lên).
    this.showDetailPopup.set(r);
    this.isEditMode.set(false);
  }

  openEdit(r: Reminder, contextDate?: string, editKey?: string): void {
    if (contextDate && this.isDateClaimed(contextDate)) {
      this.toast.showInfo('Bạn đã nhận xu hôm nay, không thể chỉnh sửa thêm.');
      return;
    }
    const todayKey = toDateKey(new Date());
    if (contextDate && this.isPastDayKey(contextDate)) {
      this.toast.showInfo('Bạn không thể chỉnh sửa lịch nhắc này nhé');
      return;
    }
    // Nếu có contextDate (từ Diary): khóa start từ đúng ngày đang chọn
    // và cho phép sửa tiếp đến hết end_date gốc (chỉ tách phần quá khứ giữ nguyên).
    const defaultStart =
      contextDate || (r.start_date && r.start_date.slice(0, 10) >= todayKey ? r.start_date.slice(0, 10) : todayKey);
    const defaultEnd = contextDate ? (r.end_date?.slice(0, 10) || contextDate) : r.end_date?.slice(0, 10) || defaultStart;

    this.editMinStartDate.set(contextDate ?? null);
    this.activeDiaryEditKey.set(editKey ?? null);

    this.formModel.set({
      med_name: r.med_name,
      dosage: r.dosage,
      unit: r.unit || '',
      route: r.route || '',
      instruction: r.instruction || '',
      reminder_times: [...(r.reminder_times || ['08:00'])],
      frequency: r.frequency || '',
      start_date: defaultStart,
      end_date: defaultEnd,
      note: r.note || '',
      image_url: r.image_url ?? null,
      tag_label: (r as any).tag_label ?? null,
      tag_color: (r as any).tag_color ?? null,
    });
    this.showDetailPopup.set(null);
    this.showCreatePopup.set(true);
    this.isEditMode.set(true);
    this.editingId.set(r._id ?? null);
  }

  openDiary(): void {
    this.diarySelectedDate.set(toDateKey(new Date()));
    this.showDiaryPopup.set(true);
  }

  closeRewardMissionPopup(): void {
    this.showRewardMissionPopup.set(false);
    this.rewardMissionMessage.set('');
    this.rewardMissionTargetDate.set(null);
  }

  openRewardMissionTarget(): void {
    const target = this.rewardMissionTargetDate();
    if (!target) {
      this.closeRewardMissionPopup();
      return;
    }
    this.diarySelectedDate.set(target);
    this.showDiaryPopup.set(true);
    this.closeRewardMissionPopup();
  }

  closeCreate(): void {
    this.showCreatePopup.set(false);
    this.editingId.set(null);
    this.editMinStartDate.set(null);
    this.activeDiaryEditKey.set(null);
  }

  closeDetail(): void {
    this.showDetailPopup.set(null);
    this.activeDiaryEditKey.set(null);
    // Khi đóng popup chi tiết thì quay lại đúng màn Nhật ký.
    this.showDiaryPopup.set(true);
  }

  closeDiary(): void {
    this.showDiaryPopup.set(false);
    this.activeDiaryEditKey.set(null);
    this.editMinStartDate.set(null);
  }

  addTime(): void {
    const current = this.formModel().reminder_times || [];
    this.formModel.update((m) => ({
      ...m,
      reminder_times: [...current, '08:00'],
    }));
  }

  updateTime(index: number, time: string): void {
    const current = [...(this.formModel().reminder_times || [])];
    current[index] = time;
    this.formModel.update((m) => ({ ...m, reminder_times: current }));
  }

  removeTime(index: number): void {
    const current = [...(this.formModel().reminder_times || [])];
    current.splice(index, 1);
    this.formModel.update((m) => ({ ...m, reminder_times: current }));
  }

  saveReminder(): void {
    const user = this.auth.currentUser();
    const userId = user?.user_id ?? '';
    if (!userId) return;
    const form = this.formModel();
    const editingId = this.editingId();
    if (editingId) {
      const oldR = this.reminders().find((x) => x._id === editingId);
      if (!oldR) return;

      const newStart = form.start_date;
      const newEnd = form.end_date;
      if (!newStart || !newEnd) return;

      const oldStart = oldR.start_date.slice(0, 10);
      const oldEnd = oldR.end_date.slice(0, 10);

      const isIsolating = newStart !== oldStart || newEnd !== oldEnd;

      if (isIsolating) {
        // 1. Quá khứ: Nếu newStart > oldStart, thu hẹp lịch cũ
        if (this.compareDateKey(oldStart, newStart) < 0) {
          const trimmedEnd = this.addDays(newStart, -1);
          this.reminderApi
            .update(editingId, {
              end_date: trimmedEnd + 'T00:00:00Z',
              skipped_dates: pruneSkippedDatesInRange(oldR.skipped_dates, oldStart, trimmedEnd),
            })
            .subscribe();
        }

        // 2. Hiện tại: Tạo mới cho giai đoạn đã chọn
        const editedBody: ReminderCreate = {
          user_id: userId,
          med_name: form.med_name ?? '',
          dosage: form.dosage ?? '',
          unit: form.unit,
          route: form.route,
          instruction: form.instruction,
          reminder_times: form.reminder_times ?? ['08:00'],
          frequency: form.frequency ?? 'Daily',
          start_date: newStart + 'T00:00:00Z',
          end_date: newEnd + 'T00:00:00Z',
          note: form.note,
          image_url: form.image_url ?? null,
          tag_label: (form as any).tag_label ?? null,
          tag_color: (form as any).tag_color ?? null,
          skipped_dates: pruneSkippedDatesInRange(oldR.skipped_dates, newStart, newEnd),
        };

        this.reminderApi.create(editedBody).subscribe({
          next: (res) => {
            if (res.success && res.reminder) {
              this.toast.showSuccess(`Đã cập nhật lịch cho ngày ${newStart}`);

              // 3. Tương lai: Nếu newEnd < oldEnd, tạo lại lịch gốc
              if (this.compareDateKey(newEnd, oldEnd) < 0) {
                const futureStart = this.addDays(newEnd, 1);
                const futureBody: ReminderCreate = {
                  user_id: userId,
                  med_name: oldR.med_name,
                  dosage: oldR.dosage,
                  unit: oldR.unit,
                  route: oldR.route,
                  instruction: oldR.instruction,
                  reminder_times: oldR.reminder_times,
                  frequency: oldR.frequency,
                  start_date: futureStart + 'T00:00:00Z',
                  end_date: oldEnd + 'T00:00:00Z',
                  note: oldR.note,
                  image_url: oldR.image_url ?? null,
                  tag_label: (oldR as any).tag_label ?? null,
                  tag_color: (oldR as any).tag_color ?? null,
                  skipped_dates: pruneSkippedDatesInRange(oldR.skipped_dates, futureStart, oldEnd),
                };
                this.reminderApi.create(futureBody).subscribe({
                  next: () => this.loadReminders(userId)
                });
              } else {
                this.loadReminders(userId);
              }
            }
            this.closeCreate();
          },
        });

        if (this.compareDateKey(oldStart, newStart) === 0) {
          this.reminderApi.delete(editingId).subscribe();
        }
      } else {
        this.reminderApi
          .update(editingId, {
            med_name: form.med_name ?? '',
            dosage: form.dosage ?? '',
            unit: form.unit,
            route: form.route,
            instruction: form.instruction,
            reminder_times: form.reminder_times ?? ['08:00'],
            frequency: form.frequency,
            start_date: form.start_date ? form.start_date + 'T00:00:00Z' : undefined,
            end_date: form.end_date ? form.end_date + 'T00:00:00Z' : undefined,
            note: form.note,
            image_url: form.image_url ?? null,
            tag_label: (form as any).tag_label ?? null,
            tag_color: (form as any).tag_color ?? null,
          })
          .subscribe({
            next: (res) => {
              if (res.success && res.reminder) {
                this.reminders.update((list) => list.map((r) => (r._id === editingId ? res.reminder! : r)));
                this.toast.showSuccess('Cập nhật lời nhắc thành công.');
              }
              this.closeCreate();
            },
            error: () => { },
          });
      }
    } else {
      const todayKey = toDateKey(new Date());
      const startKey = form.start_date && form.start_date.length >= 10 ? form.start_date : todayKey;
      const endKey =
        form.end_date && form.end_date.length >= 10
          ? form.end_date
          : toDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

      const body: ReminderCreate = {
        user_id: userId,
        med_name: form.med_name ?? '',
        dosage: form.dosage ?? '',
        unit: form.unit,
        route: form.route,
        instruction: form.instruction,
        reminder_times: form.reminder_times ?? ['08:00'],
        frequency: form.frequency ?? 'Daily',
        start_date: startKey + 'T00:00:00Z',
        end_date: endKey + 'T00:00:00Z',
        note: form.note,
        image_url: form.image_url ?? null,
        tag_label: (form as any).tag_label ?? null,
        tag_color: (form as any).tag_color ?? null,
      };
      this.reminderApi.create(body).subscribe({
        next: (res) => {
          if (res.success && res.reminder) {
            this.reminders.update((list) => [...list, res.reminder!]);
            this.toast.showSuccess('Tạo lời nhắc mới thành công.');
          }
          this.closeCreate();
        },
        error: () => { },
      });
    }
  }

  /**
   * Nhật ký: mở popup — "chỉ ngày này" chỉ bỏ hiển thị một ngày (skipped_dates),
   * không xóa cả thông tin thuốc trên các ngày còn lại.
   */
  openCalendarDayRemoveConfirm(r: Reminder, dayKey: string): void {
    if (dayKey && this.isDateClaimed(dayKey)) {
      this.toast.showInfo('Bạn đã nhận xu hôm nay, không thể thay đổi lịch.');
      return;
    }
    if (dayKey && this.isPastDayKey(dayKey)) {
      return;
    }
    this.deleteTarget.set(r);
    this.deleteContextDate.set(dayKey || null);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
    this.deleteTarget.set(null);
    this.deleteContextDate.set(null);
  }

  /** scope: `day` = chỉ đúng ngày đang xem; `from` = từ ngày đó đến hết lịch (giữ ngày trước đó). */
  confirmDeleteWithScope(scope: 'day' | 'from'): void {
    const r = this.deleteTarget();
    const ctxDate = this.deleteContextDate();
    if (!r || !r._id) return;

    const userId = this.auth.currentUser()?.user_id || '';
    const closeUi = () => {
      this.cancelDelete();
      this.showDetailPopup.set(null);
    };

    if (ctxDate) {
      const calendarDate = normalizeCalendarYmd(ctxDate);
      const rangeStart = normalizeCalendarYmd(toDateKey(new Date(r.start_date)));
      const rangeEnd = normalizeCalendarYmd(toDateKey(new Date(r.end_date)));

      const obs =
        scope === 'day'
          ? this.reminderApi.skipOneCalendarDay(r._id!, { calendarDate, rangeStart, rangeEnd })
          : this.reminderApi.deleteCalendar(r._id!, {
              calendarDate,
              scope: 'from',
              rangeStart,
              rangeEnd,
            });

      obs.subscribe({
        next: (res: any) => {
          if (res.success) {
            if (scope === 'day') {
              const addKey = normalizeCalendarYmd(ctxDate);
              this.reminders.update((list) =>
                list.map((it) => {
                  if (it._id !== r._id) return it;
                  const cur = (it.skipped_dates || []).map((x) => normalizeCalendarYmd(String(x)));
                  if (cur.includes(addKey)) return it;
                  return { ...it, skipped_dates: [...cur, addKey] };
                })
              );
              this.toast.showSuccess(`Lịch ngày ${this.formatDateKey(ctxDate)} đã được huỷ bỏ.`);
            } else {
              this.toast.showSuccess(`Lịch từ ngày ${this.formatDateKey(ctxDate)} đã được huỷ bỏ.`);
            }
            this.loadReminders(userId);
          }
          closeUi();
        },
        error: (err: HttpErrorResponse) => {
          const apiMsg = (err.error && (err.error as { message?: string }).message) || err.message;
          this.toast.showError(
            typeof apiMsg === 'string' && apiMsg.trim()
              ? apiMsg
              : err.status === 0
                ? 'Không kết nối được máy chủ. Hãy chạy backend và thử lại.'
                : 'Lỗi khi xóa lịch nhắc'
          );
          this.loadReminders(userId);
          closeUi();
        },
      });
      return;
    }

    this.reminderApi.delete(r._id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.reminders.update((list) => list.filter((item) => item._id !== r._id));
          this.toast.showSuccess('Đã xóa toàn bộ lịch nhắc');
        }
        closeUi();
      },
      error: () => {
        this.toast.showError('Không thể xóa lịch nhắc');
        closeUi();
      },
    });
  }

  async completeReminder(r: Reminder): Promise<void> {
    const dk = this.diarySelectedDate();
    const reminderId = r._id != null ? String(r._id) : '';
    if (!reminderId) return;

    // Nếu đã nhận xu hôm nay thì không cho tick thay đổi thêm.
    if (this.isDateClaimed(dk)) {
      this.toast.showInfo('Bạn đã nhận xu hôm nay, không thể thay đổi trạng thái tick.');
      this.closeDetail();
      this.showDiaryPopup.set(true);
      return;
    }

    // Lọc các giờ có trong reminder_times và đã đến giờ.
    const times = r.reminder_times || [];
    const current = this.reminders().find((x) => String(x._id) === reminderId);
    const log = current?.completion_log || [];

    const toMark = times.filter((t) => this.isTimeReached(t) && !log.some((c) => c.date === dk && c.time === t));
    if (toMark.length === 0) {
      // Không có gì để tick thêm
      this.closeDetail();
      this.showDiaryPopup.set(true);
      return;
    }

    try {
      for (const t of toMark) {
        const res = await firstValueFrom(this.reminderApi.markComplete(reminderId, dk, t));
        if (res?.success && res?.reminder) {
          this.reminders.update((list) => list.map((it) => (String(it._id) === reminderId ? res.reminder! : it)));
        }
      }

      this.auth.showHeaderSuccess('Bạn đã hoàn thành lời nhắc');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
      this.toast.showError('Không thể đánh dấu hoàn thành lời nhắc. Vui lòng thử lại.');
    } finally {
      // Quay lại Nhật ký và đóng popup chi tiết
      this.closeDetail();
      this.showDiaryPopup.set(true);
    }
  }

  toggleComplete(
    item: { reminder: Reminder; time: string; completed: boolean },
    dateOverride?: string
  ): void {
    const reminderId = item.reminder._id != null ? String(item.reminder._id) : '';
    if (!reminderId) return;
    const dk = dateOverride ?? this.dateKey();

    if (this.isDateClaimed(dk)) {
      this.toast.showInfo('Bạn đã nhận xu hôm nay, không thể thay đổi trạng thái tick.');
      return;
    }

    // Chỉ cho phép tích hoàn thành cho ngày hôm nay
    if (!this.isTodayKey(dk)) {
      this.toast.showInfo('Bạn chỉ có thể thực hiện thao tác này cho lời nhắc của ngày hôm nay.');
      return;
    }

    // Kiểm tra xem đã đến giờ chưa
    if (!this.isTimeReached(item.time)) {
      this.toast.showInfo(`Bạn chỉ có thể hoàn thành lời nhắc này sau ${item.time}.`);
      return;
    }

    if (!item.completed) {
      // Đánh dấu hoàn thành
      this.reminders.update((list) =>
        list.map((r) => {
          if (String(r._id) !== reminderId) return r;
          const log = r.completion_log || [];
          if (log.some((c) => c.date === dk && c.time === item.time)) return r;
          return {
            ...r,
            completion_log: [...log, { date: dk, time: item.time }],
          };
        })
      );
      this.reminderApi
        .markComplete(reminderId, dk, item.time)
        .subscribe({
          next: (res) => {
            if (res.success && res.reminder) {
              this.reminders.update((list) =>
                list.map((r) => (String(r._id) === reminderId ? res.reminder! : r))
              );
              this.auth.showHeaderSuccess('Bạn đã hoàn thành lời nhắc');

              // Kiểm tra xem đã hoàn thành toàn bộ nhắc nhở của hôm nay chưa
              this.checkAndAwardCoins(dk);
            }
          },
          error: () => {
            // Revert optimistic update khi API lỗi
            this.reminders.update((list) =>
              list.map((r) => {
                if (String(r._id) !== reminderId) return r;
                const log = (r.completion_log || []).filter(
                  (c) => !(c.date === dk && c.time === item.time)
                );
                return { ...r, completion_log: log };
              })
            );
          },
        });
    } else {
      // Bỏ đánh dấu hoàn thành
      this.reminders.update((list) =>
        list.map((r) => {
          if (String(r._id) !== reminderId) return r;
          const log = (r.completion_log || []).filter(
            (c) => !(c.date === dk && c.time === item.time)
          );
          return { ...r, completion_log: log };
        })
      );
      this.reminderApi
        .markUncomplete(reminderId, dk, item.time)
        .subscribe({
          next: (res) => {
            if (res.success && res.reminder) {
              this.reminders.update((list) =>
                list.map((r) => (String(r._id) === reminderId ? res.reminder! : r))
              );
            }
          },
          error: () => {
            // Revert optimistic update khi API lỗi
            this.reminders.update((list) =>
              list.map((r) => {
                if (String(r._id) !== reminderId) return r;
                const log = r.completion_log || [];
                if (log.some((c) => c.date === dk && c.time === item.time)) return r;
                return {
                  ...r,
                  completion_log: [...log, { date: dk, time: item.time }],
                };
              })
            );
          },
        });
    }
  }

  addReminderTime(): void {
    this.formModel.update((m) => ({
      ...m,
      reminder_times: [...(m.reminder_times || ['08:00']), '08:00'],
    }));
  }

  removeReminderTime(i: number): void {
    this.formModel.update((m) => {
      const arr = [...(m.reminder_times || [])];
      if (arr.length <= 1) return m;
      arr.splice(i, 1);
      return { ...m, reminder_times: arr };
    });
  }


  get diaryMonthLabel(): string {
    const [y, m] = this.diarySelectedDate().split('-').map(Number);
    if (!y || !m) return '';
    return `${String(m).padStart(2, '0')}/${y}`;
  }

  get diaryCalendarDays(): { key: string; day: number; isCurrentMonth: boolean }[] {
    const [y, m] = this.diarySelectedDate().split('-').map(Number);
    if (!y || !m) return [];
    const first = new Date(y, m - 1, 1);
    const startIndex = (first.getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(y, m, 0).getDate();
    const days: { key: string; day: number; isCurrentMonth: boolean }[] = [];
    // leading previous-month days
    for (let i = 0; i < startIndex; i++) {
      days.push({ key: '', day: 0, isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      days.push({ key: toDateKey(date), day: d, isCurrentMonth: true });
    }
    while (days.length < 42) {
      days.push({ key: '', day: 0, isCurrentMonth: false });
    }
    return days;
  }

  diaryPrevMonth(): void {
    const [y, m] = this.diarySelectedDate().split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    this.diarySelectedDate.set(toDateKey(d));
  }

  diaryNextMonth(): void {
    const [y, m] = this.diarySelectedDate().split('-').map(Number);
    const d = new Date(y, m, 1);
    this.diarySelectedDate.set(toDateKey(d));
  }

  formatDateForDisplay = formatDateForDisplay;
  toDateKey = toDateKey;

  formatDateKey(dk: string): string {
    const [y, m, d] = dk.split('-');
    return `${d}/${m}/${y}`;
  }

  /** Lấy mã màu HEX từ tag_color của reminder */
  getBadgeColorHex(r: Reminder): string {
    const colorKey = (r as any).tag_color || 'blue';
    return this.TAG_COLORS.find((c) => c.key === colorKey)?.hex || '#aecbfa';
  }

  /** Xu trên lịch chính: 6 ngày (hôm nay → +5) theo chuỗi thực tế (50/100/200/300…) */
  getCoinRewardForDate(d: Date): number {
    return this.coinService.getCalendarCoinPreview(toDateKey(d)) ?? 0;
  }

  showCalendarCoinPill(d: Date): boolean {
    return this.coinService.getCalendarCoinPreview(toDateKey(d)) !== null;
  }

  isDateClaimed(dk: string): boolean {
    return this.coinService.coinData().lastCompletedDate === dk;
  }

  isDateCompleted(d: Date): boolean {
    return this.coinService.isDateCompleted(toDateKey(d));
  }

  allTimesReached(r: Reminder): boolean {
    return (r.reminder_times || []).every(t => this.isTimeReached(t));
  }

  openClaimCelebrationPrompt(): void {
    if (this.claimInProgress()) return;
    if (!this.canClaimDailyReward()) return;
    this.claimCelebrationAmount.set(this.nextRewardAmount());
    this.showClaimCelebration.set(true);
  }

  async claimDailyReward() {
    if (!this.canClaimDailyReward() || this.claimInProgress()) {
      this.toast.showInfo('Hoàn thành tất cả lịch nhắc hôm nay rồi mới nhận xu nhé.');
      return;
    }

    const dk = this.diarySelectedDate();
    const emptyDay = this.diaryRemindersForDate().length === 0;

    this.claimInProgress.set(true);
    // Chuẩn bị tọa độ bay trước khi đóng popup
    this.computeFlyingCoinTargetFromClaimBag();
    // Đóng popup ngay khi người dùng bấm nhận
    this.showClaimCelebration.set(false);

    try {
      const res = await this.coinService.applyDailyReward(
        dk,
        emptyDay ? 'Điểm danh nhật ký' : 'Hoàn thành lịch nhắc lần 1'
      );

      if (res.isRewardApplied) {
        this.lastClaimedAmount.set(res.amount);
        this.showFlyingCoin.set(true);
        setTimeout(() => this.showFlyingCoin.set(false), 2000);
        this.toast.showSuccess(
          `Chúc mừng! Bạn nhận được ${res.amount} xu cho chuỗi ${this.coinService.coinData().currentStreak} ngày.`
        );
      }
    } finally {
      this.claimInProgress.set(false);
    }
  }

  private computeFlyingCoinTargetFromClaimBag(): void {
    // Bay theo 1 đường cong mượt bằng offset-path (relative), đảm bảo:
    // - Điểm đầu = vị trí nút nhận (flyStartX/flyStartY)
    // - Điểm cuối = túi xu neo bên phải
    const COIN_SIZE = 80;
    const HALF = COIN_SIZE / 2;

    const w = typeof window !== 'undefined' ? window.innerWidth : 0;
    const h = typeof window !== 'undefined' ? window.innerHeight : 0;

    const claimRect = this.claimBurstBtn?.nativeElement?.getBoundingClientRect?.();
    const coinContainer = document.querySelector('.coin-bag-container') as HTMLElement | null;
    const coinImg = coinContainer?.querySelector('img.coin-bag-img') as HTMLImageElement | null;
    const coinRect = (coinImg || coinContainer)?.getBoundingClientRect?.();

    const startX = claimRect ? claimRect.left + claimRect.width / 2 - HALF : w / 2 - HALF;
    const startY = claimRect ? claimRect.top + claimRect.height / 2 - HALF : h / 2 - HALF;

    const endX = coinRect ? coinRect.left + coinRect.width / 2 - HALF : w - 17 - HALF;
    const endY = coinRect ? coinRect.top + coinRect.height / 2 - HALF : h - 260;

    const dx = endX - startX;
    const dy = endY - startY;

    // Đỉnh cong nằm cao hơn đoạn giữa một chút
    const peakY = Math.min(startY, endY) - 160;
    const ctrlX = startX + dx / 2;
    const ctrlY = peakY;

    const ctrlRelX = ctrlX - startX;
    const ctrlRelY = ctrlY - startY;

    this.flyStartX.set(startX);
    this.flyStartY.set(startY);
    this.flyEndX.set(endX);
    this.flyEndY.set(endY);

    // offset-path: relative theo hệ tọa độ của chính element (0,0 tại góc top-left element)
    this.flyOffsetPath.set(
      // offset-path path-data nên dùng số thuần (không kèm px) để trình duyệt parse đúng.
      `path('M 0 0 Q ${ctrlRelX} ${ctrlRelY} ${dx} ${dy}')`
    );
  }

  async resetCoinData() {
    const user = this.auth.currentUser();
    const userId = user?.user_id ?? '';
    const todayKey = toDateKey(new Date());

    // 1. Reset toàn bộ coins trong users_memory (balance, streak, history)
    await this.coinService.resetStreak();

    // 2. Xóa completion_log hôm nay trong tất cả reminders của user
    if (userId) {
      try {
        await firstValueFrom(
          this.http.post<any>('/api/reminders/reset-today-logs', { user_id: userId, dateKey: todayKey })
        );
        // Reload reminders để UI phản ánh trạng thái mới (chưa tick)
        this.loadReminders(userId);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Failed to reset today logs', msg);
      }
    }

    this.toast.showSuccess(`✅ Đã reset: xu về 0 và bỏ tick ngày ${todayKey}. Bạn có thể test lại!`);
  }

  private getMaxCompletionDate(r: Reminder): string | null {
    if (!r.completion_log || r.completion_log.length === 0) return null;
    const dates = r.completion_log.map((c) => c.date);
    dates.sort();
    return dates[dates.length - 1];
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return toDateKey(d);
  }

  private compareDateKey(a: string, b: string): number {
    return a.localeCompare(b);
  }

  private async checkAndAwardCoins(dateKey: string): Promise<void> {
    // Không còn tự động cộng xu nữa, chỉ hiện nút nhận xu trong nhật ký
  }
}
