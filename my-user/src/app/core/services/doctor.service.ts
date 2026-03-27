import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Doctor {
    _id: number;
    name: string;
    slug: string;
    degree: string;
    specialize: string;
    organization: string;
    position: string;
    biography: string;
    avatar: {
        alt: string;
        src: string;
        width: number;
        height: number;
    };
    priority: number;
}

@Injectable({
    providedIn: 'root'
})
export class DoctorService {
    private apiUrl = '/api/doctors';

    constructor(private http: HttpClient) { }

    getDoctors(limit: number = 20): Observable<Doctor[]> {
        return this.http.get<Doctor[]>(`${this.apiUrl}?limit=${limit}`);
    }
}
