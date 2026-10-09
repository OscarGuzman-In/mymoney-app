import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { authGuard, guestGuard } from './auth.guard';

function configure(isAuthenticated: boolean): void {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthSessionService,
        useValue: { ensureInitialized: () => of(isAuthenticated) },
      },
    ],
  });
}

function runGuard(
  guard: typeof authGuard,
  url: string,
): Observable<boolean | UrlTree> {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(
    () => guard(route, state) as Observable<boolean | UrlTree>,
  );
}

describe('authGuard', () => {
  it('allows access when the user is authenticated', async () => {
    configure(true);
    expect(await firstValueFrom(runGuard(authGuard, '/app'))).toBe(true);
  });

  it('redirects to login with a returnUrl when unauthenticated', async () => {
    configure(false);
    const result = await firstValueFrom(runGuard(authGuard, '/app'));

    expect(result instanceof UrlTree).toBe(true);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/login');
    expect(tree.toString()).toContain('returnUrl=%2Fapp');
  });
});

describe('guestGuard', () => {
  it('allows access for unauthenticated visitors', async () => {
    configure(false);
    expect(await firstValueFrom(runGuard(guestGuard, '/login'))).toBe(true);
  });

  it('redirects authenticated users to the app', async () => {
    configure(true);
    const result = await firstValueFrom(runGuard(guestGuard, '/login'));

    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toBe('/app');
  });
});
