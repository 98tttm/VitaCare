import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class ConsultationService {
    private apiUrl = '/api/admin';

    constructor(
        private http: HttpClient,
        private auth: AuthService
    ) { }

    /** Backend chỉ cho phép tư vấn bệnh khi `role=pharmacist` (cùng quy ước với GET notifications). */
    private consultationDiseaseRoleQuery(): string {
        const role = this.auth.isPharmacistAccount() ? 'pharmacist' : 'admin';
        return `?role=${role}`;
    }

    getProductConsultations(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/consultations_product`);
    }

    getProductConsultationsByRole(role?: string, pharmacistId?: string, pharmacistEmail?: string, pharmacistName?: string): Observable<any> {
        const query = new URLSearchParams();
        if (role) query.set('role', role);
        if (pharmacistId) query.set('pharmacistId', pharmacistId);
        if (pharmacistEmail) query.set('pharmacistEmail', pharmacistEmail);
        if (pharmacistName) query.set('pharmacistName', pharmacistName);
        const qs = query.toString();
        return this.http.get<any>(`${this.apiUrl}/consultations_product${qs ? `?${qs}` : ''}`);
    }

    getProductConsultationStats(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/consultations_product/stats`);
    }

    getProductConsultationStatsByRole(role?: string, pharmacistId?: string, pharmacistEmail?: string, pharmacistName?: string): Observable<any> {
        const query = new URLSearchParams();
        if (role) query.set('role', role);
        if (pharmacistId) query.set('pharmacistId', pharmacistId);
        if (pharmacistEmail) query.set('pharmacistEmail', pharmacistEmail);
        if (pharmacistName) query.set('pharmacistName', pharmacistName);
        const qs = query.toString();
        return this.http.get<any>(`${this.apiUrl}/consultations_product/stats${qs ? `?${qs}` : ''}`);
    }

    getPrescriptionConsultations(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/consultations_prescription`);
    }

    getPrescriptionConsultationsByRole(
        role?: string,
        pharmacistId?: string,
        pharmacistEmail?: string,
        pharmacistName?: string,
        prescriptionId?: string
    ): Observable<any> {
        const query = new URLSearchParams();
        if (role) query.set('role', role);
        if (pharmacistId) query.set('pharmacistId', pharmacistId);
        if (pharmacistEmail) query.set('pharmacistEmail', pharmacistEmail);
        if (pharmacistName) query.set('pharmacistName', pharmacistName);
        if (prescriptionId) query.set('prescriptionId', prescriptionId);
        const qs = query.toString();
        return this.http.get<any>(`${this.apiUrl}/consultations_prescription${qs ? `?${qs}` : ''}`);
    }

    updatePrescription(id: string, data: any): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/consultations_prescription/${id}`, data);
    }

    /** Admin: gửi thông báo nhắc nhở tới dược sĩ (đơn waiting + đã phân công). */
    remindPrescriptionPharmacist(id: string): Observable<{ success: boolean; message?: string }> {
        const enc = encodeURIComponent(String(id || '').trim());
        return this.http.post<{ success: boolean; message?: string }>(
            `${this.apiUrl}/consultations_prescription/${enc}/remind-pharmacist`,
            {}
        );
    }

    replyProductQuestion(data: {
        sku: string,
        questionId: string,
        answer: string,
        answeredBy?: string,
        assignedPharmacistId?: string,
        assignedBy?: string,
        actorRole?: string
    }): Observable<any> {
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

    getDiseaseConsultations(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/consultations_disease${this.consultationDiseaseRoleQuery()}`);
    }

    getDiseaseConsultationStats(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/consultations_disease/stats${this.consultationDiseaseRoleQuery()}`);
    }

    replyDiseaseQuestion(data: {
        sku: string;
        questionId: string;
        answer: string;
        answeredBy: string;
        /** Server tra `pharmacistName` nếu thiếu / Admin — luôn nên gửi khi có. */
        pharmacistId?: string;
    }): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/consultations_disease/reply${this.consultationDiseaseRoleQuery()}`, data);
    }

    deleteDiseaseConsultation(sku: string, questionId: string): Observable<any> {
        const encSku = encodeURIComponent(String(sku || '').trim());
        const encQ = encodeURIComponent(String(questionId || '').trim());
        return this.http.delete<any>(`${this.apiUrl}/consultations_disease/${encSku}/${encQ}${this.consultationDiseaseRoleQuery()}`);
    }

    /** Xóa vĩnh viễn cả document consultations_disease (Mongo _id). */
    deleteDiseaseConsultationDocument(docId: string): Observable<any> {
        const id = encodeURIComponent(String(docId || '').trim());
        return this.http.delete<any>(`${this.apiUrl}/consultations_disease/document/${id}${this.consultationDiseaseRoleQuery()}`);
    }
}
