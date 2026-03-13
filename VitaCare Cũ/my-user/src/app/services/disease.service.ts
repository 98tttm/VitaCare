import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class DiseaseService {
    private apiUrl = 'http://localhost:3000/api/diseases';
    private groupsUrl = 'http://localhost:3000/api/disease-groups';

    constructor(private http: HttpClient) { }

    getDiseases(params: { keyword?: string; limit?: number; page?: number; bodyPart?: string; slug?: string; groupSlug?: string }): Observable<any> {
        return this.http.get(this.apiUrl, { params: params as any });
    }

    getDiseaseById(id: number | string): Observable<any> {
        const params: any = {};
        if (typeof id === 'number' || /^\d+$/.test(String(id))) {
            params.id = String(id);
        } else {
            params.slug = String(id);
        }
        return this.http.get(this.apiUrl, { params });
    }

    getDiseaseGroups(): Observable<any[]> {
        return this.http.get<any[]>(this.groupsUrl);
    }
}
