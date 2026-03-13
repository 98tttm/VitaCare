import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Address {
  id: string;
  name: string;
  fullAddress: string;
  phone: string;
  email?: string;
  isDefault: boolean;
}

@Component({
  selector: 'app-addresses',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './addresses.html',
  styleUrl: './addresses.css',
})
export class Addresses {
  addresses: Address[] = [
    {
      id: 'addr1',
      name: 'Huỳnh Hương',
      fullAddress: '123 Nguyễn Thị Minh Khai, Phường Phú Lợi, Thành phố Cần Thơ',
      phone: '0987654321',
      email: 'hello@gmail.com',
      isDefault: true
    },
    {
      id: 'addr2',
      name: 'abcd',
      fullAddress: '2222 nè, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh',
      phone: '0987654321',
      email: 'hello@gmail.com',
      isDefault: false
    }
  ];

  editAddress(id: string): void {
    console.log('Edit address:', id);
    alert('Chức năng chỉnh sửa địa chỉ đang được phát triển');
  }

  deleteAddress(id: string): void {
    if (confirm('Bạn có chắc chắn muốn xóa địa chỉ này?')) {
      this.addresses = this.addresses.filter(addr => addr.id !== id);
      console.log('Address deleted:', id);
    }
  }

  setDefaultAddress(id: string): void {
    this.addresses.forEach(addr => {
      addr.isDefault = addr.id === id;
    });
    console.log('Set default address:', id);
  }

  addNewAddress(): void {
    console.log('Add new address');
    alert('Chức năng thêm địa chỉ mới đang được phát triển');
  }
}
