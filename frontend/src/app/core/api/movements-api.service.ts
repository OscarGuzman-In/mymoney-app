import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import {
  CreateMovementRequest,
  Movement,
  MovementFilters,
  UpdateMovementRequest,
} from '../models/movement.model';

@Injectable({ providedIn: 'root' })
export class MovementsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/${API_ENDPOINTS.movements}`;

  list(filters: MovementFilters = {}): Observable<Movement[]> {
    let params = new HttpParams();
    if (filters.account_id) {
      params = params.set('account_id', filters.account_id);
    }
    if (filters.category_id) {
      params = params.set('category_id', filters.category_id);
    }
    if (filters.type) {
      params = params.set('type', filters.type);
    }
    if (filters.start_date) {
      params = params.set('start_date', filters.start_date);
    }
    if (filters.end_date) {
      params = params.set('end_date', filters.end_date);
    }
    return this.http.get<Movement[]>(this.baseUrl, { params });
  }

  get(id: string): Observable<Movement> {
    return this.http.get<Movement>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateMovementRequest): Observable<Movement> {
    return this.http.post<Movement>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateMovementRequest): Observable<Movement> {
    return this.http.patch<Movement>(`${this.baseUrl}/${id}`, payload);
  }
}
