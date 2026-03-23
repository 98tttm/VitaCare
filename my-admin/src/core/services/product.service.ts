import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  constructor(private http: HttpClient) { }

  getProductBySlug(slug: string): Observable<any> {
    return this.http.get<any>(`http://localhost:3000/api/product/${slug}`);
  }
}
