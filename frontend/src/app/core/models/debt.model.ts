export type DebtStatus = 'active' | 'paid' | 'overdue' | 'cancelled';

export const DEBT_STATUSES: readonly DebtStatus[] = [
  'active',
  'paid',
  'overdue',
  'cancelled',
];

export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  active: 'Activa',
  paid: 'Pagada',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
};

export interface Debt {
  id: string;
  user_id: string;
  currency_id: string;
  name: string;
  original_amount: string;
  remaining_amount: string;
  due_date: string;
  status: DebtStatus;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DebtPayment {
  id: string;
  debt_id: string;
  amount: string;
  payment_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDebtRequest {
  name: string;
  currency_id: string;
  original_amount: number;
  due_date: string;
  remaining_amount?: number;
  status?: DebtStatus;
  description?: string;
}

export interface UpdateDebtRequest {
  name?: string;
  currency_id?: string;
  original_amount?: number;
  remaining_amount?: number;
  due_date?: string;
  status?: DebtStatus;
  description?: string | null;
}

export interface CreateDebtPaymentRequest {
  amount: number;
  payment_date: string;
  notes?: string;
}
