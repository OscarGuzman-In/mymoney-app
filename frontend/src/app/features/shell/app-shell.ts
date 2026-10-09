import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthSessionService } from '../../core/auth/auth-session.service';

interface NavItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly user = this.session.user;

  readonly navItems: readonly NavItem[] = [
    { label: 'Resumen', path: 'dashboard' },
    { label: 'Cuentas', path: 'accounts' },
    { label: 'Movimientos', path: 'movements' },
    { label: 'Categorías', path: 'categories' },
    { label: 'Presupuestos', path: 'budgets' },
    { label: 'Metas de ahorro', path: 'savings-goals' },
    { label: 'Deudas', path: 'debts' },
    { label: 'Perfil', path: 'profile' },
  ];

  logout(): void {
    this.session.logout().subscribe(() => {
      void this.router.navigateByUrl('/login');
    });
  }
}
