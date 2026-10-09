import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'MyMoney · Finanzas personales',
    loadComponent: () =>
      import('./features/landing/landing').then((module) => module.Landing),
  },
  {
    path: 'login',
    title: 'Iniciar sesión · MyMoney',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login').then((module) => module.Login),
  },
  {
    path: 'register',
    title: 'Crear cuenta · MyMoney',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register').then(
        (module) => module.Register,
      ),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/shell/app-shell').then((module) => module.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Resumen · MyMoney',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then(
            (module) => module.Dashboard,
          ),
      },
      {
        path: 'accounts',
        title: 'Cuentas · MyMoney',
        loadComponent: () =>
          import('./features/accounts/accounts').then(
            (module) => module.Accounts,
          ),
      },
      {
        path: 'movements',
        title: 'Movimientos · MyMoney',
        loadComponent: () =>
          import('./features/movements/movements').then(
            (module) => module.Movements,
          ),
      },
      {
        path: 'categories',
        title: 'Categorías · MyMoney',
        loadComponent: () =>
          import('./features/categories/categories').then(
            (module) => module.Categories,
          ),
      },
      {
        path: 'budgets',
        title: 'Presupuestos · MyMoney',
        loadComponent: () =>
          import('./features/budgets/budgets').then(
            (module) => module.Budgets,
          ),
      },
      {
        path: 'savings-goals',
        title: 'Metas de ahorro · MyMoney',
        loadComponent: () =>
          import('./features/savings-goals/savings-goals').then(
            (module) => module.SavingsGoals,
          ),
      },
      {
        path: 'debts',
        title: 'Deudas · MyMoney',
        loadComponent: () =>
          import('./features/debts/debts').then((module) => module.Debts),
      },
      {
        path: 'profile',
        title: 'Perfil · MyMoney',
        loadComponent: () =>
          import('./features/profile/profile').then((module) => module.Profile),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
