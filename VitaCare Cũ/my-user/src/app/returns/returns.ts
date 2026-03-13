import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ReturnItem {
  name: string;
  description: string;
  price: number;
  quantity: number;
  image: string;
}

interface Return {
  id: string;
  orderId: string;
  status: 'processing' | 'returning' | 'completed';
  statusText: string;
  date: string;
  items: ReturnItem[];
  total: number;
}

@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './returns.html',
  styleUrl: './returns.css',
})
export class Returns {
  activeTab: 'processing' | 'returning' | 'completed' = 'processing';

  returns: Return[] = [
    {
      id: 'ret1',
      orderId: '12345',
      status: 'processing',
      statusText: 'Đang chờ xử lý',
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
      total: 220990
    },
    {
      id: 'ret2',
      orderId: '12346',
      status: 'returning',
      statusText: 'Đang trả hàng',
      date: '10/01/2026',
      items: [
        {
          name: 'Vitamin C 1000mg',
          description: 'Bổ sung vitamin C',
          price: 150000,
          quantity: 2,
          image: 'assets/images/product2.png'
        }
      ],
      total: 300000
    }
  ];

  get filteredReturns(): Return[] {
    return this.returns.filter(r => r.status === this.activeTab);
  }

  setActiveTab(tab: 'processing' | 'returning' | 'completed'): void {
    this.activeTab = tab;
  }

  toggleReturnDetails(id: string): void {
    console.log('Toggle return details:', id);
  }

  cancelReturn(id: string): void {
    if (confirm('Bạn có chắc chắn muốn hủy yêu cầu đổi trả này?')) {
      this.returns = this.returns.filter(r => r.id !== id);
      console.log('Return cancelled:', id);
    }
  }
}
