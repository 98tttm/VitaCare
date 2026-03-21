import { Component, ViewChild, ElementRef, OnDestroy, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { Notice } from '../notice/notice';
import { AuthRole } from '../services/auth.service';

@Component({
  selector: 'app-layout',
  imports: [CommonModule, RouterOutlet, RouterModule, FormsModule, Notice],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout implements OnInit, OnDestroy {
  isSidebarCollapsed = false;
  isAdminDropdownOpen = false;
  isConsultationMenuOpen = false;
  isOrderMenuOpen = false;
  isLogoutConfirmModalOpen = false;
  isPersonalInfoModalOpen = false;
  isSettingsModalOpen = false;
  isEditingProfile = false;
  isBlogMenuOpen = false;

  // Profile data state
  profileData: any = {};
  tempProfileData: any = {};
  avatarUrl: string | null = null;
  areasList: any[] = [];

  // Password visibility & update
  isPasswordVisible = false;
  isChangePasswordModalOpen = false;
  changePasswordStep: 'verify' | 'new' = 'verify';
  oldPasswordInput = '';
  newPasswordInput = '';
  confirmNewPasswordInput = '';

  // Camera fields
  isCameraOpen = false;
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;
  stream: MediaStream | null = null;

  toastMessage: string | null = null;
  toastType: 'success' | 'error' | 'warning' = 'success';

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
    private themeService: ThemeService
  ) { }

  ngOnInit() {
    this.isDarkMode = this.themeService.isDarkMode;
    this.loadProfile();
    this.loadAreas();
  }

  loadAreas() {
    this.http.get<any>('http://localhost:3000/api/tree_complete').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          // Transform tree_complete.json into simple list of cities
          this.areasList = res.data.map((item: any) => {
            const key = Object.keys(item)[0];
            return {
              code: key,
              name: item[key].name_with_type
            };
          }).sort((a: any, b: any) => a.name.localeCompare(b.name));
        }
      },
      error: (err) => console.error('Error loading areas:', err)
    });
  }

  loadProfile() {
    let adminStr = null;
    if (typeof window !== 'undefined') {
      adminStr = localStorage.getItem('admin');
    }

    if (adminStr) {
      try {
        const mainAdmin = JSON.parse(adminStr);
        const accountRole = mainAdmin.accountRole === 'pharmacist' ? 'Dược sĩ' : 'Quản trị viên';
        this.profileData = {
          name: mainAdmin.adminname || mainAdmin.pharmacistName || 'Admin VitaCare',
          role: mainAdmin.role || accountRole,
          email: mainAdmin.adminemail || mainAdmin.pharmacistEmail || mainAdmin.email || 'admin@vitacare.vn',
          phone: mainAdmin.phone || mainAdmin.pharmacistPhone || 'Chưa cập nhật',
          region: mainAdmin.region || 'Chưa cập nhật',
          joinDate: mainAdmin.joinDate || '01/01/2024',
          password: mainAdmin.password || '',
          avatar: mainAdmin.avatar || null
        };
        this.updateProfileState();
        return;
      } catch (e) {
        console.error('Lỗi parse admin từ localStorage', e);
      }
    }

    // Fallback if not found in cache
    this.authService.getAdmins().subscribe({
      next: (admins) => {
        if (admins && admins.length > 0) {
          const mainAdmin = admins[0];
          this.profileData = {
            name: mainAdmin.adminname || 'Admin VitaCare',
            role: mainAdmin.role || 'Quản trị viên',
            email: mainAdmin.adminemail || 'admin@vitacare.vn',
            phone: mainAdmin.phone || 'Chưa cập nhật',
            region: mainAdmin.region || 'Chưa cập nhật',
            joinDate: mainAdmin.joinDate || '01/01/2024',
            password: mainAdmin.password || '',
            avatar: mainAdmin.avatar || null
          };
        } else {
          this.setDefaultProfile();
        }
        this.updateProfileState();
      },
      error: (err) => {
        console.error('Lỗi khi tải dữ liệu admin', err);
        this.setDefaultProfile();
        this.updateProfileState();
      }
    });
  }

  setDefaultProfile() {
    this.profileData = {
      name: 'Admin VitaCare',
      role: 'Quản trị viên',
      email: 'admin@vitacare.vn',
      phone: '0123456789',
      region: 'Hồ Chí Minh',
      joinDate: '01/01/2024',
      password: 'admin',
      avatar: null
    };
  }

  updateProfileState() {
    this.avatarUrl = this.profileData.avatar || null;
    this.tempProfileData = { ...this.profileData };
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  toggleConsultationMenu() {
    this.isConsultationMenuOpen = !this.isConsultationMenuOpen;
  }

  toggleOrderMenu(event: Event) {
    event.preventDefault();
    this.isOrderMenuOpen = !this.isOrderMenuOpen;
  }

  toggleBlogMenu() {
    this.isBlogMenuOpen = !this.isBlogMenuOpen;
  }

  isDarkMode = false;
  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    this.themeService.toggleTheme(this.isDarkMode);
  }

  toggleAdminDropdown() {
    this.isAdminDropdownOpen = !this.isAdminDropdownOpen;
  }

  showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = null;
    }, 3000);
  }

  openPersonalInfo() {
    this.isAdminDropdownOpen = false;
    this.isEditingProfile = false;
    this.isPasswordVisible = false;
    this.tempProfileData = { ...this.profileData };
    this.avatarUrl = this.profileData.avatar || null;
    this.isPersonalInfoModalOpen = true;
  }

  closePersonalInfo() {
    if (this.isCameraOpen) this.closeCamera();
    this.isPersonalInfoModalOpen = false;
  }

  startEditingProfile() {
    this.isEditingProfile = true;
    this.tempProfileData = { ...this.profileData };
    this.avatarUrl = this.profileData.avatar || null;
  }

  cancelEditingProfile() {
    this.isEditingProfile = false;
    this.tempProfileData = { ...this.profileData };
    this.avatarUrl = this.profileData.avatar || null;
    if (this.isCameraOpen) this.closeCamera();
  }

  saveProfile() {
    this.profileData = { ...this.tempProfileData };
    this.profileData.avatar = this.avatarUrl; // Save image
    localStorage.setItem('admin_profile', JSON.stringify(this.profileData));
    this.isEditingProfile = false;
    this.showNotification('Đã cập nhật thông tin cá nhân!', 'success');
  }

  // --- Avatar Logic ---
  triggerFileInput() {
    const fileInput = document.getElementById('avatarUploadBtn') as HTMLInputElement;
    if (fileInput) fileInput.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.avatarUrl = e.target.result;
        this.showNotification('Đã tải lên ảnh từ máy!', 'success');
      };
      reader.readAsDataURL(file);
    }
  }

  openCamera() {
    this.isCameraOpen = true;
    setTimeout(() => {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          this.stream = stream;
          if (this.videoElement) {
            this.videoElement.nativeElement.srcObject = stream;
            this.videoElement.nativeElement.play();
          }
        })
        .catch(err => {
          this.showNotification('Không thể truy cập Camera. Kiểm tra quyền trình duyệt.', 'error');
          this.isCameraOpen = false;
        });
    }, 100);
  }

  closeCamera() {
    this.stopCamera();
    this.isCameraOpen = false;
  }

  capturePhoto() {
    if (this.videoElement && this.canvasElement) {
      const video = this.videoElement.nativeElement;
      const canvas = this.canvasElement.nativeElement;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        this.avatarUrl = canvas.toDataURL('image/png');
        this.closeCamera();
        this.showNotification('Đã chụp ảnh thành công!', 'success');
      }
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  // --- Password Logic ---
  openChangePasswordModal() {
    this.isChangePasswordModalOpen = true;
    this.changePasswordStep = 'verify';
    this.oldPasswordInput = '';
    this.newPasswordInput = '';
    this.confirmNewPasswordInput = '';
  }

  closeChangePasswordModal() {
    this.isChangePasswordModalOpen = false;
  }

  verifyOldPassword() {
    if (!this.oldPasswordInput) {
      this.showNotification('Vui lòng nhập mật khẩu hiện tại.', 'warning');
      return;
    }
    // Move to next step - the actual verification happens when comparing hashes via API
    this.changePasswordStep = 'new';
  }

  saveNewPassword() {
    if (!this.newPasswordInput || this.newPasswordInput.length < 8) {
      this.showNotification('Mật khẩu mới phải từ 8 ký tự trở lên.', 'warning');
      return;
    }
    const hasUpper = /[A-Z]/.test(this.newPasswordInput);
    const hasLower = /[a-z]/.test(this.newPasswordInput);
    const hasDigit = /[0-9]/.test(this.newPasswordInput);
    if (!hasUpper || !hasLower || !hasDigit) {
      this.showNotification('Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số.', 'warning');
      return;
    }
    if (this.newPasswordInput !== this.confirmNewPasswordInput) {
      this.showNotification('Mật khẩu xác nhận không khớp.', 'error');
      return;
    }

    const email = this.profileData.email;
    this.authService.changePassword(email, this.oldPasswordInput, this.newPasswordInput, this.getCurrentRole()).subscribe({
      next: (res) => {
        // Update the cached admin in localStorage with the new password hash
        if (res.admin) {
          const updatedAdmin = res.admin;
          localStorage.setItem('admin', JSON.stringify(updatedAdmin));
          this.profileData.password = updatedAdmin.password;
          this.tempProfileData.password = updatedAdmin.password;
        }
        this.isChangePasswordModalOpen = false;
        this.showNotification('Đổi mật khẩu thành công!', 'success');
      },
      error: (err) => {
        this.showNotification(err.message || 'Lỗi đổi mật khẩu. Vui lòng kiểm tra lại.', 'error');
      }
    });
  }

  openSettings() {
    this.isAdminDropdownOpen = false;
    this.isSettingsModalOpen = true;
  }

  closeSettings() {
    this.isSettingsModalOpen = false;
  }

  saveSettings() {
    this.closeSettings();
    this.showNotification('Đã lưu thay đổi cài đặt thành công!', 'success');
  }

  openLogoutConfirm() {
    this.isAdminDropdownOpen = false;
    this.isLogoutConfirmModalOpen = true;
  }

  closeLogoutConfirm() {
    this.isLogoutConfirmModalOpen = false;
  }

  confirmLogout() {
    this.isLogoutConfirmModalOpen = false;
    this.router.navigate(['/login']);
  }

  private getCurrentRole(): AuthRole {
    if (typeof window === 'undefined') return 'admin';
    try {
      const raw = localStorage.getItem('admin');
      if (!raw) return 'admin';
      const parsed = JSON.parse(raw);
      return parsed?.accountRole === 'pharmacist' ? 'pharmacist' : 'admin';
    } catch (_) {
      return 'admin';
    }
  }
}
