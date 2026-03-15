import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { NoticeService, AdminNotification } from '../services/notice.service';

@Component({
  selector: 'app-notice',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './notice.html',
  styleUrl: './notice.css',
})
export class Notice implements OnInit {
  notifications: AdminNotification[] = [];
  isDropdownOpen = false;
  unreadCount = 0;

  // Popup khi đăng nhập / reload có thông báo mới
  showPopup = false;
  popupNotifications: AdminNotification[] = [];

  private readonly lastSeenKey = 'admin_notice_last_seen_at';

  constructor(
    private noticeService: NoticeService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.noticeService.getNotifications(20).subscribe({
      next: (res) => {
        if (!res.success) return;
        this.notifications = res.data || [];
        this.computeUnreadAndPopup();
      },
      error: () => {
        // Fail silently – không làm hỏng layout nếu API lỗi
      }
    });
  }

  private computeUnreadAndPopup(): void {
    const lastSeen = localStorage.getItem(this.lastSeenKey);
    const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;

    // Với backend hiện tại chưa có cờ isRead, dùng mốc thời gian lastSeen để tạm xác định thông báo mới
    const sorted = [...this.notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const newly = sorted.filter(n => new Date(n.createdAt).getTime() > lastSeenTime);
    this.popupNotifications = newly;
    this.unreadCount = Math.min(newly.length, 99);

    if (newly.length > 0) {
      this.showPopup = true;
    }
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  closePopup(): void {
    this.showPopup = false;
    localStorage.setItem(this.lastSeenKey, new Date().toISOString());
    this.unreadCount = 0;
  }

  viewAll(): void {
    this.isDropdownOpen = false;
    this.router.navigate(['/admin/notifications']);
  }

  openItem(item: AdminNotification): void {
    if (item.link) {
      this.router.navigateByUrl(item.link);
    }
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.notice-wrapper')) {
      this.isDropdownOpen = false;
    }
  }
}

