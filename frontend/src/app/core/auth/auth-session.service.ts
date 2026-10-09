import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { AuthTokens, LoginRequest, RegisterRequest } from '../models/auth.model';
import { SafeUser } from '../models/user.model';
import { AuthApiService } from './auth-api.service';
import { TokenStorageService } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly api = inject(AuthApiService);
  private readonly tokens = inject(TokenStorageService);
  private readonly router = inject(Router);

  private readonly userState = signal<SafeUser | null>(null);
  private readonly generation = signal(0);

  readonly user = this.userState.asReadonly();
  readonly isAuthenticated = computed(() => this.userState() !== null);

  private init$: Observable<boolean> | null = null;
  private refresh$: Observable<AuthTokens> | null = null;

  login(credentials: LoginRequest): Observable<SafeUser> {
    return this.api.login(credentials).pipe(
      tap((tokens) => this.applyTokens(tokens)),
      switchMap(() => this.api.me()),
      tap((user) => {
        this.setUser(user);
        this.markInitialized();
      }),
    );
  }

  register(payload: RegisterRequest): Observable<SafeUser> {
    return this.api.register(payload);
  }

  refreshUser(): Observable<SafeUser> {
    return this.api.me().pipe(tap((user) => this.setUser(user)));
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(
      catchError(() => of({ success: false })),
      tap(() => this.clearSession()),
      map(() => undefined),
    );
  }

  ensureInitialized(): Observable<boolean> {
    if (!this.init$) {
      this.init$ = this.restore().pipe(shareReplay(1));
    }
    return this.init$;
  }

  refreshAccessToken(): Observable<AuthTokens> {
    if (this.refresh$) {
      return this.refresh$;
    }

    const refreshToken = this.tokens.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No hay una sesión activa'));
    }

    this.refresh$ = this.api.refresh(refreshToken).pipe(
      tap((tokens) => this.applyTokens(tokens)),
      finalize(() => {
        this.refresh$ = null;
      }),
      shareReplay(1),
    );

    return this.refresh$;
  }

  handleAuthFailure(): void {
    const returnUrl = this.router.url;
    const onProtectedRoute = returnUrl.startsWith('/app');
    this.clearSession();
    if (onProtectedRoute) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl } });
    }
  }

  private restore(): Observable<boolean> {
    const hasTokens =
      this.tokens.getAccessToken() !== null ||
      this.tokens.getRefreshToken() !== null;

    if (!hasTokens) {
      return of(false);
    }

    const generation = this.generation();

    return this.api.me().pipe(
      tap((user) => {
        if (generation === this.generation()) {
          this.setUser(user);
        }
      }),
      map(() => generation === this.generation()),
      catchError(() => {
        if (generation === this.generation()) {
          this.clearSession();
        }
        return of(false);
      }),
    );
  }

  private applyTokens(tokens: AuthTokens): void {
    this.tokens.store(tokens);
  }

  private setUser(user: SafeUser): void {
    this.userState.set(user);
  }

  private markInitialized(): void {
    this.init$ = of(true).pipe(shareReplay(1));
  }

  private clearSession(): void {
    this.generation.update((value) => value + 1);
    this.tokens.clear();
    this.userState.set(null);
    this.refresh$ = null;
    this.init$ = null;
  }
}
