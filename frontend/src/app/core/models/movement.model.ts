export type MovementType = 'income' | 'expense' | 'transfer';

export const MOVEMENT_TYPES: readonly MovementType[] = [
  'income',
  'expense',
  'transfer',
];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
};

export interface Movement {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  payment_method_id: string | null;
  currency_id: string;
  transfer_account_id: string | null;
  amount: string;
  type: MovementType;
  description: string | null;
  movement_date: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMovementRequest {
  account_id: string;
  currency_id: string;
  amount: number;
  type: MovementType;
  movement_date: string;
  category_id?: string | null;
  transfer_account_id?: string | null;
  description?: string;
  reference?: string;
  notes?: string;
}

export interface UpdateMovementRequest {
  account_id?: string;
  currency_id?: string;
  amount?: number;
  type?: MovementType;
  movement_date?: string;
  category_id?: string | null;
  transfer_account_id?: string | null;
  description?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface MovementFilters {
  account_id?: string;
  category_id?: string;
  type?: MovementType;
  start_date?: string;
  end_date?: string;
}
