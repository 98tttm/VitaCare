import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = 'http://localhost:3000/api/products';
  private readonly apiBase = 'http://localhost:3000';

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
    return this.http.get<any>(`http://localhost:3000/api/product/${slug}`).pipe(
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
    return this.http.get('http://localhost:3000/api/products/stats');
  }

  getHealthVideos(options: any = {}): Observable<any[]> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.category) params.set('category', options.category);
    if (options.keyword) params.set('keyword', options.keyword);
    if (options.productName) params.set('productName', options.productName);

    const queryString = params.toString();
    return this.http.get<any[]>(`http://localhost:3000/api/health-videos${queryString ? '?' + queryString : ''}`);
  }

  getHealthVideoById(id: string): Observable<any> {
    return this.http.get<any>(`http://localhost:3000/api/health-video/${id}`);
  }

  getRelatedProducts(productId: string): Observable<any[]> {
    return this.http.get<any[]>(`http://localhost:3000/api/products/related/${productId}`).pipe(
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
    return this.http.get(`http://localhost:3000/api/reviews/${sku}`);
  }

  submitReview(reviewData: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/reviews', reviewData);
  }

  updateReview(reviewData: any): Observable<any> {
    return this.http.patch('http://localhost:3000/api/reviews', reviewData);
  }

  deleteReview(sku: string, reviewId: string): Observable<any> {
    return this.http.delete(`http://localhost:3000/api/reviews/${sku}/${reviewId}`);
  }

  replyToReview(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/reviews/reply', data);
  }

  likeReview(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/reviews/like', data);
  }

  likeReviewReply(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/reviews/reply/like', data);
  }

  updateReviewReply(data: any): Observable<any> {
    return this.http.patch('http://localhost:3000/api/reviews/reply', data);
  }

  deleteReviewReply(sku: string, reviewId: string, replyId: string, userId: string): Observable<any> {
    return this.http.delete(`http://localhost:3000/api/reviews/reply/${sku}/${reviewId}/${replyId}/${userId}`);
  }

  getProductConsultations(sku: string): Observable<any> {
    return this.http.get(`http://localhost:3000/api/consultations/${sku}`);
  }

  submitConsultation(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/consultations', data);
  }

  updateConsultation(data: any): Observable<any> {
    return this.http.patch('http://localhost:3000/api/consultations', data);
  }

  deleteConsultation(sku: string, questionId: string): Observable<any> {
    return this.http.delete(`http://localhost:3000/api/consultations/${sku}/${questionId}`);
  }

  likeConsultation(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/consultations/like', data);
  }

  replyToConsultation(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/consultations/reply', data);
  }

  updateConsultationReply(data: any): Observable<any> {
    return this.http.patch('http://localhost:3000/api/consultations/reply', data);
  }

  deleteConsultationReply(sku: string, questionId: string, replyId: string, userId: string): Observable<any> {
    return this.http.delete(`http://localhost:3000/api/consultations/reply/${sku}/${questionId}/${replyId}/${userId}`);
  }

  likeConsultationReply(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/consultations/reply/like', data);
  }

  likeConsultationExpertAnswer(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/consultations/expert-answer/like', data);
  }

  getProductFaqs(productId: string): Observable<any[]> {
    return this.http.get<any[]>(`http://localhost:3000/api/product-faqs/${productId}`);
  }

  getFavorites(userId: string): Observable<any> {
    return this.http.get(`http://localhost:3000/api/favorites?user_id=${userId}`).pipe(
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
    return this.http.post('http://localhost:3000/api/favorites', { user_id: userId, video });
  }

  removeFromFavorites(userId: string, videoId: string): Observable<any> {
    return this.http.request('delete', 'http://localhost:3000/api/favorites', {
      body: { user_id: userId, videoId }
    });
  }

  trackProductView(userId: string, product: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/recently-viewed', { user_id: userId, product });
  }

  getRecentlyViewed(userId: string): Observable<any> {
    return this.http.get(`http://localhost:3000/api/recently-viewed?user_id=${userId}`).pipe(
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
    return this.http.request('delete', 'http://localhost:3000/api/recently-viewed', {
      body: { user_id: userId, productId }
    });
  }

  clearRecentlyViewedHistory(userId: string): Observable<any> {
    return this.http.request('delete', 'http://localhost:3000/api/recently-viewed/all', {
      body: { user_id: userId }
    });
  }
}
