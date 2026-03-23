import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface Admin {
    email: string;
    password: string;
}
export type AuthRole = 'admin' | 'pharmacist';

interface ApiResponse {
    success: boolean;
    message: string;
    user?: any;
}

interface RoleEmailCheckResponse {
    success: boolean;
    valid: boolean;
    message?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private apiUrl = 'http://localhost:3000/api/admin';

    constructor(private http: HttpClient) { }

    /** Session user stored as `admin` in localStorage; role set by backend as `accountRole`. */
    isPharmacistAccount(): boolean {
        if (typeof window === 'undefined') return false;
        try {
            const raw = localStorage.getItem('admin');
            if (!raw) return false;
            const parsed = JSON.parse(raw) as { accountRole?: string };
            return parsed?.accountRole === 'pharmacist';
        } catch {
            return false;
        }
    }

    /**
     * Người tạo đơn từ admin (lưu DB: createdByAdmin | createdByPharmacist).
     */
    getOrderCreatorMeta(): {
        createdByAdmin: { id: string; name: string } | null;
        createdByPharmacist: { id: string; name: string } | null;
    } {
        if (typeof window === 'undefined') {
            return { createdByAdmin: null, createdByPharmacist: null };
        }
        try {
            const raw = localStorage.getItem('admin');
            if (!raw) return { createdByAdmin: null, createdByPharmacist: null };
            const a = JSON.parse(raw) as Record<string, unknown>;
            const isPh = a['accountRole'] === 'pharmacist';
            const id = String(a['_id'] ?? a['id'] ?? a['pharmacist_id'] ?? '').trim();
            const nameAdmin = String(a['adminname'] ?? a['adminName'] ?? '').trim();
            const namePh = String(a['pharmacistName'] ?? a['adminname'] ?? '').trim();
            const name = isPh ? namePh : nameAdmin;
            if (!id && !name) return { createdByAdmin: null, createdByPharmacist: null };
            const payload = { id: id || '—', name: name || '—' };
            if (isPh) {
                return { createdByAdmin: null, createdByPharmacist: payload };
            }
            return { createdByAdmin: payload, createdByPharmacist: null };
        } catch {
            return { createdByAdmin: null, createdByPharmacist: null };
        }
    }

    /**
     * Thông tin dược sĩ đang đăng nhập để gắn vào blog (author / approver).
     * Cấu trúc tương thích document blog (không gửi password).
     */
    getPharmacistBlogPerson(forApprover: boolean = false): Record<string, unknown> | null {
        if (!this.isPharmacistAccount()) return null;
        try {
            const raw = localStorage.getItem('admin');
            if (!raw) return null;
            const a = JSON.parse(raw) as Record<string, unknown>;
            const id = a['_id'] ?? a['pharmacist_id'];
            const fullName = String(a['pharmacistName'] || a['adminname'] || '').trim();
            const email = String(a['pharmacistEmail'] || a['email'] || a['adminemail'] || '').trim();
            if (!fullName && !email) return null;

            const avatarVal = a['avatar'];
            const avatar =
                avatarVal && typeof avatarVal === 'string'
                    ? { url: avatarVal }
                    : avatarVal && typeof avatarVal === 'object'
                        ? avatarVal
                        : null;

            const base: Record<string, unknown> = {
                id: id != null ? (typeof id === 'number' ? id : String(id)) : undefined,
                fullName,
                email,
                degree: 'Dược sĩ',
                bio: '',
                slug: '',
                nickName: null,
                avatar,
                partner: null,
                position: ''
            };
            if (forApprover) {
                base['isApproved'] = true;
            }
            return base;
        } catch {
            return null;
        }
    }

    private async sha256(message: string): Promise<string> {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    login(email: string, password: string, role: AuthRole = 'admin'): Observable<boolean> {
        return new Observable<boolean>(observer => {
            this.sha256(password).then(hashedPassword => {
                this.http.post<any>(`${this.apiUrl}/login`, { email, password: hashedPassword, role })
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

    checkEmailForRole(email: string, role: AuthRole = 'admin'): Observable<RoleEmailCheckResponse> {
        return this.http.post<RoleEmailCheckResponse>(`${this.apiUrl}/check-role-email`, { email, role })
            .pipe(
                catchError((error: HttpErrorResponse) => of({
                    success: false,
                    valid: false,
                    message: error.error?.message || 'Không thể kiểm tra email theo vai trò.'
                }))
            );
    }

    sendVerificationCode(email: string, role: AuthRole = 'admin'): Observable<any> {
        return this.http.post<ApiResponse>(`${this.apiUrl}/forgot-password`, { email, role })
            .pipe(
                map(response => {
                    if (response.success) return response;
                    throw new Error(response.message);
                }),
                catchError(this.handleError)
            );
    }

    verifyCode(email: string, code: string, role: AuthRole = 'admin'): Observable<boolean> {
        return this.http.post<ApiResponse>(`${this.apiUrl}/verify-code`, { email, code, role })
            .pipe(
                map(response => {
                    if (response.success) return true;
                    throw new Error(response.message);
                }),
                catchError(this.handleError)
            );
    }

    resetPassword(email: string, newPassword: string, role: AuthRole = 'admin'): Observable<boolean> {
        return new Observable<boolean>(observer => {
            this.sha256(newPassword).then(hashedPassword => {
                this.http.post<ApiResponse>(`${this.apiUrl}/reset-password`, { email, newPassword: hashedPassword, role })
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

    changePassword(email: string, oldPassword: string, newPassword: string, role: AuthRole = 'admin'): Observable<any> {
        return new Observable<any>(observer => {
            Promise.all([
                this.sha256(oldPassword),
                this.sha256(newPassword)
            ]).then(([hashedOld, hashedNew]) => {
                this.http.post<ApiResponse>(`${this.apiUrl}/change-password`, {
                    email,
                    oldPassword: hashedOld,
                    newPassword: hashedNew,
                    role
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
