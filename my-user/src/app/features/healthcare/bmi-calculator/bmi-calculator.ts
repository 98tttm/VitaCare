import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, catchError, finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { HealthApiService } from '../../../core/services/health-api.service';
import { BlogService } from '../../../core/services/blog.service';
import { ToastService } from '../../../core/services/toast.service';

const BASE = '/assets/images/health/';
const IMG_MAP: Record<string, string> = {
    underweight: BASE + 'bmi_thieu_can.jpg',
    normal: BASE + 'bmi_binh_thuong.jpg',
    overweight: BASE + 'bmi_thua_can.jpg',
    obese1: BASE + 'bmi_beo_phi_1.jpg',
    obese2: BASE + 'bmi_beo_phi_2.jpg',
    default: BASE + 'bmi_mau.jpg',
};

@Component({
    selector: 'app-bmi-calculator',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, DecimalPipe],
    templateUrl: './bmi-calculator.html',
    styleUrl: './bmi-calculator.css',
})
export class BmiCalculator implements OnInit {
    readonly authService = inject(AuthService);
    private healthApi = inject(HealthApiService);
    private blogService = inject(BlogService);
    private toastService = inject(ToastService);

    gender: 'male' | 'female' = 'female';
    dob = '';
    height = 165;
    weight = 55;

    bmiValue: number | null = null;
    bmrValue: number | null = null;
    bmiStatus = '';
    bmiStatusKey = '';
    bmiColorClass = '';

    // Ảnh hiện tại + trạng thái fade animation
    currentImagePath = signal(IMG_MAP['default']);
    imgSwitching = signal(false);
    private _lastStatusKey = '';

    /** Góc sức khỏe: gộp bài gợi ý BMI + BMR (không trùng), tối đa 5 bài */
    healthCornerBlogs = signal<any[]>([]);

    /** Popup sau khi lưu sổ sức khỏe thành công */
    showSaveSuccess = signal(false);
    saveInProgress = signal(false);

    ngOnInit(): void {
        this.calculate();
        this.fetchBlogs();
    }

    private fetchBlogs(): void {
        forkJoin({
            bmi: this.blogService
                .getBlogsByIndicator('bmi', 5)
                .pipe(catchError(() => of({ blogs: [] }))),
            bmr: this.blogService
                .getBlogsByIndicator('bmr', 5)
                .pipe(catchError(() => of({ blogs: [] }))),
        }).subscribe({
            next: ({ bmi, bmr }) => {
                const bmiList = Array.isArray(bmi?.blogs) ? bmi.blogs : [];
                const bmrList = Array.isArray(bmr?.blogs) ? bmr.blogs : [];
                this.healthCornerBlogs.set(this.mergeUniqueBlogs(bmiList, bmrList, 5));
            },
            error: () => this.healthCornerBlogs.set([]),
        });
    }

    private mergeUniqueBlogs(bmi: any[], bmr: any[], max: number): any[] {
        const seen = new Set<string>();
        const out: any[] = [];
        const pushUnique = (arr: any[]) => {
            for (const b of arr) {
                const id = String(b?._id ?? '').trim();
                const url = String(b?.url ?? '').trim();
                const key = id || url;
                if (!key || seen.has(key)) continue;
                seen.add(key);
                out.push(b);
                if (out.length >= max) return;
            }
        };
        pushUnique(bmi);
        pushUnique(bmr);
        return out;
    }

    getBlogImageUrl(blog: any): string {
        const url = blog?.primaryImage?.url ?? blog?.image ?? blog?.imageUrl;
        if (!url) return 'assets/images/homepage/blogs/ngu_ngon.jpg';
        if (url.startsWith('http') || url.startsWith('assets/')) return url;
        return url.startsWith('/') ? url : `/${url}`;
    }

    setGender(g: 'male' | 'female'): void {
        this.gender = g;
        this.calculate();
    }

    calculate(): void {
        const h = Number(this.height);
        const w = Number(this.weight);
        if (!h || !w || h < 50 || w < 10) {
            this.bmiValue = null;
            this.bmrValue = null;
            this.bmiStatus = '';
            this.bmiStatusKey = '';
            this.bmiColorClass = '';
            this._updateImage('default');
            return;
        }

        const hm = h / 100;
        this.bmiValue = w / (hm * hm);

        let newStatusKey: string;
        if (this.bmiValue < 18.5) {
            this.bmiStatus = 'Thiếu cân';
            newStatusKey = 'underweight';
            this.bmiColorClass = 'bmi-result-value--under';
        } else if (this.bmiValue < 23) {
            this.bmiStatus = 'Bình thường';
            newStatusKey = 'normal';
            this.bmiColorClass = 'bmi-result-value--normal';
        } else if (this.bmiValue < 25) {
            this.bmiStatus = 'Thừa cân';
            newStatusKey = 'overweight';
            this.bmiColorClass = 'bmi-result-value--over';
        } else if (this.bmiValue < 30) {
            this.bmiStatus = 'Béo phì độ I';
            newStatusKey = 'obese1';
            this.bmiColorClass = 'bmi-result-value--obese';
        } else {
            this.bmiStatus = 'Béo phì độ II';
            newStatusKey = 'obese2';
            this.bmiColorClass = 'bmi-result-value--obese2';
        }
        this.bmiStatusKey = newStatusKey;

        // BMR – Mifflin-St Jeor
        if (this.gender === 'male') {
            this.bmrValue = 10 * w + 6.25 * h - 5 * this.getAge() + 5;
        } else {
            this.bmrValue = 10 * w + 6.25 * h - 5 * this.getAge() - 161;
        }

        this._updateImage(newStatusKey);
    }

    /** Fade-out → ảnh mới → fade-in */
    private _updateImage(statusKey: string): void {
        const newPath = IMG_MAP[statusKey] ?? IMG_MAP['default'];
        if (this._lastStatusKey === statusKey) return; // không đổi thì bỏ qua
        this._lastStatusKey = statusKey;

        // Bước 1: fade out
        this.imgSwitching.set(true);
        setTimeout(() => {
            // Bước 2: đổi nguồn ảnh (trong khi ảnh đang mờ)
            this.currentImagePath.set(newPath);
            // Bước 3: fade in
            setTimeout(() => {
                this.imgSwitching.set(false);
            }, 50); // delay nhỏ để browser kịp paint src mới
        }, 300); // thời gian fade-out = 300ms
    }

    getAge(): number {
        if (!this.dob) return 25;
        const birth = new Date(this.dob);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age > 0 ? age : 25;
    }

    reset(): void {
        this.gender = 'female';
        this.dob = '';
        this.height = 165;
        this.weight = 55;
        this._lastStatusKey = '';
        this.calculate();
    }

    /** Khách vãng lai → mở đăng nhập/đăng ký; đã đăng nhập → lưu DB */
    onSaveClick(): void {
        if (!this.authService.currentUser()) {
            this.authService.openAuthModal();
            return;
        }
        if (this.bmiValue === null || this.bmrValue === null) {
            this.toastService.showError('Vui lòng nhập chiều cao và cân nặng hợp lệ để có chỉ số BMI/BMR trước khi lưu.');
            return;
        }
        this.save();
    }

    save(): void {
        const user = this.authService.currentUser();
        const uid = user?.user_id ?? (user as { id?: string })?.id;
        if (!uid || this.bmiValue === null || this.bmrValue === null) return;
        if (this.saveInProgress()) return;

        this.saveInProgress.set(true);
        this.healthApi
            .updateProfile({
                user_id: String(uid),
                bmi: Math.round(this.bmiValue * 100) / 100,
                bmiStatus: this.bmiStatus,
                bmr: Math.round(this.bmrValue),
                bmrStatus: this.getBmrStatus(),
            })
            .pipe(finalize(() => this.saveInProgress.set(false)))
            .subscribe({
                next: (res) => {
                    if (res.success) {
                        this.showSaveSuccess.set(true);
                    } else {
                        this.toastService.showError(res.message || 'Không lưu được sổ sức khỏe. Vui lòng thử lại.');
                    }
                },
                error: () => {
                    this.toastService.showError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
                },
            });
    }

    closeSaveSuccess(): void {
        this.showSaveSuccess.set(false);
    }

    private getBmrStatus(): string {
        if (!this.bmrValue) return '';
        if (this.bmrValue < 1200) return 'Thấp, nguy cơ';
        if (this.bmrValue < 1800) return 'Trung bình';
        return 'Cao';
    }
}
