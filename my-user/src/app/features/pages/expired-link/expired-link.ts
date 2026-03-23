import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-expired-link',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './expired-link.html',
    styleUrls: ['./expired-link.css'],
})
export class ExpiredLink {
}
