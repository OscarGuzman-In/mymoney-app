export type BudgetStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export const BUDGET_STATUSES: readonly BudgetStatus[] = [
  'active',
  'paused',
  'completed',
  'cancelled',
];

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export interface BudgetCategory {
  id: string;
  budget_id: string;
  category_id: string;
  amount: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategoryItem {
  category_id: string;
  amount: number;
}

export interface Budget {
  id: string;
  user_id: string;
  currency_id: string;
  name: string;
  amount: string;
  start_date: string;
  end_date: string;
  status: BudgetStatus;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  budget_categories: BudgetCategory[];
}

export interface CreateBudgetRequest {
  name: string;
  currency_id: string;
  amount: number;
  start_date: string;
  end_date: string;
  status?: BudgetStatus;
  description?: string;
  categories?: BudgetCategoryItem[];
}

export interface UpdateBudgetRequest {
  name?: string;
  currency_id?: string;
  amount?: number;
  start_date?: string;
  end_date?: string;
  status?: BudgetStatus;
  description?: string | null;
  categories?: BudgetCategoryItem[];
}
