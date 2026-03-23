import { Component, effect, inject, signal, OnDestroy, ViewChildren, QueryList, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { HOME_URL } from '../../../core/constants/navigation.constants';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.css',
})
export class Auth implements OnDestroy {
  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;
  readonly authService = inject(AuthService);
  private authApi = inject(AuthApiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  isSubmitting = false;

  isRegisterMode = false;
  isForgotPasswordMode = false;
  showQrPopup = false;
  forgotStep: 1 | 2 | 3 = 1;
  registerStep: 1 | 2 | 3 = 1;
  phone = '';
  password = '';
  confirmPassword = '';
  otpCode = '';
  otpGenerated = '';
  otpAttempts = 0;
  readonly OTP_MAX_ATTEMPTS = 3;
  showPassword = false;
  showConfirmPassword = false;
  showNewPassword = false;
  showConfirmNewPassword = false;

  otpTimer = signal(60);
  private otpInterval: ReturnType<typeof setInterval> | null = null;

  showOtpPopup = signal(true);
  private otpPopupTimeout: ReturnType<typeof setTimeout> | null = null;

  errors: { phone?: string; password?: string; confirmPassword?: string; otp?: string } = {};

  /** Popup thông báo khi đăng nhập */
  toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.authService.showAuthModal()) {
        this.isRegisterMode = false;
        this.isForgotPasswordMode = false;
        this.showQrPopup = false;
        this.forgotStep = 1;
        this.registerStep = 1;
        this.otpAttempts = 0;
        this.stopOtpTimer();
        this.stopOtpPopupTimer();
        this.showOtpPopup.set(true);
        this.errors = {};
        this.toast.set(null);
        if (this.toastTimeout) {
          clearTimeout(this.toastTimeout);
          this.toastTimeout = null;
        }
      }
    });
    // Sau khi đăng xuất: xóa sạch thông tin đăng nhập trong form
    effect(() => {
      const user = this.authService.currentUser();
      console.log('[AuthComponent] currentUser change detected:', user);
      if (user === null) {
        this.phone = '';
        this.password = '';
        this.confirmPassword = '';
        this.isSubmitting = false;
        this.errors = {};
        this.toast.set(null);
        if (this.toastTimeout) {
          clearTimeout(this.toastTimeout);
          this.toastTimeout = null;
        }
      } else {
        // AUTO-CLOSE Logic: If a user exists, the modal MUST close
        console.log('[AuthComponent] User exists, ensuring modal is closed');
        this.authService.closeAuthModal();
        this.cdr.detectChanges();
      }
    });
  }

  /** SĐT: chỉ số, 9-11 chữ số */
  private validatePhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 9 && cleaned.length <= 11;
  }

  /** Mật khẩu: ít nhất 8 ký tự, 1 chữ in hoa, 1 ký tự đặc biệt */
  private validatePassword(password: string): boolean {
    if (!password || password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return false;
    return true;
  }

  private getPasswordErrorMessage(password: string): string | null {
    if (!password) {
      return 'Ít nhất 8 ký tự, 1 chữ in hoa, 1 ký tự đặc biệt.';
    }
    if (password.length < 8) return 'Mật khẩu cần tối thiểu 8 ký tự.';
    if (!/[A-Z]/.test(password)) return 'Mật khẩu cần tối thiểu 1 chữ in hoa.';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return 'Mật khẩu cần tối thiểu 1 ký tự đặc biệt.';
    return null;
  }

  readonly PHONE_ERROR = 'Số điện thoại không hợp lệ.';
  readonly PASSWORD_ERROR = 'Mật khẩu không hợp lệ.';
  readonly CONFIRM_PASSWORD_ERROR = 'Mật khẩu nhập lại không khớp.';

  validatePhoneField(): void {
    if (!this.phone.trim()) {
      this.errors = { ...this.errors, phone: this.PHONE_ERROR };
    } else if (!this.validatePhone(this.phone)) {
      this.errors = { ...this.errors, phone: this.PHONE_ERROR };
    } else {
      const { phone: _, ...rest } = this.errors;
      this.errors = rest;
    }
  }

  validatePasswordField(): void {
    const errorMsg = this.getPasswordErrorMessage(this.password);
    if (errorMsg) {
      this.errors = { ...this.errors, password: errorMsg };
    } else {
      const { password: _, ...rest } = this.errors;
      this.errors = rest;
    }
  }

  validateConfirmPasswordField(): void {
    if (!this.confirmPassword) {
      this.errors = { ...this.errors, confirmPassword: undefined };
    } else if (this.password !== this.confirmPassword) {
      this.errors = { ...this.errors, confirmPassword: this.CONFIRM_PASSWORD_ERROR };
    } else {
      const { confirmPassword: _, ...rest } = this.errors;
      this.errors = rest;
    }
  }

  get isLoginFormValid(): boolean {
    return this.validatePhone(this.phone) && this.validatePassword(this.password);
  }

  get isForgotPasswordFormValid(): boolean {
    return this.validatePhone(this.phone);
  }

  get isRegisterFormValid(): boolean {
    return (
      this.validatePassword(this.password) &&
      this.password === this.confirmPassword &&
      this.confirmPassword.length > 0
    );
  }

  get isRegisterPhoneFormValid(): boolean {
    return this.validatePhone(this.phone);
  }

  onBackdropClick(_e: MouseEvent): void {
    this.authService.closeAuthModal();
  }

  private showToast(type: 'success' | 'error', message: string): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toast.set({ type, message });
    this.toastTimeout = setTimeout(() => {
      this.toast.set(null);
      this.toastTimeout = null;
    }, 3500);
  }

  dismissToast(): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = null;
    this.toast.set(null);
  }

  onSubmit(): void {
    this.validatePhoneField();
    this.validatePasswordField();
    const valid = !this.errors.phone && !this.errors.password;
    if (valid && !this.isSubmitting) {
      this.isSubmitting = true;
      this.toast.set(null);
      this.authApi.login({ phone: this.phone, password: this.password }).subscribe({
        next: (res: any) => {
          console.log('[AuthComponent] login next - res:', res);
          if (res.success && res.user) {
            console.log('[AuthComponent] login success, setting user');
            this.authService.setUser(res.user as import('../../../core/services/auth.service').LoggedUser);

            // Defensively ensure modal is closed and state is propagated
            this.authService.closeAuthModal();
            this.cdr.detectChanges();

            this.authService.showHeaderSuccess('Bạn đã đăng nhập thành công');

            // Delay navigation slightly to ensure UI transition is smooth
            setTimeout(() => {
              this.router.navigate([HOME_URL]);
            }, 100);
          } else {
            console.warn('[AuthComponent] login success false or no user in res');
            const msg = 'Thông tin đăng nhập sai, vui lòng thử lại.';
            this.errors = { ...this.errors, password: msg };
            this.showToast('error', msg);
          }
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          const isWrongCredentials = err?.status === 401 || err?.status === 400;
          const msg = isWrongCredentials
            ? 'Thông tin đăng nhập sai, vui lòng thử lại.'
            : 'Không thể kết nối. Hãy khởi động MongoDB rồi chạy: cd backend && npm start';
          this.errors = { ...this.errors, password: msg };
          this.showToast('error', msg);
          this.isSubmitting = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  onForgotPassword(e: Event): void {
    e.preventDefault();
    this.isForgotPasswordMode = true;
    this.errors = {};
  }

  onShowLoginFromForgot(e: Event): void {
    e.preventDefault();
    this.isForgotPasswordMode = false;
    this.forgotStep = 1;
    this.stopOtpTimer();
    this.errors = {};
  }

  onBackFromOtp(e: Event): void {
    e.preventDefault();
    this.forgotStep = 1;
    this.otpCode = '';
    this.otpAttempts = 0;
    this.stopOtpTimer();
    this.stopOtpPopupTimer();
    this.errors = { ...this.errors, otp: undefined };
  }

  private startOtpTimer(): void {
    this.stopOtpTimer();
    this.otpTimer.set(60);
    this.otpInterval = setInterval(() => {
      const next = this.otpTimer() - 1;
      this.otpTimer.set(next);
      if (next <= 0) this.stopOtpTimer();
    }, 1000);
  }

  private stopOtpTimer(): void {
    if (this.otpInterval) {
      clearInterval(this.otpInterval);
      this.otpInterval = null;
    }
  }

  private startOtpPopupTimer(): void {
    if (this.otpPopupTimeout) clearTimeout(this.otpPopupTimeout);
    this.showOtpPopup.set(true);
    this.otpPopupTimeout = setTimeout(() => {
      this.showOtpPopup.set(false);
      this.otpPopupTimeout = null;
    }, 30000);
  }

  private stopOtpPopupTimer(): void {
    if (this.otpPopupTimeout) {
      clearTimeout(this.otpPopupTimeout);
      this.otpPopupTimeout = null;
    }
  }

  ngOnDestroy(): void {
    this.stopOtpTimer();
    this.stopOtpPopupTimer();
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  readonly OTP_ERROR = 'Mã không đúng, yêu cầu nhập lại.';
  readonly OTP_EXPIRED_ERROR = 'Hết thời gian, hãy yêu cầu gửi lại.';
  readonly OTP_LOCKED_ERROR = 'Bạn đã nhập quá số lần thử. Vui lòng gửi lại mã OTP.';

  private generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  get isOtpValid(): boolean {
    return this.otpCode.length === 6 && /^\d+$/.test(this.otpCode);
  }

  get isOtpLocked(): boolean {
    return this.otpAttempts >= this.OTP_MAX_ATTEMPTS;
  }

  get authTitle(): string {
    if (this.isForgotPasswordMode) {
      if (this.forgotStep === 1) return 'QUÊN MẬT KHẨU?';
      if (this.forgotStep === 2) return 'NHẬP MÃ OTP';
      return 'ĐỔI MẬT KHẨU';
    }
    if (this.isRegisterMode) {
      if (this.registerStep === 1) return 'ĐĂNG KÝ';
      if (this.registerStep === 2) return 'NHẬP MÃ OTP';
      return 'TẠO MẬT KHẨU';
    }
    return 'ĐĂNG NHẬP';
  }

  get isForgotChangeFormValid(): boolean {
    return (
      this.validatePassword(this.password) &&
      this.password === this.confirmPassword &&
      this.confirmPassword.length > 0
    );
  }

  onForgotPasswordSubmit(): void {
    this.validatePhoneField();
    const valid = !this.errors.phone;
    if (valid && !this.isSubmitting) {
      this.isSubmitting = true;
      this.authApi.forgotPassword({ phone: this.phone }).subscribe({
        next: (res: any) => {
          if (res.success && res.otp) {
            this.otpGenerated = res.otp;
            this.forgotStep = 2;
            this.otpCode = '';
            this.otpAttempts = 0;
            this.startOtpTimer();
            this.startOtpPopupTimer();
          } else {
            this.errors = { ...this.errors, phone: res.message || 'Số điện thoại chưa đăng ký.' };
          }
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          const msg = err?.error?.message || (err?.status === 0 ? 'Không thể kết nối. Chạy backend: cd backend && npm start' : 'Không thể kết nối. Kiểm tra backend và MongoDB.');
          this.errors = { ...this.errors, phone: msg };
          this.isSubmitting = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  onOtpSubmit(): void {
    this.errors = { ...this.errors, otp: undefined };
    if (this.isOtpLocked) {
      this.errors = { ...this.errors, otp: this.OTP_LOCKED_ERROR };
      return;
    }
    if (!this.isOtpValid) {
      this.errors = { ...this.errors, otp: this.OTP_ERROR };
      return;
    }
    if (this.otpTimer() <= 0) {
      this.errors = { ...this.errors, otp: this.OTP_EXPIRED_ERROR };
      return;
    }
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.authApi.verifyOtp({ phone: this.phone, otp: this.otpCode }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.forgotStep = 3;
          this.otpCode = '';
          this.otpGenerated = '';
          this.otpAttempts = 0;
          this.errors = {};
          this.stopOtpTimer();
          this.stopOtpPopupTimer();
        } else {
          this.otpAttempts++;
          this.errors = { ...this.errors, otp: res.message || this.OTP_ERROR };
          if (this.otpAttempts >= this.OTP_MAX_ATTEMPTS) {
            this.errors = { ...this.errors, otp: this.OTP_LOCKED_ERROR };
          }
        }
        this.isSubmitting = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err?.error?.message || (err?.status === 0 ? 'Không thể kết nối. Kiểm tra backend đã chạy và proxy.' : 'Không thể kết nối. Kiểm tra backend.');
        this.errors = { ...this.errors, otp: msg };
        this.isSubmitting = false;
        this.cdr.detectChanges();
      }
    });
  }

  onOtpKeypress(e: KeyboardEvent): void {
    const allowed = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete'];
    if (!/^\d$/.test(e.key) && !allowed.includes(e.key)) e.preventDefault();
  }

  onOtpDigitChange(val: string, index: number): void {
    const digits = val.replace(/\D/g, '');
    const arr = [...this.otpCode.split('')];
    while (arr.length < 6) arr.push('');
    if (digits.length > 1) {
      for (let j = 0; j < Math.min(digits.length, 6); j++) arr[j] = digits[j];
      this.otpCode = arr.join('').slice(0, 6);
      const nextIdx = Math.min(digits.length, 6) - 1;
      setTimeout(() => this.otpInputs?.get(nextIdx)?.nativeElement?.focus(), 0);
    } else {
      const digit = digits.slice(-1);
      arr[index] = digit;
      this.otpCode = arr.join('').slice(0, 6);
      if (digit && index < 5) {
        setTimeout(() => this.otpInputs?.get(index + 1)?.nativeElement?.focus(), 0);
      }
    }
    this.errors = { ...this.errors, otp: undefined };
  }

  onResendOtp(): void {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.authApi.forgotPassword({ phone: this.phone }).subscribe({
      next: (res: any) => {
        if (res.success && res.otp) {
          this.otpGenerated = res.otp;
          this.otpCode = '';
          this.otpAttempts = 0;
          this.errors = { ...this.errors, otp: undefined };
          this.startOtpTimer();
          this.startOtpPopupTimer();
        } else {
          this.errors = { ...this.errors, otp: res.message || 'Không thể gửi lại mã.' };
        }
        this.isSubmitting = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errors = { ...this.errors, otp: 'Không thể kết nối.' };
        this.isSubmitting = false;
        this.cdr.detectChanges();
      }
    });
  }

  onForgotChangeSubmit(): void {
    this.validatePasswordField();
    this.validateConfirmPasswordField();
    const valid = !this.errors.password && !this.errors.confirmPassword;
    if (valid && !this.isSubmitting) {
      this.isSubmitting = true;
      this.authApi.resetPassword({ phone: this.phone, newPassword: this.password }).subscribe({
        next: (res: any) => {
          if (res.success) {
            if (res.user) {
              this.authService.setUser(res.user as import('../../../core/services/auth.service').LoggedUser);
            }
            this.authService.closeAuthModal();
            this.cdr.detectChanges();

            this.authService.showHeaderSuccess('Đổi mật khẩu thành công. Bạn đã đăng nhập.');

            setTimeout(() => {
              this.router.navigate([HOME_URL]);
            }, 100);
          } else {
            this.errors = { ...this.errors, password: res.message || 'Không thể đổi mật khẩu.' };
          }
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.errors = { ...this.errors, password: 'Không thể kết nối.' };
          this.isSubmitting = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  onRegister(e: Event): void {
    e.preventDefault();
    this.isRegisterMode = true;
    this.errors = {};
  }

  onShowLogin(e: Event): void {
    e.preventDefault();
    this.isRegisterMode = false;
    this.isForgotPasswordMode = false;
    this.registerStep = 1;
    this.stopOtpTimer();
    this.stopOtpPopupTimer();
    this.errors = {};
  }

  onBackFromRegisterOtp(e: Event): void {
    e.preventDefault();
    this.registerStep = 1;
    this.otpCode = '';
    this.otpAttempts = 0;
    this.stopOtpTimer();
    this.stopOtpPopupTimer();
    this.errors = { ...this.errors, otp: undefined };
  }

  onRegisterOtpSubmit(): void {
    this.validatePhoneField();
    const valid = !this.errors.phone;
    if (valid && !this.isSubmitting) {
      this.isSubmitting = true;
      this.authApi.registerOtp({ phone: this.phone }).subscribe({
        next: (res: any) => {
          if (res.success && res.otp) {
            this.otpGenerated = res.otp;
            this.registerStep = 2;
            this.otpCode = '';
            this.otpAttempts = 0;
            this.startOtpTimer();
            this.startOtpPopupTimer();
          } else {
            this.errors = { ...this.errors, phone: res.message || 'Không thể tạo mã OTP.' };
          }
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          const msg = err?.error?.message || (err?.status === 0 ? 'Không thể kết nối. Chạy backend: cd backend && npm start' : 'Không thể kết nối. Kiểm tra backend và MongoDB.');
          this.errors = { ...this.errors, phone: msg };
          this.isSubmitting = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  onRegisterOtpVerify(): void {
    this.errors = { ...this.errors, otp: undefined };
    if (this.isOtpLocked) {
      this.errors = { ...this.errors, otp: this.OTP_LOCKED_ERROR };
      return;
    }
    if (!this.isOtpValid) {
      this.errors = { ...this.errors, otp: this.OTP_ERROR };
      return;
    }
    if (this.otpTimer() <= 0) {
      this.errors = { ...this.errors, otp: this.OTP_EXPIRED_ERROR };
      return;
    }
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.authApi.verifyOtpAny({ phone: this.phone, otp: this.otpCode }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.registerStep = 3;
          this.otpCode = '';
          this.otpGenerated = '';
          this.otpAttempts = 0;
          this.errors = {};
          this.stopOtpTimer();
          this.stopOtpPopupTimer();
        } else {
          this.otpAttempts++;
          this.errors = { ...this.errors, otp: res.message || this.OTP_ERROR };
          if (this.otpAttempts >= this.OTP_MAX_ATTEMPTS) {
            this.errors = { ...this.errors, otp: this.OTP_LOCKED_ERROR };
          }
        }
        this.isSubmitting = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err?.error?.message || (err?.status === 0 ? 'Không thể kết nối. Kiểm tra backend đã chạy.' : 'Không thể kết nối.');
        this.errors = { ...this.errors, otp: msg };
        this.isSubmitting = false;
        this.cdr.detectChanges();
      }
    });
  }

  onRegisterSubmit(): void {
    this.validatePasswordField();
    this.validateConfirmPasswordField();
    const valid = !this.errors.password && !this.errors.confirmPassword;
    if (valid && !this.isSubmitting) {
      this.isSubmitting = true;
      this.authApi.register({ phone: this.phone, password: this.password }).subscribe({
        next: (res: any) => {
          if (res.success && res.user) {
            this.authService.setUser(res.user as import('../../../core/services/auth.service').LoggedUser);
            this.authService.closeAuthModal();
            this.cdr.detectChanges();

            this.authService.showHeaderSuccess('Bạn đã đăng ký tài khoản thành công!');

            setTimeout(() => {
              this.router.navigate([HOME_URL]);
            }, 100);
          } else {
            this.errors = { ...this.errors, phone: res.message || 'Đăng ký thất bại.' };
          }
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.errors = { ...this.errors, phone: 'Không thể kết nối. Kiểm tra backend và MongoDB.' };
          this.isSubmitting = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  onVNeIDLogin(): void {
    console.log('VNeID login');
  }

  onGoogleLogin(): void {
    window.location.href = '/api/auth/google/start';
  }

  onFacebookLogin(): void {
    window.location.href = '/api/auth/facebook/start';
  }

  onShowQrLogin(): void {
    this.showQrPopup = true;
  }

  onShowPasswordLogin(): void {
    this.showQrPopup = false;
  }
}
