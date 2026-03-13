import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, Input, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { ReviewFormComponent, ReviewProduct } from '../components/review-form/review-form';
import { ReviewSyncService } from '../services/review-sync.service';
import { ReviewBadgeService } from '../services/review-badge.service';
import { ToastService } from '../services/toast.service';
import { OrderService } from '../services/order.service';
import { CartService, CartItem } from '../services/cart.service';
import { CartSidebarService } from '../services/cart-sidebar.service';
import { Subscription } from 'rxjs';
import { forkJoin } from 'rxjs';
import { OrderDetailAcc } from '../order-detail-acc/order-detail-acc';


interface ProductInfo {
  id: string;
  name: string;
  image?: string;
  category: string;
  price: number;
  unit: string;
  quantity: number;
  totalPrice: number;
  sku?: string; // SKU để navigate
  hasBuy1Get1?: boolean; // Có khuyến mãi buy1get1 không (deprecated, dùng itemType)
  originalPrice?: number; // Giá gốc trước khuyến mãi
  itemType?: 'purchased' | 'gifted'; // Loại item: mua hoặc tặng kèm
  backendId?: string; // _id thực của sản phẩm (ObjectId/string) nếu có
  slug?: string; // slug sản phẩm (nếu có)
}

interface ReviewItem {
  id: string;
  productName: string;
  productImage?: string;
  category: string;
  reviewerName?: string;
  rating?: number | null;
  reviewText?: string | null;
  reviewDate?: string;
  images?: string[]; // Hình ảnh từ review
  orderDate?: string;
  orderStatus?: string;
  price?: string;
  unit?: string;
  quantity?: string;
  totalPrice?: string;
  orderTotal?: string;
  orderNumber?: string; // Order number for display
  sku?: string; // SKU để navigate đến product detail
  productId?: string; // Product ID để navigate đến product detail
  // For order structure
  orderId?: string;
  OrderID?: string; // OrderID từ collection orders (để lưu vào review)
  CustomerID?: string; // CustomerID từ collection orders (để lưu vào review)
  shippingInfo?: {
    fullName?: string; // fullName từ shippingInfo để lưu vào review
    [key: string]: any;
  };
  products?: ProductInfo[];
  // For checking if order is reviewed
  isReviewed?: boolean;
}

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    RouterModule,
    ReviewFormComponent,
    OrderDetailAcc,
  ],
  templateUrl: './reviews.html',
  styleUrls: ['./reviews.css'],
})
export class ReviewsComponent implements OnInit, OnDestroy, OnChanges {
  private reviewSyncSubscription: Subscription = new Subscription();

  /** Truyền từ Account để tải đơn ngay khi vào tab (tránh phải active 2 lần) */
  @Input() userId: string | undefined;

  /** Khắc phục lỗi sidebar click không kích hoạt refresh */
  @Input() forceReload: number = 0;

  constructor(
    private http: HttpClient,
    private router: Router,
    private reviewSyncService: ReviewSyncService,
    private reviewBadgeService: ReviewBadgeService,
    private toastService: ToastService,
    private orderService: OrderService,
    private cdr: ChangeDetectorRef,
    private cartService: CartService,
    private cartSidebar: CartSidebarService,
  ) { }

  // Review modal state
  showReviewModal: boolean = false;
  selectedProductsForReview: ReviewProduct[] = [];

  @ViewChild(OrderDetailAcc) orderDetailModal!: OrderDetailAcc;
  allOrdersData: any[] = [];

  // Expanded orders state
  expandedOrders: Set<string> = new Set();

  showReviewed: boolean = false;
  sortBy: string = 'high';
  filterRatings: { [key: number]: boolean } = {
    5: false,
    4: false,
    3: false,
    2: false,
    1: false,
  };

  // Promotions data for buy1get1
  promotions: any[] = [];
  promotionTargets: any[] = [];
  isFilterDropdownOpen: boolean = false;

  // Sample reviewed items
  allReviewedItems: ReviewItem[] = [];

  // Sample unreviewed items
  unreviewedItems: ReviewItem[] = [];

  get reviewedItems(): ReviewItem[] {
    let items = [...this.allReviewedItems];

    // Filter by rating if any filter is active
    const hasActiveFilter = Object.values(this.filterRatings).some((val) => val);
    if (hasActiveFilter) {
      const selectedRatings = Object.keys(this.filterRatings)
        .filter((key) => this.filterRatings[parseInt(key)])
        .map((key) => parseInt(key));
      items = items.filter((item) => item.rating && selectedRatings.includes(item.rating));
    }

    // Sort by rating first (if sortBy is set)
    if (this.sortBy === 'high') {
      items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (this.sortBy === 'low') {
      items.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    }

    // Then sort by date (newest first) - đánh giá mới nhất lên đầu
    items.sort((a, b) => {
      // Parse reviewDate from format "dd/mm/yyyy hh:mm" or "dd/mm/yyyy"
      const parseDate = (dateStr: string | undefined): number => {
        if (!dateStr) return 0;
        try {
          // Try to parse format "dd/mm/yyyy hh:mm" or "dd/mm/yyyy"
          const parts = dateStr.split(' ');
          const datePart = parts[0]; // "dd/mm/yyyy"
          const timePart = parts[1]; // "hh:mm" (if exists)

          const [day, month, year] = datePart.split('/').map(Number);
          if (!day || !month || !year) return 0;

          let hours = 0,
            minutes = 0;
          if (timePart) {
            const [h, m] = timePart.split(':').map(Number);
            hours = h || 0;
            minutes = m || 0;
          }

          return new Date(year, month - 1, day, hours, minutes).getTime();
        } catch {
          return 0;
        }
      };

      const dateA = parseDate(a.reviewDate);
      const dateB = parseDate(b.reviewDate);

      // Sort descending (newest first)
      return dateB - dateA;
    });

    return items;
  }

  getStarArray(count: number): number[] {
    return Array(count)
      .fill(0)
      .map((_, i) => i);
  }

  getTotalQuantity(item: ReviewItem): number {
    if (!item.products || item.products.length === 0) {
      return 0;
    }
    return item.products.reduce((total, product) => total + product.quantity, 0);
  }

  // View order details
  viewOrderDetails(item: ReviewItem): void {
    if (this.orderDetailModal && this.allOrdersData.length > 0) {
      this.orderDetailModal.openModal(this.allOrdersData, item.orderId);
    }
  }

  toggleRatingFilter(level: number): void {
    this.filterRatings[level] = !this.filterRatings[level];
  }

  toggleFilterDropdown(): void {
    this.isFilterDropdownOpen = !this.isFilterDropdownOpen;
  }

  closeFilterDropdown(): void {
    this.isFilterDropdownOpen = false;
  }

  getSelectedFiltersCount(): number {
    return Object.values(this.filterRatings).filter((val) => val).length;
  }

  toggleSort(): void {
    // Toggle between 'high' and 'low'
    this.sortBy = this.sortBy === 'high' ? 'low' : 'high';
    // Sorting is handled in the getter
  }

  getSortLabel(): string {
    return this.sortBy === 'high' ? 'Cao đến thấp' : 'Thấp đến cao';
  }

  onSortChange(): void {
    // Sorting is handled in the getter (kept for backward compatibility if needed)
  }

  onEditReview(item: ReviewItem): void {
    // Convert reviewed item to ReviewProduct format for editing
    this.selectedProductsForReview = [
      {
        id: item.id,
        productName: item.productName,
        productImage: item.productImage,
        category: item.category,
        rating: item.rating,
        reviewText: item.reviewText,
        images: item.images || [],
      },
    ];
    this.showReviewModal = true;
  }

  onAddReview(item: ReviewItem): void {
    // Convert all products in the order to ReviewProduct format
    if (item.products && item.products.length > 0) {
      this.selectedProductsForReview = item.products.map((product: any) => ({
        id: `${item.orderId}_${product.id}`,
        productName: product.name,
        productImage: product.image,
        category: product.category,
        sku: product.sku || product.id, // Thêm SKU từ product
      }));
    } else {
      // Fallback for old format (single product)
      this.selectedProductsForReview = [
        {
          id: item.id,
          productName: item.productName || '',
          productImage: item.productImage,
          category: item.category,
          sku: (item as any).sku || item.id,
        },
      ];
    }
    this.showReviewModal = true;
  }

  onCloseReviewModal(): void {
    this.showReviewModal = false;
    this.selectedProductsForReview = [];
  }

  onSubmitReview(reviewedProducts: ReviewProduct[]): void {
    console.log('=== Submitting reviews ===');

    // Extract order ID from the first product (format: orderId_productId)
    const firstProductId = reviewedProducts[0].id;
    const orderId = firstProductId.split('_')[0];

    // Tìm order tương ứng để lấy CustomerID và shippingInfo
    // Ưu tiên trong danh sách chưa đánh giá; nếu không có (trường hợp chỉnh sửa đánh giá)
    // thì fallback sang danh sách đã đánh giá.
    let orderItem =
      this.unreviewedItems.find(
        (item) => item.orderId === orderId || item.id === orderId
      ) ||
      this.allReviewedItems.find(
        (item) => item.orderId === orderId || item.id === orderId
      );

    if (!orderItem) {
      console.error('Không tìm thấy order tương ứng, không thể submit review');
      this.toastService.showError('Không tìm thấy thông tin đơn hàng. Vui lòng thử lại.');
      return;
    }

    // Lấy thông tin từ order
    const customerID = orderItem.CustomerID || '';
    const orderID = orderItem.OrderID || orderItem.orderId || orderId;
    const fullname = orderItem.shippingInfo?.fullName || '';

    if (!customerID) {
      console.error('Không tìm thấy CustomerID trong order, không thể submit review');
      this.toastService.showError('Không tìm thấy thông tin khách hàng. Vui lòng thử lại.');
      return;
    }

    if (!fullname) {
      console.error('Không tìm thấy fullName trong shippingInfo, không thể submit review');
      this.toastService.showError('Không tìm thấy tên khách hàng. Vui lòng thử lại.');
      return;
    }

    console.log('Order info:', {
      orderId,
      orderID,
      customerID,
      fullname,
      orderItem,
    });

    // Submit từng review lên API
    const reviewPromises = reviewedProducts.map((product) => {
      const sku = product.sku || product.id.split('_')[1] || product.id;

      // Chuẩn bị dữ liệu review
      // SKU: Lấy từ product.sku (bắt buộc)
      // order_id: Lấy từ OrderID của orders
      // customer_id: Lấy từ CustomerID của collection orders (bắt buộc)
      // fullname: Lấy từ fullName trong shippingInfo của collection orders (bắt buộc)
      // content: Lấy từ textarea (không bắt buộc)
      // rating: Lấy từ star rating (bắt buộc)
      // images: Lấy từ image upload grid (không bắt buộc)
      // time: Thời gian gửi đánh giá
      // Đảm bảo tất cả giá trị đều có kiểu đúng
      const reviewData = {
        fullname: String(fullname || '').trim(), // Từ shippingInfo.fullName của order
        customer_id: String(customerID || '').trim(), // Từ CustomerID của order
        content: String(product.reviewText || '').trim(), // Từ textarea (không bắt buộc)
        rating: Number(product.rating) || 5, // Từ star rating (bắt buộc) - đảm bảo là số
        images: (product.images || []).filter(
          (img: any): img is string => img !== null && img !== undefined && typeof img === 'string'
        ), // Từ image upload grid (không bắt buộc)
        time: new Date().toISOString(), // Thời gian gửi đánh giá
        order_id: String(orderID || '').trim(), // Từ OrderID của orders
      };

      // Validate trước khi gửi
      if (
        !reviewData.fullname ||
        !reviewData.customer_id ||
        !reviewData.order_id ||
        !reviewData.rating
      ) {
        console.error(` [Frontend] Missing required fields for SKU ${sku}:`, {
          has_fullname: !!reviewData.fullname,
          has_customer_id: !!reviewData.customer_id,
          has_rating: !!reviewData.rating,
          has_order_id: !!reviewData.order_id,
          fullname: reviewData.fullname,
          customer_id: reviewData.customer_id,
          rating: reviewData.rating,
          order_id: reviewData.order_id,
        });
      }

      console.log(` [Frontend] Submitting review for SKU: ${sku}`);
      console.log(` [Frontend] Review data (full):`, {
        fullname: reviewData.fullname,
        customer_id: reviewData.customer_id,
        content: reviewData.content || '(empty)',
        rating: reviewData.rating,
        images_count: reviewData.images.length,
        time: reviewData.time,
        order_id: reviewData.order_id || 'MISSING!',
      });
      console.log(` [Frontend] Review data (JSON):`, JSON.stringify(reviewData, null, 2));

      // Gọi API để lưu review vào MongoDB (collection "reviews")
      // Backend định nghĩa POST /api/reviews (body: { sku, ... })
      return this.http
        .post(`http://localhost:3000/api/reviews`, {
          sku,
          ...reviewData,
        })
        .toPromise()
        .then((response: any) => {
          console.log(` Review submitted successfully for SKU: ${sku}`, response);
          return { success: true, product, response };
        })
        .catch((error: any) => {
          console.error(` Error submitting review for SKU: ${sku}`, error);
          if (error.error) {
            console.error(`Error details:`, error.error);
          }
          return { success: false, product, error };
        });
    });

    // Chờ tất cả reviews được submit
    Promise.all(reviewPromises).then((results) => {
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      if (successCount > 0) {
        console.log(` Submitted ${successCount} reviews successfully`);

        // Lưu vào reviewed items cho UI (tương thích với localStorage)
        // Lấy đầy đủ thông tin từ response để lưu images và orderId
        reviewedProducts.forEach((product, index) => {
          const reviewResult = results[index];
          // Chỉ lấy images từ response nếu review submit thành công
          let reviewImages: string[] = [];
          if (reviewResult.success && 'response' in reviewResult) {
            const imagesFromResponse =
              reviewResult.response?.data?.reviews?.[
                reviewResult.response?.data?.reviews?.length - 1
              ]?.images;
            reviewImages =
              imagesFromResponse && Array.isArray(imagesFromResponse)
                ? imagesFromResponse.filter(
                  (img: any): img is string =>
                    img !== null && img !== undefined && typeof img === 'string'
                )
                : (product.images || []).filter(
                  (img: any): img is string =>
                    img !== null && img !== undefined && typeof img === 'string'
                );
          } else {
            reviewImages = (product.images || []).filter(
              (img: any): img is string => img !== null && img !== undefined && typeof img === 'string'
            );
          }

          // Extract orderId từ product.id (format: "orderId_productId")
          const productIdParts = product.id.split('_');
          const extractedOrderId = productIdParts.length > 1 ? productIdParts[0] : orderId;

          // Lấy price và unit từ orderItem.products
          let productPrice: string | undefined;
          let productUnit: string | undefined;
          let productSku: string | undefined;
          let productId: string | undefined;
          if (orderItem.products && orderItem.products.length > 0) {
            const productIdParts = product.id.split('_');
            const extractedProductId = productIdParts.length > 1 ? productIdParts[1] : product.id;
            const productData = orderItem.products.find(
              (p: any) =>
                p.id === extractedProductId || p.sku === product.sku || p.id === product.id
            );
            if (productData) {
              productPrice = productData.price ? String(productData.price) : undefined;
              productUnit = productData.unit;
              productSku = productData.sku || productData.id;
              productId = productData.id;
            }
          }

          const reviewedItem: ReviewItem = {
            id: product.id,
            productName: product.productName,
            productImage: product.productImage,
            category: product.category,
            reviewerName: fullname,
            rating: product.rating,
            reviewText: product.reviewText,
            reviewDate: this.getCurrentDate(),
            orderId: extractedOrderId,
            orderNumber: orderItem.orderNumber || orderItem.OrderID || extractedOrderId,
            images: reviewImages && reviewImages.length > 0 ? reviewImages : undefined,
            price: productPrice,
            unit: productUnit,
            sku: productSku,
            productId: productId,
            products: orderItem.products, // Lưu products để có thể dùng sau
            // Lưu thêm CustomerID & shippingInfo để load lại sau khi reload trang
            CustomerID: orderItem.CustomerID,
            shippingInfo: orderItem.shippingInfo,
          };

          // Add to reviewed items if not already exists
          if (!this.allReviewedItems.find((item) => item.id === product.id)) {
            this.allReviewedItems.push(reviewedItem);
          } else {
            // Update existing review
            const existingIndex = this.allReviewedItems.findIndex((item) => item.id === product.id);
            this.allReviewedItems[existingIndex] = reviewedItem;
          }
        });

        // Remove the entire order from unreviewed items (all products reviewed)
        this.unreviewedItems = this.unreviewedItems.filter((item) => item.orderId !== orderId);

        // Save to localStorage for persistence (UI state)
        localStorage.setItem('reviewedItems', JSON.stringify(this.allReviewedItems));

        // Update badge count
        this.reviewBadgeService.setUnreviewedCount(this.unreviewedItems.length);
        console.log('Updated review badge count to:', this.unreviewedItems.length);

        if (failCount > 0) {
          console.warn(` ${failCount} reviews failed to submit`);
          this.toastService.showError(
            `Đã gửi ${successCount} đánh giá thành công. ${failCount > 0 ? `${failCount} đánh giá gặp lỗi.` : ''
            }`
          );
        } else {
          this.toastService.showSuccess('Đánh giá đã được gửi thành công!');
        }
      } else {
        console.error(' All reviews failed to submit');
        // Giữ nguyên popup đánh giá để người dùng không mất nội dung/hình ảnh
        this.toastService.showError('Có lỗi xảy ra khi gửi đánh giá. Vui lòng thử lại.');
        return;
      }

      this.onCloseReviewModal();
    });
  }

  getCurrentDate(): string {
    const now = new Date();
    return (
      now.toLocaleDateString('vi-VN') +
      ' ' +
      now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    );
  }

  getDisplayProducts(item: ReviewItem): any[] {
    if (!item.products || item.products.length === 0) {
      return [];
    }

    // Chỉ hiển thị purchased products (không hiển thị gifted products)
    const purchasedProducts = item.products.filter((p: ProductInfo) => p.itemType !== 'gifted');

    // Show only first product if not expanded, or all products if expanded
    if (this.isOrderExpanded(item)) {
      return purchasedProducts;
    }
    return purchasedProducts.length > 0 ? [purchasedProducts[0]] : [];
  }

  // Tìm gifted product tương ứng với purchased product (cùng SKU)
  getGiftedProduct(purchasedProduct: ProductInfo, item: ReviewItem): ProductInfo | null {
    if (!purchasedProduct.sku || !item.products) return null;

    const giftedProduct = item.products.find(
      (p: ProductInfo) => p.sku === purchasedProduct.sku && p.itemType === 'gifted'
    );

    return giftedProduct || null;
  }

  // Kiểm tra xem purchased product có gifted product tương ứng không
  hasGiftedProduct(product: ProductInfo, item: ReviewItem): boolean {
    return this.getGiftedProduct(product, item) !== null;
  }

  isOrderExpanded(item: ReviewItem): boolean {
    return this.expandedOrders.has(item.orderId || item.id);
  }

  hasMoreProducts(item: ReviewItem): boolean {
    return !!(item.products && item.products.length > 1);
  }

  toggleViewMore(item: ReviewItem): void {
    const orderId = item.orderId || item.id;
    if (this.expandedOrders.has(orderId)) {
      this.expandedOrders.delete(orderId);
    } else {
      this.expandedOrders.add(orderId);
    }
  }

  isOrderReviewed(item: ReviewItem): boolean {
    // Get all reviewed product IDs
    const reviewedProductIds = this.allReviewedItems.map((review) => review.id);

    // Check if all products in this order have been reviewed
    if (item.products && item.products.length > 0) {
      const orderId = item.orderId || item.id;
      return item.products.every((product) =>
        reviewedProductIds.includes(`${orderId}_${product.id}`)
      );
    }

    // Fallback: check if this specific item is reviewed
    return reviewedProductIds.includes(item.id);
  }

  ngOnInit(): void {
    console.log('ngOnInit: Setting showReviewed to false');
    this.showReviewed = false;
    this.clearOldReviewData();
    this.loadPromotionsAndTargets();
    this.loadReviewedItems();
    const customerID = this.userId || this.orderService.getCustomerID();
    if (customerID && customerID !== 'guest') {
      this.loadUnreviewedOrders();
    } else {
      setTimeout(() => this.tryLoadWhenUserReady(), 0);
    }

    this.reviewSyncSubscription = this.reviewSyncService.ordersChanged$.subscribe(() => {
      this.loadUnreviewedOrders();
    });

    window.addEventListener('storage', (e) => {
      if (e.key === 'ordersData' || e.key === 'ordersDataChanged') {
        this.loadUnreviewedOrders();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] || changes['forceReload']) {
      console.log('ngOnChanges: userId or forceReload changed, resetting showReviewed to false');
      this.showReviewed = false;
      const customerID = this.userId || this.orderService.getCustomerID();
      if (customerID && customerID !== 'guest') {
        this.loadUnreviewedOrders();
        this.loadReviewedItems();
      } else {
        this.cdr.detectChanges();
      }
    }
  }

  /** Gọi khi ngOnInit chạy mà chưa có userId (đợi 1 frame rồi thử lại) */
  private tryLoadWhenUserReady(): void {
    const customerID = this.userId || this.orderService.getCustomerID();
    if (customerID && customerID !== 'guest') {
      this.loadUnreviewedOrders();
      this.loadReviewedItems();
    } else {
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    if (this.reviewSyncSubscription) {
      this.reviewSyncSubscription.unsubscribe();
    }
  }

  clearOldReviewData(): void {
    // Clear any reviewed items that don't have the proper format (old format with product IDs)
    const savedReviews = localStorage.getItem('reviewedItems');
    if (savedReviews) {
      try {
        const reviews = JSON.parse(savedReviews);
        // Check if any review has the old format (no underscore in ID means it's from old format)
        const hasOldFormat = reviews.some((review: any) => !review.id.includes('_'));
        if (hasOldFormat) {
          // Clear all old format reviews
          localStorage.setItem('reviewedItems', JSON.stringify([]));
          console.log('Cleared old format review data');
        }
      } catch (error) {
        console.error('Error checking review data:', error);
      }
    }
  }

  loadReviewedItems(): void {
    // Lấy CustomerID hiện tại
    const customerID = this.orderService.getCustomerID();

    // Load previously reviewed items from localStorage first (quick load)
    const savedReviews = localStorage.getItem('reviewedItems');
    if (savedReviews) {
      try {
        const allItems = JSON.parse(savedReviews);
        // Filter reviews theo CustomerID hiện tại
        if (customerID && customerID !== 'guest') {
          this.allReviewedItems = allItems.filter((item: any) => {
            return item.CustomerID === customerID;
          });
        } else {
          // Nếu không có CustomerID, không load gì cả
          this.allReviewedItems = [];
        }
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error loading reviewed items:', error);
        this.allReviewedItems = [];
        this.cdr.detectChanges();
      }
    } else {
      this.allReviewedItems = [];
      this.cdr.detectChanges();
    }

    // Then load from backend to get full data including images
    this.loadReviewedItemsFromBackend();
  }

  loadReviewedItemsFromBackend(): void {
    // Lấy CustomerID hiện tại
    const customerID = this.orderService.getCustomerID();
    if (!customerID || customerID === 'guest') {
      console.log('No customer ID or guest user, skipping backend review load');
      return;
    }

    // Load orders to get reviewed items
    const savedOrders = localStorage.getItem('ordersData');
    if (!savedOrders) {
      return;
    }

    try {
      const orders = JSON.parse(savedOrders);
      // Filter các đơn đã giao xong (delivered/completed/received).
      // Trạng thái "chưa đánh giá" được hiểu ở tầng UI: đơn đã giao xong nhưng chưa có review.
      const completedOrders = orders.filter((order: any) => {
        const status = (order.status || '').toLowerCase().trim();
        const hasReceivedRoute = !!order.route?.received;

        return (
          status === 'completed' ||
          status === 'delivered' ||
          status === 'received' ||
          status === 'đã giao hàng' ||
          status === 'đã nhận hàng' ||
          status.includes('delivered') ||
          status.includes('completed') ||
          status.includes('received') ||
          status.includes('đã giao') ||
          hasReceivedRoute
        );
      });

      // Filter orders by CustomerID
      const customerOrders = completedOrders.filter((order: any) => {
        const orderCustomerID = order.CustomerID || order.customerID;
        return orderCustomerID === customerID;
      });

      if (customerOrders.length === 0) {
        return;
      }

      // For each order, get all products and check for reviews from backend
      const reviewPromises: Promise<any>[] = [];
      const skuOrderMap = new Map<string, Array<{ order: any; product: any }>>(); // Map SKU -> các orders chứa SKU đó

      // Nhóm tất cả products theo SKU (chỉ từ orders của customer hiện tại)
      customerOrders.forEach((order: any) => {
        if (order.products && order.products.length > 0) {
          order.products.forEach((product: any) => {
            const sku = product.sku || product.id;
            if (sku) {
              if (!skuOrderMap.has(sku)) {
                skuOrderMap.set(sku, []);
              }
              skuOrderMap.get(sku)!.push({ order, product });
            }
          });
        }
      });

      // Load reviews từ backend cho mỗi SKU
      skuOrderMap.forEach((orderProducts, sku) => {
        reviewPromises.push(
          this.http
            .get<any>(`http://localhost:3000/api/reviews/${sku}`)
            .toPromise()
            .then((response) => {
              if (response.success && response.data && response.data.reviews) {
                // Duyệt qua tất cả orders chứa SKU này
                orderProducts.forEach(({ order, product }) => {
                  const orderID = order.OrderID || order.orderNumber || order.id;

                  // Filter reviews theo customer_id và order_id
                  const reviewForOrder = response.data.reviews.find(
                    (r: any) => r.order_id === orderID && r.customer_id === customerID
                  );

                  if (reviewForOrder) {
                    const reviewId = `${order.id}_${product.id}`;

                    // Kiểm tra xem đã có trong allReviewedItems chưa
                    const existingIndex = this.allReviewedItems.findIndex(
                      (item) => item.id === reviewId
                    );

                    const reviewItem: any = {
                      id: reviewId,
                      productName: product.name || product.ProductName,
                      productImage: product.image || product.Image,
                      category: product.category || product.Category,
                      reviewerName:
                        reviewForOrder.fullname || order.shippingInfo?.fullName || 'Khách hàng',
                      rating: reviewForOrder.rating,
                      reviewText: reviewForOrder.content,
                      reviewDate: reviewForOrder.time
                        ? new Date(reviewForOrder.time).toLocaleDateString('vi-VN')
                        : this.getCurrentDate(),
                      orderId: order.id,
                      orderNumber: order.orderNumber || order.OrderID || order.id,
                      images:
                        reviewForOrder.images && reviewForOrder.images.length > 0
                          ? reviewForOrder.images
                          : undefined,
                      price: product.price ? String(product.price) : undefined,
                      unit: product.unit || product.Unit,
                      sku: sku,
                      productId: product.id,
                      OrderID: order.OrderID,
                      CustomerID: order.CustomerID,
                      shippingInfo: order.shippingInfo,
                      products: order.products,
                    };

                    if (existingIndex >= 0) {
                      // Update existing review với dữ liệu từ backend
                      this.allReviewedItems[existingIndex] = reviewItem;
                    } else {
                      // Thêm review mới từ backend
                      this.allReviewedItems.push(reviewItem);
                    }
                  }
                });
              }
              return response;
            })
            .catch((error) => {
              console.error(`Error loading review for SKU ${sku}:`, error);
              return null;
            })
        );
      });

      // Wait for all reviews to load, then save to localStorage
      Promise.all(reviewPromises).then(() => {
        // Filter allReviewedItems to only include reviews from current customer
        this.allReviewedItems = this.allReviewedItems.filter((item) => {
          return item.CustomerID === customerID;
        });
        localStorage.setItem('reviewedItems', JSON.stringify(this.allReviewedItems));
        console.log(' Loaded reviewed items from backend with full data (filtered by CustomerID)');
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('Error loading reviewed items from backend:', error);
    }
  }

  loadUnreviewedOrders(): void {
    const customerID = this.userId || this.orderService.getCustomerID();
    if (!customerID || customerID === 'guest') {
      this.loadFromLocalStorage();
      return;
    }

    this.orderService.getOrdersByCustomer(customerID).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          console.log(' [Reviews] Loaded orders from backend:', response.data.length);
          this.allOrdersData = response.data.map((o: any) => this.mapBackendOrderToFrontendFormat(o));
          this.processOrders(response.data);

          // Save to localStorage để sync với orders component
          localStorage.setItem(
            'ordersData',
            JSON.stringify(
              response.data.map((order: any) => this.mapBackendOrderToFrontendFormat(order))
            )
          );
          this.cdr.detectChanges();
        } else {
          console.log('No orders found in backend, checking localStorage...');
          this.loadFromLocalStorage();
        }
      },
      error: (error: any) => {
        console.error('[Reviews] Error loading orders from backend:', error);
        this.loadFromLocalStorage();
      },
    });
  }

  mapBackendOrderToFrontendFormat(order: any): any {
    // Map order từ backend format sang frontend format (giống với orders component)
    // Backend /api/orders đang dùng field "item", một số nơi khác có thể dùng "items"
    const rawItems = order.items || order.item || [];
    const products = rawItems.map((item: any) => {
      const rawPid = item?.productId || item?._id;
      let backendId = '';
      if (rawPid) {
        if (typeof rawPid === 'string') backendId = rawPid;
        else if (rawPid.$oid) backendId = rawPid.$oid;
        else if (typeof rawPid.toString === 'function') backendId = rawPid.toString();
      }
      // Backup: nếu chưa có _id, dùng sku để backend map ngược
      if (!backendId && item?.sku) {
        backendId = item.sku;
      }
      const slug = item.slug || backendId || '';

      const product: ProductInfo = {
        id: slug || backendId, // id dùng cho route /product/:slug (không dùng SKU)
        name: item.productName,
        price: item.price,
        unit: item.unit || '',
        quantity: item.quantity,
        totalPrice: item.price * item.quantity,
        image: item.image || '',
        category: item.category || '',
        sku: item.sku || backendId || item.id, // SKU cho API review (vẫn giữ cho API /api/reviews)
        originalPrice: item.originalPrice || item.price, // Giá gốc
        itemType: item.itemType || 'purchased', // Loại item: mua hoặc tặng kèm
        hasBuy1Get1: item.itemType === 'gifted' || this.checkBuy1Get1PromotionBySku(item.sku), // Deprecated, dùng itemType
        backendId,
        slug,
      };

      return product;
    });

    return {
      id: order.order_id || order.OrderID || order._id,
      orderNumber: order.order_id || order.OrderID || order.orderNumber,
      OrderID: order.order_id || order.OrderID || order.orderNumber, // Giữ lại OrderID từ backend
      CustomerID: order.CustomerID || order.user_id || '', // Giữ lại CustomerID / user_id từ backend
      shippingInfo: order.shippingInfo || {}, // Giữ lại shippingInfo từ backend
      status: order.status,
      totalAmount: order.totalAmount,
      orderDate: this.formatBackendDate(order.createdAt),
      deliveryDate:
        order.status === 'completed' || order.status === 'delivered'
          ? this.formatBackendDate(order.updatedAt)
          : undefined,
      products: products,
    };
  }

  formatBackendDate(date: any): string {
    if (!date) return new Date().toISOString().split('T')[0];
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }

  processOrders(orders: any[]): void {
    console.log('Total orders from backend:', orders.length);

    // Chỉ lấy các đơn có status "unreview" (đã xác nhận nhận hàng, chưa đánh giá).
    const completedOrders = orders.filter((order: any) => {
      const status = (order.status || '').toLowerCase().trim();
      return (
        status === 'unreview' ||
        status.includes('unreview')
      );
    });
    console.log('Completed orders:', completedOrders.length);

    // Get all reviewed order IDs
    const reviewedOrderIds = this.allReviewedItems.map((item) => {
      if (item.id.includes('_')) {
        return item.id.split('_')[0];
      }
      return item.orderId;
    });
    console.log('Already reviewed order IDs:', reviewedOrderIds);

    // Convert each completed order to unreviewed items
    this.unreviewedItems = [];
    completedOrders.forEach((order: any) => {
      const orderId = order.OrderID || order._id;
      const mappedOrder = this.mapBackendOrderToFrontendFormat(order);

      if (mappedOrder.products && mappedOrder.products.length > 0) {
        // Only add if this order hasn't been fully reviewed
        const isOrderReviewed = reviewedOrderIds.some(
          (reviewedOrderId) => reviewedOrderId === orderId || reviewedOrderId === mappedOrder.id
        );

        if (!isOrderReviewed) {
          // Get orderDate from order object (original, not formatted)
          const originalOrderDate =
            order.createdAt || order.orderDate || order.OrderDate || order.created_at;
          const originalDeliveryDate =
            order.updatedAt || order.deliveryDate || order.DeliveryDate || order.updated_at;

          // Use orderDate if available, otherwise use deliveryDate
          const dateToUse = originalOrderDate || originalDeliveryDate;

          this.unreviewedItems.push({
            id: mappedOrder.id,
            orderId: mappedOrder.id,
            OrderID: mappedOrder.OrderID,
            CustomerID: mappedOrder.CustomerID,
            shippingInfo: mappedOrder.shippingInfo || {},
            orderNumber: mappedOrder.orderNumber || mappedOrder.OrderID,
            productName: mappedOrder.products[0]?.name || '',
            category: mappedOrder.products[0]?.category || 'Khác',
            orderDate: dateToUse
              ? typeof dateToUse === 'string'
                ? dateToUse
                : dateToUse.toString()
              : '',
            // Ở màn Quản lý đánh giá, các đơn này đều là "Chưa đánh giá"
            orderStatus: 'unreview',
            orderTotal: this.formatPrice(mappedOrder.totalAmount),
            products: mappedOrder.products,
          });
        }
      }
    });

    console.log('Final unreviewed items count:', this.unreviewedItems.length);
    this.reviewBadgeService.setUnreviewedCount(this.unreviewedItems.length);
    this.cdr.detectChanges();
  }

  loadFromLocalStorage(): void {
    // Load orders from localStorage (fallback)
    const savedOrders = localStorage.getItem('ordersData');
    console.log('ordersData in localStorage:', savedOrders ? 'EXISTS' : 'NOT FOUND');

    if (savedOrders) {
      try {
        const orders = JSON.parse(savedOrders);
        console.log('Total orders from localStorage:', orders.length);
        this.allOrdersData = orders.map((o: any) => {
          if (o.products && !o.item) return o; // Already mapped
          return this.mapBackendOrderToFrontendFormat(o);
        });
        this.processOrders(orders);
      } catch (error) {
        console.error('Error parsing orders data:', error);
        this.unreviewedItems = [];
        this.reviewBadgeService.setUnreviewedCount(0);
        this.cdr.detectChanges();
      }
    } else {
      console.log('No ordersData in localStorage, unreviewedItems will be empty');
      this.unreviewedItems = [];
      this.reviewBadgeService.setUnreviewedCount(0);
      this.cdr.detectChanges();
    }
  }

  formatDate(dateString: string | Date | undefined | null): string {
    if (!dateString) return '';

    // Handle Date object
    let date: Date;
    if (dateString instanceof Date) {
      date = dateString;
    } else if (typeof dateString === 'string') {
      date = new Date(dateString);
    } else {
      return '';
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date:', dateString);
      return '';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  formatPrice(amount: number): string {
    return new Intl.NumberFormat('vi-VN').format(amount);
  }

  formatPriceNumber(price: string | number | undefined): string {
    if (!price) return '';
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(numPrice)) return '';
    return new Intl.NumberFormat('vi-VN').format(numPrice) + ' ₫';
  }

  goToProductDetail(item: ReviewItem): void {
    // Lấy slug/id sản phẩm để điều hướng
    const productId = item.productId || item.sku;
    if (!productId) {
      // Nếu không có productId, thử extract từ id (format: orderId_productId)
      const idParts = item.id.split('_');
      if (idParts.length > 1) {
        // Nếu có format orderId_productId, lấy productId
        const extractedId = idParts[1];
        // Thử tìm trong products array
        if (item.products && item.products.length > 0) {
          const product = item.products.find(
            (p: any) => p.id === extractedId || (p.sku && p.sku === extractedId)
          );
          if (product) {
            const finalId = (product as ProductInfo).slug || (product as ProductInfo).backendId || (product as ProductInfo).sku || product.id;
            this.router.navigate(['/product', finalId]);
            return;
          }
        }
        this.router.navigate(['/product', extractedId]);
        return;
      }
      console.warn('No product ID found for navigation');
      return;
    }
    this.router.navigate(['/product', productId]);
  }

  goToProductDetailFromUnreviewed(product: ProductInfo): void {
    // Lấy slug/id từ product (ưu tiên slug hoặc backendId)
    const productId = product.slug || product.backendId || product.id || (product as any).sku;
    if (productId) {
      this.router.navigate(['/product', productId]);
    } else {
      console.warn('No product ID found for navigation from unreviewed item');
    }
  }

  /** Mua lại từ tab "Chưa đánh giá" trong màn Quản lý đánh giá */
  onRepurchaseFromUnreviewed(item: ReviewItem): void {
    const products = item.products || [];
    if (!products.length) return;

    const skus = new Set<string>();
    const ids = new Set<string>();

    products
      .filter((p) => p.itemType !== 'gifted')
      .forEach((p) => {
        const payload: Partial<CartItem> = {
          _id: p.backendId || p.id || p.sku || '',
          sku: p.sku || '',
          productName: p.name,
          price: p.price || 0,
          discount: 0,
          image: p.image || '',
          unit: p.unit || 'Hộp',
          category: p.category || '',
          hasPromotion: false,
        };
        if (payload.sku) skus.add(payload.sku);
        if (payload._id) ids.add(String(payload._id));
        this.cartService.addItem(payload, p.quantity || 1);
      });

    localStorage.setItem('repurchase_selection', JSON.stringify({
      skus: Array.from(skus),
      ids: Array.from(ids),
    }));

    this.cartSidebar.openSidebar();
  }

  // Load promotions and targets for buy1get1
  private loadPromotionsAndTargets(): void {
    const apiUrl = 'http://localhost:3000/api';
    forkJoin({
      promotions: this.http.get<any>(`${apiUrl}/promotions`),
      targets: this.http.get<any>(`${apiUrl}/promotion-targets`),
    }).subscribe({
      next: ({ promotions, targets }) => {
        // Filter active promotions
        const now = new Date();
        const activePromotions = (promotions.data || []).filter((p: any) => {
          const startDate = new Date(p.start_date);
          const endDate = new Date(p.end_date);
          return p.status === 'Active' && now >= startDate && now <= endDate;
        });

        this.promotions = activePromotions;
        this.promotionTargets = targets?.data || [];

        // Cập nhật buy1get1 status cho tất cả review items
        this.updateAllReviewItemsBuy1Get1Status();
      },
      error: (error) => {
        console.error('❌ [Reviews] Error loading promotions:', error);
      },
    });
  }

  // Cập nhật trạng thái buy1get1 cho tất cả review items
  private updateAllReviewItemsBuy1Get1Status(): void {
    this.unreviewedItems.forEach((item) => {
      if (item.products) {
        item.products.forEach((product) => {
          product.hasBuy1Get1 = this.checkBuy1Get1Promotion(product);
        });
      }
    });
  }

  // Kiểm tra xem sản phẩm có khuyến mãi buy1get1 không
  checkBuy1Get1Promotion(product: ProductInfo): boolean {
    if (!product.sku && !product.id) return false;

    // Tìm promotion targets áp dụng cho sản phẩm này
    const applicableTargets = this.promotionTargets.filter((target) => {
      return this.isProductMatchTarget(product, target);
    });

    if (applicableTargets.length === 0) return false;

    // Tìm promotions tương ứng
    const applicablePromotions = applicableTargets
      .map((target) => this.promotions.find((p) => p.promotion_id === target.promotion_id))
      .filter((p): p is any => p !== undefined);

    // Kiểm tra xem có promotion nào có discount_type là buy1get1 không
    return applicablePromotions.some((p) => p.discount_type === 'buy1get1');
  }

  // Kiểm tra xem sản phẩm có match với promotion target không
  private isProductMatchTarget(product: ProductInfo, target: any): boolean {
    if (!target || (!product.sku && !product.id)) return false;

    const targetType = target.target_type;
    const targetRefs = target.target_ref || [];
    const productSku = product.sku || product.id;

    switch (targetType) {
      case 'Product':
        // Match theo SKU
        return targetRefs.some((ref: string) => {
          const refSku = ref.trim();
          return refSku === productSku || refSku === product.name;
        });

      case 'Category':
        // Match theo category
        return targetRefs.some((ref: string) => {
          const refCategory = ref.trim().toLowerCase();
          return refCategory === product.category?.toLowerCase();
        });

      case 'Brand':
        // Match theo brand (nếu có)
        return false; // Tạm thời return false vì ProductInfo không có brand

      default:
        return false;
    }
  }

  // Lấy số lượng sản phẩm tặng kèm (bằng số lượng mua)
  getFreeItemQuantity(product: ProductInfo, item: ReviewItem): number {
    const giftedProduct = this.getGiftedProduct(product, item);
    if (giftedProduct) {
      return giftedProduct.quantity;
    }
    return 0;
  }

  // Helper method để check buy1get1 promotion by SKU (deprecated, dùng itemType)
  private checkBuy1Get1PromotionBySku(sku?: string): boolean {
    if (!sku) return false;
    // Tạm thời return false vì đã dùng itemType từ backend
    return false;
  }

  // Get status label for display
  getStatusLabel(status?: string): string {
    const s = (status || '').toLowerCase().trim();
    if (!s) return 'Đã giao hàng';

    const statusMap: { [key: string]: string } = {
      pending: 'Chờ xác nhận',
      confirmed: 'Đã xác nhận',
      shipping: 'Đang giao hàng',
      delivered: 'Đã giao hàng',
      received: 'Đã nhận hàng',
      unreview: 'Chưa đánh giá',
      reviewed: 'Đã đánh giá',
      completed: 'Hoàn thành',
      cancelled: 'Đã hủy',
      processing_return: 'Xử lý trả hàng/hoàn tiền',
      returning: 'Xử lý trả hàng/hoàn tiền',
      returned: 'Đã trả hàng',
      refunded: 'Đã trả hàng',
      refund_rejected: 'Từ chối hoàn tiền',
    };

    return statusMap[s] || 'Đã giao hàng';
  }
}
