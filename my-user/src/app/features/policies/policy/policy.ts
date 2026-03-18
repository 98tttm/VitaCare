import { Component } from '@angular/core';
<<<<<<< HEAD
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-policy',
  imports: [RouterLink, RouterLinkActive],
=======
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-policy',
  standalone: true,
  imports: [RouterModule],
>>>>>>> a0aa7c0be33fd0e1bcec128d8ed6cdba86ecfef3
  templateUrl: './policy.html',
  styleUrl: './policy.css',
})
export class Policy {

}
