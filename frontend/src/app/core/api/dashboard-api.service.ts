import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import {
  DashboardPeriodQuery,
  DashboardSummary,
  ExpensesByCategory,
  MonthlyTrend,
  RecentMovement,
} from '../models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  summary(query: DashboardPeriodQuery = {}): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(
      `${this.baseUrl}/${API_ENDPOINTS.dashboard.summary}`,
      { params: this.periodParams(query) },
    );
  }

  expensesByCategory(
    query: DashboardPeriodQuery = {},
  ): Observable<ExpensesByCategory> {
    return this.http.get<ExpensesByCategory>(
      `${this.baseUrl}/${API_ENDPOINTS.dashboard.expensesByCategory}`,
      { params: this.periodParams(query) },
    );
  }

  monthlyTrend(months = 6): Observable<MonthlyTrend> {
    return this.http.get<MonthlyTrend>(
      `${this.baseUrl}/${API_ENDPOINTS.dashboard.monthlyTrend}`,
      { params: new HttpParams().set('months', months) },
    );
  }

  recentMovements(limit = 10): Observable<RecentMovement[]> {
    return this.http.get<RecentMovement[]>(
      `${this.baseUrl}/${API_ENDPOINTS.dashboard.recentMovements}`,
      { params: new HttpParams().set('limit', limit) },
    );
  }

  private periodParams(query: DashboardPeriodQuery): HttpParams {
    let params = new HttpParams();
    if (query.month !== undefined) {
      params = params.set('month', query.month);
    }
    if (query.year !== undefined) {
      params = params.set('year', query.year);
    }
    return params;
  }
}
