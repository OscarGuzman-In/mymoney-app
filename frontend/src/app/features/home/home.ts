import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSessionService } from '../../core/auth/auth-session.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly user = this.session.user;

  logout(): void {
    this.session.logout().subscribe(() => {
      void this.router.navigateByUrl('/login');
    });
  }
}
