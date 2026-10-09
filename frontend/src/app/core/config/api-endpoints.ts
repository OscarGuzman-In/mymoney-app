export const API_ENDPOINTS = {
  auth: {
    register: 'auth/register',
    login: 'auth/login',
    me: 'auth/me',
    refresh: 'auth/refresh',
    logout: 'auth/logout',
  },
  users: {
    me: 'users/me',
    password: 'users/me/password',
  },
  currencies: 'currencies',
  accounts: 'accounts',
  categories: 'categories',
  movements: 'movements',
  budgets: 'budgets',
  savingsGoals: 'savings-goals',
  debts: 'debts',
  dashboard: {
    summary: 'dashboard/summary',
    expensesByCategory: 'dashboard/expenses-by-category',
    monthlyTrend: 'dashboard/monthly-trend',
    recentMovements: 'dashboard/recent-movements',
  },
} as const;
