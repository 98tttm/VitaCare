import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { OrderService } from '../services/order.service';
import { CustomerService } from '../services/customer.service';
import { ProductService } from '../services/product.service';
import { CommonModule, DecimalPipe } from '@angular/common';
import { forkJoin, Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ThemeService } from '../services/theme.service';

declare var Chart: any;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  providers: [DecimalPipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  // Chart refs (Top/Main)
  @ViewChild('revenueChart') revenueChartRef!: ElementRef;
  @ViewChild('ordersVolumeChart') ordersVolumeChartRef!: ElementRef;
  @ViewChild('promoDistributionChart') promoDistributionChartRef!: ElementRef;
  @ViewChild('statusPieChart') statusPieChartRef!: ElementRef;
  @ViewChild('customerBarChart') customerBarChartRef!: ElementRef;

  // New Chart refs
  @ViewChild('paymentMethodChart') paymentMethodChartRef!: ElementRef;
  @ViewChild('customerTierChart') customerTierChartRef!: ElementRef;
  @ViewChild('peakHoursChart') peakHoursChartRef!: ElementRef;

  stats: any = {};
  isLoading = true;

  totalRevenue = 0;
  totalOrdersCount = 0;
  totalCustomersCount = 0;
  totalProductsCount = 0;

  recentOrders: any[] = [];
  topProducts: any[] = [];
  outOfStockProducts: any[] = [];

  private themeSubscription!: Subscription;
  private charts: { [key: string]: any } = {};
  private currentOrders: any[] = [];
  private currentCustomers: any[] = [];

  constructor(
    private authService: AuthService,
    private orderService: OrderService,
    private customerService: CustomerService,
    private productService: ProductService,
    private cdr: ChangeDetectorRef,
    private decimalPipe: DecimalPipe,
    private router: Router,
    private themeService: ThemeService
  ) { }

  ngOnInit() {
    this.loadData();

    // Listen to theme changes
    this.themeSubscription = this.themeService.isDarkMode$.subscribe(isDark => {
      this.updateChartDefaults(isDark);
      if (!this.isLoading) {
        this.initCharts(this.currentOrders, this.currentCustomers);
      }
    });
  }

  ngOnDestroy() {
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
    // Destroy all charts
    Object.values(this.charts).forEach(chart => chart.destroy());
  }

  private updateChartDefaults(isDark: boolean) {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
    Chart.defaults.color = isDark ? '#cbd5e1' : '#64748b';
    Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  }

  printDashboard() {
    window.print();
  }

  loadData() {
    this.isLoading = true;
    forkJoin({
      stats: this.authService.getStats(),
      orders: this.orderService.getOrders(),
      customers: this.customerService.getCustomers(),
      products: this.productService.getAllProducts()
    }).subscribe({
      next: (results: any) => {
        this.stats = results.stats.data || results.stats;
        this.currentOrders = results.orders.data || results.orders;
        this.currentCustomers = results.customers.data || results.customers;
        const products = results.products.data || results.products;

        this.processMetrics(this.currentOrders, this.currentCustomers, products);
        this.isLoading = false;

        this.cdr.detectChanges();
        // Slightly longer delay for high-quality rendering
        setTimeout(() => this.initCharts(this.currentOrders, this.currentCustomers), 300);
      },
      error: (err) => {
        console.error('Error loading dashboard data:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  processMetrics(orders: any[], customers: any[], products: any[]) {
    this.totalOrdersCount = orders.length;
    this.totalCustomersCount = customers.length;
    this.totalProductsCount = products.length;

    this.totalRevenue = this.stats.totalRevenue || 0;

    this.recentOrders = [...orders].sort((a, b) => {
      const da = new Date(a.createdAt || a.route?.pending || Date.now()).getTime();
      const db = new Date(b.createdAt || b.route?.pending || Date.now()).getTime();
      return db - da;
    }).slice(0, 8);

    const salesMap: { [key: string]: number } = {};
    orders.forEach(o => {
      (o.item || o.items || []).forEach((it: any) => {
        const id = it.sku || it.productId || 'unknown';
        salesMap[id] = (salesMap[id] || 0) + (it.quantity || 1);
      });
    });

    this.topProducts = Object.keys(salesMap)
      .map(id => {
        const p = products.find(prod => prod.sku === id || prod._id === id);
        return {
          id,
          name: p ? p.name : 'Sản phẩm ' + id,
          sales: salesMap[id],
          image: p ? (Array.isArray(p.image) ? p.image[0] : (p.image || '')) : ''
        };
      })
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 3);

    this.outOfStockProducts = products
      .filter(p => (p.stock !== undefined && p.stock <= 5))
      .sort((a, b) => (a.stock || 0) - (b.stock || 0))
      .slice(0, 5);
  }

  initCharts(orders: any[], customers: any[]) {
    if (typeof Chart === 'undefined') return;

    this.renderRevenueChart(this.stats.revenue30d || []);
    this.renderOrdersVolumeChart(orders);
    this.renderPromoDistributionChart(orders);
    this.renderStatusPieChart(orders);
    this.renderCustomerBarChart(customers);

    // New Charts
    this.renderPaymentMethodChart(orders);
    this.renderCustomerTierChart(customers);
    this.renderPeakHoursChart(orders);
  }

  private renderRevenueChart(revenueData: any[]) {
    if (!this.revenueChartRef) return;
    const ctx = this.revenueChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['revenue']) this.charts['revenue'].destroy();

    const labels = revenueData.map(r => r.date);
    const data = revenueData.map(r => r.revenue);

    this.charts['revenue'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(l => l.split('-').reverse().slice(0, 2).join('/')),
        datasets: [{
          label: 'Doanh thu (đ)',
          data: data,
          borderColor: '#6366f1',
          backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: isDark ? '#1e293b' : '#fff',
          pointBorderColor: '#6366f1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#334155' : '#1e293b',
            padding: 12,
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 13 },
            callbacks: {
              label: (ctx: any) => ` Doanh thu: ${ctx.raw.toLocaleString()}đ`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: { size: 11 }
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
            },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: { size: 11 },
              callback: (v: any) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v.toLocaleString()
            }
          }
        }
      }
    });
  }

  private renderOrdersVolumeChart(orders: any[]) {
    if (!this.ordersVolumeChartRef) return;
    const ctx = this.ordersVolumeChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['ordersVolume']) this.charts['ordersVolume'].destroy();

    const volume: { [key: string]: number } = {};
    orders.forEach(o => {
      const d = (o.createdAt || o.route?.pending || new Date().toISOString()).substring(0, 10);
      volume[d] = (volume[d] || 0) + 1;
    });
    const labels = Object.keys(volume).sort().slice(-10);
    const data = labels.map(l => volume[l]);

    this.charts['ordersVolume'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data, borderColor: '#B620E0',
          backgroundColor: isDark ? 'rgba(182, 32, 224, 0.1)' : 'rgba(182, 32, 224, 0.05)',
          fill: true, tension: 0.4, pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  private renderPromoDistributionChart(orders: any[]) {
    if (!this.promoDistributionChartRef) return;
    const ctx = this.promoDistributionChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['promo']) this.charts['promo'].destroy();

    const withPromo = orders.filter(o => o.promotion && (Array.isArray(o.promotion) ? o.promotion.length > 0 : !!o.promotion)).length;
    const defaultCnt = orders.length - withPromo;

    this.charts['promo'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Dùng Mã', 'Mặc định'],
        datasets: [{
          data: [withPromo, defaultCnt],
          backgroundColor: ['#6366f1', isDark ? '#334155' : '#EEF2FF'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        cutout: '78%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 20,
              color: isDark ? '#cbd5e1' : '#64748b'
            }
          }
        }
      }
    });
  }

  private renderStatusPieChart(orders: any[]) {
    if (!this.statusPieChartRef) return;
    const ctx = this.statusPieChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['status']) this.charts['status'].destroy();

    const delivered = orders.filter(o => o.status === 'delivered').length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const other = orders.length - delivered - pending;

    this.charts['status'] = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Hoàn tất', 'Chờ xử lý', 'Khác'],
        datasets: [{
          data: [delivered, pending, other],
          backgroundColor: ['#6366f1', '#F59E0B', '#B9A6DC'],
          borderWidth: 2,
          borderColor: isDark ? '#1e293b' : '#ffffff'
        }]
      },
      options: {
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 15,
              color: isDark ? '#cbd5e1' : '#64748b'
            }
          }
        }
      }
    });
  }

  private renderCustomerBarChart(customers: any[]) {
    if (!this.customerBarChartRef) return;
    const ctx = this.customerBarChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['customerBar']) this.charts['customerBar'].destroy();

    const days = [0, 0, 0, 0, 0, 0, 0];
    customers.forEach(u => {
      const d = u.registerdate || u.createdAt || Date.now();
      const day = new Date(d).getDay();
      days[day === 0 ? 6 : day - 1]++;
    });

    this.charts['customerBar'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
        datasets: [{
          data: days,
          backgroundColor: '#6366f1',
          borderRadius: 8,
          barThickness: 32,
          hoverBackgroundColor: '#4f46e5'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: isDark ? '#94a3b8' : '#64748b' }
          },
          y: {
            beginAtZero: true,
            grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' },
            ticks: {
              precision: 0,
              color: isDark ? '#94a3b8' : '#64748b'
            }
          }
        }
      }
    });
  }

  // --- New Visualizations ---

  private renderPaymentMethodChart(orders: any[]) {
    if (!this.paymentMethodChartRef) return;
    const ctx = this.paymentMethodChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['payment']) this.charts['payment'].destroy();

    const cod = orders.filter(o => o.paymentMethod?.toLowerCase() === 'cod').length;
    const online = orders.length - cod;

    this.charts['payment'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Tiền mặt (COD)', 'Chuyển khoản / Ví'],
        datasets: [{
          data: [cod, online],
          backgroundColor: ['#6366f1', '#10B981'],
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 20,
              color: isDark ? '#cbd5e1' : '#64748b'
            }
          }
        }
      }
    });
  }

  private renderCustomerTierChart(customers: any[]) {
    if (!this.customerTierChartRef) return;
    const ctx = this.customerTierChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['tier']) this.charts['tier'].destroy();

    const tiers: { [key: string]: number } = { 'Đồng': 0, 'Bạc': 0, 'Vàng': 0, 'Kim cương': 0 };
    customers.forEach(c => {
      const t = c.tiering || 'Đồng';
      tiers[t] = (tiers[t] || 0) + 1;
    });

    this.charts['tier'] = new Chart(ctx, {
      type: 'polarArea',
      data: {
        labels: Object.keys(tiers),
        datasets: [{
          data: Object.values(tiers),
          backgroundColor: [
            'rgba(148, 163, 184, 0.7)', // Silver-ish
            'rgba(99, 102, 241, 0.7)',  // Primary
            'rgba(245, 158, 11, 0.7)',  // Gold
            'rgba(182, 32, 224, 0.7)'   // Diamond-ish Purple
          ]
        }]
      },
      options: {
        scales: {
          r: {
            display: false,
            grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              color: isDark ? '#cbd5e1' : '#64748b'
            }
          }
        }
      }
    });
  }

  private renderPeakHoursChart(orders: any[]) {
    if (!this.peakHoursChartRef) return;
    const ctx = this.peakHoursChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['peak']) this.charts['peak'].destroy();

    const hours = new Array(24).fill(0);
    orders.forEach(o => {
      const d = new Date(o.createdAt || o.route?.pending || Date.now());
      hours[d.getHours()]++;
    });

    this.charts['peak'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => i + 'h'),
        datasets: [{
          label: 'Số đơn hàng',
          data: hours,
          backgroundColor: isDark ? 'rgba(99, 102, 241, 0.6)' : 'rgba(99, 102, 241, 0.7)',
          borderRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 9 },
              autoSkip: true,
              maxRotation: 0,
              color: isDark ? '#94a3b8' : '#64748b'
            }
          },
          y: {
            display: false,
            beginAtZero: true
          }
        }
      }
    });
  }

  viewAllOrders() {
    this.router.navigate(['/admin/orders']);
  }

  viewAllProducts() {
    this.router.navigate(['/admin/products']);
  }

  goToImport(product: any) {
    // Navigate to products page with search term to show only this product for easy import
    this.router.navigate(['/admin/products'], { queryParams: { search: product.sku || product.name } });
  }

  viewOrderDetail(orderId: string) {
    this.router.navigate(['/admin/orders/detail', orderId]);
  }
}
