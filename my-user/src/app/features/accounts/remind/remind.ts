import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../../core/services/auth.service';
import {
  ReminderService,
  Reminder,
  ReminderCreate,
} from '../../../core/services/reminder.service';
import { ToastService } from '../../../core/services/toast.service';

const WEEK_DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

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

/** Cùng logic backend: trong [start,end] hoặc quá end nhưng lịch vẫn Active */
function reminderAppliesOnDate(r: Reminder, dateObj: Date): boolean {
  const start = new Date(r.start_date);
  const end = new Date(r.end_date);
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (d < s) return false;
  if (d <= e) return true;
  return r.schedule_status !== 'Inactive' && r.config_status !== 'Inactive';
}

@Component({
  selector: 'app-remind',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './remind.html',
  styleUrl: './remind.css',
})
export class Remind implements OnInit {
  private auth = inject(AuthService);
  private reminderApi = inject(ReminderService);
  private toast = inject(ToastService);

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
  deleteTarget = signal<Reminder | null>(null);
  isEditMode = signal(false);
  editingId = signal<string | null>(null);
  uploadingImage = signal(false);
  imageUploadError = signal<string | null>(null);

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
  });

  readonly WEEK_DAYS = WEEK_DAYS;

  /** Dùng trong template để format ngày đang chọn */
  formatDateForDisplayFn(d: Date): string {
    return formatDateForDisplay(d);
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
    this.loadReminders(userId);
    this.selectedDate.set(new Date());
  }

  /** Các ô ngày trong calendar tháng (6 hàng x 7 cột) */
  calendarCells = computed(() => {
    const month = this.currentMonth();
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const startDay = start.getDay() === 0 ? 7 : start.getDay(); // 1-7 (T2..CN)
    const diffToMonday = startDay - 1;
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - diffToMonday);

    const todayKey = toDateKey(new Date());
    const cells: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push({
        date: d,
        isCurrentMonth: d.getMonth() === month.getMonth(),
        isToday: toDateKey(d) === todayKey,
      });
    }
    return cells;
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
    this.diarySelectedDate.set(toDateKey(date));
    this.showDiaryPopup.set(true);
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

  openCreate(): void {
    this.initFormDates();
    const baseDate = this.selectedDate();
    this.formModel.set({
      med_name: '',
      dosage: '',
      unit: '',
      route: '',
      instruction: '',
      reminder_times: ['08:00'],
      frequency: '',
      start_date: toDateKey(baseDate),
      end_date: toDateKey(new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000)),
      note: '',
      image_url: null,
    });
    this.isEditMode.set(false);
    this.showCreatePopup.set(true);
  }

  openDetail(r: Reminder): void {
    // Đảm bảo popup chi tiết luôn trên cùng: đóng nhật ký nếu đang mở
    this.showDiaryPopup.set(false);
    this.showDetailPopup.set(r);
    this.isEditMode.set(false);
  }

  openEdit(r: Reminder): void {
    this.formModel.set({
      med_name: r.med_name,
      dosage: r.dosage,
      unit: r.unit || '',
      route: r.route || '',
      instruction: r.instruction || '',
      reminder_times: [...(r.reminder_times || ['08:00'])],
      frequency: r.frequency || '',
      start_date: r.start_date?.slice(0, 10) || '',
      end_date: r.end_date?.slice(0, 10) || '',
      note: r.note || '',
      image_url: r.image_url ?? null,
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

  closeCreate(): void {
    this.showCreatePopup.set(false);
    this.editingId.set(null);
  }

  closeDetail(): void {
    this.showDetailPopup.set(null);
  }

  closeDiary(): void {
    this.showDiaryPopup.set(false);
  }

  saveReminder(): void {
    const user = this.auth.currentUser();
    const userId = user?.user_id ?? '';
    if (!userId) return;
    const form = this.formModel();
    const editingId = this.editingId();
    if (editingId) {
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

  deleteReminder(r: Reminder): void {
    if (!r._id) return;
    this.deleteTarget.set(r);
    this.showDeleteConfirm.set(true);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target?._id) {
      this.showDeleteConfirm.set(false);
      return;
    }
    const id = target._id;
    this.reminderApi.delete(id).subscribe({
      next: (res) => {
        if (res.success) {
          this.reminders.update((list) => list.filter((x) => x._id !== id));
          this.toast.showSuccess('Đã xóa lời nhắc.');
        }
        this.showDeleteConfirm.set(false);
        this.closeDetail();
      },
      error: () => {
        this.showDeleteConfirm.set(false);
      },
    });
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
    this.deleteTarget.set(null);
  }

  completeReminder(_r: Reminder): void {
    // Hiển thị banner thành công phía trên (giống đăng nhập thành công)
    this.auth.showHeaderSuccess('Bạn đã hoàn thành lời nhắc');
    this.closeDetail();
  }

  toggleComplete(
    item: { reminder: Reminder; time: string; completed: boolean },
    dateOverride?: string
  ): void {
    const reminderId = item.reminder._id != null ? String(item.reminder._id) : '';
    if (!reminderId) return;
    const dk = dateOverride ?? this.dateKey();
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
      reminder_times: [...(m.reminder_times || ['08:00']), '12:00'],
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
}
