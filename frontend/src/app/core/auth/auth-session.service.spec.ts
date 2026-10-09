import {
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokens } from '../models/auth.model';
import { SafeUser } from '../models/user.model';
import { AuthSessionService } from './auth-session.service';
import { TokenStorageService } from './token-storage.service';

const BASE = environment.apiBaseUrl;

const TOKENS: AuthTokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_type: 'Bearer',
  expires_in: 1800,
};

const USER: SafeUser = {
  id: 'user-1',
  email: 'ana@example.com',
  first_name: 'Ana',
  last_name: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('AuthSessionService', () => {
  let service: AuthSessionService;
  let storage: TokenStorageService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthSessionService);
    storage = TestBed.inject(TokenStorageService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('stores tokens and loads the current user on login', async () => {
    const promise = firstValueFrom(
      service.login({ email: 'ana@example.com', password: 'Password123' }),
    );

    const loginRequest = httpMock.expectOne(`${BASE}/auth/login`);
    expect(loginRequest.request.method).toBe('POST');
    expect(loginRequest.request.body).toEqual({
      email: 'ana@example.com',
      password: 'Password123',
    });
    loginRequest.flush(TOKENS);

    const meRequest = httpMock.expectOne(`${BASE}/auth/me`);
    meRequest.flush(USER);

    expect(await promise).toEqual(USER);
    expect(storage.getAccessToken()).toBe('access-1');
    expect(storage.getRefreshToken()).toBe('refresh-1');
    expect(service.user()).toEqual(USER);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('keeps the session empty when login is rejected', async () => {
    const promise = firstValueFrom(
      service.login({ email: 'ana@example.com', password: 'wrong' }),
    );

    httpMock.expectOne(`${BASE}/auth/login`).flush(
      { statusCode: 401, message: 'Credenciales inválidas' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await expect(promise).rejects.toBeTruthy();
    expect(service.isAuthenticated()).toBe(false);
    expect(storage.getAccessToken()).toBeNull();
  });

  it('resolves false when there is nothing to restore', async () => {
    expect(await firstValueFrom(service.ensureInitialized())).toBe(false);
  });

  it('restores an authenticated user from stored tokens', async () => {
    storage.store(TOKENS);

    const promise = firstValueFrom(service.ensureInitialized());
    httpMock.expectOne(`${BASE}/auth/me`).flush(USER);

    expect(await promise).toBe(true);
    expect(service.user()).toEqual(USER);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('clears the session when restoration fails', async () => {
    storage.store(TOKENS);

    const promise = firstValueFrom(service.ensureInitialized());
    httpMock.expectOne(`${BASE}/auth/me`).flush(
      { statusCode: 401, message: 'Sesión no válida' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(await promise).toBe(false);
    expect(service.user()).toBeNull();
    expect(storage.getAccessToken()).toBeNull();
    expect(storage.getRefreshToken()).toBeNull();
  });

  it('shares a single refresh request across concurrent callers', async () => {
    storage.store(TOKENS);

    const first = firstValueFrom(service.refreshAccessToken());
    const second = firstValueFrom(service.refreshAccessToken());

    const requests = httpMock.match(`${BASE}/auth/refresh`);
    expect(requests).toHaveLength(1);
    expect(requests[0].request.body).toEqual({ refresh_token: 'refresh-1' });

    requests[0].flush({ ...TOKENS, access_token: 'access-2' });

    await Promise.all([first, second]);
    expect(storage.getAccessToken()).toBe('access-2');
  });

  it('clears the session even when the logout request fails', async () => {
    storage.store(TOKENS);

    const promise = firstValueFrom(service.logout());
    httpMock.expectOne(`${BASE}/auth/logout`).flush(
      { statusCode: 500, message: 'error' },
      { status: 500, statusText: 'Server Error' },
    );

    await promise;
    expect(storage.getAccessToken()).toBeNull();
    expect(storage.getRefreshToken()).toBeNull();
    expect(service.user()).toBeNull();
  });
});
