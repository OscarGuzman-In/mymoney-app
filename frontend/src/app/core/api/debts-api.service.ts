import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import {
  CreateDebtPaymentRequest,
  CreateDebtRequest,
  Debt,
  DebtPayment,
  UpdateDebtRequest,
} from '../models/debt.model';

@Injectable({ providedIn: 'root' })
export class DebtsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/${API_ENDPOINTS.debts}`;

  list(): Observable<Debt[]> {
    return this.http.get<Debt[]>(this.baseUrl);
  }

  get(id: string): Observable<Debt> {
    return this.http.get<Debt>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateDebtRequest): Observable<Debt> {
    return this.http.post<Debt>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateDebtRequest): Observable<Debt> {
    return this.http.patch<Debt>(`${this.baseUrl}/${id}`, payload);
  }

  deactivate(id: string): Observable<Debt> {
    return this.http.patch<Debt>(`${this.baseUrl}/${id}/deactivate`, {});
  }

  listPayments(id: string): Observable<DebtPayment[]> {
    return this.http.get<DebtPayment[]>(`${this.baseUrl}/${id}/payments`);
  }

  addPayment(
    id: string,
    payload: CreateDebtPaymentRequest,
  ): Observable<DebtPayment> {
    return this.http.post<DebtPayment>(
      `${this.baseUrl}/${id}/payments`,
      payload,
    );
  }
}
