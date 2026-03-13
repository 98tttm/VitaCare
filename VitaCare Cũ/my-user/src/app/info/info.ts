import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-info',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './info.html',
  styleUrl: './info.css',
})
export class Info {
  // User Information
  fullName: string = 'Huỳnh Hương';
  phone: string = '0965813408';
  email: string = '';
  birthDate: string = '';
  gender: string = 'male';
  password: string = '************';
  userAvatar: string = 'assets/icon/customer.png';

  // Password visibility toggle
  showPassword: boolean = false;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  changePassword(event: Event): void {
    event.preventDefault();
    // Handle password change logic
    console.log('Change password clicked');
  }

  onSubmit(): void {
    const userData = {
      fullName: this.fullName,
      phone: this.phone,
      email: this.email,
      birthDate: this.birthDate,
      gender: this.gender,
    };
    console.log('Updating user info:', userData);
    // Handle form submission logic
    alert('Thông tin đã được cập nhật thành công!');
  }
}
