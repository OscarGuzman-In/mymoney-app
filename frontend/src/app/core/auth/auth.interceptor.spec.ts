import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthSessionService } from './auth-session.service';
import { authInterceptor } from './auth.interceptor';
import { TokenStorageService } from './token-storage.service';

const BASE = environment.apiBaseUrl;

const STORED_TOKENS = {
  access_token: 'stored-token',
  refresh_token: 'refresh-token',
  token_type: 'Bearer' as const,
  expires_in: 1800,
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let storage: TokenStorageService;
  let refreshAccessToken: ReturnType<typeof vi.fn>;
  let handleAuthFailure: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    refreshAccessToken = vi.fn();
    handleAuthFailure = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthSessionService,
          useValue: { refreshAccessToken, handleAuthFailure },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(TokenStorageService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the stored access token to outgoing requests', () => {
    storage.store(STORED_TOKENS);

    http.get(`${BASE}/accounts`).subscribe();
    const request = httpMock.expectOne(`${BASE}/accounts`);

    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer stored-token',
    );
    request.flush([]);
  });

  it('leaves auth endpoints without an Authorization header', () => {
    storage.store(STORED_TOKENS);

    http.post(`${BASE}/auth/login`, {}).subscribe();
    const request = httpMock.expectOne(`${BASE}/auth/login`);

    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('refreshes once and retries the failed request with the new token', async () => {
    storage.store(STORED_TOKENS);
    refreshAccessToken.mockImplementation(() => {
      storage.store({ ...STORED_TOKENS, access_token: 'fresh-token' });
      return of({ ...STORED_TOKENS, access_token: 'fresh-token' });
    });

    const promise = firstValueFrom(http.get<{ ok: boolean }>(`${BASE}/accounts`));

    const firstAttempt = httpMock.expectOne(`${BASE}/accounts`);
    expect(firstAttempt.request.headers.get('Authorization')).toBe(
      'Bearer stored-token',
    );
    firstAttempt.flush(null, { status: 401, statusText: 'Unauthorized' });

    await Promise.resolve();

    const retry = httpMock.expectOne(`${BASE}/accounts`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retry.flush({ ok: true });

    expect(await promise).toEqual({ ok: true });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a refresh for auth endpoints', () => {
    http.post(`${BASE}/auth/login`, {}).subscribe({ error: () => undefined });

    const request = httpMock.expectOne(`${BASE}/auth/login`);
    request.flush(
      { statusCode: 401 },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(handleAuthFailure).not.toHaveBeenCalled();
  });

  it('clears the session and surfaces the original error when refresh fails', async () => {
    storage.store(STORED_TOKENS);
    refreshAccessToken.mockReturnValue(throwError(() => new Error('no refresh')));

    const promise = firstValueFrom(http.get(`${BASE}/accounts`));
    httpMock.expectOne(`${BASE}/accounts`).flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(promise).rejects.toBeTruthy();
    expect(handleAuthFailure).toHaveBeenCalledTimes(1);
    expect(httpMock.match(`${BASE}/accounts`)).toHaveLength(0);
  });
});
