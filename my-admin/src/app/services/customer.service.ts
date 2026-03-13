import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class CustomerService {
    private apiUrl = 'http://localhost:3000/api/admin/users';

    constructor(private http: HttpClient) { }

    getCustomers(): Observable<any> {
        return this.http.get<any>(this.apiUrl);
    }

    getCustomerById(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}`);
    }

    getCustomerOrders(id: string): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}/orders`);
    }

    updateCustomer(id: string, customer: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/${id}`, customer);
    }

    deleteCustomer(id: string): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/${id}`);
    }

    // Groups
    getGroups(): Observable<any> {
        return this.http.get<any>('http://localhost:3000/api/admin/customer_groups');
    }

    createGroup(group: any): Observable<any> {
        return this.http.post<any>('http://localhost:3000/api/admin/customer_groups', group);
    }

    deleteGroup(id: string): Observable<any> {
        return this.http.delete<any>(`http://localhost:3000/api/admin/customer_groups/${id}`);
    }
}
