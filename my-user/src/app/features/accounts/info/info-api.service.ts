import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = '/api';

export interface UpdateProfilePayload {
  user_id: string;
  full_name?: string;
  email?: string;
  birthday?: string | null;
  gender?: string;
  avatar?: string | null;
}

export interface SendOtpAnyResponse {
  success: boolean;
  message?: string;
  otp?: string;
  phone?: string;
}

export interface VerifyOtpAnyPayload {
  phone: string;
  otp: string;
}

export interface UpdatePhonePayload {
  user_id: string;
  new_phone: string;
  otp: string;
}

export interface UserMeResponse {
  success: boolean;
  message?: string;
  user?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class InfoApiService {
  constructor(private http: HttpClient) {}

  getMe(user_id: string): Observable<UserMeResponse> {
    return this.http.get<UserMeResponse>(`${API}/users/me`, { params: { user_id } });
  }

  updateProfile(payload: UpdateProfilePayload): Observable<UserMeResponse> {
    return this.http.patch<UserMeResponse>(`${API}/users/me`, payload);
  }

  /** Upload avatar (multipart) → backend lưu Mongo + trả URL ngắn /api/promo-images/... */
  uploadAvatar(user_id: string, file: File): Observable<UserMeResponse & { imageUrl?: string }> {
    const fd = new FormData();
    fd.append('user_id', user_id);
    fd.append('file', file, file.name || 'avatar.jpg');
    return this.http.post<UserMeResponse & { imageUrl?: string }>(`${API}/users/me/upload-avatar`, fd);
  }

  sendOtpAny(phone: string): Observable<SendOtpAnyResponse> {
    return this.http.post<SendOtpAnyResponse>(`${API}/auth/send-otp-any`, { phone });
  }

  verifyOtpAny(payload: VerifyOtpAnyPayload): Observable<{ success: boolean; message?: string }> {
    return this.http.post<{ success: boolean; message?: string }>(`${API}/auth/verify-otp-any`, payload);
  }

  updatePhone(payload: UpdatePhonePayload): Observable<UserMeResponse> {
    return this.http.patch<UserMeResponse>(`${API}/users/me/phone`, payload);
  }
}
