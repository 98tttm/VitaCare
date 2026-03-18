import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-loading-shipping',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './loading-shipping.html',
    styleUrl: './loading-shipping.css'
})
export class LoadingShippingComponent implements OnInit, OnDestroy {
    @Input() progress: number = 0;
    @Input() text: string = 'Đang xử lý...';

    // Internal progress for smoother animation if progress is not provided externally
    displayProgress: number = 0;
    private interval: any;

    ngOnInit(): void {
        if (this.progress === 0) {
            // Simulate progress if not provided
            this.simulateProgress();
        } else {
            this.displayProgress = this.progress;
        }
    }

    ngOnChanges(): void {
        if (this.progress > 0) {
            this.displayProgress = this.progress;
        }
    }

    private simulateProgress(): void {
        // Use a faster interval for smoother animation (approx 30fps)
        this.interval = setInterval(() => {
            if (this.displayProgress < 99) {
                let increment = 0;

                if (this.displayProgress < 30) {
                    // Start faster
                    increment = Math.random() * 0.8 + 0.5;
                } else if (this.displayProgress < 70) {
                    // Steady progress
                    increment = Math.random() * 0.4 + 0.2;
                } else if (this.displayProgress < 90) {
                    // Slowing down
                    increment = Math.random() * 0.2 + 0.05;
                } else {
                    // Crawling to 99%
                    increment = Math.random() * 0.05 + 0.01;
                }

                this.displayProgress += increment;

                // Cap at 99.9% but display as 99%
                if (this.displayProgress > 99) {
                    this.displayProgress = 99;
                }
            }
        }, 30);
    }

    ngOnDestroy(): void {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }
}
