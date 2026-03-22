import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Store } from '../../../core/models/store.model';
import { StoreService, StoreFilter, LocationItem } from '../../../core/services/store.service';
import { VcSearchableSelectComponent } from '../../../shared/vc-searchable-select/vc-searchable-select.component';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

const TINH_THANH_LIST = [
    'Tất cả', 'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Ninh',
    'Bình Dương', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Hà Nam', 'Hà Nội',
    'Hải Dương', 'Hải Phòng', 'Hồ Chí Minh', 'Huế', 'Hưng Yên',
    'Khánh Hòa', 'Kiên Giang', 'Lâm Đồng', 'Long An', 'Nam Định',
    'Nghệ An', 'Ninh Bình', 'Phú Thọ', 'Quảng Nam', 'Quảng Ninh',
    'Thái Nguyên', 'Thanh Hóa', 'Thừa Thiên Huế', 'Tiền Giang',
    'Vĩnh Phúc', 'Vũng Tàu',
];

@Component({
    selector: 'app-store-system',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, VcSearchableSelectComponent],
    templateUrl: './store-system.html',
    styleUrl: './store-system.css',
})
export class StoreSystemComponent implements OnInit, OnDestroy {
    stores: Store[] = [];
    selectedStore: Store | null = null;
    loading = false;
    error = '';

    keyword = '';
    selectedTinh = 'Tất cả';
    selectedQuan = 'Tất cả';
    selectedPhuong = 'Tất cả';
    activeTab = 'search';

    currentPage = 1;
    totalPages = 1;
    totalStores = 0;
    pageSize = 3;

    tinhThanhList: string[] = ['Tất cả'];
    allLocations: any[] = [];
    availableQuans: any[] = [];
    availablePhuongs: string[] = [];

    private keywordSubject = new Subject<string>();
    private destroy$ = new Subject<void>();
    private retryCount = 0;
    private readonly maxRetries = 3;

    constructor(
        private storeService: StoreService,
        private ngZone: NgZone,
        private cdr: ChangeDetectorRef,
        private sanitizer: DomSanitizer
    ) { }

    ngOnInit(): void {
        this.fetchLocations();
        this.loadStores();
        this.keywordSubject.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.currentPage = 1;
            this.loadStores();
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    fetchLocations(): void {
        this.storeService.getLocations().pipe(takeUntil(this.destroy$)).subscribe({
            next: (data: any[]) => {
                this.allLocations = data;
                this.tinhThanhList = ['Tất cả', ...data.map((item: any) => item.tinh)];
                this.cdr.markForCheck();
            },
            error: (err: any) => console.error('Lỗi lấy danh sách địa điểm:', err)
        });
    }

    loadStores(): void {
        this.loading = true;
        this.error = '';
        this.retryCount = 0;
        this.cdr.markForCheck();
        this._doLoad();
    }

    retryLoad(): void {
        this.loadStores();
    }

    private _doLoad(): void {
        const filter: StoreFilter = {
            keyword: this.keyword,
            tinh_thanh: this.selectedTinh,
            quan_huyen: this.selectedQuan,
            phuong_xa: this.selectedPhuong,
            page: this.currentPage,
            limit: this.pageSize,
        };
        this.storeService.getStores(filter).pipe(takeUntil(this.destroy$)).subscribe({
            next: (res: { data: Store[]; total: number; totalPages: number }) => {
                this.stores = res.data;
                this.totalStores = res.total;
                this.totalPages = res.totalPages;
                this.loading = false;
                this.error = '';
                this.cdr.markForCheck();
            },
            error: (err: any) => {
                console.error(err);
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    const delayMs = this.retryCount * 1000;
                    // Wrap in ngZone.run() so Angular change detection fires after setTimeout
                    this.ngZone.run(() => {
                        setTimeout(() => this._doLoad(), delayMs);
                    });
                } else {
                    this.error = 'Không thể tải dữ liệu. Vui lòng kiểm tra kết nối server.';
                    this.loading = false;
                    this.cdr.markForCheck();
                }
            }
        });
    }

    onKeywordChange(): void {
        this.keywordSubject.next(this.keyword);
    }

    get tinhStoreOptions(): { value: string; label: string }[] {
        return (this.tinhThanhList || []).map((t) => ({ value: t, label: t }));
    }

    get quanStoreOptions(): { value: string; label: string }[] {
        const head = { value: 'Tất cả', label: 'Tất cả' };
        if (this.selectedTinh === 'Tất cả') return [head];
        return [head, ...this.availableQuans.map((q: { ten: string }) => ({ value: q.ten, label: q.ten }))];
    }

    get phuongStoreOptions(): { value: string; label: string }[] {
        return (this.availablePhuongs || []).map((p) => ({ value: p, label: p }));
    }

    selectTinh(tinh: string): void {
        this.selectedTinh = tinh;
        this.selectedQuan = 'Tất cả';
        this.selectedPhuong = 'Tất cả';
        this.availableQuans = [];
        this.availablePhuongs = [];

        if (tinh !== 'Tất cả') {
            const loc = this.allLocations.find(l => l.tinh === tinh);
            if (loc) {
                this.availableQuans = loc.quans.sort((a: any, b: any) => a.ten.localeCompare(b.ten));
            }
        }

        this.currentPage = 1;
        this.loadStores();
    }

    selectQuan(quan: string): void {
        this.selectedQuan = quan;
        this.selectedPhuong = 'Tất cả';
        this.availablePhuongs = [];

        if (quan !== 'Tất cả') {
            const q = this.availableQuans.find(a => a.ten === quan);
            if (q) {
                this.availablePhuongs = ['Tất cả', ...q.phuongs.sort()];
            }
        }

        this.currentPage = 1;
        this.loadStores();
    }

    selectPhuong(phuong: string): void {
        this.selectedPhuong = phuong;
        this.currentPage = 1;
        this.loadStores();
    }

    switchTab(tab: string): void {
        this.activeTab = tab;
    }

    selectStore(store: Store): void {
        this.selectedStore = store;
    }

    clearSelection(): void {
        this.selectedStore = null;
    }

    goToPage(page: number): void {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.loadStores();
    }

    getPages(): number[] {
        const pages: number[] = [];
        const start = Math.max(1, this.currentPage - 2);
        const end = Math.min(this.totalPages, start + 4);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    }

    isOpen(store: Store): boolean {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const day = now.getDay();
        const schedule = store.thoi_gian_hoat_dong;
        if (!schedule) return true;
        const slot = day === 0 ? schedule.chu_nhat : day === 6 ? schedule.thu_7 : schedule.thu_2_6;
        if (!slot) return false;
        const [openH, openM] = slot.mo_cua.split(':').map(Number);
        const [closeH, closeM] = slot.dong_cua.split(':').map(Number);
        const nowMin = hours * 60 + minutes;
        return nowMin >= openH * 60 + openM && nowMin < closeH * 60 + closeM;
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

    getTodayHours(store: Store): string {
        const day = new Date().getDay();
        const gio = store.thoi_gian_hoat_dong;
        if (!gio) return '';
        const slot = day === 0 ? gio.chu_nhat : day === 6 ? gio.thu_7 : gio.thu_2_6;
        if (!slot) return 'Đóng cửa hôm nay';
        return `${slot.mo_cua} – ${slot.dong_cua} `;
    }

    openMap(store: Store): void {
        if (store.toa_do) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${store.toa_do.lat},${store.toa_do.lng}`, '_blank');
        }
    }

    callPhone(phone: string): void {
        window.open(`tel:${phone}`);
    }

    getMapUrl(store: Store): SafeResourceUrl | null {
        if (!store.toa_do || !store.toa_do.lat || !store.toa_do.lng) return null;
        const url = `https://maps.google.com/maps?q=${store.toa_do.lat},${store.toa_do.lng}&hl=vi&z=15&output=embed`;
        return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
}
