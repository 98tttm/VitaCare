import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { OrderService } from '../services/order.service';
import { CustomerService } from '../services/customer.service';
import { ProductService } from '../services/product.service';
import { ConsultationService } from '../services/consultation.service';
import { PromotionService } from '../services/promotion.service';
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
  @ViewChild('topProductsChart') topProductsChartRef!: ElementRef;

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
  totalOutOfStockCount = 0;
  showingLowStockFallback = false;

  recentOrders: any[] = [];
  topProducts: any[] = [];
  outOfStockProducts: any[] = [];

  private themeSubscription!: Subscription;
  private charts: { [key: string]: any } = {};
  private currentOrders: any[] = [];
  private currentCustomers: any[] = [];
  private currentPrescriptions: any[] = [];
  private currentPromotions: any[] = [];

  constructor(
    private authService: AuthService,
    private orderService: OrderService,
    private customerService: CustomerService,
    private productService: ProductService,
    private consultationService: ConsultationService,
    private promotionService: PromotionService,
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
        this.initCharts(this.currentOrders, this.currentCustomers, this.currentPrescriptions, this.currentPromotions);
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
      products: this.productService.getAllProducts(),
      prescriptions: this.consultationService.getPrescriptionConsultations(),
      promotions: this.promotionService.getPromotions()
    }).subscribe({
      next: (results: any) => {
        this.stats = results.stats.data || results.stats;
        this.currentOrders = results.orders.data || results.orders;
        this.currentCustomers = results.customers.data || results.customers;
        this.currentPrescriptions =
          results.prescriptions?.data ||
          (Array.isArray(results.prescriptions) ? results.prescriptions : []);
        this.currentPromotions =
          results.promotions?.data ||
          (Array.isArray(results.promotions) ? results.promotions : []);
        const products = results.products.data || results.products;

        this.processMetrics(this.currentOrders, this.currentCustomers, products);
        this.isLoading = false;

        this.cdr.detectChanges();
        // Slightly longer delay for high-quality rendering
        setTimeout(() => this.initCharts(this.currentOrders, this.currentCustomers, this.currentPrescriptions, this.currentPromotions), 300);
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
    }).slice(0, 4);

    this.topProducts = (products || [])
      .map((p: any) => ({
        id: p._id || p.id || p.sku,
        name: p.name || 'Sản phẩm',
        sales: Number(p.sold || 0),
        image: p.image || (Array.isArray(p.gallery) && p.gallery.length > 0 ? p.gallery[0] : '')
      }))
      .sort((a: any, b: any) => b.sales - a.sales)
      .slice(0, 5);

    const normalizedProducts = (products || []).map((p: any) => ({
      ...p,
      image: p.image || (Array.isArray(p.gallery) && p.gallery.length > 0 ? p.gallery[0] : ''),
      stock: Number(p.stock ?? 0)
    }));

    const outOfStockAll = normalizedProducts
      .filter(p => (p.stock !== undefined && Number(p.stock) === 0))
      .sort((a, b) => (a.stock || 0) - (b.stock || 0));

    const lowStockAll = normalizedProducts
      .filter((p: any) => Number.isFinite(p.stock) && p.stock > 0 && p.stock < 10)
      .sort((a: any, b: any) => a.stock - b.stock);

    this.totalOutOfStockCount = outOfStockAll.length;
    this.showingLowStockFallback = outOfStockAll.length === 0;
    this.outOfStockProducts = (outOfStockAll.length > 0 ? outOfStockAll : lowStockAll).slice(0, 5);
  }

  initCharts(orders: any[], customers: any[], prescriptions: any[], promotions: any[]) {
    if (typeof Chart === 'undefined') return;

    this.renderRevenueChart(this.stats.revenue30d || []);
    this.renderPrescriptionStatusChart(prescriptions);
    this.renderPromoDistributionChart(promotions);
    this.renderStatusPieChart(orders);
    this.renderCustomerBarChart(customers);

    // New Charts
    this.renderPaymentMethodChart(orders);
    this.renderCustomerTierChart(customers);
    this.renderPeakHoursChart(orders);
    this.renderTopProductsChart(this.topProducts);
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

  private renderPrescriptionStatusChart(prescriptions: any[]) {
    if (!this.ordersVolumeChartRef) return;
    const ctx = this.ordersVolumeChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['ordersVolume']) this.charts['ordersVolume'].destroy();

    const statuses = ['pending', 'waiting', 'unreachable', 'advised', 'cancelled'];
    const statusLabels: { [key: string]: string } = {
      pending: 'Chờ',
      waiting: 'Tư vấn',
      unreachable: 'Chưa LH',
      advised: 'Đã TV',
      cancelled: 'Hủy'
    };

    const counts = statuses.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<string, number>);
    prescriptions.forEach((p: any) => {
      const s = (p?.status || 'pending').toLowerCase();
      if (counts[s] !== undefined) counts[s]++;
    });
    const labels = statuses.map(s => statusLabels[s]);
    const data = statuses.map(s => counts[s]);

    this.charts['ordersVolume'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: [
            'rgba(99, 102, 241, 0.95)',
            'rgba(99, 102, 241, 0.8)',
            'rgba(99, 102, 241, 0.62)',
            'rgba(99, 102, 241, 0.45)',
            'rgba(99, 102, 241, 0.3)'
          ],
          borderColor: isDark ? '#1e293b' : '#ffffff',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 8,
              color: isDark ? '#cbd5e1' : '#64748b',
              font: { size: 10 }
            }
          }
        }
      }
    });
  }

  private renderPromoDistributionChart(promotions: any[]) {
    if (!this.promoDistributionChartRef) return;
    const ctx = this.promoDistributionChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['promo']) this.charts['promo'].destroy();

    const now = Date.now();
    const parseDate = (value: any): number | null => {
      if (!value) return null;
      const d = new Date(value);
      const t = d.getTime();
      return Number.isNaN(t) ? null : t;
    };

    let activeCount = 0;
    let upcomingCount = 0;
    let endedCount = 0;

    (promotions || []).forEach((p: any) => {
      const start = parseDate(p.startDate || p.start_at || p.startTime);
      const end = parseDate(p.endDate || p.end_at || p.endTime);

      if (start !== null && now < start) {
        upcomingCount++;
      } else if (end !== null && now > end) {
        endedCount++;
      } else {
        activeCount++;
      }
    });

    this.charts['promo'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Đang diễn ra', 'Sắp diễn ra', 'Đã kết thúc'],
        datasets: [{
          data: [activeCount, upcomingCount, endedCount],
          backgroundColor: [
            'rgba(99, 102, 241, 0.95)',
            'rgba(99, 102, 241, 0.6)',
            isDark ? 'rgba(99, 102, 241, 0.28)' : 'rgba(99, 102, 241, 0.22)'
          ],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 8,
              color: isDark ? '#cbd5e1' : '#64748b',
              font: { size: 10 }
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
      type: 'doughnut',
      data: {
        labels: ['Hoàn tất', 'Chờ xử lý', 'Khác'],
        datasets: [{
          data: [delivered, pending, other],
          backgroundColor: [
            'rgba(99, 102, 241, 0.95)',
            'rgba(99, 102, 241, 0.6)',
            'rgba(99, 102, 241, 0.25)'
          ],
          borderWidth: 2,
          borderColor: isDark ? '#1e293b' : '#ffffff'
        }]
      },
      options: {
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 8,
              color: isDark ? '#cbd5e1' : '#64748b',
              font: { size: 10 }
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
          hoverBackgroundColor: 'rgba(99, 102, 241, 0.95)'
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
        labels: ['COD', 'Chuyển khoản'],
        datasets: [{
          data: [cod, online],
          backgroundColor: [
            'rgba(99, 102, 241, 0.95)',
            'rgba(99, 102, 241, 0.35)'
          ],
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 8,
              color: isDark ? '#cbd5e1' : '#64748b',
              font: { size: 10 }
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

    const tiers: { [key: string]: number } = { 'Đồng': 0, 'Bạc': 0, 'Vàng': 0 };
    customers.forEach(c => {
      const t = c.tiering || 'Đồng';
      if (t in tiers) {
        tiers[t]++;
      } else {
        // Group unknown tiers into "Vàng" to keep 3-tier dashboard view.
        tiers['Vàng']++;
      }
    });

    this.charts['tier'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(tiers),
        datasets: [{
          data: Object.values(tiers),
          backgroundColor: [
            'rgba(99, 102, 241, 0.35)', // Đồng
            'rgba(99, 102, 241, 0.55)', // Bạc
            'rgba(99, 102, 241, 0.8)'   // Vàng
          ]
        }]
      },
      options: {
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 8,
              color: isDark ? '#cbd5e1' : '#64748b',
              font: { size: 10 }
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

  private renderTopProductsChart(products: any[]) {
    if (!this.topProductsChartRef) return;
    const ctx = this.topProductsChartRef.nativeElement.getContext('2d');
    const isDark = this.themeService.isDarkMode;

    if (this.charts['topProducts']) this.charts['topProducts'].destroy();

    const top = (products || []).slice(0, 5);
    const labels = top.map((p: any) => {
      const name = String(p.name || 'Sản phẩm');
      return name.length > 34 ? `${name.slice(0, 34)}...` : name;
    });
    const data = top.map((p: any) => Number(p.sales || 0));

    this.charts['topProducts'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Lượt bán',
          data,
          backgroundColor: [
            'rgba(99, 102, 241, 0.95)',
            'rgba(99, 102, 241, 0.82)',
            'rgba(99, 102, 241, 0.7)',
            'rgba(99, 102, 241, 0.58)',
            'rgba(99, 102, 241, 0.46)'
          ],
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
            ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 10 } }
          },
          y: {
            grid: { display: false },
            ticks: { color: isDark ? '#cbd5e1' : '#334155', font: { size: 11 } }
          }
        }
      }
    });
  }

  viewAllOrders() {
    this.router.navigate(['/admin/orders']);
  }

  viewAllProducts() {
    this.router.navigate(['/admin/products'], {
      queryParams: {
        sortColumn: 'sold',
        sortDirection: 'desc'
      }
    });
  }

  viewAllCustomers() {
    this.router.navigate(['/admin/customers']);
  }

  goToImport(product: any) {
    // Open the exact product detail modal in product management page
    const id = product?._id || product?.id || product?.sku;
    this.router.navigate(['/admin/products'], {
      queryParams: {
        search: product.sku || product.name,
        openProductId: id
      }
    });
  }

  viewOutOfStockProducts() {
    this.router.navigate(['/admin/products'], { queryParams: { stockStatus: 'out_of_stock' } });
  }

  viewOrderDetail(orderId: string) {
    this.router.navigate(['/admin/orders/detail', orderId]);
  }
}
