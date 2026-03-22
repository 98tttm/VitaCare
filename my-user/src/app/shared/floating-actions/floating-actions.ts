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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ChatService, type ChatTurn } from '../../core/services/chat.service';
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
  private chatService = inject(ChatService);
  private cdr = inject(ChangeDetectorRef);
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

  sendMessage(): void {
    const text = this.inputText().trim();
    if (!text || this.sending()) return;

    const history = [...this.messages()];
    this.messages.set([...history, { role: 'user', parts: [{ text }] }]);
    this.inputText.set('');
    this.sending.set(true);
    this.errorMessage.set(null);
    this.cdr.markForCheck();

    this.chatService.sendMessage(text, history).subscribe({
      next: (res: any) => {
        this.sending.set(false);
        if (res.success && res.reply) {
          this.messages.update((list) => [
            ...list,
            { role: 'model', parts: [{ text: res.reply! }] },
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
