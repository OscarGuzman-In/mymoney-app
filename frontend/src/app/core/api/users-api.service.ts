import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import {
  ChangePasswordRequest,
  SafeUser,
  UpdateProfileRequest,
} from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/${API_ENDPOINTS.users.me}`;

  me(): Observable<SafeUser> {
    return this.http.get<SafeUser>(this.baseUrl);
  }

  updateProfile(payload: UpdateProfileRequest): Observable<SafeUser> {
    return this.http.patch<SafeUser>(this.baseUrl, payload);
  }

  changePassword(payload: ChangePasswordRequest): Observable<{
    success: boolean;
  }> {
    return this.http.patch<{ success: boolean }>(
      `${environment.apiBaseUrl}/${API_ENDPOINTS.users.password}`,
      payload,
    );
  }
}
