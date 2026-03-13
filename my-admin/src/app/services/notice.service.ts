import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AdminNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  link?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NoticeService {
  private apiUrl = 'http://localhost:3000/api/admin/notifications';

  constructor(@Inject(HttpClient) private http: HttpClient) { }

  getNotifications(limit: number = 20): Observable<{ success: boolean; data: AdminNotification[] }> {
    return this.http.get<{ success: boolean; data: AdminNotification[] }>(`${this.apiUrl}?limit=${limit}`);
  }
}

