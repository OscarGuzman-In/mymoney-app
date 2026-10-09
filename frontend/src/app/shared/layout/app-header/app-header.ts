import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly brand = 'MyMoney';
  readonly navItems = [
    { label: 'Resumen', href: '#resumen' },
    { label: 'Funciones', href: '#funciones' },
    { label: 'Próximamente', href: '#proximamente' },
  ];

  readonly isAuthenticated = this.session.isAuthenticated;
  readonly user = this.session.user;

  logout(): void {
    this.session.logout().subscribe(() => {
      void this.router.navigateByUrl('/login');
    });
  }
}
