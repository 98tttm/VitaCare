import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Khi chạy ng serve, proxy.conf.json chuyển /api sang http://localhost:3000 */
const API = '/api';

export interface AuthLoginRequest {
  phone: string;
  password: string;
}

export interface AuthRegisterRequest {
  phone: string;
  password: string;
}

export interface AuthForgotRequest {
  phone: string;
}

export interface AuthVerifyOtpRequest {
  phone: string;
  otp: string;
}

export interface AuthResetPasswordRequest {
  phone: string;
  newPassword: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: Record<string, unknown>;
  otp?: string;
  phone?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  constructor(private http: HttpClient) { }

  login(req: AuthLoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/login`, req);
  }

  register(req: AuthRegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/register`, req);
  }

  forgotPassword(req: AuthForgotRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/forgot-password`, req);
  }

  registerOtp(req: AuthForgotRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/register-otp`, req);
  }

  verifyOtpAny(req: AuthVerifyOtpRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/verify-otp-any`, req);
  }

  verifyOtp(req: AuthVerifyOtpRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/verify-otp`, req);
  }

  resetPassword(req: AuthResetPasswordRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/reset-password`, req);
  }

  /** Sau redirect OAuth: đổi mã một lần lấy user (POST /api/auth/oauth/exchange) */
  exchangeOAuthCode(code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/oauth/exchange`, { code });
  }
}

