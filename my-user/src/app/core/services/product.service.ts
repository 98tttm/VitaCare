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
    // Note: The backend endpoint is /api/product/:slug, whereas base apiUrl is /api/products
    // So we need to construct the URL correctly.
    // Assuming backend endpoint is http://localhost:3000/api/product/:slug
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

  replyToReview(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/reviews/reply', data);
  }

  likeReview(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/reviews/like', data);
  }

  getProductConsultations(sku: string): Observable<any> {
    return this.http.get(`http://localhost:3000/api/consultations/${sku}`);
  }

  submitConsultation(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/consultations', data);
  }

  likeConsultation(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/consultations/like', data);
  }

  replyToConsultation(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/consultations/reply', data);
  }

  getProductFaqs(productId: string): Observable<any[]> {
    return this.http.get<any[]>(`http://localhost:3000/api/product-faqs/${productId}`);
  }

  getFavorites(userId: string): Observable<any> {
    return this.http.get(`http://localhost:3000/api/favorites?user_id=${userId}`);
  }

  addToFavorites(userId: string, video: any): Observable<any> {
    return this.http.post('http://localhost:3000/api/favorites', { user_id: userId, video });
  }

  removeFromFavorites(userId: string, videoId: string): Observable<any> {
    // Backend expects videoId in body for DELETE (as per my implementation)
    return this.http.request('delete', 'http://localhost:3000/api/favorites', {
      body: { user_id: userId, videoId }
    });
  }
}
