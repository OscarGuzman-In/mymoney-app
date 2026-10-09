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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { CurrenciesApiService } from '../../core/api/currencies-api.service';
import { SavingsGoalsApiService } from '../../core/api/savings-goals-api.service';
import { toUserMessage } from '../../core/http/api-error.util';
import { Currency } from '../../core/models/currency.model';
import {
  SAVINGS_GOAL_STATUSES,
  SAVINGS_GOAL_STATUS_LABELS,
  SavingsGoal,
  SavingsGoalContribution,
  SavingsGoalStatus,
} from '../../core/models/savings-goal.model';
import {
  formatDate,
  todayInputValue,
} from '../../core/util/date.util';
import { formatMoney, progressPercent } from '../../core/util/money.util';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-savings-goals',
  imports: [ReactiveFormsModule, PageHeader, EmptyState, Badge],
  templateUrl: './savings-goals.html',
  styleUrl: './savings-goals.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavingsGoals implements OnInit {
  private readonly api = inject(SavingsGoalsApiService);
  private readonly currenciesApi = inject(CurrenciesApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = SAVINGS_GOAL_STATUSES;
  readonly statusLabels = SAVINGS_GOAL_STATUS_LABELS;
  readonly formatDate = formatDate;
  readonly formatMoney = formatMoney;
  readonly today = todayInputValue();

  readonly goals = signal<SavingsGoal[]>([]);
  readonly currencies = signal<Currency[]>([]);
  readonly contributions = signal<SavingsGoalContribution[]>([]);
  readonly selectedGoalId = signal<string | null>(null);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly contributing = signal(false);
  readonly contributionError = signal<string | null>(null);

  readonly currencyById = computed(
    () => new Map(this.currencies().map((item) => [item.id, item])),
  );

  readonly selectedGoal = computed(() =>
    this.goals().find((goal) => goal.id === this.selectedGoalId()) ?? null,
  );

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    currency_id: ['', [Validators.required]],
    target_amount: [0, [Validators.required, Validators.min(0.01)]],
    target_date: [this.today, [Validators.required]],
    status: ['active' as SavingsGoalStatus, [Validators.required]],
    description: ['', [Validators.maxLength(500)]],
  });

  readonly contributionForm = this.formBuilder.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    contribution_date: [this.today, [Validators.required]],
    notes: ['', [Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    this.load();
  }

  get name() {
    return this.form.controls.name;
  }

  get currencyId() {
    return this.form.controls.currency_id;
  }

  get targetAmount() {
    return this.form.controls.target_amount;
  }

  statusTone(status: SavingsGoalStatus): BadgeTone {
    switch (status) {
      case 'active':
        return 'positive';
      case 'paused':
        return 'warning';
      case 'completed':
        return 'info';
      default:
        return 'neutral';
    }
  }

  progress(goal: SavingsGoal): number {
    return progressPercent(goal.current_amount, goal.target_amount);
  }

  currencyOf(goal: SavingsGoal): Currency | undefined {
    return this.currencyById().get(goal.currency_id);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      name: '',
      currency_id: '',
      target_amount: 0,
      target_date: this.today,
      status: 'active',
      description: '',
    });
    this.formOpen.set(true);
  }

  openEdit(goal: SavingsGoal): void {
    this.editingId.set(goal.id);
    this.formError.set(null);
    this.form.reset({
      name: goal.name,
      currency_id: goal.currency_id,
      target_amount: Number(goal.target_amount),
      target_date: goal.target_date.slice(0, 10),
      status: goal.status,
      description: goal.description ?? '',
    });
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.formError.set(null);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) {
      return;
    }
    const value = this.form.getRawValue();
    const editingId = this.editingId();
    this.saving.set(true);
    this.formError.set(null);

    const request$ = editingId
      ? this.api.update(editingId, {
          name: value.name,
          currency_id: value.currency_id,
          target_amount: value.target_amount,
          target_date: value.target_date,
          status: value.status,
          description: value.description || null,
        })
      : this.api.create({
          name: value.name,
          currency_id: value.currency_id,
          target_amount: value.target_amount,
          target_date: value.target_date,
          status: value.status,
          description: value.description || undefined,
        });

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: () => {
          this.formOpen.set(false);
          this.editingId.set(null);
          this.load();
        },
        error: (error: unknown) => this.formError.set(toUserMessage(error)),
      });
  }

  toggleContributions(goal: SavingsGoal): void {
    if (this.selectedGoalId() === goal.id) {
      this.selectedGoalId.set(null);
      this.contributions.set([]);
      return;
    }
    this.selectedGoalId.set(goal.id);
    this.contributionForm.reset({
      amount: 0,
      contribution_date: this.today,
      notes: '',
    });
    this.contributionError.set(null);
    this.loadContributions(goal.id);
  }

  addContribution(): void {
    const goalId = this.selectedGoalId();
    if (!goalId || this.contributionForm.invalid) {
      this.contributionForm.markAllAsTouched();
      return;
    }
    if (this.contributing()) {
      return;
    }
    const value = this.contributionForm.getRawValue();
    this.contributing.set(true);
    this.contributionError.set(null);
    this.api
      .addContribution(goalId, {
        amount: value.amount,
        contribution_date: value.contribution_date,
        notes: value.notes || undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.contributing.set(false)),
      )
      .subscribe({
        next: () => {
          this.contributionForm.reset({
            amount: 0,
            contribution_date: this.today,
            notes: '',
          });
          this.load();
          this.loadContributions(goalId);
        },
        error: (error: unknown) =>
          this.contributionError.set(toUserMessage(error)),
      });
  }

  complete(goal: SavingsGoal): void {
    this.api
      .complete(goal.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  deactivate(goal: SavingsGoal): void {
    const confirmed = window.confirm(`¿Desactivar la meta "${goal.name}"?`);
    if (!confirmed) {
      return;
    }
    this.api
      .deactivate(goal.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  private loadContributions(goalId: string): void {
    this.api
      .listContributions(goalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (contributions) => this.contributions.set(contributions),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      goals: this.api.list(),
      currencies: this.currenciesApi.list(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ goals, currencies }) => {
          this.goals.set(goals);
          this.currencies.set(currencies);
        },
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }
}
