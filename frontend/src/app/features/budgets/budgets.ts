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
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { BudgetsApiService } from '../../core/api/budgets-api.service';
import { CategoriesApiService } from '../../core/api/categories-api.service';
import { CurrenciesApiService } from '../../core/api/currencies-api.service';
import { toUserMessage } from '../../core/http/api-error.util';
import {
  BUDGET_STATUSES,
  BUDGET_STATUS_LABELS,
  Budget,
  BudgetCategoryItem,
  BudgetStatus,
} from '../../core/models/budget.model';
import { Category } from '../../core/models/category.model';
import { Currency } from '../../core/models/currency.model';
import { formatDate } from '../../core/util/date.util';
import { formatMoney } from '../../core/util/money.util';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

interface CategoryDraft {
  category_id: string;
  amount: number;
}

@Component({
  selector: 'app-budgets',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    PageHeader,
    EmptyState,
    Badge,
  ],
  templateUrl: './budgets.html',
  styleUrl: './budgets.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Budgets implements OnInit {
  private readonly api = inject(BudgetsApiService);
  private readonly currenciesApi = inject(CurrenciesApiService);
  private readonly categoriesApi = inject(CategoriesApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = BUDGET_STATUSES;
  readonly statusLabels = BUDGET_STATUS_LABELS;
  readonly formatDate = formatDate;
  readonly formatMoney = formatMoney;

  readonly budgets = signal<Budget[]>([]);
  readonly currencies = signal<Currency[]>([]);
  readonly categories = signal<Category[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly categoryDrafts = signal<CategoryDraft[]>([]);

  readonly currencyById = computed(
    () => new Map(this.currencies().map((item) => [item.id, item])),
  );
  readonly categoryById = computed(
    () => new Map(this.categories().map((item) => [item.id, item])),
  );

  readonly expenseCategories = computed(() =>
    this.categories().filter(
      (category) => category.is_active && category.type === 'expense',
    ),
  );

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    currency_id: ['', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    start_date: [this.firstOfMonth(), [Validators.required]],
    end_date: [this.lastOfMonth(), [Validators.required]],
    status: ['active' as BudgetStatus, [Validators.required]],
    description: ['', [Validators.maxLength(500)]],
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

  get amount() {
    return this.form.controls.amount;
  }

  statusTone(status: BudgetStatus): BadgeTone {
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

  currencyOf(budget: Budget): Currency | undefined {
    return this.currencyById().get(budget.currency_id);
  }

  categoryName(categoryId: string): string {
    return this.categoryById().get(categoryId)?.name ?? 'Categoría';
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.categoryDrafts.set([]);
    this.form.reset({
      name: '',
      currency_id: '',
      amount: 0,
      start_date: this.firstOfMonth(),
      end_date: this.lastOfMonth(),
      status: 'active',
      description: '',
    });
    this.formOpen.set(true);
  }

  openEdit(budget: Budget): void {
    this.editingId.set(budget.id);
    this.formError.set(null);
    this.categoryDrafts.set(
      budget.budget_categories.map((item) => ({
        category_id: item.category_id,
        amount: Number(item.amount),
      })),
    );
    this.form.reset({
      name: budget.name,
      currency_id: budget.currency_id,
      amount: Number(budget.amount),
      start_date: budget.start_date.slice(0, 10),
      end_date: budget.end_date.slice(0, 10),
      status: budget.status,
      description: budget.description ?? '',
    });
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.formError.set(null);
  }

  addCategoryDraft(): void {
    this.categoryDrafts.update((drafts) => [
      ...drafts,
      { category_id: '', amount: 0 },
    ]);
  }

  updateDraft(
    index: number,
    field: keyof CategoryDraft,
    value: string | number,
  ): void {
    this.categoryDrafts.update((drafts) =>
      drafts.map((draft, current) =>
        current === index
          ? { ...draft, [field]: field === 'amount' ? Number(value) : value }
          : draft,
      ),
    );
  }

  removeCategoryDraft(index: number): void {
    this.categoryDrafts.update((drafts) =>
      drafts.filter((_, current) => current !== index),
    );
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.end_date < value.start_date) {
      this.formError.set('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }

    const drafts = this.categoryDrafts();
    if (drafts.some((draft) => !draft.category_id || draft.amount <= 0)) {
      this.formError.set(
        'Cada categoría del presupuesto requiere una categoría y un monto válido.',
      );
      return;
    }
    const duplicate = new Set(drafts.map((draft) => draft.category_id)).size;
    if (duplicate !== drafts.length) {
      this.formError.set('No puedes repetir una categoría en el presupuesto.');
      return;
    }

    if (this.saving()) {
      return;
    }

    const categories: BudgetCategoryItem[] = drafts.map((draft) => ({
      category_id: draft.category_id,
      amount: draft.amount,
    }));

    const editingId = this.editingId();
    this.saving.set(true);
    this.formError.set(null);

    const request$ = editingId
      ? this.api.update(editingId, {
          name: value.name,
          currency_id: value.currency_id,
          amount: value.amount,
          start_date: value.start_date,
          end_date: value.end_date,
          status: value.status,
          description: value.description || null,
          categories,
        })
      : this.api.create({
          name: value.name,
          currency_id: value.currency_id,
          amount: value.amount,
          start_date: value.start_date,
          end_date: value.end_date,
          status: value.status,
          description: value.description || undefined,
          categories,
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

  deactivate(budget: Budget): void {
    const confirmed = window.confirm(
      `¿Desactivar el presupuesto "${budget.name}"?`,
    );
    if (!confirmed) {
      return;
    }
    this.api
      .deactivate(budget.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      budgets: this.api.list(),
      currencies: this.currenciesApi.list(),
      categories: this.categoriesApi.list(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ budgets, currencies, categories }) => {
          this.budgets.set(budgets);
          this.currencies.set(currencies);
          this.categories.set(categories);
        },
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  private firstOfMonth(): string {
    return this.todayIso().slice(0, 8) + '01';
  }

  private lastOfMonth(): string {
    const now = new Date();
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return last.toISOString().slice(0, 10);
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
