import { Component, ElementRef, QueryList, ViewChildren, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, FormBuilder, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  // UI State
  currentStep: 'login' | 'forgot-email' | 'verify-code' | 'reset-password' = 'login';
  showPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
  isLoading = false;
  errorMessage = '';
  popupMessage: string | null = null;
  isLoginSuccess = false;

  // Data for flow
  verificationEmail = '';

  // Forms
  loginForm: FormGroup;
  forgotEmailForm: FormGroup;
  verifyCodeForm: FormGroup;
  resetPasswordForm: FormGroup;

  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef>;

  constructor(
    private router: Router,
    private authService: AuthService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    // 1. Login Form
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    // 2. Forgot Password (Email) Form
    this.forgotEmailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    // 3. Verify Code Form (6 digits)
    this.verifyCodeForm = this.fb.group({
      digit1: ['', Validators.required],
      digit2: ['', Validators.required],
      digit3: ['', Validators.required],
      digit4: ['', Validators.required],
      digit5: ['', Validators.required],
      digit6: ['', Validators.required],
    });

    // 4. Reset Password Form
    this.resetPasswordForm = this.fb.group({
      newPassword: ['', [Validators.required, Validators.minLength(8), this.passwordStrengthValidator]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  // --- Validators ---
  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);

    const valid = hasUpperCase && hasLowerCase && hasNumeric;

    return valid ? null : { passwordStrength: true };
  }

  passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  // --- Actions ---

  // Step 1: Login
  onLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: (success) => {
        this.isLoading = false;
        if (success) {
          this.isLoginSuccess = true;
          this.cdr.detectChanges();
          setTimeout(() => {
            // Navigate to Admin Dashboard
            this.router.navigate(['/admin/dashboard']);
          }, 2000);
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.message || 'Login failed';
        this.cdr.detectChanges(); // Ensure UI updates
      }
    });
  }

  // Go to Forgot Password Step
  goToForgotPassword() {
    this.currentStep = 'forgot-email';
    this.errorMessage = '';
    this.forgotEmailForm.reset();
  }

  // Step 2: Submit Email for Code
  onSendCode() {
    if (this.forgotEmailForm.invalid) {
      this.forgotEmailForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const email = this.forgotEmailForm.get('email')?.value;

    console.log('Sending Code to:', email);

    this.authService.sendVerificationCode(email).subscribe({
      next: (res) => {
        console.log('Code Sent Success. Moving to verify-code step.');
        this.isLoading = false;

        // Show message from backend (especially if fallback was used)
        if (res.message) {
          this.popupMessage = res.message;
        }

        this.verificationEmail = email;
        this.currentStep = 'verify-code';
        console.log('New Step:', this.currentStep);
        this.verifyCodeForm.reset();
        this.cdr.detectChanges();
        // Focus first input after view update (handled in template or via lifecycle hook if needed)
      },
      error: (err) => {
        console.error('Send Code Failed:', err);
        this.isLoading = false;
        this.errorMessage = err.message || 'Failed to send code';
        this.cdr.detectChanges();
      }
    });
  }

  // Step 3: Verify Code
  onVerifyCode() {
    if (this.verifyCodeForm.invalid) {
      this.verifyCodeForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const codeObj = this.verifyCodeForm.value;
    const code = Object.values(codeObj).join('');

    console.log(`Verifying code: ${code} for ${this.verificationEmail}`);

    this.authService.verifyCode(this.verificationEmail, code).subscribe({
      next: () => {
        console.log('Code Verified Successfully. Moving to reset-password.');
        this.isLoading = false;
        this.currentStep = 'reset-password';
        console.log('New Step:', this.currentStep);
        this.resetPasswordForm.reset();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Verify Code Error:', err);
        this.isLoading = false;
        this.errorMessage = err.message || 'Invalid code';
        this.cdr.detectChanges();
      }
    });
  }

  // Helper for OTP Input Focus
  onOtpInput(event: any, index: number) {
    const input = event.target;
    const nextInput = this.otpInputs.get(index + 1);
    const prevInput = this.otpInputs.get(index - 1);

    // If user typed a number and there is a next input, focus mock it
    if (input.value && nextInput) {
      nextInput.nativeElement.focus();
    }

    // Handle backspace
    if (event.inputType === 'deleteContentBackward' && prevInput) {
      prevInput.nativeElement.focus();
    }
  }

  onOtpPaste(event: ClipboardEvent) {
    event.preventDefault();
    const clipboardData = event.clipboardData;
    const pastedText = clipboardData?.getData('text') || '';

    if (pastedText && /^\d{6}$/.test(pastedText)) {
      const digits = pastedText.split('');
      this.verifyCodeForm.patchValue({
        digit1: digits[0],
        digit2: digits[1],
        digit3: digits[2],
        digit4: digits[3],
        digit5: digits[4],
        digit6: digits[5]
      });
      // Focus last?
      this.otpInputs.last.nativeElement.focus();
    }
  }

  // Step 4: Reset Password
  onResetPassword() {
    if (this.resetPasswordForm.invalid) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const { newPassword } = this.resetPasswordForm.value;

    console.log('Resetting Password for:', this.verificationEmail);

    this.authService.resetPassword(this.verificationEmail, newPassword).subscribe({
      next: () => {
        console.log('Password Reset Success');
        this.isLoading = false;
        this.popupMessage = 'Mật khẩu đã được đặt lại thành công!';
        this.currentStep = 'login';
        this.loginForm.reset();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Reset Password Error:', err);
        this.isLoading = false;
        this.errorMessage = err.message || 'Failed to reset password';
        this.cdr.detectChanges();
      }
    });
  }

  // Navigation Helper
  backToLogin() {
    this.currentStep = 'login';
    this.errorMessage = '';
    this.loginForm.reset();
  }

  resendCode() {
    // Logic to resend code
    this.authService.sendVerificationCode(this.verificationEmail).subscribe({
      next: () => {
        this.popupMessage = `Mã đã được gửi lại đến ${this.verificationEmail}`;
      },
      error: (err) => this.errorMessage = err.message
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  toggleNewPasswordVisibility() {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  closePopup() {
    this.popupMessage = null;
  }
}
