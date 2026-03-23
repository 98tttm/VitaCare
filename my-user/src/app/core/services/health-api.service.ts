import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = '/api';

export interface MedicationReminderItem {
  time?: string;
  medicine?: string;
  pills?: string | number;
}

export interface HealthProfile {
  user_id: string;
  bmi: number | null;
  bmiStatus: string | null;
  bmr: number | null;
  bmrStatus: string | null;
  bloodPressure: string | null;
  bloodPressureStatus: string | null;
  bloodSugar: string | null;
  bloodSugarStatus: string | null;
  bloodFat: string | null;
  bloodFatStatus: string | null;
  osteoporosis: string | null;
  osteoporosisStatus: string | null;
  menstruation: string | null;
  pregnancy: string | null;
  medicationReminder: MedicationReminderItem[];
  updatedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class HealthApiService {
  constructor(private http: HttpClient) {}

  getProfile(user_id: string): Observable<{ success: boolean; profile?: HealthProfile }> {
    return this.http.get<{ success: boolean; profile?: HealthProfile }>(`${API}/healthprofiles`, {
      params: { user_id },
    });
  }

  updateProfile(body: Partial<HealthProfile> & { user_id: string }): Observable<{ success: boolean; profile?: HealthProfile; message?: string }> {
    const payload = { ...body, user_id: String(body.user_id) };
    return this.http.patch<{ success: boolean; profile?: HealthProfile; message?: string }>(`${API}/healthprofiles`, payload);
  }
}
