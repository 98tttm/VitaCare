import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ReviewItem {
  name: string;
  description: string;
  price: number;
  quantity: number;
  image: string;
}

interface Review {
  id: string;
  orderId: string;
  status: 'pending' | 'completed';
  statusText: string;
  date: string;
  items: ReviewItem[];
  total: number;
}

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reviews.html',
  styleUrl: './reviews.css',
})
export class Reviews {
  activeTab: 'pending' | 'completed' = 'pending';

  reviews: Review[] = [
    {
      id: 'rev1',
      orderId: '12345',
      status: 'pending',
      statusText: 'Đã giao hàng',
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
      id: 'rev2',
      orderId: '12346',
      status: 'completed',
      statusText: 'Đã đánh giá',
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

  get filteredReviews(): Review[] {
    return this.reviews.filter(r => r.status === this.activeTab);
  }

  setActiveTab(tab: 'pending' | 'completed'): void {
    this.activeTab = tab;
  }

  toggleReviewDetails(id: string): void {
    console.log('Toggle review details:', id);
  }

  buyAgain(orderId: string): void {
    console.log('Buy again:', orderId);
    alert('Chức năng mua lại đang được phát triển');
  }

  writeReview(id: string): void {
    console.log('Write review for:', id);
    alert('Chức năng đánh giá sản phẩm đang được phát triển');
  }
}
