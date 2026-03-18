import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import type { CartItem } from './cart.service';

export interface Promotion {
  _id: string;
  promotion_id: string;
  code: string;
  name: string;
  description?: string;
  type: 'Order' | 'Product' | string;
  scope: 'Order' | 'Product' | 'Shipping' | string;
  discount_type: 'percent' | 'amount' | string;
  discount_value: number;
  max_discount_value?: number;
  min_order_value?: number;
  usage_limit?: number;
  user_limit?: number;
  is_first_order_only?: boolean;
  start_date?: string;
  end_date?: string;
  status?: string;
  typeBanner?: string;
  images?: string[];
}

export interface PromotionTarget {
  _id: string;
  promotion_id: string;
  target_type: 'Category' | 'Product' | string;
  target_ref: string[];
}

export interface ApplicablePromotion extends Promotion {
  /** Số tiền giảm tính được cho giỏ hàng hiện tại (0 nếu không áp dụng được) */
  discountAmount: number;
  /** Khuyến mãi này hiện có áp dụng được cho giỏ hàng hay không */
  isApplicable: boolean;
  /** Lý do không áp dụng được (ví dụ: chưa đủ giá trị đơn hàng, không có sản phẩm phù hợp, hết hạn...) */
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class PromotionService {
  private http = inject(HttpClient);

  getPromotions(): Observable<Promotion[]> {
    return this.http.get<{ success: boolean; data?: Promotion[] }>('/api/promotions').pipe(
      map((res) => res.data ?? []),
    );
  }

  getPromotionTargets(): Observable<PromotionTarget[]> {
    return this.http.get<{ success: boolean; data?: PromotionTarget[] }>('/api/promotion-targets').pipe(
      map((res) => res.data ?? []),
    );
  }

  /**
   * Trả về danh sách khuyến mãi kèm trạng thái có áp dụng được hay không cho giỏ hàng hiện tại.
   * Hỗ trợ khuyến mãi theo đơn (type/scope = Order) và theo danh mục/sản phẩm.
   */
  buildApplicablePromotions(
    promotions: Promotion[],
    targets: PromotionTarget[],
    cartItems: CartItem[],
    subtotal: number,
    userId?: string | null,
    isFirstOrder?: boolean,
    categories?: any[],
  ): ApplicablePromotion[] {
    const now = new Date();

    const byPromotionId = new Map<string, PromotionTarget[]>();
    targets.forEach((t) => {
      const list = byPromotionId.get(t.promotion_id) ?? [];
      list.push(t);
      byPromotionId.set(t.promotion_id, list);
    });

    const parentMap = new Map<string, string>();
    const nameToId = new Map<string, string>();

    if (categories && Array.isArray(categories)) {
      categories.forEach(c => {
        if (c._id) {
          if (c.name) nameToId.set(String(c.name).toLowerCase().trim(), String(c._id));
          if (c.parentId) parentMap.set(String(c._id), String(c.parentId));
        }
      });
    }

    const getAncestors = (cat: string): string[] => {
      if (!cat) return [];
      const result: string[] = [];
      const strCat = String(cat).trim();
      let currentId = nameToId.get(strCat.toLowerCase()) || strCat;

      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        result.push(currentId);
        currentId = parentMap.get(currentId) || '';
      }
      return result;
    };

    const result: ApplicablePromotion[] = [];

    for (const promo of promotions) {
      let isApplicable = true;
      let reason: string | undefined;

      // Trạng thái
      if (promo.status && promo.status !== 'active') {
        isApplicable = false;
        reason = 'Chương trình đã kết thúc';
      }

      // Thời gian hiệu lực
      if (isApplicable && promo.start_date) {
        const s = new Date(promo.start_date);
        if (now < s) {
          isApplicable = false;
          reason = 'Chương trình chưa bắt đầu';
        }
      }
      if (isApplicable && promo.end_date) {
        const e = new Date(promo.end_date);
        if (now > e) {
          isApplicable = false;
          reason = 'Chương trình đã hết hạn';
        }
      }

      // Đơn đầu tiên
      if (isApplicable && promo.is_first_order_only && !isFirstOrder) {
        isApplicable = false;
        reason = 'Chỉ áp dụng cho đơn hàng đầu tiên';
      }

      // Giá trị tối thiểu đơn
      const minOrder = promo.min_order_value ?? 0;
      if (isApplicable && subtotal < minOrder) {
        isApplicable = false;
        reason = 'Chưa đạt giá trị đơn tối thiểu';
      }

      // Tính tổng tiền đủ điều kiện theo scope/type
      let eligibleSubtotal = 0;
      const promoTargets = byPromotionId.get(promo.promotion_id) ?? [];

      if (isApplicable) {
        const scope = (promo.scope || promo.type || 'Order').toString().toLowerCase();

        if (scope === 'shipping') {
          // Giảm vào phí vận chuyển: chỉ áp dụng khi hiện đang có phí ship (>0)
          const FREE_SHIPPING_THRESHOLD = 300_000;
          const DEFAULT_SHIPPING_FEE = 30_000;
          const shippingFee = subtotal > FREE_SHIPPING_THRESHOLD ? 0 : DEFAULT_SHIPPING_FEE;
          if (shippingFee <= 0) {
            isApplicable = false;
            reason = 'Đơn này đang được miễn phí vận chuyển';
          } else {
            eligibleSubtotal = shippingFee;
          }
        } else if ((promo.type === 'Order' || promo.scope === 'Order') || promoTargets.length === 0) {
          eligibleSubtotal = subtotal;
        } else {
          // Theo sản phẩm/danh mục
          for (const item of cartItems) {
            const catId = (item as any).category || (item as any).categoryId || '';
            const itemId = (item as any)._id || item._id;
            const quantity = item.quantity || 1;
            const price = item.price || 0;

            const ancestors = getAncestors(catId);

            let matched = false;
            for (const t of promoTargets) {
              if (t.target_type === 'Category') {
                if (t.target_ref?.some(ref => ancestors.includes(String(ref)))) {
                  matched = true;
                  break;
                }
              }
              if (t.target_type === 'Product' && t.target_ref?.includes(String(itemId))) {
                matched = true;
                break;
              }
            }

            if (matched) {
              eligibleSubtotal += price * quantity;
            }
          }

          if (eligibleSubtotal <= 0) {
            isApplicable = false;
            reason = 'Giỏ hàng chưa có sản phẩm phù hợp với chương trình';
          }
        }
      }

      // Tính số tiền giảm (nếu áp dụng được)
      let discountAmount = 0;
      if (isApplicable) {
        if (promo.discount_type === 'percent') {
          discountAmount = (eligibleSubtotal * (promo.discount_value || 0)) / 100;
          if (promo.max_discount_value && promo.max_discount_value > 0) {
            discountAmount = Math.min(discountAmount, promo.max_discount_value);
          }
        } else if (promo.discount_type === 'amount') {
          discountAmount = promo.discount_value || 0;
        }
        if (discountAmount <= 0) {
          isApplicable = false;
          reason = 'Không tính được số tiền giảm phù hợp';
        }
      }

      result.push({
        ...promo,
        discountAmount: isApplicable ? discountAmount : 0,
        isApplicable,
        reason,
      });
    }

    // Sắp xếp: khuyến mãi dùng được trước (giảm nhiều đứng trên), sau đó tới khuyến mãi không đủ điều kiện
    return result.sort((a, b) => {
      if (a.isApplicable && !b.isApplicable) return -1;
      if (!a.isApplicable && b.isApplicable) return 1;
      return (b.discountAmount || 0) - (a.discountAmount || 0);
    });
  }
}

