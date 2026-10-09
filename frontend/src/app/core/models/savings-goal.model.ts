export type SavingsGoalStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export const SAVINGS_GOAL_STATUSES: readonly SavingsGoalStatus[] = [
  'active',
  'paused',
  'completed',
  'cancelled',
];

export const SAVINGS_GOAL_STATUS_LABELS: Record<SavingsGoalStatus, string> = {
  active: 'Activa',
  paused: 'Pausada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export interface SavingsGoal {
  id: string;
  user_id: string;
  currency_id: string;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string;
  status: SavingsGoalStatus;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavingsGoalContribution {
  id: string;
  savings_goal_id: string;
  amount: string;
  contribution_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSavingsGoalRequest {
  name: string;
  currency_id: string;
  target_amount: number;
  target_date: string;
  status?: SavingsGoalStatus;
  description?: string;
}

export interface UpdateSavingsGoalRequest {
  name?: string;
  currency_id?: string;
  target_amount?: number;
  target_date?: string;
  status?: SavingsGoalStatus;
  description?: string | null;
}

export interface CreateContributionRequest {
  amount: number;
  contribution_date: string;
  notes?: string;
}
