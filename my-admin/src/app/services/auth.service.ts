import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface Admin {
    email: string;
    password: string;
}

interface ApiResponse {
    success: boolean;
    message: string;
    user?: any;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private apiUrl = 'http://localhost:3000/api/admin';

    constructor(private http: HttpClient) { }

    private async sha256(message: string): Promise<string> {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    login(email: string, password: string): Observable<boolean> {
        return new Observable<boolean>(observer => {
            this.sha256(password).then(hashedPassword => {
                this.http.post<any>(`${this.apiUrl}/login`, { email, password: hashedPassword })
                    .subscribe({
                        next: response => {
                            if (response.success) {
                                if (typeof window !== 'undefined' && response.admin) {
                                    localStorage.setItem('admin', JSON.stringify(response.admin));
                                }
                                observer.next(true);
                                observer.complete();
                            } else {
                                observer.error(new Error(response.message));
                            }
                        },
                        error: err => observer.error(err)
                    });
            });
        }).pipe(catchError(this.handleError));
    }

    sendVerificationCode(email: string): Observable<any> {
        return this.http.post<ApiResponse>(`${this.apiUrl}/forgot-password`, { email })
            .pipe(
                map(response => {
                    if (response.success) return response;
                    throw new Error(response.message);
                }),
                catchError(this.handleError)
            );
    }

    verifyCode(email: string, code: string): Observable<boolean> {
        return this.http.post<ApiResponse>(`${this.apiUrl}/verify-code`, { email, code })
            .pipe(
                map(response => {
                    if (response.success) return true;
                    throw new Error(response.message);
                }),
                catchError(this.handleError)
            );
    }

    resetPassword(email: string, newPassword: string): Observable<boolean> {
        return new Observable<boolean>(observer => {
            this.sha256(newPassword).then(hashedPassword => {
                this.http.post<ApiResponse>(`${this.apiUrl}/reset-password`, { email, newPassword: hashedPassword })
                    .subscribe({
                        next: response => {
                            if (response.success) {
                                observer.next(true);
                                observer.complete();
                            } else {
                                observer.error(new Error(response.message || 'Lỗi đổi mật khẩu'));
                            }
                        },
                        error: err => observer.error(err)
                    });
            });
        }).pipe(catchError(this.handleError));
    }

    changePassword(email: string, oldPassword: string, newPassword: string): Observable<any> {
        return new Observable<any>(observer => {
            Promise.all([
                this.sha256(oldPassword),
                this.sha256(newPassword)
            ]).then(([hashedOld, hashedNew]) => {
                this.http.post<ApiResponse>(`${this.apiUrl}/change-password`, {
                    email,
                    oldPassword: hashedOld,
                    newPassword: hashedNew
                }).subscribe({
                    next: response => {
                        if (response.success) {
                            observer.next(response);
                            observer.complete();
                        } else {
                            observer.error(new Error(response.message || 'Lỗi đổi mật khẩu'));
                        }
                    },
                    error: (err: HttpErrorResponse) => {
                        // Pass the backend error message directly to the observer
                        const msg = err.error?.message || err.message || 'Mật khẩu hiện tại không chính xác';
                        observer.error(new Error(msg));
                    }
                });
            }).catch(err => observer.error(new Error('Lỗi xử lý mật khẩu')));
        }).pipe(catchError((err) => throwError(() => err)));
    }

    getAdmins(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/admins`).pipe(
            map(response => {
                if (response.success) return response.data;
                throw new Error(response.message);
            }),
            catchError(this.handleError)
        );
    }

    getStats(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/stats`).pipe(
            map(response => {
                if (response.success) return response.data;
                throw new Error(response.message);
            }),
            catchError(this.handleError)
        );
    }

    private handleError(error: HttpErrorResponse) {
        if (error.error instanceof ErrorEvent) {
            // Client-side error
            console.error('An error occurred:', error.error.message);
        } else {
            // Backend error
            console.error(
                `Backend returned code ${error.status}, ` +
                `body was: ${JSON.stringify(error.error)}`);
        }
        // Return an observable with a user-facing error message.
        return throwError(() => new Error(error.error?.message || 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'));
    }
}
