import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface PrescriptionItem {
  name: string;
  description: string;
  price: number;
  quantity: number;
  image: string;
}

interface Prescription {
  id: string;
  status: 'pending' | 'completed' | 'unreachable' | 'cancelled';
  statusText: string;
  date: string;
  items: PrescriptionItem[];
  total: number;
}

@Component({
  selector: 'app-prescriptions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './prescriptions.html',
  styleUrl: './prescriptions.css',
})
export class Prescriptions {
  activeTab: 'all' | 'pending' | 'completed' | 'unreachable' | 'cancelled' = 'all';

  prescriptions: Prescription[] = [
    {
      id: 'RX001',
      status: 'pending',
      statusText: 'Chờ tư vấn',
      date: '15/01/2026',
      items: [
        {
          name: 'Tên sản phẩm 1',
          description: 'Viên uống Pikolin Ocavill hỗ trợ tăng tuần hoàn máu não, giảm hình thành cục máu đông',
          price: 102500,
          quantity: 1,
          image: 'assets/images/product1.png'
        }
      ],
      total: 102500
    },
    {
      id: 'RX002',
      status: 'completed',
      statusText: 'Đã tư vấn',
      date: '10/01/2026',
      items: [
        {
          name: 'Thuốc giảm đau',
          description: 'Hỗ trợ giảm đau, hạ sốt hiệu quả',
          price: 50000,
          quantity: 2,
          image: 'assets/images/product2.png'
        }
      ],
      total: 100000
    }
  ];

  get filteredPrescriptions(): Prescription[] {
    if (this.activeTab === 'all') {
      return this.prescriptions;
    }
    return this.prescriptions.filter(p => p.status === this.activeTab);
  }

  setActiveTab(tab: 'all' | 'pending' | 'completed' | 'unreachable' | 'cancelled'): void {
    this.activeTab = tab;
  }

  getPrescriptionCount(status: string): number {
    if (status === 'all') {
      return this.prescriptions.length;
    }
    return this.prescriptions.filter(p => p.status === status).length;
  }

  uploadPrescription(): void {
    console.log('Upload prescription');
    alert('Chức năng upload đơn thuốc đang được phát triển');
  }

  togglePrescriptionDetails(id: string): void {
    console.log('Toggle prescription details:', id);
  }

  requestConsultation(id: string): void {
    console.log('Request consultation for:', id);
  }
}
