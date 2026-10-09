import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { DashboardApiService } from '../../core/api/dashboard-api.service';
import { toUserMessage } from '../../core/http/api-error.util';
import { MOVEMENT_TYPE_LABELS } from '../../core/models/movement.model';
import {
  DashboardSummary,
  ExpenseByCategory,
  ExpensesByCategory,
  MonthlyTrend,
  RecentMovement,
} from '../../core/models/dashboard.model';
import {
  Period,
  formatDate,
  monthLabel,
  recentPeriods,
} from '../../core/util/date.util';
import { formatMoney, toNumber } from '../../core/util/money.util';
import { Badge } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatCard } from '../../shared/ui/stat-card/stat-card';

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, StatCard, PageHeader, EmptyState, Badge],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private readonly api = inject(DashboardApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly periods = recentPeriods(12).reverse();
  readonly monthLabel = monthLabel;
  readonly formatDate = formatDate;
  readonly toNumber = toNumber;
  readonly typeLabels = MOVEMENT_TYPE_LABELS;

  readonly selected = signal(this.periods[0]);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly expenses = signal<ExpenseByCategory[]>([]);
  readonly trend = signal<MonthlyTrend | null>(null);
  readonly recent = signal<RecentMovement[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly maxExpense = computed(() => {
    const totals = this.expenses().map((item) => toNumber(item.total));
    return totals.length ? Math.max(...totals) : 0;
  });

  readonly maxTrendNet = computed(() => {
    const trend = this.trend();
    if (!trend) {
      return 1;
    }
    const values = trend.trend.flatMap((period) =>
      period.totals_by_currency.map((item) => Math.abs(toNumber(item.net))),
    );
    return values.length ? Math.max(...values, 1) : 1;
  });

  ngOnInit(): void {
    this.load(this.selected());
  }

  onPeriodChange(value: string): void {
    const [year, month] = value.split('-').map(Number);
    const period: Period = { year, month };
    this.selected.set(period);
    this.load(period);
  }

  periodValue(period: Period): string {
    return `${period.year}-${String(period.month).padStart(2, '0')}`;
  }

  money(value: string | number, symbol?: string | null, code?: string | null) {
    return formatMoney(value, { symbol, code });
  }

  amountTone(value: string): 'positive' | 'negative' | 'neutral' {
    const numeric = toNumber(value);
    if (numeric > 0) {
      return 'positive';
    }
    if (numeric < 0) {
      return 'negative';
    }
    return 'neutral';
  }

  barWidth(total: string): number {
    const max = this.maxExpense();
    return max > 0 ? Math.round((toNumber(total) / max) * 100) : 0;
  }

  trendBarHeight(net: string): number {
    return Math.round((Math.abs(toNumber(net)) / this.maxTrendNet()) * 100);
  }

  private load(period: Period): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      summary: this.api.summary(period),
      expenses: this.api.expensesByCategory(period),
      trend: this.api.monthlyTrend(6),
      recent: this.api.recentMovements(8),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ summary, expenses, trend, recent }) => {
          this.summary.set(summary);
          this.expenses.set((expenses as ExpensesByCategory).expenses);
          this.trend.set(trend);
          this.recent.set(recent);
        },
        error: (error: unknown) => {
          this.error.set(toUserMessage(error));
        },
      });
  }
}
