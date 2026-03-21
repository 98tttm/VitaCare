import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-pharmacist-only-shell',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './pharmacist-only-shell.html',
  styleUrl: './pharmacist-only-shell.css',
})
export class PharmacistOnlyShell implements OnInit {
  isPharmacist = false;

  constructor(private auth: AuthService) {}

  ngOnInit(): void {
    this.isPharmacist = this.auth.isPharmacistAccount();
  }
}
