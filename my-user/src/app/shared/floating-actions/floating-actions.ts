import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import {
  ChatService,
  type ChatResponse,
  type ChatTurn,
  type ChatProductCard,
} from '../../core/services/chat.service';
import { ReminderBadgeService } from '../../core/services/reminder-badge.service';
import { Coin } from '../coin/coin';

@Component({
  selector: 'app-floating-actions',
  standalone: true,
  imports: [CommonModule, FormsModule, Coin, RouterLink],
  templateUrl: './floating-actions.html',
  styleUrl: './floating-actions.css',
})
export class FloatingActionsComponent implements AfterViewInit, OnDestroy {
  private static readonly CHAT_STORAGE_KEY = 'vitacare-vitabot-chat-v1';
  /** Giới hạn lượt để tránh tràn localStorage (~5MB). */
  private static readonly CHAT_MAX_TURNS = 80;

  private chatService = inject(ChatService);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  readonly reminderBadge = inject(ReminderBadgeService);

  showScroll = signal(false);
  chatOpen = signal(false);
  chatbotImageLoaded = signal(true);
  inputText = signal('');
  sending = signal(false);
  errorMessage = signal<string | null>(null);

  private scrollThreshold = 300;
  private scrollHandler = (): void => {
    this.showScroll.set(window.scrollY > this.scrollThreshold);
  };

  messages = signal<ChatTurn[]>([]);
  messagesList = computed(() => this.messages());

  @ViewChild('chatList') chatListRef!: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') private chatInputRef?: ElementRef<HTMLInputElement>;

  constructor() {
    this.restoreChatFromStorage();
    effect(() => {
      const list = this.messages();
      this.persistChatToStorage(list);
    });
  }

  /** Khôi phục hội thoại đã lưu (reload / đóng tab mở lại cùng origin). */
  private restoreChatFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(FloatingActionsComponent.CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const turns = this.normalizeStoredTurns(parsed);
      if (turns.length > 0) this.messages.set(turns);
    } catch {
      /* ignore corrupt storage */
    }
  }

  private normalizeStoredTurns(raw: unknown[]): ChatTurn[] {
    const out: ChatTurn[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { role?: string; parts?: unknown; products?: unknown };
      if (o.role !== 'user' && o.role !== 'model') continue;
      if (!Array.isArray(o.parts) || o.parts.length === 0) continue;
      const t0 = o.parts[0] as { text?: string } | undefined;
      const text = typeof t0?.text === 'string' ? t0.text : '';
      if (o.role === 'user' && !text.trim()) continue;
      const turn: ChatTurn = { role: o.role, parts: [{ text }] };
      if (o.role === 'model' && Array.isArray(o.products) && o.products.length) {
        const cards: ChatProductCard[] = [];
        for (const p of o.products) {
          if (!p || typeof p !== 'object') continue;
          const q = p as { slug?: string; name?: string; price?: unknown; image?: string };
          const slug = String(q.slug || '').trim();
          if (!slug) continue;
          const priceRaw = q.price;
          let priceNum: number = NaN;
          if (typeof priceRaw === 'number' && Number.isFinite(priceRaw)) priceNum = priceRaw;
          else if (typeof priceRaw === 'string' && priceRaw.trim() !== '') priceNum = Number(priceRaw);
          cards.push({
            slug,
            name: String(q.name || 'Sản phẩm'),
            price: Number.isFinite(priceNum) ? priceNum : null,
            image: typeof q.image === 'string' ? q.image : '',
          });
          if (cards.length >= 20) break;
        }
        if (cards.length) turn.products = cards;
      }
      out.push(turn);
    }
    const max = FloatingActionsComponent.CHAT_MAX_TURNS;
    return out.length > max ? out.slice(-max) : out;
  }

  private persistChatToStorage(list: ChatTurn[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const key = FloatingActionsComponent.CHAT_STORAGE_KEY;
      if (!list.length) {
        localStorage.removeItem(key);
        return;
      }
      const json = JSON.stringify(list);
      if (json.length > 450_000) {
        const trimmed = list.slice(-40);
        localStorage.setItem(key, JSON.stringify(trimmed));
        return;
      }
      localStorage.setItem(key, json);
    } catch (e) {
      console.warn('[VitaBot] Không lưu được lịch sử chat (localStorage):', e);
    }
  }

  ngAfterViewInit(): void {
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
    this.scrollHandler();
    this.reminderBadge.initPopupAckedFromSession();
  }

  /** Cùng route với menu Cá nhân → Nhắc lịch uống thuốc (`account.ts` map path này → remind). */
  goToReminder(): void {
    void this.router.navigate(['/health', 'nhac-lich-uong-thuoc']);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.scrollHandler);
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openChat(): void {
    this.chatOpen.set(true);
    this.errorMessage.set(null);
    this.cdr.markForCheck();
    setTimeout(() => this.scrollChatToBottom(), 100);
  }

  closeChat(): void {
    this.chatOpen.set(false);
    this.cdr.markForCheck();
  }

  /** Chỉ gửi role + parts lên API (bỏ products đã render) */
  private chatHistoryForApi(): ChatTurn[] {
    return this.messages().map(({ role, parts }) => ({ role, parts }));
  }

  formatModelHtml(raw: string): SafeHtml {
    if (!raw) return this.sanitizer.bypassSecurityTrustHtml('');
    const esc = (t: string) =>
      t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const formatPlain = (chunk: string): string => {
      const parts = chunk.split(/(\*\*[^*]+\*\*)/g);
      return parts
        .map((p) => {
          if (/^\*\*[^*]+\*\*$/.test(p)) {
            return '<strong>' + esc(p.slice(2, -2)) + '</strong>';
          }
          return esc(p).replace(/\n/g, '<br>');
        })
        .join('');
    };

    const allowedHref = (href: string): boolean => {
      const h = href.trim();
      if (/^https?:\/\//i.test(h)) {
        try {
          const u = new URL(h);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      }
      return h.startsWith('/') && !h.startsWith('//');
    };

    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let html = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(raw)) !== null) {
      const href = m[2].trim();
      html += formatPlain(raw.slice(last, m.index));
      if (allowedHref(href)) {
        html += `<a class="chat-inline-link" href="${esc(href)}" target="_top" rel="noopener noreferrer">${esc(m[1])}</a>`;
      } else {
        html += formatPlain(m[0]);
      }
      last = m.index + m[0].length;
    }
    html += formatPlain(raw.slice(last));
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  formatProductPrice(price: number | null): string {
    if (price == null || !Number.isFinite(price)) return 'Liên hệ';
    return `${price.toLocaleString('vi-VN')}₫`;
  }

  productImgError(ev: Event): void {
    const el = ev.target as HTMLImageElement | null;
    if (el) el.style.display = 'none';
  }

  /** Luôn lấy từ DOM — signal có thể chậm hơn IME (Telex/VNI) một nhịp. */
  private getChatInputValue(): string {
    const el = this.chatInputRef?.nativeElement;
    if (el && typeof el.value === 'string') return el.value;
    return this.inputText();
  }

  /** Đồng bộ signal với ô nhập (sau khi IME gõ xong) để nút Gửi / disabled đúng. */
  syncInputFromDom(): void {
    const v = this.getChatInputValue();
    if (v !== this.inputText()) this.inputText.set(v);
  }

  /**
   * Enter: không chặn khi đang composition (IME), tránh cắt từ đang gõ (Telex/VNI).
   */
  onChatInputKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter') return;
    const anyEv = ev as KeyboardEvent & { keyCode?: number };
    if (ev.isComposing || anyEv.keyCode === 229) return;
    ev.preventDefault();
    this.sendMessage();
  }

  sendMessage(): void {
    /** Một microtask để `input.value` khớp sau IME / sự kiện input cuối (cả nút Gửi và Enter). */
    queueMicrotask(() => this.sendMessageFlush());
  }

  private sendMessageFlush(): void {
    const text = this.getChatInputValue().trim();
    if (!text || this.sending()) return;

    const history = this.chatHistoryForApi();
    this.messages.set([...history, { role: 'user', parts: [{ text }] }]);
    this.inputText.set('');
    const inputEl = this.chatInputRef?.nativeElement;
    if (inputEl) inputEl.value = '';
    this.sending.set(true);
    this.errorMessage.set(null);
    this.cdr.markForCheck();

    this.chatService.sendMessage(text, history).subscribe({
      next: (res: ChatResponse) => {
        this.sending.set(false);
        if (res.success && res.reply) {
          const products = Array.isArray(res.products) ? res.products : [];
          this.messages.update((list) => [
            ...list,
            { role: 'model', parts: [{ text: res.reply! }], products: products.length ? products : undefined },
          ]);
        } else {
          this.errorMessage.set(res.message || 'Không thể gửi tin nhắn.');
        }
        this.scrollChatToBottom();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.sending.set(false);
        const msg = err?.error?.message || err?.message || 'Lỗi kết nối. Kiểm tra backend đang chạy (npm start) và GEMINI_API_KEY.';
        this.errorMessage.set(msg);
        this.cdr.markForCheck();
      },
    });
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      const el = this.chatListRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 80);
  }
}
