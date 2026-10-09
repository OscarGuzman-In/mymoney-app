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
import { CurrenciesApiService } from '../../core/api/currencies-api.service';
import { toUserMessage } from '../../core/http/api-error.util';
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  Account,
  AccountType,
} from '../../core/models/account.model';
import { Currency } from '../../core/models/currency.model';
import { formatMoney } from '../../core/util/money.util';
import { Badge } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-accounts',
  imports: [ReactiveFormsModule, PageHeader, EmptyState, Badge],
  templateUrl: './accounts.html',
  styleUrl: './accounts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Accounts implements OnInit {
  private readonly api = inject(AccountsApiService);
  private readonly currenciesApi = inject(CurrenciesApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly accountTypes = ACCOUNT_TYPES;
  readonly typeLabels = ACCOUNT_TYPE_LABELS;
  readonly formatMoney = formatMoney;

  readonly accounts = signal<Account[]>([]);
  readonly currencies = signal<Currency[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly currencyById = computed(
    () => new Map(this.currencies().map((item) => [item.id, item])),
  );

  readonly activeAccounts = computed(() =>
    this.accounts().filter((account) => account.is_active),
  );

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['cash' as AccountType, [Validators.required]],
    currency_id: ['', [Validators.required]],
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

  openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.controls.currency_id.enable({ emitEvent: false });
    this.form.reset({ name: '', type: 'cash', currency_id: '', description: '' });
    this.formOpen.set(true);
  }

  openEdit(account: Account): void {
    this.editingId.set(account.id);
    this.formError.set(null);
    this.form.reset({
      name: account.name,
      type: account.type,
      currency_id: account.currency_id,
      description: account.description ?? '',
    });
    this.form.controls.currency_id.disable({ emitEvent: false });
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.formError.set(null);
    this.form.controls.currency_id.enable({ emitEvent: false });
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
          type: value.type,
          description: value.description || null,
        })
      : this.api.create({
          name: value.name,
          type: value.type,
          currency_id: value.currency_id,
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

  deactivate(account: Account): void {
    const confirmed = window.confirm(
      `¿Desactivar la cuenta "${account.name}"? Podrás seguir consultando su historial.`,
    );
    if (!confirmed) {
      return;
    }
    this.api
      .deactivate(account.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  currencyOf(account: Account): Currency | undefined {
    return this.currencyById().get(account.currency_id);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      accounts: this.api.list(),
      currencies: this.currenciesApi.list(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ accounts, currencies }) => {
          this.accounts.set(accounts);
          this.currencies.set(currencies);
        },
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }
}
