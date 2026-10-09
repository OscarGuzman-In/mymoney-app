import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatCard, StatTrend } from '../../shared/ui/stat-card/stat-card';

interface PreviewStat {
  label: string;
  value: string;
  hint: string;
  trend: StatTrend;
}

interface Feature {
  title: string;
  description: string;
}

@Component({
  selector: 'app-landing',
  imports: [StatCard, RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  readonly previewStats: PreviewStat[] = [
    {
      label: 'Balance total',
      value: '$ 12.480,00',
      hint: 'Vista previa',
      trend: 'neutral',
    },
    {
      label: 'Ingresos del mes',
      value: '+ $ 3.200,00',
      hint: 'Vista previa',
      trend: 'positive',
    },
    {
      label: 'Gastos del mes',
      value: '- $ 1.940,00',
      hint: 'Vista previa',
      trend: 'negative',
    },
    {
      label: 'Metas activas',
      value: '3',
      hint: 'Vista previa',
      trend: 'neutral',
    },
  ];

  readonly features: Feature[] = [
    {
      title: 'Cuentas y saldos',
      description:
        'Organiza tus cuentas y consulta el saldo real derivado de tus movimientos.',
    },
    {
      title: 'Movimientos',
      description:
        'Registra ingresos, gastos y transferencias entre cuentas de forma consistente.',
    },
    {
      title: 'Presupuestos',
      description:
        'Define límites por categoría y sigue el avance de cada presupuesto.',
    },
    {
      title: 'Metas de ahorro',
      description:
        'Ahorra con objetivos claros y registra aportes periódicos.',
    },
    {
      title: 'Deudas',
      description: 'Controla tus deudas y mantén tus pagos al día.',
    },
    {
      title: 'Reportes',
      description:
        'Visualiza totales y tendencias separados por moneda, sin mezclar divisas.',
    },
  ];

  readonly upcoming: string[] = [
    'Autenticación con JWT y gestión de sesión.',
    'Conexión real con la API y datos del usuario.',
    'Gráficos, filtros y flujos completos del panel.',
  ];
}
