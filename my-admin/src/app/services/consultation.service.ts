import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ConsultationService {
    private apiUrl = 'http://localhost:3000/api/admin';

    constructor(private http: HttpClient) { }

    getProductConsultations(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/consultations_product`);
    }

    getProductConsultationStats(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/consultations_product/stats`);
    }

    getPrescriptionConsultations(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/consultations_prescription`);
    }

    updatePrescription(id: string, data: any): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/consultations_prescription/${id}`, data);
    }

    replyProductQuestion(data: { sku: string, questionId: string, answer: string, answeredBy: string }): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/consultations_product/reply`, data);
    }

    getPharmacists(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/pharmacists`);
    }

    deletePrescriptionConsultation(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/consultations_prescription/${id}`);
    }

    deleteProductConsultation(sku: string, questionId: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/consultations_product/${sku}/${questionId}`);
    }
}
