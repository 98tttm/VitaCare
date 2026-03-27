import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DiseaseResponse {
    success: boolean;
    data: any[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

@Injectable({
    providedIn: 'root'
})
export class DiseaseService {
    private apiUrl = '/api/admin';

    constructor(private http: HttpClient) { }

    getDiseases(page: number = 1, limit: number = 20, filters: any = {}): Observable<DiseaseResponse> {
        let url = `${this.apiUrl}/diseases?page=${page}&limit=${limit}`;
        if (filters.search) url += `&search=${encodeURIComponent(filters.search)}`;
        if (filters.groupIds) url += `&groupIds=${encodeURIComponent(filters.groupIds)}`;
        if (filters.status) url += `&status=${encodeURIComponent(filters.status)}`;
        if (filters.sortColumn) url += `&sortColumn=${encodeURIComponent(filters.sortColumn)}`;
        if (filters.sortDirection) url += `&sortDirection=${encodeURIComponent(filters.sortDirection)}`;
        return this.http.get<DiseaseResponse>(url);
    }

    getDiseaseById(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/diseases/${id}`);
    }

    createDisease(data: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/diseases`, data);
    }

    updateDisease(id: string, data: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/diseases/${id}`, data);
    }

    deleteDisease(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/diseases/${id}`);
    }

    getGroups(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/disease-groups`);
    }

    searchDiseases(query: string): Observable<DiseaseResponse> {
        return this.getDiseases(1, 10, { search: query });
    }
}
