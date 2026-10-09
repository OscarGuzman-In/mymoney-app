import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import {
  CreateContributionRequest,
  CreateSavingsGoalRequest,
  SavingsGoal,
  SavingsGoalContribution,
  UpdateSavingsGoalRequest,
} from '../models/savings-goal.model';

@Injectable({ providedIn: 'root' })
export class SavingsGoalsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/${API_ENDPOINTS.savingsGoals}`;

  list(): Observable<SavingsGoal[]> {
    return this.http.get<SavingsGoal[]>(this.baseUrl);
  }

  get(id: string): Observable<SavingsGoal> {
    return this.http.get<SavingsGoal>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateSavingsGoalRequest): Observable<SavingsGoal> {
    return this.http.post<SavingsGoal>(this.baseUrl, payload);
  }

  update(
    id: string,
    payload: UpdateSavingsGoalRequest,
  ): Observable<SavingsGoal> {
    return this.http.patch<SavingsGoal>(`${this.baseUrl}/${id}`, payload);
  }

  deactivate(id: string): Observable<SavingsGoal> {
    return this.http.patch<SavingsGoal>(
      `${this.baseUrl}/${id}/deactivate`,
      {},
    );
  }

  complete(id: string): Observable<SavingsGoal> {
    return this.http.patch<SavingsGoal>(`${this.baseUrl}/${id}/complete`, {});
  }

  listContributions(id: string): Observable<SavingsGoalContribution[]> {
    return this.http.get<SavingsGoalContribution[]>(
      `${this.baseUrl}/${id}/contributions`,
    );
  }

  addContribution(
    id: string,
    payload: CreateContributionRequest,
  ): Observable<SavingsGoalContribution> {
    return this.http.post<SavingsGoalContribution>(
      `${this.baseUrl}/${id}/contributions`,
      payload,
    );
  }
}
