import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductService {

  private apiUrl = 'http://localhost:3000/api/products';

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
    return this.http.get(`${this.apiUrl}${queryString ? '?' + queryString : ''}`);
  }

  getProductBySlug(slug: string): Observable<any> {
    // Note: The backend endpoint is /api/product/:slug, whereas base apiUrl is /api/products
    // So we need to construct the URL correctly.
    // Assuming backend endpoint is http://localhost:3000/api/product/:slug
    return this.http.get(`http://localhost:3000/api/product/${slug}`);
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
    return this.http.get<any[]>(`http://localhost:3000/api/products/related/${productId}`);
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
}
