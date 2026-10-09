import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import {
  AuthTokens,
  LoginRequest,
  RegisterRequest,
} from '../models/auth.model';
import { SafeUser } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  login(payload: LoginRequest): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(
      `${this.baseUrl}/${API_ENDPOINTS.auth.login}`,
      payload,
    );
  }

  register(payload: RegisterRequest): Observable<SafeUser> {
    return this.http.post<SafeUser>(
      `${this.baseUrl}/${API_ENDPOINTS.auth.register}`,
      payload,
    );
  }

  me(): Observable<SafeUser> {
    return this.http.get<SafeUser>(
      `${this.baseUrl}/${API_ENDPOINTS.auth.me}`,
    );
  }

  refresh(refreshToken: string): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(
      `${this.baseUrl}/${API_ENDPOINTS.auth.refresh}`,
      { refresh_token: refreshToken },
    );
  }

  logout(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.baseUrl}/${API_ENDPOINTS.auth.logout}`,
      {},
    );
  }
}
