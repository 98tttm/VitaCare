import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const API_BASE = '';

import { Store } from '../models/store.model';

export interface StoreFilter {
  keyword?: string;
  tinh_thanh?: string;
  quan_huyen?: string;
  phuong_xa?: string;
  page?: number;
  limit?: number;
}

export interface LocationItem {
  tinh: string;
  quans: { ten: string; phuongs: string[] }[];
}

@Injectable({ providedIn: 'root' })
export class StoreService {
  constructor(private http: HttpClient) { }

  getLocations(): Observable<LocationItem[]> {
    return this.http.get<LocationItem[]>(`${API_BASE}/api/store-locations/tree`);
  }

  getStores(filter: StoreFilter): Observable<{ data: Store[]; total: number; totalPages: number }> {
    let params = new HttpParams();
    if (filter.keyword) params = params.set('keyword', filter.keyword);
    if (filter.tinh_thanh) params = params.set('tinh_thanh', filter.tinh_thanh);
    if (filter.quan_huyen) params = params.set('quan_huyen', filter.quan_huyen);
    if (filter.phuong_xa) params = params.set('phuong_xa', filter.phuong_xa);
    if (filter.page) params = params.set('page', filter.page.toString());
    if (filter.limit) params = params.set('limit', filter.limit.toString());

    return this.http
      .get<{ success: boolean; data: Store[]; total: number; totalPages: number }>(
        `${API_BASE}/api/stores`,
        { params }
      )
      .pipe(
        map((res) => ({
          data: res.data || [],
          total: res.total || 0,
          totalPages: res.totalPages || 1,
        }))
      );
  }
}
