import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import {
  Budget,
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from '../models/budget.model';

@Injectable({ providedIn: 'root' })
export class BudgetsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/${API_ENDPOINTS.budgets}`;

  list(): Observable<Budget[]> {
    return this.http.get<Budget[]>(this.baseUrl);
  }

  get(id: string): Observable<Budget> {
    return this.http.get<Budget>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateBudgetRequest): Observable<Budget> {
    return this.http.post<Budget>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateBudgetRequest): Observable<Budget> {
    return this.http.patch<Budget>(`${this.baseUrl}/${id}`, payload);
  }

  deactivate(id: string): Observable<Budget> {
    return this.http.patch<Budget>(`${this.baseUrl}/${id}/deactivate`, {});
  }
}
