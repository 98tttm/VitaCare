import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Info } from '../info/info';
import { Orders } from '../orders/orders';
import { Prescriptions } from '../prescriptions/prescriptions';
import { Addresses } from '../addresses/addresses';
import { Reviews } from '../reviews/reviews';
import { Returns } from '../returns/returns';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, Info, Orders, Prescriptions, Addresses, Reviews, Returns],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account {
  // User Data
  userName: string = 'Huỳnh Hương';
  userPhone: string = '0965813408';
  userAvatar: string = 'assets/icon/customer.png';

  // Active Menu
  activeMenu: string = 'info';

  // Notification Count
  notificationCount: number = 2;

  setActiveMenu(menu: string, event: Event): void {
    event.preventDefault();
    this.activeMenu = menu;
  }

  logout(): void {
    // Handle logout logic
    console.log('Logging out...');
  }
}
