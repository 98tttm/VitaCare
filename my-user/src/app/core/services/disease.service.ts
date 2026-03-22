import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface DiseaseFilters {
  bodyPart?: string;
  groupSlug?: string;
  page?: number;
  limit?: number;
}

export interface DiseaseGroup {
  slug: string;
  name: string;
  icon?: string;
  count?: number;
}

@Injectable({
  providedIn: 'root',
})
export class DiseaseService {
  private apiUrl = '/api';

  constructor(private http: HttpClient) { }

  /** Lấy danh sách nhóm bệnh từ MongoDB (API). */
  getDiseaseGroups(): Observable<DiseaseGroup[]> {
    return this.http.get<DiseaseGroup[]>(`${this.apiUrl}/disease-groups`).pipe(
      map((res: any) => (Array.isArray(res) ? res : res?.groups ?? [])),
      catchError(() => of([]))
    );
  }

  /** Lấy danh sách bệnh từ MongoDB (API). */
  getDiseases(filters: DiseaseFilters): Observable<{
    diseases: any[];
    total: number;
    totalPages: number;
  }> {
    let params = new HttpParams();
    if (filters.bodyPart) params = params.set('bodyPart', filters.bodyPart);
    if (filters.groupSlug) params = params.set('groupSlug', filters.groupSlug);
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.limit) params = params.set('limit', String(filters.limit));

    return this.http.get<any>(`${this.apiUrl}/diseases`, { params }).pipe(
      map((res) => ({
        diseases: res?.diseases ?? [],
        total: res?.total ?? 0,
        totalPages: res?.totalPages ?? 1,
      })),
      catchError(() => of({ diseases: [], total: 0, totalPages: 1 }))
    );
  }

  getDiseaseById(id: string): Observable<any> {
    const encodedId = encodeURIComponent(id);
    return this.http.get<any>(`${this.apiUrl}/diseases/${encodedId}`).pipe(
      catchError(() => of({ message: 'Not found' }))
    );
  }

  /** Lấy danh sách câu hỏi về bệnh. */
  getConsultations(id: string): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/consultations/disease/${encodeURIComponent(id)}`).pipe(
      map(res => res?.questions ?? []),
      catchError(() => of([]))
    );
  }

  /** Gửi câu hỏi mới về bệnh. */
  postConsultation(data: { sku: string, productName: string, question: string, user_id?: string, full_name?: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/consultations/disease`, data).pipe(
      catchError((err) => {
        console.error('Post consultation error:', err);
        throw err;
      })
    );
  }

  /** Sửa câu hỏi hỏi đáp bệnh (chỉ chủ userId). */
  patchDiseaseConsultationQuestion(data: {
    sku: string;
    questionId: string;
    question: string;
    userId: string;
  }): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/consultations/disease/question`, data).pipe(
      catchError((err) => {
        console.error('Patch disease consultation question error:', err);
        throw err;
      })
    );
  }

  /** Xóa câu hỏi hỏi đáp bệnh (chỉ chủ userId). */
  deleteDiseaseConsultationQuestion(sku: string, questionId: string, userId: string): Observable<any> {
    const params = new HttpParams()
      .set('sku', sku)
      .set('questionId', questionId)
      .set('userId', userId);
    return this.http.delete<any>(`${this.apiUrl}/consultations/disease/question`, { params }).pipe(
      catchError((err) => {
        console.error('Delete disease consultation question error:', err);
        throw err;
      })
    );
  }

  /** Toggle "Hữu ích" trên câu hỏi về bệnh. */
  likeDiseaseConsultation(data: { sku: string; questionId: string; userId: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/consultations/disease/like`, data).pipe(
      catchError((err) => {
        console.error('Like disease consultation error:', err);
        throw err;
      })
    );
  }

  /** Toggle "Hữu ích" trên một phản hồi trong hỏi đáp bệnh. */
  likeDiseaseConsultationReply(data: {
    sku: string;
    questionId: string;
    replyId: string;
    userId: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/consultations/disease/reply/like`, data).pipe(
      catchError((err) => {
        console.error('Like disease consultation reply error:', err);
        throw err;
      })
    );
  }

  /** Thống kê đánh giá độ hữu ích bài bệnh (1–5). */
  getDiseaseArticleRating(sku: string, userId?: string): Observable<{
    success: boolean;
    counts: Record<number, number>;
    total: number;
    average: number;
    userScore: number | null;
  }> {
    const q = userId?.trim() ? `?userId=${encodeURIComponent(userId.trim())}` : '';
    return this.http
      .get<any>(`${this.apiUrl}/diseases/article-rating/${encodeURIComponent(sku)}${q}`)
      .pipe(
        catchError(() =>
          of({
            success: false,
            counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            total: 0,
            average: 0,
            userScore: null,
          })
        )
      );
  }

  /** Gửi / đổi điểm đánh giá bài bệnh (mỗi user một điểm). */
  postDiseaseArticleRating(data: { sku: string; score: number; userId: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/diseases/article-rating`, data).pipe(
      catchError((err) => {
        console.error('Post disease article rating error:', err);
        throw err;
      })
    );
  }

  /** Trả lời câu hỏi về bệnh. */
  replyDiseaseConsultation(data: {
    sku: string;
    questionId: string;
    content: string;
    fullname?: string;
    user_id?: string | null;
    avatar?: string;
    isAdmin?: boolean;
  }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/consultations/disease/reply`, data).pipe(
      catchError((err) => {
        console.error('Reply disease consultation error:', err);
        throw err;
      })
    );
  }

  /** Sửa phản hồi trong hỏi đáp bệnh (chỉ chủ userId). */
  patchDiseaseConsultationReply(data: {
    sku: string;
    questionId: string;
    replyId: string;
    content: string;
    userId: string;
  }): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/consultations/disease/reply`, data).pipe(
      catchError((err) => {
        console.error('Patch disease consultation reply error:', err);
        throw err;
      })
    );
  }

  /** Xóa phản hồi trong hỏi đáp bệnh (chỉ chủ userId). */
  deleteDiseaseConsultationReply(
    sku: string,
    questionId: string,
    replyId: string,
    userId: string
  ): Observable<any> {
    const params = new HttpParams()
      .set('sku', sku)
      .set('questionId', questionId)
      .set('replyId', replyId)
      .set('userId', userId);
    return this.http.delete<any>(`${this.apiUrl}/consultations/disease/reply`, { params }).pipe(
      catchError((err) => {
        console.error('Delete disease consultation reply error:', err);
        throw err;
      })
    );
  }
}
