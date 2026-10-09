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
import { DebtsApiService } from '../../core/api/debts-api.service';
import { toUserMessage } from '../../core/http/api-error.util';
import { Currency } from '../../core/models/currency.model';
import {
  DEBT_STATUSES,
  DEBT_STATUS_LABELS,
  Debt,
  DebtPayment,
  DebtStatus,
} from '../../core/models/debt.model';
import { formatDate, todayInputValue } from '../../core/util/date.util';
import { formatMoney, progressPercent, toNumber } from '../../core/util/money.util';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-debts',
  imports: [ReactiveFormsModule, PageHeader, EmptyState, Badge],
  templateUrl: './debts.html',
  styleUrl: './debts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Debts implements OnInit {
  private readonly api = inject(DebtsApiService);
  private readonly currenciesApi = inject(CurrenciesApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = DEBT_STATUSES;
  readonly statusLabels = DEBT_STATUS_LABELS;
  readonly formatDate = formatDate;
  readonly formatMoney = formatMoney;
  readonly today = todayInputValue();

  readonly debts = signal<Debt[]>([]);
  readonly currencies = signal<Currency[]>([]);
  readonly payments = signal<DebtPayment[]>([]);
  readonly selectedDebtId = signal<string | null>(null);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly paying = signal(false);
  readonly paymentError = signal<string | null>(null);

  readonly currencyById = computed(
    () => new Map(this.currencies().map((item) => [item.id, item])),
  );

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    currency_id: ['', [Validators.required]],
    original_amount: [0, [Validators.required, Validators.min(0.01)]],
    remaining_amount: [0, [Validators.min(0)]],
    due_date: [this.today, [Validators.required]],
    status: ['active' as DebtStatus, [Validators.required]],
    description: ['', [Validators.maxLength(500)]],
  });

  readonly paymentForm = this.formBuilder.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    payment_date: [this.today, [Validators.required]],
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

  get originalAmount() {
    return this.form.controls.original_amount;
  }

  statusTone(status: DebtStatus): BadgeTone {
    switch (status) {
      case 'paid':
        return 'positive';
      case 'overdue':
        return 'negative';
      case 'cancelled':
        return 'neutral';
      default:
        return 'warning';
    }
  }

  paidPercent(debt: Debt): number {
    const original = toNumber(debt.original_amount);
    if (original <= 0) {
      return 0;
    }
    const remaining = toNumber(debt.remaining_amount);
    return progressPercent(original - remaining, original);
  }

  currencyOf(debt: Debt): Currency | undefined {
    return this.currencyById().get(debt.currency_id);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      name: '',
      currency_id: '',
      original_amount: 0,
      remaining_amount: 0,
      due_date: this.today,
      status: 'active',
      description: '',
    });
    this.formOpen.set(true);
  }

  openEdit(debt: Debt): void {
    this.editingId.set(debt.id);
    this.formError.set(null);
    this.form.reset({
      name: debt.name,
      currency_id: debt.currency_id,
      original_amount: Number(debt.original_amount),
      remaining_amount: Number(debt.remaining_amount),
      due_date: debt.due_date.slice(0, 10),
      status: debt.status,
      description: debt.description ?? '',
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
    const value = this.form.getRawValue();
    if (value.remaining_amount > value.original_amount) {
      this.formError.set(
        'El saldo pendiente no puede superar el monto original.',
      );
      return;
    }
    if (this.saving()) {
      return;
    }

    const editingId = this.editingId();
    this.saving.set(true);
    this.formError.set(null);

    const request$ = editingId
      ? this.api.update(editingId, {
          name: value.name,
          currency_id: value.currency_id,
          original_amount: value.original_amount,
          remaining_amount: value.remaining_amount,
          due_date: value.due_date,
          status: value.status,
          description: value.description || null,
        })
      : this.api.create({
          name: value.name,
          currency_id: value.currency_id,
          original_amount: value.original_amount,
          remaining_amount: value.remaining_amount,
          due_date: value.due_date,
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

  togglePayments(debt: Debt): void {
    if (this.selectedDebtId() === debt.id) {
      this.selectedDebtId.set(null);
      this.payments.set([]);
      return;
    }
    this.selectedDebtId.set(debt.id);
    this.paymentForm.reset({
      amount: 0,
      payment_date: this.today,
      notes: '',
    });
    this.paymentError.set(null);
    this.loadPayments(debt.id);
  }

  addPayment(debt: Debt): void {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    if (this.paying()) {
      return;
    }
    const value = this.paymentForm.getRawValue();
    this.paying.set(true);
    this.paymentError.set(null);
    this.api
      .addPayment(debt.id, {
        amount: value.amount,
        payment_date: value.payment_date,
        notes: value.notes || undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.paying.set(false)),
      )
      .subscribe({
        next: () => {
          this.paymentForm.reset({
            amount: 0,
            payment_date: this.today,
            notes: '',
          });
          this.load();
          this.loadPayments(debt.id);
        },
        error: (error: unknown) => this.paymentError.set(toUserMessage(error)),
      });
  }

  deactivate(debt: Debt): void {
    const confirmed = window.confirm(`¿Desactivar la deuda "${debt.name}"?`);
    if (!confirmed) {
      return;
    }
    this.api
      .deactivate(debt.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  private loadPayments(debtId: string): void {
    this.api
      .listPayments(debtId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payments) => this.payments.set(payments),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      debts: this.api.list(),
      currencies: this.currenciesApi.list(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ debts, currencies }) => {
          this.debts.set(debts);
          this.currencies.set(currencies);
        },
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }
}
