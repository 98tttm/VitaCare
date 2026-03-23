import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Thẻ sản phẩm kèm câu trả lời bot (từ backend enrich /product/...) */
export interface ChatProductCard {
  slug: string;
  name: string;
  price: number | null;
  image: string;
}

export interface ChatTurn {
  role: 'user' | 'model';
  parts: { text: string }[];
  products?: ChatProductCard[];
}

export interface ChatResponse {
  success: boolean;
  reply?: string;
  products?: ChatProductCard[];
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private apiBase = '/api';

  sendMessage(message: string, history: ChatTurn[] = []): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.apiBase}/chat`, { message, history });
  }
}
