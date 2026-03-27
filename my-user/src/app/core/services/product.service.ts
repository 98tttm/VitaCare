import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = '/api/products';
  private readonly apiBase = '';

  /** Chuẩn hoá URL ảnh trả về từ backend (thêm domain nếu là đường dẫn tương đối). */
  private normalizeMediaUrl(src?: string | null): string | undefined {
    if (!src) return undefined;
    if (typeof src !== 'string') return src as any;
    // Bỏ qua nếu đã là URL tuyệt đối hoặc asset frontend
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('assets/')) {
      return src;
    }
    // Thêm domain cho đường dẫn bắt đầu bằng /
    if (src.startsWith('/')) {
      return `${this.apiBase}${src}`;
    }
    // Các trường hợp còn lại coi như đường dẫn tương đối trên server
    return `${this.apiBase}/${src}`;
  }

  constructor(private http: HttpClient) { }

  /** Lấy tên hiển thị theo danh sách user_id (tooltip người đã thích). */
  getUserDisplayNames(ids: string[]): Observable<Record<string, string>> {
    const clean = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
    if (clean.length === 0) return of({});
    return this.http
      .post<{ success: boolean; names: Record<string, string> }>(`${this.apiBase}/api/users/display-names`, {
        ids: clean,
      })
      .pipe(
        map((res) => (res && res.names) || {}),
        catchError(() => of({}))
      );
  }

  getProducts(options: any = {}): Observable<any> {
    const params = new URLSearchParams();

    Object.keys(options).forEach(key => {
      const value = options[key];
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            params.set(key, value.join(','));
          }
        } else {
          params.set(key, value.toString());
        }
      }
    });

    const queryString = params.toString();
    return this.http.get<any>(`${this.apiUrl}${queryString ? '?' + queryString : ''}`).pipe(
      map((res) => {
        const products = Array.isArray(res?.products)
          ? res.products.map((p: any) => ({
            ...p,
            image: this.normalizeMediaUrl(p.image) || p.image,
            gallery: Array.isArray(p.gallery)
              ? p.gallery.map((g: string) => this.normalizeMediaUrl(g) || g)
              : p.gallery,
          }))
          : [];
        return { ...res, products };
      })
    );
  }

  getProductBySlug(slug: string): Observable<any> {
    return this.http.get<any>(`/api/product/${slug}`).pipe(
      map((p) => {
        if (!p) return p;
        const image = this.normalizeMediaUrl(p.image) || p.image;
        const gallery = Array.isArray(p.gallery)
          ? p.gallery.map((g: string) => this.normalizeMediaUrl(g) || g)
          : p.gallery;
        return { ...p, image, gallery };
      })
    );
  }

  getProductStats(): Observable<any> {
    return this.http.get('/api/products/stats');
  }

  getHealthVideos(options: any = {}): Observable<any[]> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.category) params.set('category', options.category);
    if (options.keyword) params.set('keyword', options.keyword);
    if (options.productName) params.set('productName', options.productName);

    const queryString = params.toString();
    return this.http.get<any[]>(`/api/health-videos${queryString ? '?' + queryString : ''}`);
  }

  getHealthVideoById(id: string): Observable<any> {
    return this.http.get<any>(`/api/health-video/${id}`);
  }

  getRelatedProducts(productId: string): Observable<any[]> {
    return this.http.get<any[]>(`/api/products/related/${productId}`).pipe(
      map((list) =>
        Array.isArray(list)
          ? list.map((p: any) => ({
            ...p,
            image: this.normalizeMediaUrl(p.image) || p.image,
          }))
          : []
      )
    );
  }

  getProductReviews(sku: string): Observable<any> {
    return this.http.get(`/api/reviews/${sku}`);
  }

  submitReview(reviewData: any): Observable<any> {
    return this.http.post('/api/reviews', reviewData);
  }

  updateReview(reviewData: any): Observable<any> {
    return this.http.patch('/api/reviews', reviewData);
  }

  deleteReview(sku: string, reviewId: string): Observable<any> {
    return this.http.delete(`/api/reviews/${sku}/${reviewId}`);
  }

  replyToReview(data: any): Observable<any> {
    return this.http.post('/api/reviews/reply', data);
  }

  likeReview(data: any): Observable<any> {
    return this.http.post('/api/reviews/like', data);
  }

  likeReviewReply(data: any): Observable<any> {
    return this.http.post('/api/reviews/reply/like', data);
  }

  updateReviewReply(data: any): Observable<any> {
    return this.http.patch('/api/reviews/reply', data);
  }

  deleteReviewReply(sku: string, reviewId: string, replyId: string, userId: string): Observable<any> {
    return this.http.delete(`/api/reviews/reply/${sku}/${reviewId}/${replyId}/${userId}`);
  }

  getProductConsultations(sku: string): Observable<any> {
    return this.http.get(`/api/consultations/${sku}`);
  }

  submitConsultation(data: any): Observable<any> {
    return this.http.post('/api/consultations', data);
  }

  updateConsultation(data: any): Observable<any> {
    return this.http.patch('/api/consultations', data);
  }

  deleteConsultation(sku: string, questionId: string): Observable<any> {
    return this.http.delete(`/api/consultations/${sku}/${questionId}`);
  }

  likeConsultation(data: any): Observable<any> {
    return this.http.post('/api/consultations/like', data);
  }

  replyToConsultation(data: any): Observable<any> {
    return this.http.post('/api/consultations/reply', data);
  }

  updateConsultationReply(data: any): Observable<any> {
    return this.http.patch('/api/consultations/reply', data);
  }

  deleteConsultationReply(sku: string, questionId: string, replyId: string, userId: string): Observable<any> {
    return this.http.delete(`/api/consultations/reply/${sku}/${questionId}/${replyId}/${userId}`);
  }

  likeConsultationReply(data: any): Observable<any> {
    return this.http.post('/api/consultations/reply/like', data);
  }

  likeConsultationExpertAnswer(data: any): Observable<any> {
    return this.http.post('/api/consultations/expert-answer/like', data);
  }

  getProductFaqs(productId: string): Observable<any[]> {
    return this.http.get<any[]>(`/api/product-faqs/${productId}`);
  }

  getFavorites(userId: string): Observable<any> {
    return this.http.get(`/api/favorites?user_id=${userId}`).pipe(
      map((res: any) => {
        if (res && res.favorites) {
          res.favorites = res.favorites.map((v: any) => ({
            ...v,
            thumbnail: this.normalizeMediaUrl(v.thumbnail) || v.thumbnail,
          }));
        }
        return res;
      })
    );
  }

  addToFavorites(userId: string, video: any): Observable<any> {
    return this.http.post('/api/favorites', { user_id: userId, video });
  }

  removeFromFavorites(userId: string, videoId: string): Observable<any> {
    return this.http.request('delete', '/api/favorites', {
      body: { user_id: userId, videoId }
    });
  }

  trackProductView(userId: string, product: any): Observable<any> {
    return this.http.post('/api/recently-viewed', { user_id: userId, product });
  }

  getRecentlyViewed(userId: string): Observable<any> {
    return this.http.get(`/api/recently-viewed?user_id=${userId}`).pipe(
      map((res: any) => {
        if (res && res.recentlyViewed) {
          res.recentlyViewed = res.recentlyViewed.map((p: any) => ({
            ...p,
            image: this.normalizeMediaUrl(p.image) || p.image,
          }));
        }
        return res;
      })
    );
  }

  deleteRecentlyViewedProduct(userId: string, productId: string): Observable<any> {
    return this.http.request('delete', '/api/recently-viewed', {
      body: { user_id: userId, productId }
    });
  }

  clearRecentlyViewedHistory(userId: string): Observable<any> {
    return this.http.request('delete', '/api/recently-viewed/all', {
      body: { user_id: userId }
    });
  }
}
