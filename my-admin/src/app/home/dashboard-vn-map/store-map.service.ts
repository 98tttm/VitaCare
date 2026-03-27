import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

const API_BASE = '';

export interface DashboardStore {
  _id?: string;
  ma_cua_hang?: string;
  ten_cua_hang?: string;
  loai_hinh?: string;
  dia_chi?: {
    so_nha?: string;
    duong?: string;
    phuong_xa?: string;
    quan_huyen?: string;
    tinh_thanh?: string;
    dia_chi_day_du?: string;
  };
  toa_do?: { lat?: number; lng?: number };
  thong_tin_lien_he?: {
    so_dien_thoai?: string[];
    hotline?: string;
    zalo?: string;
  };
  thoi_gian_hoat_dong?: {
    thu_2_6?: { mo_cua: string; dong_cua: string };
    thu_7?: { mo_cua: string; dong_cua: string };
    chu_nhat?: { mo_cua: string; dong_cua: string };
    ngay_le?: string;
    ghi_chu?: string;
  };
  giao_hang?: boolean;
  ban_kinh_giao_hang?: number;
  danh_gia?: { diem_tb?: number; so_luot?: number; binh_luan_noi_bat?: string[] };
  mo_ta?: string;
  dich_vu?: string[];
  duoc_si?: { ho_ten?: string; trinh_do?: string; kinh_nghiem?: string; chuyen_mon?: string[] };
  giay_phep?: { so_giay_phep?: string; noi_cap?: string; ngay_het_han?: string };
  tien_nghi?: string[];
  phuong_thuc_thanh_toan?: string[];
  trang_thai?: string;
}

interface StoresApiResponse {
  success?: boolean;
  data: DashboardStore[];
  total: number;
  totalPages?: number;
}

@Injectable({ providedIn: 'root' })
export class StoreMapService {
  private readonly http = inject(HttpClient);

  private normalizeProvinceName(v: string): string {
    return (v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(tp|tp\.|thanh pho|tinh|city|province)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractStoreTinh(store: DashboardStore): string {
    const direct = store.dia_chi?.tinh_thanh?.trim();
    if (direct) return direct;
    const full = store.dia_chi?.dia_chi_day_du || '';
    const parts = full
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  /** Lấy toàn bộ cửa hàng (không filter tỉnh). */
  fetchAllStores(): Observable<DashboardStore[]> {
    const limit = 500;
    const params = new HttpParams().set('limit', String(limit)).set('page', '1');
    return this.http.get<StoresApiResponse>(`${API_BASE}/api/stores`, { params }).pipe(
      switchMap((first) => {
        const total = Number(first.total) || 0;
        const data = [...(first.data || [])];
        const totalPages = Math.max(1, Math.ceil(total / limit));
        if (totalPages <= 1) return of(data);

        const rest: Observable<StoresApiResponse>[] = [];
        for (let p = 2; p <= totalPages; p++) {
          const pp = new HttpParams().set('limit', String(limit)).set('page', String(p));
          rest.push(this.http.get<StoresApiResponse>(`${API_BASE}/api/stores`, { params: pp }));
        }
        return forkJoin(rest).pipe(
          map((pages) => {
            for (const pg of pages) data.push(...(pg.data || []));
            return data;
          })
        );
      })
    );
  }

  /**
   * Fallback khi query cứng theo tỉnh không ra dữ liệu:
   * - tải toàn bộ stores
   * - lọc bằng tên tỉnh chuẩn hóa + alias (hỗ trợ map tên cũ/mới, tỉnh/thành phố)
   */
  private fuzzyFilterByProvince(allStores: DashboardStore[], variants: string[]): DashboardStore[] {
    const normalized = new Set(
      variants
        .map((v) => this.normalizeProvinceName(v))
        .filter(Boolean)
    );
    if (!normalized.size) return [];

    return allStores.filter((s) => {
      const rawTinh = this.extractStoreTinh(s);
      const st = this.normalizeProvinceName(rawTinh);
      if (!st) return false;
      return normalized.has(st);
    });
  }

  /** Lấy toàn bộ cửa hàng theo tỉnh (phân trang nếu > limit). */
  fetchAllStoresForProvince(tinhThanh: string): Observable<DashboardStore[]> {
    const limit = 500;
    const params = new HttpParams()
      .set('tinh_thanh', tinhThanh)
      .set('limit', String(limit))
      .set('page', '1');

    return this.http.get<StoresApiResponse>(`${API_BASE}/api/stores`, { params }).pipe(
      switchMap((first) => {
        const total = Number(first.total) || 0;
        const data = [...(first.data || [])];
        const totalPages = Math.max(1, Math.ceil(total / limit));
        if (totalPages <= 1) return of(data);

        const rest: Observable<StoresApiResponse>[] = [];
        for (let p = 2; p <= totalPages; p++) {
          const pp = new HttpParams()
            .set('tinh_thanh', tinhThanh)
            .set('limit', String(limit))
            .set('page', String(p));
          rest.push(this.http.get<StoresApiResponse>(`${API_BASE}/api/stores`, { params: pp }));
        }
        return forkJoin(rest).pipe(
          map((pages) => {
            for (const pg of pages) {
              data.push(...(pg.data || []));
            }
            return data;
          })
        );
      })
    );
  }

  /** Thử nhiều biến thể tên tỉnh cho đến khi có dữ liệu. */
  fetchStoresWithVariants(variants: string[]): Observable<{ stores: DashboardStore[]; usedTinh: string }> {
    if (!variants.length) {
      return of({ stores: [], usedTinh: '' });
    }
    const [first, ...others] = variants;
    return this.fetchAllStoresForProvince(first).pipe(
      switchMap((stores) => {
        if (stores.length > 0 || others.length === 0) {
          if (stores.length > 0) return of({ stores, usedTinh: first });
          // Đến cuối vẫn rỗng -> thử khớp mềm từ toàn bộ DB.
          return this.fetchAllStores().pipe(
            map((all) => {
              const fuzzy = this.fuzzyFilterByProvince(all, variants);
              return { stores: fuzzy, usedTinh: `${first} (khớp mềm)` };
            })
          );
        }
        return this.fetchStoresWithVariants(others);
      })
    );
  }
}
