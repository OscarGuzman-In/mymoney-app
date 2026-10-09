export type AccountType =
  | 'cash'
  | 'bank_account'
  | 'savings_account'
  | 'wallet';

export const ACCOUNT_TYPES: readonly AccountType[] = [
  'cash',
  'bank_account',
  'savings_account',
  'wallet',
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank_account: 'Cuenta bancaria',
  savings_account: 'Cuenta de ahorro',
  wallet: 'Billetera',
};

export interface Account {
  id: string;
  user_id: string;
  currency_id: string;
  name: string;
  type: AccountType;
  description: string | null;
  balance: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  currency_id: string;
  description?: string;
}

export interface UpdateAccountRequest {
  name?: string;
  type?: AccountType;
  description?: string | null;
}
