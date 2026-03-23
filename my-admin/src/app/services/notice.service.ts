import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface AdminNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  link?: string;
  /** Đơn chờ xác nhận: server đánh dấu khi đơn đã giao / kết thúc — hiển thị tab Đã giải quyết, không cần bấm Đã xử lý. */
  autoResolved?: boolean;
  /** Trạng thái đơn hiện tại (chỉ type order_pending) — dùng cho màu khung / nhãn tag. */
  orderStatus?: string;
  /** Tư vấn bệnh: đã có dược sĩ trả lời chính thức — vẫn hiển thị trong tab, nền xanh + tag. */
  consultationDiseaseResolved?: boolean;
  /** Tên dược sĩ (từ server `consultedByName`). */
  consultedByPharmacistName?: string;
  /** Đơn tư vấn thuốc (admin): đã phân công dược sĩ — UI nền xanh lá + nhãn. */
  prescriptionPharmacistAssigned?: boolean;
  assignedPharmacistName?: string;
  /** Đơn tư vấn sản phẩm (admin/pharmacist): đã phân công dược sĩ — UI xanh lá + nhãn. */
  productPharmacistAssigned?: boolean;
  assignedPharmacistId?: string;
  /** Dược sĩ — thông báo phân công: trạng thái đơn (advised, unreachable, consultation_failed, …). */
  prescriptionConsultStatus?: string;
  /** Dược sĩ — phân công tư vấn sản phẩm: trạng thái câu hỏi (assigned, answered, reviewed, ...). */
  productConsultStatus?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NoticeService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private apiUrl = 'http://localhost:3000/api/admin/notifications';

  getNotifications(limit: number = 20): Observable<{ success: boolean; data: AdminNotification[] }> {
    const role = this.auth.isPharmacistAccount() ? 'pharmacist' : 'admin';
    const q = new URLSearchParams({ limit: String(limit), role });
    if (role === 'pharmacist' && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('admin');
        if (raw) {
          const a = JSON.parse(raw) as Record<string, unknown>;
          const pid = a['_id'] ?? a['pharmacist_id'];
          if (pid != null && String(pid).trim() !== '') {
            q.set('pharmacistId', String(pid).trim());
          }
          const em = String(a['pharmacistEmail'] || a['email'] || a['adminemail'] || '').trim();
          if (em) q.set('pharmacistEmail', em.toLowerCase());
          const nm = String(a['pharmacistName'] || a['adminname'] || '').trim();
          if (nm) q.set('pharmacistName', nm);
        }
      } catch {
        /* ignore */
      }
    }
    return this.http.get<{ success: boolean; data: AdminNotification[] }>(`${this.apiUrl}?${q.toString()}`);
  }
}
