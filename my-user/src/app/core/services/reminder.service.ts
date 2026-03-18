import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
  config_status?: string;
  schedule_status?: string;
  reminder_sound?: boolean;
  completion_log?: { date: string; time: string }[];
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
}

@Injectable({ providedIn: 'root' })
export class ReminderService {
  constructor(private http: HttpClient) {}

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

  delete(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API}/reminders/${id}`);
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
