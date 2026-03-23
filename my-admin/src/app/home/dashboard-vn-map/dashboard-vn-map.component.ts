import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as L from 'leaflet';
import {
  TOTAL_VITACARE_STORES,
  aggregateOrdersByProvince,
  distributeStores,
  type ProvinceCentroid,
  type ProvinceOrderAgg
} from './vn-map-utils';
import { apiTinhQueryVariants, provinceSoftAliasesFromCentroid } from './centroid-to-api-tinh';
import { DashboardStore, StoreMapService } from './store-map.service';

export type MapDashboardMode = 'stores' | 'orders';

@Component({
  selector: 'app-dashboard-vn-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-vn-map.component.html',
  styleUrl: './dashboard-vn-map.component.css'
})
export class DashboardVnMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() orders: any[] = [];

  @ViewChild('mapHost') mapHost!: ElementRef<HTMLDivElement>;

  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storeMap = inject(StoreMapService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly ngZone = inject(NgZone);

  mapMode: MapDashboardMode = 'stores';
  provinces: ProvinceCentroid[] = [];
  selectedProvince: ProvinceCentroid | null = null;
  selectedStore: DashboardStore | null = null;
  selectedOrder: any | null = null;

  storesInProvince: DashboardStore[] = [];
  storesLoading = false;
  storesError: string | null = null;
  usedApiTinh: string | null = null;

  storeByProvince = new Map<string, number>();
  /** Số cửa hàng thực theo tỉnh từ DB (ưu tiên dùng cho chế độ stores). */
  storeByProvinceActual = new Map<string, number>();
  /** Tâm hotspot thực theo tỉnh (trung bình tọa độ cửa hàng). */
  storeHotspotByProvince = new Map<string, { lat: number; lng: number }>();
  orderByProvince = new Map<string, ProvinceOrderAgg>();

  loading = true;
  loadError: string | null = null;
  mapApiError: string | null = null;

  private map: L.Map | null = null;
  private markerLayer: L.LayerGroup | null = null;
  private geocodeCache = new Map<string, { lat: number; lng: number }>();
  private geocodeSkipped = new Set<string>();
  private mapViewVersion = 0;
  private geocodeProcessing = false;

  readonly totalStores = TOTAL_VITACARE_STORES;

  ngAfterViewInit(): void {
    this.http
      .get<ProvinceCentroid[]>('/geo/vn-province-centroids.json')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.provinces = list;
          this.storeByProvince = distributeStores(TOTAL_VITACARE_STORES, list);
          this.orderByProvince = aggregateOrdersByProvince(this.orders, list);
          this.preloadStoreProvinceStats();
          this.loading = false;
          this.cdr.markForCheck();
          setTimeout(() => this.initMap(), 0);
        },
        error: () => {
          this.loading = false;
          this.loadError = 'Không tải được dữ liệu bản đồ.';
          this.cdr.markForCheck();
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['orders'] && this.provinces.length > 0 && this.map) {
      this.orderByProvince = aggregateOrdersByProvince(this.orders, this.provinces);
      this.refreshMarkers();
    }
  }

  ngOnDestroy(): void {
    this.teardownMap();
  }

  setMode(mode: MapDashboardMode): void {
    if (this.mapMode === mode) return;
    this.mapMode = mode;
    this.resetProvinceAndStore();
    this.selectedOrder = null;
    this.refreshMarkers();
    this.cdr.markForCheck();
  }

  selectProvince(p: ProvinceCentroid): void {
    this.mapViewVersion++;
    this.selectedProvince = p;
    this.selectedStore = null;
    this.storesInProvince = [];
    this.storesError = null;
    this.usedApiTinh = null;
    this.geocodeCache.clear();
    this.geocodeSkipped.clear();

    if (this.mapMode === 'stores') {
      this.storesLoading = true;
      this.refreshMarkers();
      this.loadStoresForProvince(p);
    } else {
      this.refreshMarkers();
    }
    this.cdr.markForCheck();
  }

  private loadStoresForProvince(p: ProvinceCentroid): void {
    const strictVariants = apiTinhQueryVariants(p.name);
    const variants = provinceSoftAliasesFromCentroid(p.name);
    this.storeMap.fetchStoresWithVariants(variants).subscribe({
      next: ({ stores, usedTinh }) => {
        this.storesInProvince = stores;
        this.usedApiTinh = usedTinh || strictVariants[0] || p.name;
        this.storesLoading = false;
        this.storesError = null;
        this.cdr.markForCheck();
        setTimeout(() => this.refreshMarkers(), 0);
      },
      error: () => {
        this.storesLoading = false;
        this.storesError = 'Không tải được danh sách cửa hàng. Kiểm tra backend (localhost:3000).';
        this.storesInProvince = [];
        this.cdr.markForCheck();
        setTimeout(() => this.refreshMarkers(), 0);
      }
    });
  }

  selectStore(store: DashboardStore): void {
    this.selectedStore = store;
    this.cdr.markForCheck();
  }

  private selectStoreFromMap(store: DashboardStore): void {
    this.selectStore(store);
  }

  private normalizeCoord(v: unknown): number | null {
    if (v == null) return null;
    const n =
      typeof v === 'number'
        ? v
        : typeof v === 'string'
          ? parseFloat(v.trim().replace(',', '.'))
          : NaN;
    return Number.isFinite(n) ? n : null;
  }

  private storeCacheKey(s: DashboardStore): string {
    return String(s.ma_cua_hang || s._id || this.addressLine(s));
  }

  private parseStoreLatLng(s: DashboardStore): [number, number] | null {
    const key = this.storeCacheKey(s);
    const cached = this.geocodeCache.get(key);
    if (cached) return [cached.lat, cached.lng];

    let lat = this.normalizeCoord(s.toa_do?.lat);
    let lng = this.normalizeCoord(s.toa_do?.lng);
    if (lat != null && lng != null) return [lat, lng];

    const raw = s as Record<string, unknown>;
    const loc = raw['location'] as { type?: string; coordinates?: number[] } | undefined;
    if (loc?.type === 'Point' && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      lng = this.normalizeCoord(loc.coordinates[0]);
      lat = this.normalizeCoord(loc.coordinates[1]);
      if (lat != null && lng != null) return [lat, lng];
    }

    lat = this.normalizeCoord(raw['vi_do']);
    lng = this.normalizeCoord(raw['kinh_do']);
    if (lat != null && lng != null) return [lat, lng];

    return null;
  }

  private normalizeProvinceName(v: string): string {
    return (v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(tp|tp\.|thanh pho|tinh|city|province)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractStoreTinh(store: DashboardStore): string {
    const direct = store.dia_chi?.tinh_thanh?.trim();
    if (direct) return direct;
    const full = store.dia_chi?.dia_chi_day_du || '';
    const parts = full
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  private isWithinVietnamBounds(lat: number, lng: number): boolean {
    // Bounding box đơn giản để loại tọa độ nhiễu ngoài lãnh thổ Việt Nam.
    return lat >= 8.1 && lat <= 23.95 && lng >= 102.0 && lng <= 109.6;
  }

  private distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Nạp số lượng + hotspot thực theo DB để thay thế hotspot ước lượng. */
  private preloadStoreProvinceStats(): void {
    this.storeMap.fetchAllStores().subscribe({
      next: (stores) => {
        const countMap = new Map<string, number>();
        const centerMap = new Map<string, { lat: number; lng: number }>();

        for (const p of this.provinces) {
          const aliases = provinceSoftAliasesFromCentroid(p.name).map((v) => this.normalizeProvinceName(v));
          const aliasSet = new Set(aliases.filter(Boolean));
          let count = 0;
          const coords: Array<{ lat: number; lng: number }> = [];

          for (const s of stores) {
            const st = this.normalizeProvinceName(this.extractStoreTinh(s));
            if (!st) continue;
            if (!aliasSet.has(st)) continue;
            count++;
            const ll = this.parseStoreLatLng(s);
            if (ll) {
              const [lat, lng] = ll;
              if (this.isWithinVietnamBounds(lat, lng)) {
                coords.push({ lat, lng });
              }
            }
          }

          if (count > 0) countMap.set(p.name, count);
          if (coords.length > 0) {
            // Loại outlier theo khoảng cách tới centroid tỉnh để tránh hotspot bị kéo lệch.
            const withDist = coords
              .map((c) => ({
                ...c,
                d: this.distanceKm(c.lat, c.lng, p.lat, p.lng)
              }))
              .sort((a, b) => a.d - b.d);

            // Giữ 75% điểm gần centroid nhất (tối thiểu 1) và chặn ngưỡng 260km.
            const keepN = Math.max(1, Math.ceil(withDist.length * 0.75));
            const kept = withDist.slice(0, keepN).filter((x) => x.d <= 260);
            const finalPts = kept.length ? kept : withDist.slice(0, Math.max(1, Math.min(3, withDist.length)));

            const lat = finalPts.reduce((s, x) => s + x.lat, 0) / finalPts.length;
            const lng = finalPts.reduce((s, x) => s + x.lng, 0) / finalPts.length;

            // Chốt an toàn: hotspot không được lệch quá xa centroid tỉnh.
            const centerDistance = this.distanceKm(lat, lng, p.lat, p.lng);
            if (centerDistance <= 120 && this.isWithinVietnamBounds(lat, lng)) {
              centerMap.set(p.name, { lat, lng });
            } else {
              centerMap.set(p.name, { lat: p.lat, lng: p.lng });
            }
          }
        }

        this.storeByProvinceActual = countMap;
        this.storeHotspotByProvince = centerMap;
        this.refreshMarkers();
        this.cdr.markForCheck();
      },
      error: () => {
        // fallback giữ cơ chế ước lượng cũ
      }
    });
  }

  clearProvinceSelection(): void {
    this.selectedOrder = null;
    this.resetProvinceAndStore();
    this.refreshMarkers();
    this.cdr.markForCheck();
  }

  clearStoreSelection(): void {
    this.selectedStore = null;
    this.cdr.markForCheck();
    this.refreshMarkers();
  }

  private resetProvinceAndStore(): void {
    this.mapViewVersion++;
    this.selectedProvince = null;
    this.selectedStore = null;
    this.storesInProvince = [];
    this.storesLoading = false;
    this.storesError = null;
    this.usedApiTinh = null;
    this.geocodeCache.clear();
    this.geocodeSkipped.clear();
  }

  countForProvince(p: ProvinceCentroid): number {
    if (this.mapMode === 'stores') {
      return this.storeByProvinceActual.get(p.name) ?? 0;
    }
    return this.orderByProvince.get(p.name)?.total ?? 0;
  }

  orderDetailForSelected(): ProvinceOrderAgg | null {
    if (!this.selectedProvince) return null;
    return (
      this.orderByProvince.get(this.selectedProvince.name) ?? {
        total: 0,
        homeDelivery: 0,
        pharmacyPickup: 0,
        samples: []
      }
    );
  }

  formatMoney(v: unknown): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `${n.toLocaleString('vi-VN')}đ`;
  }

  orderLabel(o: any): string {
    return String(o?.order_id || o?.orderCode || o?._id || '').slice(0, 24) || '—';
  }

  openOrderDetail(order: any): void {
    this.selectedOrder = order || null;
    this.cdr.markForCheck();
  }

  closeOrderDetail(): void {
    this.selectedOrder = null;
    this.cdr.markForCheck();
  }

  orderCustomerName(o: any): string {
    return o?.customerName || o?.fullName || o?.receiverName || o?.name || 'Khách hàng';
  }

  orderPhone(o: any): string {
    return o?.phone || o?.phoneNumber || o?.receiverPhone || o?.customerPhone || '';
  }

  orderAddress(o: any): string {
    if (o?.address) return String(o.address);
    if (o?.shippingAddress) return String(o.shippingAddress);
    if (o?.deliveryAddress) return String(o.deliveryAddress);
    const parts = [o?.ward, o?.district, o?.city, o?.province].filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  }

  orderCreatedAt(o: any): string {
    const raw = o?.createdAt || o?.created_at || o?.orderDate || o?.date;
    const d = raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN');
  }

  deliveryLabel(o: any): string {
    return o?.atPharmacy ? 'Nhận tại nhà thuốc' : 'Giao tận nơi';
  }

  addressLine(store: DashboardStore): string {
    const d = store.dia_chi;
    if (!d) return '—';
    if (d.dia_chi_day_du) return d.dia_chi_day_du;
    const parts = [d.so_nha, d.duong, d.phuong_xa, d.quan_huyen, d.tinh_thanh].filter(Boolean);
    return parts.join(', ') || '—';
  }

  isOpen(store: DashboardStore): boolean {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const day = now.getDay();
    const schedule = store.thoi_gian_hoat_dong;
    if (!schedule) return true;
    const slot = day === 0 ? schedule.chu_nhat : day === 6 ? schedule.thu_7 : schedule.thu_2_6;
    if (!slot?.mo_cua || !slot?.dong_cua) return true;
    const [openH, openM] = slot.mo_cua.split(':').map(Number);
    const [closeH, closeM] = slot.dong_cua.split(':').map(Number);
    const nowMin = hours * 60 + minutes;
    return nowMin >= openH * 60 + openM && nowMin < closeH * 60 + closeM;
  }

  getTodayHours(store: DashboardStore): string {
    const day = new Date().getDay();
    const gio = store.thoi_gian_hoat_dong;
    if (!gio) return '';
    const slot = day === 0 ? gio.chu_nhat : day === 6 ? gio.thu_7 : gio.thu_2_6;
    if (!slot) return '—';
    return `${slot.mo_cua} – ${slot.dong_cua}`;
  }

  getStarArray(rating: number): string[] {
    const stars: string[] = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) stars.push('full');
      else if (i - rating < 1) stars.push('half');
      else stars.push('empty');
    }
    return stars;
  }

  getMapUrl(store: DashboardStore): SafeResourceUrl | null {
    const ll = this.parseStoreLatLng(store);
    if (!ll) return null;
    const [lat, lng] = ll;
    const url = `https://maps.google.com/maps?q=${lat},${lng}&hl=vi&z=17&output=embed`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  openMap(store: DashboardStore): void {
    const ll = this.parseStoreLatLng(store);
    if (ll) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${ll[0]},${ll[1]}`, '_blank');
    }
  }

  callPhone(phone: string): void {
    window.open(`tel:${phone}`, '_self');
  }

  private initMap(): void {
    if (!this.mapHost?.nativeElement || this.map) return;

    const el = this.mapHost.nativeElement;
    this.map = L.map(el, {
      zoomControl: true,
      minZoom: 5,
      maxZoom: 18
    }).setView([16.2, 106.8], 6);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.markerLayer = L.layerGroup().addTo(this.map);
    this.map.fitBounds(
      [
        [8.2, 102],
        [23.9, 110.2]
      ],
      { padding: [16, 16], animate: true }
    );
    this.map.on('resize', () => {
      this.map?.invalidateSize();
    });
    this.mapApiError = null;
    this.refreshMarkers();
    this.triggerResize();
    this.cdr.markForCheck();
  }

  private triggerResize(): void {
    if (!this.map) return;
    queueMicrotask(() => this.map?.invalidateSize());
  }

  private teardownMap(): void {
    this.markerLayer?.clearLayers();
    this.markerLayer = null;
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private refreshMarkers(): void {
    if (!this.map || !this.markerLayer) return;
    this.markerLayer.clearLayers();

    if (this.mapMode === 'orders' || !this.selectedProvince) {
      this.plotProvinceCircles();
      return;
    }

    if (this.mapMode === 'stores' && this.selectedProvince) {
      if (this.storesLoading) {
        this.plotProvinceCircles();
        return;
      }
      this.plotStoreMarkers();
    }
  }

  private plotProvinceCircles(): void {
    if (!this.map || !this.markerLayer) return;
    const maxVal = Math.max(1, ...this.provinces.map((p) => this.countForProvince(p)));

    for (const p of this.provinces) {
      const count = this.countForProvince(p);
      if (count <= 0) continue;
      const t = maxVal > 0 ? Math.log1p(count) / Math.log1p(maxVal) : 0;
      const radius = Math.min(13, 4 + t * 9);
      const fillOpacity = 0.22 + t * 0.2;
      const fill = this.mapMode === 'stores' ? '#00589f' : '#7b63c6';
      const stroke =
        this.mapMode === 'stores' ? 'rgba(0, 88, 159, 0.55)' : 'rgba(91, 33, 182, 0.5)';

      const hotspot = this.storeHotspotByProvince.get(p.name);
      const lat = hotspot?.lat ?? p.lat;
      const lng = hotspot?.lng ?? p.lng;
      if (!this.isWithinVietnamBounds(lat, lng)) continue;

      const cm = L.circleMarker([lat, lng], {
        radius,
        color: stroke,
        weight: 1.25,
        fillColor: fill,
        fillOpacity,
        opacity: 0.95
      });
      cm.bindTooltip(
        `${p.name} · ${count}${this.mapMode === 'stores' ? ' CH (ước lượng)' : ' đơn'}`,
        { direction: 'top', sticky: true, opacity: 0.95, className: 'vn-map-tooltip' }
      );
      cm.on('click', () => {
        this.ngZone.run(() => this.selectProvince(p));
      });
      cm.addTo(this.markerLayer);
    }
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private plotStoreMarkers(): void {
    if (!this.map || !this.markerLayer) return;

    const boundsPts: L.LatLngExpression[] = [];
    const withCoord = this.storesInProvince.filter((s) => this.parseStoreLatLng(s) != null);

    for (const s of withCoord) {
      const ll = this.parseStoreLatLng(s)!;
      const [lat, lng] = ll;
      boundsPts.push([lat, lng]);

      const sel =
        this.selectedStore &&
        (this.selectedStore.ma_cua_hang === s.ma_cua_hang ||
          this.selectedStore._id === s._id);

      const cm = L.circleMarker([lat, lng], {
        radius: sel ? 12 : 6,
        color: sel ? '#2b3e66' : 'rgba(0, 88, 159, 0.65)',
        weight: sel ? 2.5 : 1.5,
        fillColor: sel ? '#43a2e6' : '#00589f',
        fillOpacity: sel ? 0.85 : 0.65,
        opacity: 1
      });
      cm.bindTooltip(
        `${s.ten_cua_hang || s.ma_cua_hang || 'VitaCare'} — ${this.addressLine(s)}`,
        { direction: 'top', sticky: true, opacity: 0.98, className: 'vn-map-tooltip vn-map-tooltip-store' }
      );
      cm.on('click', () => {
        this.ngZone.run(() => this.selectStoreFromMap(s));
      });
      cm.addTo(this.markerLayer);
    }

    if (boundsPts.length === 0) {
      this.scheduleGeocodeMissing();
      return;
    }
    // Không tự focus/pan/zoom bản đồ khi chọn khu vực hoặc cửa hàng.
    this.scheduleGeocodeMissing();
  }

  private scheduleGeocodeMissing(): void {
    if (!this.map || this.geocodeProcessing) return;
    const session = this.mapViewVersion;
    const left = this.storesInProvince.filter((s) => {
      const key = this.storeCacheKey(s);
      return (
        !this.parseStoreLatLng(s) &&
        this.addressLine(s) !== '—' &&
        !this.geocodeSkipped.has(key)
      );
    });
    if (left.length === 0) return;

    this.geocodeProcessing = true;
    const s = left[0];

    void this.runGeocodeForStore(s).finally(() => {
      this.ngZone.run(() => {
        this.geocodeProcessing = false;
        if (!this.map || session !== this.mapViewVersion) return;
        setTimeout(() => this.refreshMarkers(), 200);
      });
    });
  }

  private async runGeocodeForStore(s: DashboardStore): Promise<void> {
    const addr = `${this.addressLine(s)}, Vietnam`;
    const key = this.storeCacheKey(s);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'vi',
          'User-Agent': 'VitaCareAdmin/1.0 (dashboard map)'
        }
      });
      const arr = (await res.json()) as { lat: string; lon: string }[];
      if (arr?.[0]) {
        this.geocodeCache.set(key, {
          lat: parseFloat(arr[0].lat),
          lng: parseFloat(arr[0].lon)
        });
        return;
      }
    } catch {
      /* skip */
    }

    this.geocodeSkipped.add(key);
  }
}
