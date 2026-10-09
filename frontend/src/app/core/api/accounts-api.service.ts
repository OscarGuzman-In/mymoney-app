import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import {
  Account,
  CreateAccountRequest,
  UpdateAccountRequest,
} from '../models/account.model';

@Injectable({ providedIn: 'root' })
export class AccountsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/${API_ENDPOINTS.accounts}`;

  list(): Observable<Account[]> {
    return this.http.get<Account[]>(this.baseUrl);
  }

  get(id: string): Observable<Account> {
    return this.http.get<Account>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateAccountRequest): Observable<Account> {
    return this.http.post<Account>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateAccountRequest): Observable<Account> {
    return this.http.patch<Account>(`${this.baseUrl}/${id}`, payload);
  }

  deactivate(id: string): Observable<Account> {
    return this.http.patch<Account>(`${this.baseUrl}/${id}/deactivate`, {});
  }
}
