import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

const STORAGE_KEY = 'vitacare_user';

export interface LoggedUser {
  user_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  avatar?: string | null;
  tiering?: string;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  readonly showAuthModal = signal(false);
  readonly currentUser = signal<LoggedUser | null>(null);
  /** Popup xác nhận đăng xuất (Bạn có chắc muốn đăng xuất?) */
  readonly showLogoutConfirm = signal(false);
  /** Banner thành công trên đầu trang (đăng nhập / đăng xuất), tự tắt sau vài giây */
  readonly headerSuccessMessage = signal<string | null>(null);
  private headerSuccessTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.restoreUserFromStorage();
  }

  private restoreUserFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      console.log('[AuthService] Restoring from storage, raw:', raw);
      if (!raw) return;
      const user = JSON.parse(raw);
      console.log('[AuthService] Parsed user:', user);
      // Robust check: user_id can be string or number, or exist as 'id'
      const uid = user?.user_id || user?.id;
      if (uid !== undefined && uid !== null) {
        // Ensure user_id exists as a string for consistency
        if (!user.user_id) user.user_id = String(uid);
        console.log('[AuthService] Setting currentUser:', user);
        this.currentUser.set(user as LoggedUser);
      } else {
        console.warn('[AuthService] Invalid user data found in storage, removing.');
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.error('[AuthService] Error restoring user:', e);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private saveUserToStorage(user: LoggedUser | null): void {
    console.log('[AuthService] Saving user to storage:', user);
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  openLogoutConfirm(): void {
    this.showLogoutConfirm.set(true);
  }

  closeLogoutConfirm(): void {
    this.showLogoutConfirm.set(false);
  }

  /** Gọi khi user bấm OK trong popup xác nhận đăng xuất */
  confirmLogout(): void {
    this.showLogoutConfirm.set(false);
    this.doLogout();
    this.router.navigate(['/']);
  }

  openAuthModal(): void {
    this.showAuthModal.set(true);
  }

  closeAuthModal(): void {
    this.showAuthModal.set(false);
  }

  setUser(user: LoggedUser | null): void {
    this.currentUser.set(user);
    this.saveUserToStorage(user);
  }

  logout(): void {
    this.currentUser.set(null);
    this.saveUserToStorage(null);
  }

  /** Hiện banner thành công (ví dụ: "Bạn đã đăng nhập thành công", "Bạn đã đăng xuất") */
  showHeaderSuccess(message: string): void {
    this.headerSuccessMessage.set(message);
    if (this.headerSuccessTimeout) clearTimeout(this.headerSuccessTimeout);
    this.headerSuccessTimeout = setTimeout(() => {
      this.headerSuccessMessage.set(null);
      this.headerSuccessTimeout = null;
    }, 2500);
  }

  /** Đăng xuất và hiện banner "Bạn đã đăng xuất" */
  doLogout(): void {
    this.currentUser.set(null);
    this.saveUserToStorage(null);
    this.showHeaderSuccess('Bạn đã đăng xuất');
  }
}

