import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { Account } from '../models/account.model';
import { AccountsApiService } from './accounts-api.service';

const BASE = `${environment.apiBaseUrl}/accounts`;

const ACCOUNT: Account = {
  id: 'acc-1',
  user_id: 'user-1',
  currency_id: 'cur-1',
  name: 'Efectivo',
  type: 'cash',
  description: null,
  balance: '0',
  is_active: true,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('AccountsApiService', () => {
  let service: AccountsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AccountsApiService,
      ],
    });
    service = TestBed.inject(AccountsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists accounts', () => {
    service.list().subscribe((accounts) => {
      expect(accounts).toEqual([ACCOUNT]);
    });

    const request = httpMock.expectOne(BASE);
    expect(request.request.method).toBe('GET');
    request.flush([ACCOUNT]);
  });

  it('creates an account', () => {
    const payload = {
      name: 'Efectivo',
      type: 'cash' as const,
      currency_id: 'cur-1',
    };

    service.create(payload).subscribe((account) => {
      expect(account).toEqual(ACCOUNT);
    });

    const request = httpMock.expectOne(BASE);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush(ACCOUNT);
  });

  it('deactivates an account through the dedicated endpoint', () => {
    service.deactivate('acc-1').subscribe();

    const request = httpMock.expectOne(`${BASE}/acc-1/deactivate`);
    expect(request.request.method).toBe('PATCH');
    request.flush({ ...ACCOUNT, is_active: false });
  });
});
