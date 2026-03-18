import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HealthTestService, QuizResultReq } from '../../../core/services/health-test.service';
import { AuthService } from '../../../core/services/auth.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-health-test',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './health-test.html',
  styleUrls: ['./health-test.css']
})
export class HealthTestComponent implements OnInit {
  screen: 'list' | 'intro' | 'quiz' | 'register' | 'result' | 'history' = 'list';
  quizzes: any[] = [];
  selectedQuiz: any = null;
  currentQ: number = 0;
  answers: { [key: number]: string } = {};
  result: any = null;
  isLoggedIn: boolean = false; // Mock auth
  historyRecords: any[] = []; // Store history list

  tinhThanhList = [
    "An Giang", "Bà Rịa - Vũng Tàu", "Bạc Liêu", "Bắc Giang", "Bắc Kạn",
    "Bắc Ninh", "Bến Tre", "Bình Định", "Bình Dương", "Bình Phước",
    "Bình Thuận", "Cà Mau", "Cần Thơ", "Cao Bằng", "Đà Nẵng",
    "Đắk Lắk", "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp",
    "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội", "Hà Tĩnh",
    "Hải Dương", "Hải Phòng", "Hậu Giang", "Hòa Bình", "Hưng Yên",
    "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lâm Đồng",
    "Lạng Sơn", "Lào Cai", "Long An", "Nam Định", "Nghệ An",
    "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình",
    "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng",
    "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa",
    "Thừa Thiên Huế", "Tiền Giang", "TP. Hồ Chí Minh", "Trà Vinh", "Tuyên Quang",
    "Vĩnh Long", "Vĩnh Phúc", "Yên Bái"
  ];

  form = {
    name: '', province: '', phone: '', dob: '', gender: 'Nam', referralCode: '', agreed: true
  };
  formErrors: any = {};

  constructor(
    private healthTestService: HealthTestService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // Check auth status
    this.isLoggedIn = !!this.authService.currentUser();

    // Đồng nhất màu với trang chủ: một màu chủ đạo (vc-main + vc-main-bg)
    const unifiedColor = '#00589F';
    const unifiedBg = '#DAECFF';
    const quizUIMap: any = {
      '01_Benh_Hen': { icon: 'pulmonology', color: unifiedColor, bgColor: unifiedBg },
      '02_COPD_Man_Tinh': { icon: 'air', color: unifiedColor, bgColor: unifiedBg },
      '03_Lam_Dung_Thuoc_Hen': { icon: 'medication', color: unifiedColor, bgColor: unifiedBg },
      '04_GERD': { icon: 'info', color: unifiedColor, bgColor: unifiedBg },
      '05_Suy_Gian_Tinh_Mach': { icon: 'monitor_heart', color: unifiedColor, bgColor: unifiedBg },
      '09_Tri_Nho_TNmindtest': { icon: 'psychology', color: unifiedColor, bgColor: unifiedBg },
      '10_Tim_Mach_Than_Chuyen_Hoa': { icon: 'favorite', color: unifiedColor, bgColor: unifiedBg }
    };

    this.healthTestService.getQuizzes().subscribe({
      next: (data: any[]) => {
        this.quizzes = data.map(q => ({
          ...q,
          icon: quizUIMap[q.quiz_id]?.icon || 'quiz',
          color: quizUIMap[q.quiz_id]?.color || unifiedColor,
          bgColor: quizUIMap[q.quiz_id]?.bgColor || unifiedBg
        }));
        this.cdr.markForCheck();
        // Nếu vào từ trang chủ với ?quiz=xxx thì tự mở bài quiz đó
        const quizId = this.route.snapshot.queryParamMap.get('quiz');
        if (quizId) {
          const quiz = this.quizzes.find(q => (q.quiz_id || q.id) === quizId);
          if (quiz) this.startQuiz(quiz);
        }
      },
      error: (err: any) => console.error('Failed to load quizzes', err)
    });
  }

  startQuiz(quiz: any) {
    this.selectedQuiz = quiz;
    this.currentQ = 0;
    this.answers = {};
    this.result = null;
    this.screen = 'intro';
  }

  viewHistory(quiz: any, event: Event) {
    event.stopPropagation();
    this.selectedQuiz = quiz;

    // Check if user has mock auth
    if (!this.isLoggedIn) {
      alert("Vui lòng đăng nhập để xem lịch sử!");
      return;
    }

    this.healthTestService.getQuizHistory(quiz.quiz_id).subscribe({
      next: (data) => {
        this.historyRecords = data;
        this.screen = 'history';
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load history', err);
        alert("Lỗi khi tải lịch sử kiểm tra.");
      }
    });
  }

  beginQuiz() {
    this.screen = 'quiz';
  }

  handleAnswer(qId: number, value: string) {
    this.answers[qId] = value;
  }

  handleNext() {
    const questions = this.selectedQuiz.questions || [];
    if (this.currentQ < questions.length - 1) {
      this.currentQ++;
    } else {
      if (this.isLoggedIn) {
        this.finishQuiz();
      } else {
        this.screen = 'register';
      }
    }
  }

  handlePrev() {
    if (this.currentQ > 0) this.currentQ--;
  }

  calculateScore(): number {
    let yesCount = 0;
    this.selectedQuiz.questions.forEach((q: any) => {
      const answer = this.answers[q.id];
      if (!answer) return;
      if (answer === "A" && (q.options[0].text === "Có" || q.options[0].text === "0 ngày")) {
        if (q.options[0].text === "Có") yesCount++;
      } else if (q.options[0].text !== "Có" && q.options[0].text !== "0 ngày") {
        if (answer === "D" || answer === "E") yesCount++;
      } else if (q.options[0].text === "0 ngày") {
        if (answer !== "A") yesCount++;
      }
    });
    return yesCount;
  }

  finishQuiz() {
    const score = this.calculateScore();
    const res = (this.selectedQuiz.results || []).find((r: any) => {
      if (r?.condition?.operator === "<=") return score <= r.condition.value;
      if (r?.condition?.operator === ">") return score > r.condition.value;
      return false;
    });

    const finalRes = res || {
      id: "R_DEFAULT",
      condition: { operator: ">=", value: 0 },
      title: "Đã ghi nhận kết quả",
      description: "Thông tin của bạn đã được hệ thống ghi nhận. Vui lòng tham khảo ý kiến bác sĩ chuyên khoa để được tư vấn chính xác nhất.",
      isLow: score === 0
    };

    this.result = { ...finalRes, score };
    this.screen = 'result';

    // Submit to backend
    const req: QuizResultReq = {
      ...this.form,
      quiz_id: this.selectedQuiz.quiz_id,
      score: score,
      result_id: finalRes.id
    };
    this.healthTestService.submitResult(req).subscribe();
  }

  validateForm(): boolean {
    const errors: any = {};
    if (!this.form.name.trim()) errors.name = "Vui lòng nhập họ và tên";
    if (!this.form.province) errors.province = "Vui lòng chọn tỉnh/thành phố";
    if (!this.form.phone.trim()) errors.phone = "Vui lòng nhập số điện thoại";
    else if (!/^(0|\+84)[0-9]{9}$/.test(this.form.phone.trim())) errors.phone = "Số điện thoại không hợp lệ";
    if (!this.form.agreed) errors.agreed = "Vui lòng đồng ý với điều khoản";
    this.formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  handleSubmitReg() {
    if (this.validateForm()) {
      this.finishQuiz();
    }
  }

  resetAll() {
    this.screen = 'list';
    this.selectedQuiz = null;
    this.currentQ = 0;
    this.answers = {};
    this.result = null;
    this.historyRecords = [];
    this.form = { name: '', province: '', phone: '', dob: '', gender: 'Nam', referralCode: '', agreed: true };
    this.formErrors = {};
  }

  get currentQuestion() {
    return this.selectedQuiz?.questions ? this.selectedQuiz.questions[this.currentQ] : null;
  }

  get progress() {
    const totalQ = this.selectedQuiz?.questions?.length || 1;
    return this.selectedQuiz ? (this.currentQ / totalQ) * 100 : 0;
  }
}
