import { Component, OnInit, inject, signal, ViewChild, ViewChildren, QueryList, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { InfoApiService } from './info-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { DatePickerComponent } from '../../../shared/date-picker/date-picker';

type OtpPurpose = 'password' | 'phone';

@Component({
  selector: 'app-info',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePickerComponent],
  templateUrl: './info.html',
  styleUrl: './info.css',
})
export class Info implements OnInit {
  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChild('avatarUploadInput') avatarUploadInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('avatarCaptureInput') avatarCaptureInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('cameraVideo') cameraVideoRef?: ElementRef<HTMLVideoElement>;

  private authService = inject(AuthService);
  private authApi = inject(AuthApiService);
  private infoApi = inject(InfoApiService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  fullName = '';
  phone = '';
  email = '';
  birthDate = '';
  gender = 'male';
  /** Hiển thị trên form (readonly); đổi mật khẩu qua popup OTP */
  passwordDisplay = '••••••••';
  showPassword = false;
  /** Avatar từ currentUser để đồng bộ với sidebar khi đổi ảnh */
  get userAvatar(): string {
    return (this.authService.currentUser()?.avatar as string) || '/assets/images/avt.png';
  }
  avatarError = false;
  showAvatarModal = false;
  /** Stream từ camera (getUserMedia); khi set sẽ hiển thị video và nút Chụp */
  cameraStream: MediaStream | null = null;
  cameraError = '';
  /** Ảnh vừa chụp (blob URL); khi set sẽ hiện ảnh và nút Lưu / Hủy */
  capturedImageUrl: string | null = null;

  /** Snapshot ban đầu để so sánh khi submit */
  private originalPhone = '';
  private originalUser: Record<string, unknown> = {};

  /** Modal OTP: đổi mật khẩu hoặc xác thực đổi SĐT */
  showOtpModal = false;
  otpPurpose = signal<OtpPurpose>('password');
  otpStep = signal<1 | 2 | 3>(1);
  otpPhone = '';
  otpCode = '';
  otpGenerated = '';
  otpTimer = signal(0);
  private otpInterval: ReturnType<typeof setInterval> | null = null;
  showOtpPopup = signal(true);
  private otpPopupTimeout: ReturnType<typeof setTimeout> | null = null;
  otpAttempts = 0;
  readonly OTP_MAX_ATTEMPTS = 3;

  /** Đổi mật khẩu: mật khẩu mới (bước 3) */
  newPassword = '';
  confirmNewPassword = '';
  showNewPassword = false;
  showConfirmNewPassword = false;

  isSubmitting = false;
  errors: { phone?: string; password?: string; confirmPassword?: string; otp?: string } = {};

  readonly PASSWORD_RULE = 'Ít nhất 8 ký tự, 1 chữ in hoa và 1 ký tự đặc biệt.';

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.fullName = (user.full_name as string) ?? '';
      this.phone = (user.phone as string) ?? '';
      this.originalPhone = this.phone;
      this.email = (user.email as string) ?? '';
      this.birthDate = (user['birthday'] as string) ?? '';
      this.gender = (user['gender'] as string) ?? 'male';
      this.originalUser = { ...user };
    }
  }

  /** Ràng buộc SĐT: ít nhất 10 chữ số, chỉ số. */
  private validatePhone(phone: string): boolean {
    const cleaned = (phone || '').trim().replace(/\s/g, '');
    if (!/^\d+$/.test(cleaned)) return false;
    return cleaned.length >= 10;
  }

  /** Validate ô Số điện thoại trên form chính (thông tin cá nhân), set errors.phone. */
  validateMainPhoneField(): void {
    const raw = (this.phone || '').trim();
    if (raw === '') {
      this.errors = { ...this.errors, phone: 'Vui lòng nhập số điện thoại.' };
      return;
    }
    const digitsOnly = raw.replace(/\s/g, '');
    if (!/^\d+$/.test(digitsOnly)) {
      this.errors = { ...this.errors, phone: 'Số điện thoại chỉ được chứa chữ số.' };
      return;
    }
    if (digitsOnly.length < 10) {
      this.errors = { ...this.errors, phone: 'Số điện thoại phải có ít nhất 10 chữ số.' };
      return;
    }
    const { phone: _, ...rest } = this.errors;
    this.errors = rest;
  }

  private validatePassword(pwd: string): boolean {
    if (!pwd || pwd.length < 8) return false;
    if (!/[A-Z]/.test(pwd)) return false;
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) return false;
    return true;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  /** Mở popup: tự bật camera để khung hiển thị livestream, có nút Chụp để chụp ảnh */
  triggerAvatarCapture(): void {
    this.discardCapturedImage();
    this.showAvatarModal = true;
    this.cameraError = '';
    setTimeout(() => this.startCamera(), 50);
  }

  closeAvatarModal(): void {
    this.discardCapturedImage();
    this.stopCamera();
    this.showAvatarModal = false;
  }

  /** Hủy ảnh đã chụp, quay lại livestream */
  discardCapturedImage(): void {
    if (this.capturedImageUrl) {
      URL.revokeObjectURL(this.capturedImageUrl);
      this.capturedImageUrl = null;
    }
    this.cdr.detectChanges();
  }

  /** Lưu ảnh đã chụp: gửi lên MongoDB rồi cập nhật sidebar + info */
  saveCapturedImage(): void {
    if (!this.capturedImageUrl) return;
    const user = this.authService.currentUser();
    if (!user?.user_id) return;
    fetch(this.capturedImageUrl)
      .then((res) => res.blob())
      .then((blob) => this.blobToDataUrl(blob))
      .then((dataUrl) => {
        this.infoApi.updateProfile({ user_id: user.user_id, avatar: dataUrl }).subscribe({
          next: (res) => {
            if (res.success && res.user) {
              this.authService.setUser(res.user as import('../../../core/services/auth.service').LoggedUser);
              this.avatarError = false;
              if (this.capturedImageUrl) URL.revokeObjectURL(this.capturedImageUrl);
              this.capturedImageUrl = null;
              this.stopCamera();
              this.showAvatarModal = false;
              this.toastService.showSuccess('Đã lưu ảnh đại diện.');
            }
            this.cdr.detectChanges();
          },
          error: () => {
            this.toastService.showError('Không thể lưu ảnh. Thử lại sau.');
            this.cdr.detectChanges();
          },
        });
      })
      .catch(() => {
        this.toastService.showError('Không thể xử lý ảnh.');
        this.cdr.detectChanges();
      });
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Mở camera thiết bị (getUserMedia) và hiển thị livestream trực tiếp trong khung */
  async startCamera(): Promise<void> {
    this.cameraError = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      this.cameraStream = stream;
      this.cdr.detectChanges();
      const video = this.cameraVideoRef?.nativeElement;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => { });
      } else {
        setTimeout(() => {
          const v = this.cameraVideoRef?.nativeElement;
          if (v && this.cameraStream) {
            v.srcObject = this.cameraStream;
            v.play().catch(() => { });
          }
          this.cdr.detectChanges();
        }, 50);
      }
    } catch (err) {
      this.cameraError = err instanceof Error ? err.message : 'Không thể truy cập camera. Kiểm tra quyền trình duyệt.';
      this.toastService.showError(this.cameraError);
      this.cdr.detectChanges();
    }
  }

  stopCamera(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
    }
    this.cameraError = '';
  }

  /** Chụp ảnh từ video: hiện ảnh trong modal, đổi nút thành Lưu / Hủy */
  captureFromVideo(): void {
    const video = this.cameraVideoRef?.nativeElement;
    if (!video || !this.cameraStream || video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (this.capturedImageUrl) URL.revokeObjectURL(this.capturedImageUrl);
        this.capturedImageUrl = URL.createObjectURL(blob);
        this.cdr.detectChanges();
      },
      'image/jpeg',
      0.9
    );
  }

  /** Kích hoạt input tải ảnh (không dùng camera) */
  triggerAvatarUpload(): void {
    const input = this.avatarUploadInputRef?.nativeElement;
    if (input) {
      input.value = '';
      input.click();
    }
  }

  /** Thử lại mở camera (khi lần đầu bị từ chối hoặc lỗi) */
  triggerAvatarCamera(): void {
    this.cameraError = '';
    this.startCamera();
  }

  onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const user = this.authService.currentUser();
    if (!user?.user_id) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.infoApi.updateProfile({ user_id: user.user_id, avatar: dataUrl }).subscribe({
        next: (res) => {
          if (res.success && res.user) {
            this.authService.setUser(res.user as import('../../../core/services/auth.service').LoggedUser);
            this.avatarError = false;
            this.showAvatarModal = false;
            this.toastService.showSuccess('Đã lưu ảnh đại diện.');
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.toastService.showError('Không thể lưu ảnh. Thử lại sau.');
          this.cdr.detectChanges();
        },
      });
    };
    reader.readAsDataURL(file);
  }

  /** Mở popup đổi mật khẩu: bước 1 nhập SĐT (prefill current), gửi OTP */
  changePassword(event: Event): void {
    event.preventDefault();
    this.otpPurpose.set('password');
    this.otpStep.set(1);
    this.otpPhone = this.originalPhone;
    this.otpCode = '';
    this.newPassword = '';
    this.confirmNewPassword = '';
    this.otpAttempts = 0;
    this.errors = {};
    this.showOtpModal = true;
  }

  closeOtpModal(): void {
    this.showOtpModal = false;
    this.stopOtpTimer();
    this.stopOtpPopupTimer();
    this.otpStep.set(1);
    this.errors = {};
  }

  private startOtpPopupTimer(): void {
    this.stopOtpPopupTimer();
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

  /** Bước 1: Gửi OTP (đổi mật khẩu = forgotPassword; đổi SĐT = sendOtpAny) */
  onOtpStep1Submit(): void {
    this.errors = {};
    if (!this.validatePhone(this.otpPhone)) {
      this.errors.phone = 'Số điện thoại phải có ít nhất 10 chữ số và chỉ chứa số.';
      return;
    }
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const req = this.otpPurpose() === 'password'
      ? this.authApi.forgotPassword({ phone: this.otpPhone })
      : this.infoApi.sendOtpAny(this.otpPhone);

    req.subscribe({
      next: (res) => {
        if (res.success && res.otp) {
          this.otpGenerated = res.otp;
          this.otpStep.set(2);
          this.otpCode = '';
          this.otpAttempts = 0;
          this.startOtpTimer();
          this.startOtpPopupTimer();
        } else {
          this.errors.phone = (res as { message?: string }).message || 'Không thể gửi mã OTP.';
        }
        this.isSubmitting = false;
      },
      error: () => {
        this.errors.phone = 'Không thể kết nối. Kiểm tra backend.';
        this.isSubmitting = false;
      },
    });
  }

  /** Bước 2: Xác thực OTP. Đổi mật khẩu = verifyOtp rồi sang bước 3; đổi SĐT = gọi updatePhone (backend tự verify OTP) */
  onOtpStep2Submit(): void {
    this.errors = { ...this.errors, otp: undefined };
    if (this.otpAttempts >= this.OTP_MAX_ATTEMPTS) {
      this.errors.otp = 'Bạn đã nhập quá số lần thử. Vui lòng gửi lại mã OTP.';
      return;
    }
    if (this.otpCode.length !== 6 || !/^\d+$/.test(this.otpCode)) {
      this.errors.otp = 'Mã không đúng, yêu cầu nhập lại.';
      return;
    }
    if (this.otpTimer() <= 0) {
      this.errors.otp = 'Hết thời gian, hãy yêu cầu gửi lại.';
      return;
    }
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    if (this.otpPurpose() === 'phone') {
      const user = this.authService.currentUser();
      if (!user?.user_id) {
        this.errors.otp = 'Phiên đăng nhập không hợp lệ.';
        this.isSubmitting = false;
        return;
      }
      this.infoApi.updatePhone({
        user_id: user.user_id,
        new_phone: this.otpPhone,
        otp: this.otpCode,
      }).subscribe({
        next: (res) => {
          if (res.success && res.user) {
            this.authService.setUser(res.user as import('../../../core/services/auth.service').LoggedUser);
            this.phone = this.otpPhone;
            this.originalPhone = this.phone;
            this.toastService.showSuccess('Số điện thoại đã được cập nhật.');
            this.closeOtpModal();
            this.doUpdateProfileRest();
          } else {
            this.otpAttempts++;
            this.errors.otp = (res as { message?: string }).message || 'Mã OTP không đúng.';
            if (this.otpAttempts >= this.OTP_MAX_ATTEMPTS) {
              this.errors.otp = 'Bạn đã nhập quá số lần thử. Vui lòng gửi lại mã OTP.';
            }
          }
          this.isSubmitting = false;
        },
        error: () => {
          this.errors.otp = 'Không thể kết nối.';
          this.isSubmitting = false;
        },
      });
      return;
    }

    this.authApi.verifyOtp({ phone: this.otpPhone, otp: this.otpCode }).subscribe({
      next: (res) => {
        if (res.success) {
          this.otpCode = '';
          this.otpAttempts = 0;
          this.stopOtpTimer();
          this.otpStep.set(3);
        } else {
          this.otpAttempts++;
          this.errors.otp = (res as { message?: string }).message || 'Mã OTP không đúng.';
          if (this.otpAttempts >= this.OTP_MAX_ATTEMPTS) {
            this.errors.otp = 'Bạn đã nhập quá số lần thử. Vui lòng gửi lại mã OTP.';
          }
        }
        this.isSubmitting = false;
      },
      error: () => {
        this.errors.otp = 'Không thể kết nối.';
        this.isSubmitting = false;
      },
    });
  }

  /** Cập nhật các trường còn lại (full_name, email, birthday, gender) lên MongoDB */
  private doUpdateProfileRest(): void {
    const user = this.authService.currentUser();
    if (!user?.user_id) return;
    this.infoApi.updateProfile({
      user_id: user.user_id,
      full_name: this.fullName,
      email: this.email,
      birthday: this.birthDate || null,
      gender: this.gender,
    }).subscribe({
      next: (res) => {
        if (res.success && res.user) {
          this.authService.setUser(res.user as import('../../../core/services/auth.service').LoggedUser);
        }
      },
      error: () => { },
    });
  }

  /** Bước 3 (chỉ đổi mật khẩu): Gửi mật khẩu mới */
  onOtpStep3Submit(): void {
    this.errors = { ...this.errors, password: undefined, confirmPassword: undefined };
    if (!this.validatePassword(this.newPassword)) {
      this.errors.password = this.PASSWORD_RULE;
      return;
    }
    if (this.newPassword !== this.confirmNewPassword) {
      this.errors.confirmPassword = 'Mật khẩu nhập lại không khớp.';
      return;
    }
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.authApi.resetPassword({ phone: this.otpPhone, newPassword: this.newPassword }).subscribe({
      next: (res) => {
        if (res.success) {
          this.toastService.showSuccess('Mật khẩu đã được thay đổi.');
          this.closeOtpModal();
        } else {
          this.errors.password = (res as { message?: string }).message || 'Không thể đổi mật khẩu.';
        }
        this.isSubmitting = false;
      },
      error: () => {
        this.errors.password = 'Không thể kết nối.';
        this.isSubmitting = false;
      },
    });
  }

  onOtpBack(): void {
    this.otpStep.set(1);
    this.otpCode = '';
    this.otpAttempts = 0;
    this.stopOtpTimer();
    this.stopOtpPopupTimer();
    this.showOtpPopup.set(true);
    this.errors = { ...this.errors, otp: undefined };
  }

  onResendOtp(): void {
    if (this.isSubmitting) return;
    this.otpCode = '';
    this.otpAttempts = 0;
    this.errors = { ...this.errors, otp: undefined };
    this.onOtpStep1Submit();
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

  /** Cập nhật thông tin: nếu đổi SĐT thì mở popup OTP trước; không thì gọi PATCH /api/users/me */
  onSubmit(): void {
    const user = this.authService.currentUser();
    if (!user?.user_id) {
      this.toastService.showError('Vui lòng đăng nhập.');
      return;
    }

    const phoneChanged = this.phone !== this.originalPhone;
    if (phoneChanged) {
      this.validateMainPhoneField();
      if (!this.validatePhone(this.phone)) {
        this.toastService.showError('Số điện thoại phải có ít nhất 10 chữ số và chỉ chứa số.');
        return;
      }
      this.otpPurpose.set('phone');
      this.otpStep.set(1);
      this.otpPhone = this.phone;
      this.otpCode = '';
      this.otpAttempts = 0;
      this.errors = {};
      this.showOtpModal = true;
      return;
    }

    this.isSubmitting = true;
    this.infoApi.updateProfile({
      user_id: user.user_id,
      full_name: this.fullName,
      email: this.email,
      birthday: this.birthDate || null,
      gender: this.gender,
    }).subscribe({
      next: (res) => {
        if (res.success && res.user) {
          this.authService.setUser(res.user as import('../../../core/services/auth.service').LoggedUser);
          this.toastService.showSuccess('Thông tin đã được cập nhật thành công!');
          // Reload lại trang để đồng bộ ngay sidebar, header và các khu vực khác dùng thông tin user
          setTimeout(() => {
            window.location.reload();
          }, 400);
        } else {
          this.toastService.showError((res as { message?: string }).message || 'Cập nhật thất bại.');
        }
        this.isSubmitting = false;
      },
      error: () => {
        this.toastService.showError('Không thể kết nối. Kiểm tra backend.');
        this.isSubmitting = false;
      },
    });
  }

  /** Title popup: tất cả chữ in hoa */
  get otpModalTitle(): string {
    const purpose = this.otpPurpose();
    if (purpose === 'password') {
      if (this.otpStep() === 1) return 'XÁC THỰC SỐ ĐIỆN THOẠI';
      if (this.otpStep() === 2) return 'NHẬP MÃ OTP';
      return 'ĐẶT MẬT KHẨU MỚI';
    }
    if (this.otpStep() === 1) return 'GỬI MÃ OTP ĐẾN SỐ MỚI';
    return 'NHẬP MÃ OTP';
  }

  get isOtpStep1Valid(): boolean {
    return this.validatePhone(this.otpPhone);
  }

  get isOtpStep2Valid(): boolean {
    return this.otpCode.length === 6 && /^\d+$/.test(this.otpCode);
  }

  get isOtpStep3Valid(): boolean {
    return this.validatePassword(this.newPassword) && this.newPassword === this.confirmNewPassword && this.confirmNewPassword.length > 0;
  }
}
