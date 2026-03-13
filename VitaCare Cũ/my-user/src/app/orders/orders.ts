import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface OrderItem {
  name: string;
  description: string;
  price: number;
  quantity: number;
  image: string;
}

interface Order {
  id: string;
  status: 'pending' | 'shipping' | 'delivered' | 'cancelled';
  statusText: string;
  date: string;
  items: OrderItem[];
  total: number;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class Orders {
  activeTab: 'all' | 'pending' | 'shipping' | 'delivered' | 'cancelled' = 'all';
  searchKeyword: string = '';

  orders: Order[] = [
    {
      id: '12345',
      status: 'pending',
      statusText: 'Chờ xác nhận',
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
      id: '12346',
      status: 'shipping',
      statusText: 'Đang giao hàng',
      date: '10/01/2026',
      items: [
        {
          name: 'Vitamin C 1000mg',
          description: 'Bổ sung vitamin C, tăng cường sức đề kháng',
          price: 150000,
          quantity: 2,
          image: 'assets/images/product2.png'
        }
      ],
      total: 300000
    },
    {
      id: '12347',
      status: 'delivered',
      statusText: 'Đã giao hàng',
      date: '05/01/2026',
      items: [
        {
          name: 'Omega 3 Fish Oil',
          description: 'Hỗ trợ tim mạch và sức khỏe não bộ',
          price: 250000,
          quantity: 1,
          image: 'assets/images/product3.png'
        }
      ],
      total: 250000
    }
  ];

  get filteredOrders(): Order[] {
    let filtered = this.orders;

    if (this.activeTab !== 'all') {
      filtered = filtered.filter(order => order.status === this.activeTab);
    }

    if (this.searchKeyword.trim()) {
      const keyword = this.searchKeyword.toLowerCase();
      filtered = filtered.filter(order =>
        order.id.toLowerCase().includes(keyword) ||
        order.items.some(item => item.name.toLowerCase().includes(keyword))
      );
    }

    return filtered;
  }

  setActiveTab(tab: 'all' | 'pending' | 'shipping' | 'delivered' | 'cancelled'): void {
    this.activeTab = tab;
  }

  getOrderCount(status: string): number {
    if (status === 'all') {
      return this.orders.length;
    }
    return this.orders.filter(order => order.status === status).length;
  }

  toggleOrderDetails(orderId: string): void {
    console.log('Toggle order details:', orderId);
  }

  cancelOrder(orderId: string): void {
    if (confirm('Bạn có chắc chắn muốn hủy đơn hàng này?')) {
      const order = this.orders.find(o => o.id === orderId);
      if (order) {
        order.status = 'cancelled';
        order.statusText = 'Đã hủy';
        console.log('Order cancelled:', orderId);
      }
    }
  }
}
