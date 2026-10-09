import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import 'dotenv/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const TEST_JWT_SECRET = 'integration-test-jwt-secret-do-not-use-in-prod';
const REQUIRED_CURRENCY_CODES = [
  'ARS',
  'BRL',
  'CLP',
  'COP',
  'EUR',
  'MXN',
  'PEN',
  'USD',
];

function resolveTestDatabaseUrl(): string {
  const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!source) {
    throw new Error(
      'DATABASE_URL is required to derive the integration test database',
    );
  }
  const url = new URL(source);
  url.pathname = '/mymoney_bd_test';
  return url.toString();
}

const testDatabaseUrl = resolveTestDatabaseUrl();
const testDatabaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');

if (!testDatabaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run integration tests against "${testDatabaseName}": the target database name must end with "_test"`,
  );
}

const configStub = {
  get: (key: string): string | undefined => {
    if (key === 'DATABASE_URL') {
      return testDatabaseUrl;
    }
    if (key === 'JWT_SECRET') {
      return TEST_JWT_SECRET;
    }
    return undefined;
  },
  getOrThrow: (key: string): string => {
    const value =
      key === 'JWT_SECRET'
        ? TEST_JWT_SECRET
        : key === 'DATABASE_URL'
          ? testDatabaseUrl
          : undefined;
    if (value === undefined) {
      throw new TypeError(`Configuration key "${key}" does not exist`);
    }
    return value;
  },
} as unknown as ConfigService;

const ENABLED = process.env.RUN_DB_INTEGRATION === '1';
const describeIntegration = ENABLED ? describe : describe.skip;

interface MoneyBody {
  balance: string;
}

interface SummaryBody {
  balances_by_currency: Array<{
    currency_id: string;
    currency_code: string | null;
    total: string;
  }>;
  totals_by_currency: Array<{
    currency_code: string | null;
    income: string;
    expenses: string;
    net: string;
  }>;
}

interface ExpensesByCategoryBody {
  expenses: Array<{
    name: string | null;
    currency_code: string | null;
    total: string;
  }>;
}

describeIntegration('Real PostgreSQL integration', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let usdId: string;
  let eurId: string;
  const createdUserIds: string[] = [];

  const api = () => request(app.getHttpServer());

  async function registerAndLogin(
    email: string,
    password: string,
  ): Promise<{ token: string; userId: string }> {
    const registered = await api()
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    const userId = (registered.body as { id: string }).id;
    createdUserIds.push(userId);

    const loggedIn = await api()
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return {
      token: (loggedIn.body as { access_token: string }).access_token,
      userId,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(configStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const currencies = await prisma.currency.findMany();
    const byCode = new Map(currencies.map((item) => [item.code, item.id]));
    usdId = byCode.get('USD') ?? '';
    eurId = byCode.get('EUR') ?? '';
  });

  afterAll(async () => {
    if (prisma) {
      for (const userId of createdUserIds) {
        await prisma.debtPayment.deleteMany({
          where: { debt: { user_id: userId } },
        });
        await prisma.debt.deleteMany({ where: { user_id: userId } });
        await prisma.movement.deleteMany({ where: { user_id: userId } });
        await prisma.session.deleteMany({ where: { user_id: userId } });
        await prisma.account.deleteMany({ where: { user_id: userId } });
        await prisma.category.deleteMany({ where: { user_id: userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    }
    await app?.close();
  });

  it('connects to the isolated test database and finds the seeded currencies', async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`select 1 as ok`;
    expect(rows[0]?.ok).toBe(1);

    const currencies = await prisma.currency.findMany({
      where: { is_active: true },
      orderBy: { code: 'asc' },
    });
    expect(currencies.map((item) => item.code)).toEqual(
      REQUIRED_CURRENCY_CODES,
    );
  });

  it('persists real user-owned financial data and keeps balances correct', async () => {
    const { token } = await registerAndLogin(
      'integration-primary@example.com',
      'Password123',
    );
    const auth = { Authorization: `Bearer ${token}` };

    const accountA = await api()
      .post('/api/accounts')
      .set(auth)
      .send({ name: 'Efectivo', type: 'cash', currency_id: usdId })
      .expect(201);
    const accountAId = (accountA.body as { id: string }).id;

    const accountB = await api()
      .post('/api/accounts')
      .set(auth)
      .send({ name: 'Banco', type: 'bank_account', currency_id: usdId })
      .expect(201);
    const accountBId = (accountB.body as { id: string }).id;

    const listed = await api().get('/api/accounts').set(auth).expect(200);
    expect((listed.body as unknown[]).length).toBe(2);

    await api()
      .post('/api/movements')
      .set(auth)
      .send({
        account_id: accountAId,
        currency_id: usdId,
        amount: 100.5,
        type: 'income',
        movement_date: '2026-01-10',
      })
      .expect(201);

    const afterIncome = await api()
      .get(`/api/accounts/${accountAId}`)
      .set(auth)
      .expect(200);
    expect(Number((afterIncome.body as MoneyBody).balance)).toBeCloseTo(100.5);

    await api()
      .post('/api/movements')
      .set(auth)
      .send({
        account_id: accountAId,
        currency_id: usdId,
        amount: 30.25,
        type: 'expense',
        movement_date: '2026-01-11',
      })
      .expect(201);

    await api()
      .post('/api/movements')
      .set(auth)
      .send({
        account_id: accountAId,
        transfer_account_id: accountBId,
        currency_id: usdId,
        amount: 20,
        type: 'transfer',
        movement_date: '2026-01-12',
      })
      .expect(201);

    const finalA = await api()
      .get(`/api/accounts/${accountAId}`)
      .set(auth)
      .expect(200);
    const finalB = await api()
      .get(`/api/accounts/${accountBId}`)
      .set(auth)
      .expect(200);

    expect(Number((finalA.body as MoneyBody).balance)).toBeCloseTo(50.25);
    expect(Number((finalB.body as MoneyBody).balance)).toBeCloseTo(20);
  });

  it('separates dashboard totals by currency', async () => {
    const { token } = await registerAndLogin(
      'integration-dashboard@example.com',
      'Password123',
    );
    const auth = { Authorization: `Bearer ${token}` };

    const usdAccount = await api()
      .post('/api/accounts')
      .set(auth)
      .send({ name: 'USD', type: 'cash', currency_id: usdId })
      .expect(201);
    const usdAccountId = (usdAccount.body as { id: string }).id;

    const eurAccount = await api()
      .post('/api/accounts')
      .set(auth)
      .send({ name: 'EUR', type: 'cash', currency_id: eurId })
      .expect(201);
    const eurAccountId = (eurAccount.body as { id: string }).id;

    const category = await api()
      .post('/api/categories')
      .set(auth)
      .send({ name: 'Comida', type: 'expense' })
      .expect(201);
    const categoryId = (category.body as { id: string }).id;

    await api()
      .post('/api/movements')
      .set(auth)
      .send({
        account_id: usdAccountId,
        currency_id: usdId,
        amount: 200,
        type: 'income',
        movement_date: '2026-02-05',
      })
      .expect(201);

    await api()
      .post('/api/movements')
      .set(auth)
      .send({
        account_id: usdAccountId,
        category_id: categoryId,
        currency_id: usdId,
        amount: 50,
        type: 'expense',
        movement_date: '2026-02-06',
      })
      .expect(201);

    await api()
      .post('/api/movements')
      .set(auth)
      .send({
        account_id: eurAccountId,
        currency_id: eurId,
        amount: 80,
        type: 'income',
        movement_date: '2026-02-07',
      })
      .expect(201);

    const summary = await api()
      .get('/api/dashboard/summary?year=2026&month=2')
      .set(auth)
      .expect(200);
    const summaryBody = summary.body as SummaryBody;

    const usdBalance = summaryBody.balances_by_currency.find(
      (item) => item.currency_code === 'USD',
    );
    const eurBalance = summaryBody.balances_by_currency.find(
      (item) => item.currency_code === 'EUR',
    );
    expect(Number(usdBalance?.total)).toBeCloseTo(150);
    expect(Number(eurBalance?.total)).toBeCloseTo(80);

    const usdTotals = summaryBody.totals_by_currency.find(
      (item) => item.currency_code === 'USD',
    );
    const eurTotals = summaryBody.totals_by_currency.find(
      (item) => item.currency_code === 'EUR',
    );
    expect(usdTotals).toMatchObject({
      income: '200.00',
      expenses: '50.00',
      net: '150.00',
    });
    expect(eurTotals).toMatchObject({
      income: '80.00',
      expenses: '0.00',
      net: '80.00',
    });

    const byCategory = await api()
      .get('/api/dashboard/expenses-by-category?year=2026&month=2')
      .set(auth)
      .expect(200);
    const expenses = (byCategory.body as ExpensesByCategoryBody).expenses;
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      name: 'Comida',
      currency_code: 'USD',
      total: '50.00',
    });
  });

  it('isolates data between users', async () => {
    const owner = await registerAndLogin(
      'integration-owner@example.com',
      'Password123',
    );
    const intruder = await registerAndLogin(
      'integration-intruder@example.com',
      'Password123',
    );

    const account = await api()
      .post('/api/accounts')
      .set({ Authorization: `Bearer ${owner.token}` })
      .send({ name: 'Privada', type: 'cash', currency_id: usdId })
      .expect(201);
    const accountId = (account.body as { id: string }).id;

    await api()
      .get(`/api/accounts/${accountId}`)
      .set({ Authorization: `Bearer ${intruder.token}` })
      .expect(404);

    const intruderList = await api()
      .get('/api/accounts')
      .set({ Authorization: `Bearer ${intruder.token}` })
      .expect(200);
    expect(intruderList.body as unknown[]).toHaveLength(0);
  });

  it('persists debt payments and updates the remaining balance', async () => {
    const { token } = await registerAndLogin(
      'integration-debt@example.com',
      'Password123',
    );
    const auth = { Authorization: `Bearer ${token}` };

    const debt = await api()
      .post('/api/debts')
      .set(auth)
      .send({
        name: 'Préstamo',
        currency_id: usdId,
        original_amount: 500,
        due_date: '2026-12-31',
      })
      .expect(201);
    const debtId = (debt.body as { id: string }).id;

    await api()
      .post(`/api/debts/${debtId}/payments`)
      .set(auth)
      .send({ amount: 100, payment_date: '2026-06-15' })
      .expect(201);

    const updated = await api()
      .get(`/api/debts/${debtId}`)
      .set(auth)
      .expect(200);
    expect(
      Number((updated.body as { remaining_amount: string }).remaining_amount),
    ).toBe(400);

    const payments = await api()
      .get(`/api/debts/${debtId}/payments`)
      .set(auth)
      .expect(200);
    expect(payments.body as unknown[]).toHaveLength(1);
  });
});
