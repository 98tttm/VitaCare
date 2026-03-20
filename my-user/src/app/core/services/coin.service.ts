import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

export interface CoinHistory {
    amount: number;
    reason: string;
    date: string | Date;
    dateKey: string;
}

export interface CoinData {
    balance: number;
    lastCompletedDate: string | null; // YYYY-MM-DD
    currentStreak: number;
    history: CoinHistory[];
}

@Injectable({
    providedIn: 'root'
})
export class CoinService {
    private http = inject(HttpClient);
    private auth = inject(AuthService);
    private static STORAGE_KEY = 'vc_coin_data';
    private apiUrl = '/api/users-memory/coins';

    coinData = signal<CoinData>({
        balance: 0,
        lastCompletedDate: null,
        currentStreak: 0,
        history: []
    });

    constructor() {
        this.initialize();
    }

    private async initialize() {
        // Ưu tiên load từ backend nếu đã đăng nhập
        const user = this.auth.currentUser();
        if (user?.user_id) {
            await this.loadFromBackend(user.user_id);
        } else {
            this.loadFromStorage();
        }
    }

    private async loadFromBackend(userId: string) {
        try {
            const res = await firstValueFrom(this.http.get<any>(`${this.apiUrl}?user_id=${userId}`));
            if (res.success) {
                this.coinData.set(res.coins);
                this.saveToStorage();
            }
        } catch (e) {
            console.error('Failed to load coins from backend', e);
            this.loadFromStorage();
        }
    }

    private loadFromStorage(): void {
        const raw = localStorage.getItem(CoinService.STORAGE_KEY);
        if (raw) {
            try {
                this.coinData.set(JSON.parse(raw));
            } catch (e) {
                console.error('Failed to parse coin data', e);
            }
        }
    }

    private saveToStorage(): void {
        localStorage.setItem(CoinService.STORAGE_KEY, JSON.stringify(this.coinData()));
    }

    /** Lấy số tiền thưởng cho ngày cụ thể (dùng trên Calendar) */
    getRewardForDate(dateKey: string): number {
        const data = this.coinData();
        const todayKey = this.formatDateKey(new Date());

        // Nếu đã hoàn thành ngày này rồi (Today hoặc Past)
        if (data.lastCompletedDate === dateKey) {
            return this.getRewardForStreak(data.currentStreak);
        }

        // Nếu là ngày mai (hoặc tương lai) và hôm nay đã xong
        if (dateKey > todayKey) {
            // Nếu hôm nay xong, streak tiếp theo là +1
            if (data.lastCompletedDate === todayKey) {
                return this.getRewardForStreak(data.currentStreak + 1);
            }
            // Nếu hôm nay chưa xong, chưa biết chuỗi có bị đứt không, mặc định mốc 1
            return 50;
        }

        // Mặc định cho ngày hiện tại (nếu chưa xong)
        if (dateKey === todayKey) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = this.formatDateKey(yesterday);

            if (data.lastCompletedDate === yesterdayKey) {
                return this.getRewardForStreak(data.currentStreak + 1);
            }
            return 50;
        }

        return 50;
    }

    isDateCompleted(dateKey: string): boolean {
        return this.coinData().lastCompletedDate === dateKey;
    }

    /**
     * Số xu hiển thị trên lịch (hôm nay + 5 ngày tới), giả sử điểm danh đủ nối tiếp.
     * Bậc: 50 → 100 → 200 → 300 (lặp). Trả về null nếu không nằm trong cửa sổ 6 ngày hoặc ngày quá khứ (trừ ngày đã nhận).
     */
    getCalendarCoinPreview(dateKey: string): number | null {
        const data = this.coinData();
        const todayKey = this.formatDateKey(new Date());
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = this.formatDateKey(yesterday);

        const windowEnd = this.addDaysToDateKey(todayKey, 5);

        if (dateKey < todayKey) {
            if (data.lastCompletedDate === dateKey) {
                return this.getRewardForStreak(data.currentStreak);
            }
            return null;
        }

        if (dateKey > windowEnd) {
            return null;
        }

        let firstPending: string;
        let streakOnFirstPending: number;

        if (data.lastCompletedDate === todayKey) {
            firstPending = this.addDaysToDateKey(todayKey, 1);
            streakOnFirstPending = (data.currentStreak || 0) + 1;
        } else {
            firstPending = todayKey;
            if (!data.lastCompletedDate) {
                streakOnFirstPending = 1;
            } else if (data.lastCompletedDate === yesterdayKey) {
                streakOnFirstPending = (data.currentStreak || 0) + 1;
            } else {
                streakOnFirstPending = 1;
            }
        }

        if (dateKey < firstPending) {
            if (data.lastCompletedDate === dateKey) {
                return this.getRewardForStreak(data.currentStreak);
            }
            return null;
        }

        const offset = this.daysBetweenDateKeys(firstPending, dateKey);
        return this.getRewardForStreak(streakOnFirstPending + offset);
    }

    /** Áp dụng phần thưởng hàng ngày và cập nhật chuỗi */
    async applyDailyReward(dateKey: string, reason: string = 'Hoàn thành nhắc nhở'): Promise<{ amount: number; newTotal: number; isRewardApplied: boolean }> {
        const data = this.coinData();

        if (data.lastCompletedDate === dateKey) {
            return { amount: 0, newTotal: data.balance, isRewardApplied: false };
        }

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = this.formatDateKey(yesterday);

        let newStreak = 1;
        if (data.lastCompletedDate === yesterdayKey) {
            newStreak = (data.currentStreak || 0) + 1;
        }

        const reward = this.getRewardForStreak(newStreak);
        const newTotal = (data.balance || 0) + reward;

        // Cập nhật local state ngay lập tức để UI mượt mà
        const newEntry: CoinHistory = {
            amount: reward,
            reason: `${reason} ngày ${dateKey}`,
            date: new Date(),
            dateKey
        };

        const updatedData: CoinData = {
            balance: newTotal,
            lastCompletedDate: dateKey,
            currentStreak: newStreak,
            history: [newEntry, ...(data.history || [])].slice(0, 50)
        };

        this.coinData.set(updatedData);
        this.saveToStorage();

        // Đồng bộ lên backend nếu đã đăng nhập
        const user = this.auth.currentUser();
        if (user?.user_id) {
            console.log(`[CoinService] Syncing reward: ${reward} xu for user: ${user.user_id}, date: ${dateKey}`);
            try {
                const response = await firstValueFrom(this.http.post<any>(`${this.apiUrl}/reward`, {
                    user_id: user.user_id,
                    amount: reward,
                    dateKey,
                    reason: newEntry.reason
                }));
                console.log('[CoinService] Backend sync success:', response);
            } catch (e) {
                console.error('[CoinService] Failed to sync reward to backend:', e);
            }
        }

        return { amount: reward, newTotal, isRewardApplied: true };
    }

    async resetStreak(): Promise<void> {
        const emptyCoins: CoinData = { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] };

        // Xóa ngay lập tức ở local để UI phản ánh ngay
        this.coinData.set(emptyCoins);
        localStorage.removeItem(CoinService.STORAGE_KEY);

        const user = this.auth.currentUser();
        if (user?.user_id) {
            try {
                await firstValueFrom(this.http.post<any>(`${this.apiUrl}/reset`, { user_id: user.user_id }));
                // Đồng bộ lại từ backend để đảm bảo nhất quán
                await this.loadFromBackend(user.user_id);
            } catch (e) {
                console.error('Failed to reset streak', e);
            }
        }
    }

    private getRewardForStreak(streak: number): number {
        if (streak === 1) return 50;
        if (streak === 2) return 100;
        if (streak === 3) return 200;
        return 300;
    }

    private formatDateKey(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    private addDaysToDateKey(key: string, days: number): string {
        const [y, m, d] = key.split('-').map(Number);
        const dt = new Date(y, m - 1, d + days);
        return this.formatDateKey(dt);
    }

    private daysBetweenDateKeys(a: string, b: string): number {
        const da = this.parseDateKey(a);
        const db = this.parseDateKey(b);
        return Math.round((db.getTime() - da.getTime()) / 86400000);
    }

    private parseDateKey(key: string): Date {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
}
