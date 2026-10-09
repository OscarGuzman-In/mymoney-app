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
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { CategoriesApiService } from '../../core/api/categories-api.service';
import { CurrenciesApiService } from '../../core/api/currencies-api.service';
import { MovementsApiService } from '../../core/api/movements-api.service';
import { toUserMessage } from '../../core/http/api-error.util';
import { Account } from '../../core/models/account.model';
import { Category } from '../../core/models/category.model';
import { Currency } from '../../core/models/currency.model';
import {
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  Movement,
  MovementFilters,
  MovementType,
} from '../../core/models/movement.model';
import { formatDate, todayInputValue } from '../../core/util/date.util';
import { formatMoney } from '../../core/util/money.util';
import { Badge } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-movements',
  imports: [ReactiveFormsModule, PageHeader, EmptyState, Badge],
  templateUrl: './movements.html',
  styleUrl: './movements.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Movements implements OnInit {
  private readonly api = inject(MovementsApiService);
  private readonly accountsApi = inject(AccountsApiService);
  private readonly categoriesApi = inject(CategoriesApiService);
  private readonly currenciesApi = inject(CurrenciesApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly types = MOVEMENT_TYPES;
  readonly typeLabels = MOVEMENT_TYPE_LABELS;
  readonly formatDate = formatDate;
  readonly formatMoney = formatMoney;
  readonly today = todayInputValue();

  readonly movements = signal<Movement[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly currencies = signal<Currency[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly formType = signal<MovementType>('expense');
  readonly formAccountId = signal('');

  readonly accountById = computed(
    () => new Map(this.accounts().map((item) => [item.id, item])),
  );
  readonly categoryById = computed(
    () => new Map(this.categories().map((item) => [item.id, item])),
  );
  readonly currencyById = computed(
    () => new Map(this.currencies().map((item) => [item.id, item])),
  );

  readonly activeAccounts = computed(() =>
    this.accounts().filter((account) => account.is_active),
  );

  readonly categoryOptions = computed(() =>
    this.categories().filter(
      (category) =>
        category.is_active && category.type === this.formType(),
    ),
  );

  readonly transferTargets = computed(() => {
    const source = this.accountById().get(this.formAccountId());
    if (!source) {
      return [];
    }
    return this.activeAccounts().filter(
      (account) =>
        account.id !== source.id && account.currency_id === source.currency_id,
    );
  });

  readonly form = this.formBuilder.nonNullable.group({
    type: 'expense' as MovementType,
    account_id: ['', [Validators.required]],
    currency_id: ['', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    movement_date: [this.today, [Validators.required]],
    category_id: [''],
    transfer_account_id: [''],
    description: ['', [Validators.maxLength(500)]],
    reference: ['', [Validators.maxLength(100)]],
    notes: ['', [Validators.maxLength(1000)]],
  });

  readonly filters = this.formBuilder.nonNullable.group({
    account_id: '',
    category_id: '',
    type: '' as '' | MovementType,
    start_date: '',
    end_date: '',
  });

  constructor() {
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        this.formType.set(type);
        if (type === 'transfer') {
          this.form.controls.category_id.setValue('');
        } else {
          this.form.controls.transfer_account_id.setValue('');
        }
      });

    this.form.controls.account_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((accountId) => {
        this.formAccountId.set(accountId);
        const account = this.accountById().get(accountId);
        if (account) {
          this.form.controls.currency_id.setValue(account.currency_id, {
            emitEvent: false,
          });
        }
      });
  }

  ngOnInit(): void {
    this.loadReferenceData();
    this.loadMovements();
  }

  get amount() {
    return this.form.controls.amount;
  }

  get accountId() {
    return this.form.controls.account_id;
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      type: 'expense',
      account_id: '',
      currency_id: '',
      amount: 0,
      movement_date: this.today,
      category_id: '',
      transfer_account_id: '',
      description: '',
      reference: '',
      notes: '',
    });
    this.formType.set('expense');
    this.formAccountId.set('');
    this.formOpen.set(true);
  }

  openEdit(movement: Movement): void {
    this.editingId.set(movement.id);
    this.formError.set(null);
    this.form.reset({
      type: movement.type,
      account_id: movement.account_id,
      currency_id: movement.currency_id,
      amount: Number(movement.amount),
      movement_date: movement.movement_date.slice(0, 10),
      category_id: movement.category_id ?? '',
      transfer_account_id: movement.transfer_account_id ?? '',
      description: movement.description ?? '',
      reference: movement.reference ?? '',
      notes: movement.notes ?? '',
    });
    this.formType.set(movement.type);
    this.formAccountId.set(movement.account_id);
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
    if (value.type === 'transfer' && !value.transfer_account_id) {
      this.formError.set('Selecciona una cuenta destino para la transferencia.');
      return;
    }
    if (this.saving()) {
      return;
    }

    const editingId = this.editingId();
    this.saving.set(true);
    this.formError.set(null);

    const payload = {
      account_id: value.account_id,
      currency_id: value.currency_id,
      amount: value.amount,
      type: value.type,
      movement_date: value.movement_date,
      category_id:
        value.type !== 'transfer' && value.category_id
          ? value.category_id
          : null,
      transfer_account_id:
        value.type === 'transfer' ? value.transfer_account_id : null,
      description: value.description || undefined,
      reference: value.reference || undefined,
      notes: value.notes || undefined,
    };

    const request$ = editingId
      ? this.api.update(editingId, payload)
      : this.api.create(payload);

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: () => {
          this.formOpen.set(false);
          this.editingId.set(null);
          this.loadReferenceData();
          this.loadMovements();
        },
        error: (error: unknown) => this.formError.set(toUserMessage(error)),
      });
  }

  applyFilters(): void {
    const value = this.filters.getRawValue();
    const filters: MovementFilters = {};
    if (value.account_id) {
      filters.account_id = value.account_id;
    }
    if (value.category_id) {
      filters.category_id = value.category_id;
    }
    if (value.type) {
      filters.type = value.type;
    }
    if (value.start_date) {
      filters.start_date = value.start_date;
    }
    if (value.end_date) {
      filters.end_date = value.end_date;
    }
    this.loadMovements(filters);
  }

  clearFilters(): void {
    this.filters.reset({
      account_id: '',
      category_id: '',
      type: '',
      start_date: '',
      end_date: '',
    });
    this.loadMovements();
  }

  categoryName(movement: Movement): string {
    if (!movement.category_id) {
      return '—';
    }
    return this.categoryById().get(movement.category_id)?.name ?? '—';
  }

  currencyOf(movement: Movement): Currency | undefined {
    return this.currencyById().get(movement.currency_id);
  }

  amountTone(type: MovementType): string {
    return type === 'income' ? 'positive' : type === 'expense' ? 'negative' : 'neutral';
  }

  private loadReferenceData(): void {
    forkJoin({
      accounts: this.accountsApi.list(),
      categories: this.categoriesApi.list(),
      currencies: this.currenciesApi.list(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ accounts, categories, currencies }) => {
          this.accounts.set(accounts);
          this.categories.set(categories);
          this.currencies.set(currencies);
        },
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  private loadMovements(filters: MovementFilters = {}): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list(filters)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (movements) => this.movements.set(movements),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }
}
