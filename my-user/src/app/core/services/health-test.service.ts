import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_BASE = '';

export interface QuizResultReq {
  name: string;
  province: string;
  phone: string;
  dob?: string;
  gender?: string;
  referralCode?: string;
  agreed?: boolean;
  quiz_id: string;
  score: number;
  result_id: string;
  /** Chỉ khi đã đăng nhập — backend bỏ qua lưu nếu thiếu */
  user_id?: string;
  result_title?: string;
  result_badge?: string;
  recommendation?: string;
}

@Injectable({
  providedIn: 'root'
})
export class HealthTestService {
  constructor(private http: HttpClient) { }

  getQuizzes(): Observable<any[]> {
    return this.http.get<any[]>(`${API_BASE}/api/quizzes`);
  }

  submitResult(req: QuizResultReq): Observable<any> {
    return this.http.post(`${API_BASE}/api/quiz-results`, req);
  }

  getQuizHistory(quiz_id: string, user_id: string): Observable<any[]> {
    const q = encodeURIComponent(user_id);
    return this.http.get<any[]>(`${API_BASE}/api/quiz-history/${encodeURIComponent(quiz_id)}?user_id=${q}`);
  }
}
