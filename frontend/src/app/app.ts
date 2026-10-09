import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthSessionService } from './core/auth/auth-session.service';
import { AppFooter } from './shared/layout/app-footer/app-footer';
import { AppHeader } from './shared/layout/app-header/app-header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppHeader, AppFooter],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly session = inject(AuthSessionService);

  constructor() {
    this.session.ensureInitialized().subscribe();
  }
}
