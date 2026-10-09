import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { CurrenciesApiService } from '../../core/api/currencies-api.service';
import { Account } from '../../core/models/account.model';
import { Currency } from '../../core/models/currency.model';
import { Accounts } from './accounts';

const USD: Currency = {
  id: 'cur-1',
  code: 'USD',
  name: 'Dólar estadounidense',
  symbol: '$',
};

const ACCOUNT: Account = {
  id: 'acc-1',
  user_id: 'user-1',
  currency_id: 'cur-1',
  name: 'Efectivo',
  type: 'cash',
  description: null,
  balance: '150.00',
  is_active: true,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('Accounts', () => {
  let fixture: ComponentFixture<Accounts>;
  let list: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let deactivate: ReturnType<typeof vi.fn>;

  function create_(): void {
    list = vi.fn(() => of([ACCOUNT]));
    create = vi.fn(() => of(ACCOUNT));
    deactivate = vi.fn(() => of({ ...ACCOUNT, is_active: false }));

    TestBed.configureTestingModule({
      imports: [Accounts],
      providers: [
        { provide: AccountsApiService, useValue: { list, create, deactivate } },
        { provide: CurrenciesApiService, useValue: { list: () => of([USD]) } },
      ],
    });

    fixture = TestBed.createComponent(Accounts);
    fixture.detectChanges();
  }

  it('renders the user accounts', () => {
    create_();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Efectivo');
    expect(text).toContain('USD');
  });

  it('creates an account from the form', () => {
    create_();
    const component = fixture.componentInstance;
    component.openCreate();
    fixture.detectChanges();

    component.form.patchValue({
      name: 'Ahorros',
      type: 'savings_account',
      currency_id: 'cur-1',
    });
    component.submit();

    expect(create).toHaveBeenCalledWith({
      name: 'Ahorros',
      type: 'savings_account',
      currency_id: 'cur-1',
      description: undefined,
    });
  });

  it('does not submit an invalid form', () => {
    create_();
    const component = fixture.componentInstance;
    component.openCreate();
    component.submit();

    expect(create).not.toHaveBeenCalled();
  });

  it('deactivates an account after confirmation', () => {
    create_();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const component = fixture.componentInstance;

    component.deactivate(ACCOUNT);

    expect(deactivate).toHaveBeenCalledWith('acc-1');
  });
});
