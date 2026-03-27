import { Injectable, signal, inject, computed, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

/** Cùng backend với HealthTestService — tránh 404 khi gọi /api qua localhost:4200 (proxy không áp dụng hoặc POST lỗi). */
const API_BASE = '';

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
    /** Cache cũ không gắn user — gây lộn số dư khi đổi tài khoản; chỉ dùng để xóa một lần. */
    private static readonly LEGACY_STORAGE_KEY = 'vc_coin_data';
    private static storageKeyForUser(userId: string): string {
        return `vc_coin_data_${String(userId || '').trim()}`;
    }
    private readonly apiUrl = `${API_BASE}/api/users-memory/coins`;

    /**
     * Dùng để chặn trường hợp loadFromBackend (chạy async lúc init) trả về SAU khi
     * user vừa nhận xu và coinData đã được set mới -> response cũ không được ghi đè.
     */
    private lastCoinSetAt = 0;
    private bagLoadingTimer: ReturnType<typeof setTimeout> | null = null;
    /** User đã load coin vào memory (tránh gộp số dư giữa 2 tài khoản). */
    private loadedUserId: string | null = null;

    coinData = signal<CoinData>({
        balance: 0,
        lastCompletedDate: null,
        currentStreak: 0,
        history: []
    });
    coinBagLoading = signal(false);

    /**
     * Số xu hiển thị / dùng thanh toán: chỉ khi đã đăng nhập.
     * Khách vãng lai luôn 0 — tránh lộ số dư từ localStorage của phiên trước.
     */
    readonly effectiveBalance = computed(() => {
        const u = this.auth.currentUser();
        if (!u?.user_id) return 0;
        return Math.max(0, Number(this.coinData().balance || 0));
    });

    /**
     * Các ngày đã nhận xu nhắc lịch/điểm danh: từ history (dateKey YYYY-MM-DD, amount > 0).
     * Dùng để lịch tháng giữ chip xám cho mọi ngày đã nhận, không chỉ lastCompletedDate.
     */
    readonly reminderClaimAmountByDate = computed(() => {
        const map = new Map<string, number>();
        for (const h of this.coinData().history || []) {
            if (!h) continue;
            const dk = String(h.dateKey || '').trim();
            if (!CoinService.isCalendarDateKey(dk)) continue;
            const amt = Number(h.amount) || 0;
            if (amt <= 0) continue;
            const prev = map.get(dk);
            if (prev === undefined || amt > prev) map.set(dk, amt);
        }
        return map;
    });

    private static isCalendarDateKey(key: string): boolean {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(key || '').trim());
    }

    constructor() {
        effect(() => {
            const u = this.auth.currentUser();
            const uid = u?.user_id ? String(u.user_id).trim() : '';
            if (!uid) {
                this.loadedUserId = null;
                this.coinData.set({
                    balance: 0,
                    lastCompletedDate: null,
                    currentStreak: 0,
                    history: []
                });
                return;
            }
            if (this.loadedUserId === uid) {
                return;
            }
            this.loadedUserId = uid;
            try {
                localStorage.removeItem(CoinService.LEGACY_STORAGE_KEY);
            } catch {
                /* ignore */
            }
            this.loadFromStorageForUser(uid);
            void this.loadFromBackend(uid);
        });
    }

    private emptyCoinData(): CoinData {
        return { balance: 0, lastCompletedDate: null, currentStreak: 0, history: [] };
    }

    private loadFromStorageForUser(userId: string): void {
        const key = CoinService.storageKeyForUser(userId);
        const raw = localStorage.getItem(key);
        if (!raw) {
            this.coinData.set(this.emptyCoinData());
            this.lastCoinSetAt = Date.now();
            return;
        }
        try {
            const parsed = JSON.parse(raw) as Partial<CoinData>;
            this.coinData.set({
                balance: Math.max(0, Number(parsed.balance) || 0),
                lastCompletedDate: parsed.lastCompletedDate ?? null,
                currentStreak: Math.max(0, Number(parsed.currentStreak) || 0),
                history: Array.isArray(parsed.history) ? parsed.history : []
            });
            this.lastCoinSetAt = Date.now();
        } catch (e) {
            console.error('Failed to parse coin data', e);
            this.coinData.set(this.emptyCoinData());
        }
    }

    /** Gộp history hai phía, bỏ bản ghi trùng (dateKey + amount + reason). */
    private mergeHistoriesUnique(a: CoinHistory[] = [], b: CoinHistory[] = []): CoinHistory[] {
        const seen = new Set<string>();
        const out: CoinHistory[] = [];
        for (const h of [...(a || []), ...(b || [])]) {
            if (!h) continue;
            const sig = `${String(h.dateKey)}|${Number(h.amount)}|${String(h.reason || '')}`;
            if (seen.has(sig)) continue;
            seen.add(sig);
            out.push(h);
        }
        return out;
    }

    /** Gộp server + local: ưu tiên ngày nhận xu mới hơn (YYYY-MM-DD), balance lấy max, history gộp đủ hai nguồn. */
    private mergeCoinDataFromServer(local: CoinData, server: CoinData): CoinData {
        const lk = local.lastCompletedDate;
        const sk = server.lastCompletedDate;
        const bal = Math.max(Number(local.balance) || 0, Number(server.balance) || 0);
        const hist = this.mergeHistoriesUnique(local.history, server.history);

        if (lk && sk) {
            if (lk > sk) return { ...local, balance: bal, history: hist };
            if (lk < sk) return { ...server, balance: bal, history: hist };
            return {
                ...server,
                balance: bal,
                currentStreak: Math.max(Number(local.currentStreak) || 0, Number(server.currentStreak) || 0),
                history: hist,
            };
        }
        if (lk && !sk) return { ...local, balance: bal, history: hist };
        if (!lk && sk) return { ...server, balance: bal, history: hist };
        return { ...server, balance: bal, history: hist };
    }

    private async loadFromBackend(userId: string) {
        const uid = String(userId || '').trim();
        if (!uid) return;
        const requestStartAt = Date.now();
        try {
            const res = await firstValueFrom(this.http.get<any>(`${this.apiUrl}?user_id=${encodeURIComponent(uid)}`));
            const currentUid = String(this.auth.currentUser()?.user_id || '').trim();
            if (currentUid !== uid) {
                return;
            }
            if (res.success) {
                // Nếu coinData đã được cập nhật bởi luồng khác (nhận xu) sau thời điểm request này bắt đầu,
                // thì bỏ response để UI không bị "tụt" lại cho tới khi reload.
                if (this.lastCoinSetAt > requestStartAt) return;
                const merged = this.mergeCoinDataFromServer(this.coinData(), res.coins);
                this.coinData.set(merged);
                this.lastCoinSetAt = Date.now();
                this.saveToStorage();
            }
        } catch (e) {
            console.error('Failed to load coins from backend', e);
            if (String(this.auth.currentUser()?.user_id || '').trim() === uid) {
                this.loadFromStorageForUser(uid);
            }
        }
    }

    private saveToStorage(): void {
        const uid = String(this.auth.currentUser()?.user_id || '').trim();
        if (!uid) return;
        try {
            localStorage.setItem(CoinService.storageKeyForUser(uid), JSON.stringify(this.coinData()));
        } catch (e) {
            console.error('Failed to save coin data', e);
        }
    }

    /** Lấy số tiền thưởng cho ngày cụ thể (dùng trên Calendar) */
    getRewardForDate(dateKey: string): number {
        const data = this.coinData();
        const todayKey = this.formatDateKey(new Date());

        const claimedAmt = this.reminderClaimAmountByDate().get(dateKey);
        if (claimedAmt != null && claimedAmt > 0) {
            return claimedAmt;
        }
        if (data.lastCompletedDate === dateKey) {
            return this.getRewardForStreak(Math.max(data.currentStreak || 0, 1));
        }

        // Nếu là ngày mai (hoặc tương lai) và hôm nay đã xong
        if (dateKey > todayKey) {
            // Nếu hôm nay xong, streak tiếp theo là +1
            if (data.lastCompletedDate === todayKey) {
                return this.getRewardForStreak(Math.max(data.currentStreak || 0, 1) + 1);
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
                return this.getRewardForStreak(Math.max(data.currentStreak || 0, 1) + 1);
            }
            return 50;
        }

        return 50;
    }

    isDateCompleted(dateKey: string): boolean {
        if (this.reminderClaimAmountByDate().has(dateKey)) return true;
        return this.coinData().lastCompletedDate === dateKey;
    }

    /**
     * Số xu trên ô lịch: tương lai (hôm nay → +5) theo chuỗi dự kiến; quá khứ: mọi ngày đã nhận (history) trả về đúng số đã nhận để chip xám.
     * Bậc tương lai: 50 → 100 → 200 → 300 (lặp). null nếu ô quá khứ không có nhận xu, hoặc tương lai ngoài +5 ngày.
     */
    getCalendarCoinPreview(dateKey: string): number | null {
        const data = this.coinData();
        const todayKey = this.formatDateKey(new Date());
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = this.formatDateKey(yesterday);

        const windowEnd = this.addDaysToDateKey(todayKey, 5);

        if (dateKey < todayKey) {
            const histAmt = this.reminderClaimAmountByDate().get(dateKey);
            if (histAmt != null && histAmt > 0) return histAmt;
            if (data.lastCompletedDate === dateKey) {
                return this.getRewardForStreak(Math.max(data.currentStreak || 0, 1));
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
            streakOnFirstPending = Math.max(data.currentStreak || 0, 1) + 1;
        } else {
            firstPending = todayKey;
            if (!data.lastCompletedDate) {
                streakOnFirstPending = 1;
            } else if (data.lastCompletedDate === yesterdayKey) {
                /* currentStreak lưu sai = 0 (server cũ dùng UTC) vẫn coi đã qua ít nhất 1 ngày chuỗi */
                streakOnFirstPending = Math.max(data.currentStreak || 0, 1) + 1;
            } else {
                streakOnFirstPending = 1;
            }
        }

        if (dateKey < firstPending) {
            const histAmt = this.reminderClaimAmountByDate().get(dateKey);
            if (histAmt != null && histAmt > 0) return histAmt;
            if (data.lastCompletedDate === dateKey) {
                return this.getRewardForStreak(Math.max(data.currentStreak || 0, 1));
            }
            return null;
        }

        const offset = this.daysBetweenDateKeys(firstPending, dateKey);
        return this.getRewardForStreak(streakOnFirstPending + offset);
    }

    /** Áp dụng phần thưởng hàng ngày và cập nhật chuỗi */
    async applyDailyReward(dateKey: string, reason: string = 'Hoàn thành nhắc nhở'): Promise<{ amount: number; newTotal: number; isRewardApplied: boolean }> {
        const data = this.coinData();

        if (data.lastCompletedDate === dateKey || this.reminderClaimAmountByDate().has(dateKey)) {
            return { amount: 0, newTotal: data.balance, isRewardApplied: false };
        }

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = this.formatDateKey(yesterday);

        let newStreak = 1;
        if (data.lastCompletedDate === yesterdayKey) {
            newStreak = Math.max(data.currentStreak || 0, 1) + 1;
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
            history: [newEntry, ...(data.history || [])]
        };

        this.coinData.set(updatedData);
        this.lastCoinSetAt = Date.now();
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
        this.lastCoinSetAt = Date.now();
        const uidReset = String(this.auth.currentUser()?.user_id || '').trim();
        if (uidReset) {
            try {
                localStorage.removeItem(CoinService.storageKeyForUser(uidReset));
            } catch {
                /* ignore */
            }
        }
        try {
            localStorage.removeItem(CoinService.LEGACY_STORAGE_KEY);
        } catch {
            /* ignore */
        }

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

    /**
     * Thưởng xu đơn hàng (ví dụ sau khi user bấm "Nhận xu" ở đơn đã giao).
     * Đồng bộ backend + cập nhật ngay signal coinData để UI (túi xu) tăng realtime.
     */
    async applyOrderReward(orderCode: string, amount: number, explicitUserId?: string): Promise<{ success: boolean; alreadyApplied?: boolean; coins?: CoinData }> {
        const uid = String(explicitUserId || this.auth.currentUser()?.user_id || '').trim();
        const code = String(orderCode || '').trim();
        const amt = Math.max(0, Math.floor(Number(amount) || 0));

        if (!uid || uid === 'guest') {
            throw new Error('Thiếu user_id hợp lệ.');
        }
        if (!code) {
            throw new Error('Thiếu mã đơn hàng.');
        }
        if (amt <= 0) {
            throw new Error('Số xu thưởng không hợp lệ.');
        }

        const res = await firstValueFrom(this.http.post<any>(`${this.apiUrl}/order-reward`, {
            user_id: uid,
            orderCode: code,
            amount: amt
        }));

        if (!res?.success) {
            throw new Error(res?.message || 'Không thể cộng xu đơn hàng.');
        }

        if (res?.coins) {
            this.coinData.set(res.coins);
            this.lastCoinSetAt = Date.now();
            this.saveToStorage();
        } else {
            // Fallback: nếu backend không trả coins thì reload lại từ backend.
            await this.loadFromBackend(uid);
        }

        return { success: true, alreadyApplied: !!res?.alreadyApplied, coins: res?.coins };
    }

    /**
     * Thưởng xu cho hành động "Đánh giá".
     * Idempotency dựa trên orderCode thông qua coins.history.dateKey ở backend.
     * Không đụng vào streak/lastCompletedDate.
     */
    async applyReviewReward(orderCode: string, amount: number, explicitUserId?: string): Promise<{ success: boolean; alreadyApplied?: boolean; coins?: CoinData }> {
        const uid = String(explicitUserId || this.auth.currentUser()?.user_id || '').trim();
        const code = String(orderCode || '').trim();
        const amt = Math.max(0, Math.floor(Number(amount) || 0));

        if (!uid || uid === 'guest') {
            throw new Error('Thiếu user_id hợp lệ.');
        }
        if (!code) {
            throw new Error('Thiếu orderCode.');
        }
        if (amt <= 0) {
            throw new Error('Số xu thưởng không hợp lệ.');
        }

        const res = await firstValueFrom(this.http.post<any>(`${this.apiUrl}/review-reward`, {
            user_id: uid,
            orderCode: code,
            amount: amt
        }));

        if (!res?.success) {
            throw new Error(res?.message || 'Không thể cộng xu đánh giá.');
        }

        if (res?.coins) {
            this.coinData.set(res.coins);
            this.lastCoinSetAt = Date.now();
            this.saveToStorage();
        } else {
            await this.loadFromBackend(uid);
        }

        return { success: true, alreadyApplied: !!res?.alreadyApplied, coins: res?.coins };
    }

    /**
     * Thưởng xu sau khi hoàn thành bài kiểm tra sức khỏe (50 xu/lần, tối đa 2 lần/ngày trên server).
     * Idempotent theo claimToken (mỗi lần làm bài một token).
     */
    async applyQuizReward(
        claimToken: string,
        quizId: string,
        explicitUserId?: string
    ): Promise<{ success: boolean; alreadyApplied?: boolean; coins?: CoinData; message?: string }> {
        const uid = String(explicitUserId || this.auth.currentUser()?.user_id || '').trim();
        const tok = String(claimToken || '').trim();
        const qid = String(quizId || '').trim();

        if (!uid || uid === 'guest') {
            throw new Error('Vui lòng đăng nhập để nhận xu.');
        }
        if (!tok) {
            throw new Error('Thiếu mã nhận thưởng.');
        }
        if (!qid) {
            throw new Error('Thiếu mã bài test.');
        }

        const res = await firstValueFrom(
            this.http.post<any>(`${this.apiUrl}/quiz-reward`, {
                user_id: uid,
                quiz_id: qid,
                claimToken: tok,
            })
        );

        if (!res?.success) {
            throw new Error(res?.message || 'Không thể nhận xu.');
        }

        if (res?.coins) {
            this.coinData.set(res.coins);
            this.lastCoinSetAt = Date.now();
            this.saveToStorage();
        } else {
            await this.loadFromBackend(uid);
        }

        return { success: true, alreadyApplied: !!res?.alreadyApplied, coins: res?.coins, message: res?.message };
    }

    /**
     * Sau khi đặt hàng dùng Vita Xu: trừ đúng số xu đơn, ghi history chi tiêu.
     * Không đụng lastCompletedDate / currentStreak — chuỗi nhắc lịch giữ nguyên (khớp backend).
     * Cập nhật local **ngay** (không chờ timeout) để refreshFromBackend merge đúng, không bị ghi đè mất history.
     */
    applyCheckoutVitaXuReset(orderCode?: string, xuUsedFromOrder?: number): void {
        if (this.bagLoadingTimer) {
            clearTimeout(this.bagLoadingTimer);
            this.bagLoadingTimer = null;
        }
        this.coinBagLoading.set(true);

        const prev = this.coinData();
        const currentBalance = Math.max(0, Number(prev?.balance || 0));
        const rawUse = Number(xuUsedFromOrder);
        const use =
            rawUse > 0 ? Math.min(currentBalance, Math.floor(rawUse)) : currentBalance;
        const history = Array.isArray(prev?.history) ? prev.history : [];
        const dateKey = `vita-xu-used-${String(orderCode || Date.now())}`;
        const existed = history.some((h) => String(h?.dateKey || '') === dateKey);

        const entry =
            use > 0 && !existed
                ? ([
                      {
                          amount: -use,
                          reason: `Sử dụng Vita Xu cho đơn hàng ${String(orderCode || '')}`.trim(),
                          date: new Date(),
                          dateKey,
                      },
                  ] as CoinHistory[])
                : [];

        const newBal = Math.max(0, currentBalance - use);

        this.coinData.set({
            ...prev,
            balance: newBal,
            history: [...entry, ...history],
        });
        this.lastCoinSetAt = Date.now();
        this.saveToStorage();

        this.bagLoadingTimer = setTimeout(() => {
            this.coinBagLoading.set(false);
            this.bagLoadingTimer = null;
        }, 850);
    }

    /**
     * Đồng bộ lại coinData từ backend (khi đã đăng nhập).
     * Dùng sau các nghiệp vụ tiêu xu/cộng xu để tránh hiển thị số dư cũ do cache local.
     */
    async refreshFromBackend(): Promise<void> {
        const userId = String(this.auth.currentUser()?.user_id || '').trim();
        if (!userId) return;
        await this.loadFromBackend(userId);
    }

    /** Khớp backend `QUIZ_REASON` trong POST /quiz-reward */
    static readonly QUIZ_HEALTH_REASON = 'Hoàn thành bài kiểm tra sức khỏe';

    /** 50 xu/lần, tối đa 2 lần/ngày → 100 xu/ngày (theo ngày Asia/Ho_Chi_Minh). */
    static readonly QUIZ_HEALTH_REWARD_EACH = 50;
    static readonly QUIZ_HEALTH_DAILY_MAX_XU = 100;

    /** Số lần đã nhận xu từ bài test sức khỏe hôm nay (VN), tối đa 2/ngày trên server. */
    countQuizHealthRewardsToday(): number {
        const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 10);
        const reason = CoinService.QUIZ_HEALTH_REASON;
        let n = 0;
        for (const h of this.coinData().history || []) {
            if (!h || String(h.reason || '').trim() !== reason) continue;
            if (!h.date) continue;
            try {
                const vn = new Date(h.date as Date | string)
                    .toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
                    .slice(0, 10);
                if (vn === today) n++;
            } catch {
                /* ignore */
            }
        }
        return n;
    }

    /**
     * Tổng xu đã cộng từ bài kiểm tra sức khỏe trong ngày (VN) — chỉ dòng amount dương.
     * Dùng kèm số lần: đủ 100 xu hoặc đủ 2 lần thì coi như hết lượt trong ngày.
     */
    sumQuizHealthRewardsXuToday(): number {
        const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 10);
        const reason = CoinService.QUIZ_HEALTH_REASON;
        let sum = 0;
        for (const h of this.coinData().history || []) {
            if (!h || String(h.reason || '').trim() !== reason) continue;
            if (!h.date) continue;
            try {
                const vn = new Date(h.date as Date | string)
                    .toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
                    .slice(0, 10);
                if (vn !== today) continue;
                const amt = Number(h.amount) || 0;
                if (amt > 0) sum += amt;
            } catch {
                /* ignore */
            }
        }
        return sum;
    }

    /**
     * Hết lượt thưởng bài test trong ngày: đủ 2 lần hoặc đủ 100 xu (cùng ngày VN).
     * Sang ngày mới (theo múi giờ VN) lịch sử không còn khớp “hôm nay” → badge/nút lại vàng.
     */
    isQuizHealthDailyRewardCapReached(): boolean {
        if (this.countQuizHealthRewardsToday() >= 2) return true;
        if (this.sumQuizHealthRewardsXuToday() >= CoinService.QUIZ_HEALTH_DAILY_MAX_XU) return true;
        return false;
    }

    private getRewardForStreak(streak: number): number {
        const s = Math.max(1, Math.floor(Number(streak) || 0));
        if (s === 1) return 50;
        if (s === 2) return 100;
        if (s === 3) return 200;
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
