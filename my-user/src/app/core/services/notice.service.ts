import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import type { NoticeItem } from '../../features/accounts/notice/notice';

export interface NoticeApiResponse {
  success: boolean;
  items: NoticeItem[];
}

@Injectable({
  providedIn: 'root',
})
export class NoticeService {
  private apiUrl = 'http://localhost:3000/api/notices';
  private refreshSubject = new Subject<void>();
  refresh$ = this.refreshSubject.asObservable();

  triggerRefresh(): void {
    this.refreshSubject.next();
  }

  constructor(private http: HttpClient) { }

  getNotices(userId: string): Observable<NoticeApiResponse> {
    return this.http.get<NoticeApiResponse>(`${this.apiUrl}?user_id=${encodeURIComponent(userId)}`);
  }

  markAsRead(noticeId: string, userId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(
      `${this.apiUrl}/${encodeURIComponent(noticeId)}/read?user_id=${encodeURIComponent(userId)}`,
      {}
    );
  }

  markAllAsRead(userId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.apiUrl}/read-all`, { user_id: userId });
  }
}
