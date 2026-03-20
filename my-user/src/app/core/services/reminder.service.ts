import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

const API = '/api';

export interface Reminder {
  _id?: string;
  user_id: string;
  is_completed?: boolean;
  last_completed_date?: string | null;
  start_date: string;
  end_date: string;
  frequency: string;
  times_per_day: number;
  reminder_times: string[];
  med_id?: string;
  med_name: string;
  dosage: string;
  unit?: string;
  route?: string;
  instruction?: string;
  note?: string;
  image_url?: string | null;
  tag_label?: string | null;
  tag_color?: string | null;
  config_status?: string;
  schedule_status?: string;
  reminder_sound?: boolean;
  completion_log?: { date: string; time: string }[];
  /** Các ngày (YYYY-MM-DD) đã bỏ khỏi lịch nhưng vẫn giữ một lời nhắc */
  skipped_dates?: string[];
}

export interface ReminderCreate {
  user_id: string;
  start_date: string;
  end_date: string;
  frequency?: string;
  times_per_day?: number;
  reminder_times: string[];
  med_name: string;
  dosage: string;
  unit?: string;
  route?: string;
  instruction?: string;
  note?: string;
  image_url?: string | null;
  tag_label?: string | null;
  tag_color?: string | null;
  skipped_dates?: string[];
}

@Injectable({ providedIn: 'root' })
export class ReminderService {
  constructor(private http: HttpClient) { }

  getByUser(user_id: string): Observable<{ success: boolean; reminders: Reminder[] }> {
    return this.http.get<{ success: boolean; reminders: Reminder[] }>(`${API}/reminders`, {
      params: { user_id },
    });
  }

  create(body: ReminderCreate): Observable<{ success: boolean; reminder?: Reminder }> {
    return this.http.post<{ success: boolean; reminder?: Reminder }>(`${API}/reminders`, body);
  }

  update(id: string, body: Partial<Reminder>): Observable<{ success: boolean; reminder?: Reminder }> {
    return this.http.patch<{ success: boolean; reminder?: Reminder }>(`${API}/reminders/${id}`, body);
  }

  /**
   * @param opts.date Khi có: xóa theo ngày (nhật ký).
   * @param opts.scope `day` = chỉ bỏ đúng ngày đó; `from` = từ ngày đó đến hết lịch (giữ ngày trước đó, kể cả đã qua).
   * @param opts.rangeStart/rangeEnd Khớp lịch theo giờ local như UI (YYYY-MM-DD), tránh lệch UTC vs calendar.
   */
  delete(
    id: string,
    opts?: { date?: string; scope?: 'from' | 'day'; rangeStart?: string; rangeEnd?: string }
  ): Observable<{ success: boolean }> {
    let params = new HttpParams();
    if (opts?.date) {
      const dk = opts.date.slice(0, 10);
      params = params.set('date', dk);
      params = params.set('scope', opts.scope === 'day' ? 'day' : 'from');
      const rs = opts.rangeStart?.slice(0, 10);
      const re = opts.rangeEnd?.slice(0, 10);
      if (rs && /^\d{4}-\d{2}-\d{2}$/.test(rs)) params = params.set('rangeStart', rs);
      if (re && /^\d{4}-\d{2}-\d{2}$/.test(re)) params = params.set('rangeEnd', re);
    }
    return this.http.delete<{ success: boolean }>(`${API}/reminders/${id}`, {
      params,
    });
  }

  /**
   * Chỉ bỏ hiển thị đúng một ngày (skipped_dates).
   * Nếu backend chưa có /skip-one-day (404) → fallback POST delete-calendar?scope=day (cần backend đã pull bản có delete-calendar).
   */
  skipOneCalendarDay(
    id: string,
    body: { calendarDate: string; rangeStart: string; rangeEnd: string }
  ): Observable<{ success: boolean }> {
    const idEnc = encodeURIComponent(String(id ?? '').trim());
    const cal = String(body.calendarDate ?? '').slice(0, 10);
    const rs = String(body.rangeStart ?? '').slice(0, 10);
    const re = String(body.rangeEnd ?? '').slice(0, 10);
    const payload = { calendarDate: cal, rangeStart: rs, rangeEnd: re };
    return this.http
      .post<{ success: boolean }>(`${API}/reminders/${idEnc}/skip-one-day`, payload)
      .pipe(
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) {
            return this.http.post<{ success: boolean }>(`${API}/reminders/${idEnc}/delete-calendar`, {
              ...payload,
              scope: 'day',
            });
          }
          return throwError(() => err);
        })
      );
  }

  /**
   * Cắt lịch từ một ngày đến hết (POST delete-calendar, scope=from). Không dùng cho “chỉ một ngày”.
   */
  deleteCalendar(
    id: string,
    body: {
      calendarDate: string;
      scope: 'day' | 'from';
      rangeStart: string;
      rangeEnd: string;
    }
  ): Observable<{ success: boolean }> {
    const idEnc = encodeURIComponent(String(id ?? '').trim());
    const cal = String(body.calendarDate ?? '').slice(0, 10);
    const rs = String(body.rangeStart ?? '').slice(0, 10);
    const re = String(body.rangeEnd ?? '').slice(0, 10);
    return this.http.post<{ success: boolean }>(`${API}/reminders/${idEnc}/delete-calendar`, {
      calendarDate: cal,
      scope: body.scope,
      rangeStart: rs,
      rangeEnd: re,
    });
  }

  markComplete(id: string, date: string, time: string): Observable<{ success: boolean; reminder?: Reminder }> {
    return this.http.post<{ success: boolean; reminder?: Reminder }>(`${API}/reminders/${id}/complete`, {
      date,
      time,
    });
  }

  markUncomplete(id: string, date: string, time: string): Observable<{ success: boolean; reminder?: Reminder }> {
    return this.http.post<{ success: boolean; reminder?: Reminder }>(`${API}/reminders/${id}/uncomplete`, {
      date,
      time,
    });
  }

  uploadImage(file: File): Observable<{ success: boolean; url?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ success: boolean; url?: string }>(`${API}/reminders/upload-image`, formData);
  }
}
