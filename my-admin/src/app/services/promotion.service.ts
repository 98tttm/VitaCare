import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class PromotionService {
    private apiUrl = '/api/admin/promotions';

    constructor(private http: HttpClient) { }

    getPromotions(): Observable<any> {
        return this.http.get<any>(this.apiUrl);
    }

    createPromotion(promotion: any): Observable<any> {
        return this.http.post<any>(this.apiUrl, promotion);
    }

    updatePromotion(id: string, promotion: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/${id}`, promotion);
    }

    deletePromotion(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/${id}`);
    }

    /** Upload file → URL ngắn /api/promo-images/... (cùng backend với KM) */
    uploadBannerImage(file: File): Observable<{ success: boolean; imageUrl?: string; token?: string; message?: string }> {
        const fd = new FormData();
        fd.append('file', file, file.name || 'banner.jpg');
        return this.http.post<{ success: boolean; imageUrl?: string; token?: string; message?: string }>(
            `${this.apiUrl}/upload-banner-image`,
            fd
        );
    }
}
