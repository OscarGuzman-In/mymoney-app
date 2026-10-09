import { AccountType } from './account.model';
import { MovementType } from './movement.model';

export interface CurrencyBalance {
  currency_id: string;
  currency_code: string | null;
  symbol: string | null;
  total: string;
}

export interface CurrencyTotals {
  currency_id: string;
  currency_code: string | null;
  symbol: string | null;
  income: string;
  expenses: string;
  net: string;
}

export interface DashboardSummary {
  month: number;
  year: number;
  balances_by_currency: CurrencyBalance[];
  totals_by_currency: CurrencyTotals[];
  active_accounts_count: number;
  active_budgets_count: number;
  active_savings_goals_count: number;
}

export interface ExpenseByCategory {
  category_id: string | null;
  name: string | null;
  currency_id: string;
  currency_code: string | null;
  symbol: string | null;
  total: string;
}

export interface ExpensesByCategory {
  month: number;
  year: number;
  expenses: ExpenseByCategory[];
}

export interface MonthlyTrendPeriod {
  year: number;
  month: number;
  totals_by_currency: CurrencyTotals[];
}

export interface MonthlyTrend {
  months: number;
  trend: MonthlyTrendPeriod[];
}

export interface RecentMovement {
  id: string;
  type: MovementType;
  amount: string;
  movement_date: string;
  description: string | null;
  category: { id: string; name: string } | null;
  account: { id: string; name: string; type: AccountType } | null;
  currency: { id: string; code: string; symbol: string | null } | null;
}

export interface DashboardPeriodQuery {
  month?: number;
  year?: number;
}
