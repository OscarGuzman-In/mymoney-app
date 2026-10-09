import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { Prisma } from './../src/generated/prisma/client';
import { PrismaService } from './../src/prisma/prisma.service';

const TEST_JWT_SECRET = 'e2e-test-jwt-secret-do-not-use-in-prod';

const USD_ID = '00000000-0000-4000-8000-ffffffff0001';
const FOOD_CATEGORY_ID = '00000000-0000-4000-8000-ffffffff0002';
const EUR_ID = '00000000-0000-4000-8000-ffffffff0003';

const configStub = {
  get: (key: string): string | undefined =>
    key === 'JWT_SECRET' ? TEST_JWT_SECRET : undefined,
  getOrThrow: (key: string): string => {
    const value = key === 'JWT_SECRET' ? TEST_JWT_SECRET : undefined;
    if (value === undefined) {
      throw new TypeError(`Configuration key "${key}" does not exist`);
    }
    return value;
  },
} as unknown as ConfigService;

interface FakeUser {
  id: string;
  email: string;
  password: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface FakeSession {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
  last_used_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
}

interface FakeCurrency {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  is_active: boolean;
}

interface FakeAccount {
  id: string;
  user_id: string;
  currency_id: string;
  name: string;
  type: string;
  balance: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface FakeCategory {
  id: string;
  user_id: string | null;
  name: string;
  type: string;
  is_active: boolean;
}

interface FakeMovement {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  currency_id: string;
  amount: string;
  type: string;
  description: string | null;
  movement_date: Date;
  created_at: Date;
}

interface FakeBudget {
  id: string;
  user_id: string;
  is_active: boolean;
  status: string;
}

interface FakeSavingsGoal {
  id: string;
  user_id: string;
  is_active: boolean;
  status: string;
}

interface AccountWhere {
  user_id?: string;
  is_active?: boolean;
}

interface MovementWhere {
  user_id?: string;
  type?: string | { in: string[] };
  movement_date?: { gte?: Date; lt?: Date };
}

function toSafeUser(user: FakeUser) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function sumCents(amounts: string[]): number {
  return amounts.reduce(
    (total, amount) => total + Math.round(Number(amount) * 100),
    0,
  );
}

class InMemoryPrismaService {
  private users: FakeUser[] = [];
  private sessions: FakeSession[] = [];
  private currencies: FakeCurrency[] = [
    {
      id: USD_ID,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      is_active: true,
    },
    {
      id: EUR_ID,
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      is_active: true,
    },
  ];
  private accounts: FakeAccount[] = [];
  private categories: FakeCategory[] = [];
  private movements: FakeMovement[] = [];
  private budgets: FakeBudget[] = [];
  private savingsGoals: FakeSavingsGoal[] = [];
  private seq = 0;

  private nextId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-0000000000${String(this.seq).padStart(2, '0')}`;
  }

  seedAccount(data: {
    user_id: string;
    name: string;
    type?: string;
    balance: number;
    is_active?: boolean;
    currency_id?: string;
  }): string {
    const id = this.nextId();
    this.accounts.push({
      id,
      user_id: data.user_id,
      currency_id: data.currency_id ?? USD_ID,
      name: data.name,
      type: data.type ?? 'cash',
      balance: data.balance.toString(),
      is_active: data.is_active ?? true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return id;
  }

  seedCategory(data: { id?: string; name: string; type?: string }): string {
    const id = data.id ?? this.nextId();
    this.categories.push({
      id,
      user_id: null,
      name: data.name,
      type: data.type ?? 'expense',
      is_active: true,
    });
    return id;
  }

  seedMovement(data: {
    user_id: string;
    account_id: string;
    category_id?: string | null;
    amount: number;
    type: string;
    movement_date: Date;
    description?: string | null;
    currency_id?: string;
  }): string {
    const id = this.nextId();
    this.movements.push({
      id,
      user_id: data.user_id,
      account_id: data.account_id,
      category_id: data.category_id ?? null,
      currency_id: data.currency_id ?? USD_ID,
      amount: data.amount.toString(),
      type: data.type,
      description: data.description ?? null,
      movement_date: data.movement_date,
      created_at: new Date(
        data.movement_date.getTime() + this.movements.length,
      ),
    });
    return id;
  }

  seedBudget(data: { user_id: string; is_active?: boolean; status?: string }) {
    this.budgets.push({
      id: this.nextId(),
      user_id: data.user_id,
      is_active: data.is_active ?? true,
      status: data.status ?? 'active',
    });
  }

  seedSavingsGoal(data: {
    user_id: string;
    is_active?: boolean;
    status?: string;
  }) {
    this.savingsGoals.push({
      id: this.nextId(),
      user_id: data.user_id,
      is_active: data.is_active ?? true,
      status: data.status ?? 'active',
    });
  }

  private matchesMovement(
    movement: FakeMovement,
    where: MovementWhere,
  ): boolean {
    if (where.user_id && movement.user_id !== where.user_id) {
      return false;
    }
    if (where.type) {
      if (typeof where.type === 'string') {
        if (movement.type !== where.type) {
          return false;
        }
      } else if (!where.type.in.includes(movement.type)) {
        return false;
      }
    }
    if (where.movement_date) {
      const time = movement.movement_date.getTime();
      if (where.movement_date.gte && time < where.movement_date.gte.getTime()) {
        return false;
      }
      if (where.movement_date.lt && time >= where.movement_date.lt.getTime()) {
        return false;
      }
    }
    return true;
  }

  user = {
    create: (args: { data: Partial<FakeUser> }): FakeUser => {
      const { data } = args;
      if (this.users.some((user) => user.email === data.email)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['email'] },
        });
      }
      const now = new Date();
      const user: FakeUser = {
        id: this.nextId(),
        email: data.email ?? '',
        password: data.password ?? '',
        first_name: data.first_name ?? null,
        last_name: data.last_name ?? null,
        is_active: true,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      };
      this.users.push(user);
      return user;
    },
    findUnique: (args: {
      where: { id?: string; email?: string };
      select?: Record<string, boolean>;
    }): unknown => {
      const { where, select } = args;
      const user =
        (where.id
          ? this.users.find((item) => item.id === where.id)
          : this.users.find((item) => item.email === where.email)) ?? null;
      if (!user) {
        return null;
      }
      return select ? toSafeUser(user) : user;
    },
  };

  session = {
    create: (args: { data: Partial<FakeSession> }): FakeSession => {
      const session: FakeSession = {
        id: this.nextId(),
        user_id: args.data.user_id ?? '',
        token: args.data.token ?? '',
        expires_at: args.data.expires_at ?? new Date(),
        created_at: new Date(),
        last_used_at: null,
        ip_address: args.data.ip_address ?? null,
        user_agent: args.data.user_agent ?? null,
      };
      this.sessions.push(session);
      return session;
    },
    findUnique: (args: { where: { token: string } }): FakeSession | null => {
      return (
        this.sessions.find((session) => session.token === args.where.token) ??
        null
      );
    },
    findFirst: (args: {
      where: { id: string; user_id: string };
    }): (FakeSession & { user: FakeUser | null }) | null => {
      const session = this.sessions.find(
        (item) =>
          item.id === args.where.id && item.user_id === args.where.user_id,
      );
      if (!session) {
        return null;
      }
      const user =
        this.users.find((item) => item.id === session.user_id) ?? null;
      return { ...session, user };
    },
    update: (args: {
      where: { id: string };
      data: Partial<FakeSession>;
    }): FakeSession => {
      const session = this.sessions.find((item) => item.id === args.where.id);
      if (!session) {
        throw new Error('Session not found');
      }
      Object.assign(session, args.data);
      return session;
    },
    deleteMany: (): { count: number } => ({ count: 0 }),
  };

  currency = {
    findMany: (args?: {
      where?: { id: { in: string[] } };
      select?: Record<string, boolean>;
    }): Array<Pick<FakeCurrency, 'id' | 'code' | 'symbol'>> => {
      const rows = args?.where
        ? this.currencies.filter((currency) =>
            args.where!.id.in.includes(currency.id),
          )
        : this.currencies;
      return rows.map((currency) => ({
        id: currency.id,
        code: currency.code,
        symbol: currency.symbol,
      }));
    },
  };

  account = {
    count: (args: { where: AccountWhere }): number => {
      return this.accounts.filter(
        (account) =>
          (!args.where.user_id || account.user_id === args.where.user_id) &&
          (args.where.is_active === undefined ||
            account.is_active === args.where.is_active),
      ).length;
    },
    aggregate: (args: {
      _sum: { balance: true };
      where: AccountWhere;
    }): { _sum: { balance: string | null } } => {
      const rows = this.accounts.filter(
        (account) =>
          (!args.where.user_id || account.user_id === args.where.user_id) &&
          (args.where.is_active === undefined ||
            account.is_active === args.where.is_active),
      );
      if (rows.length === 0) {
        return { _sum: { balance: null } };
      }
      const cents = sumCents(rows.map((account) => account.balance));
      return { _sum: { balance: (cents / 100).toString() } };
    },
    groupBy: (args: {
      by: string[];
      _sum: { balance: true };
      where: AccountWhere;
    }): Array<{ currency_id: string; _sum: { balance: string } }> => {
      const rows = this.accounts.filter(
        (account) =>
          (!args.where.user_id || account.user_id === args.where.user_id) &&
          (args.where.is_active === undefined ||
            account.is_active === args.where.is_active),
      );
      const groups = new Map<string, FakeAccount[]>();
      for (const account of rows) {
        const existing = groups.get(account.currency_id) ?? [];
        existing.push(account);
        groups.set(account.currency_id, existing);
      }
      return Array.from(groups.entries()).map(([currencyId, group]) => ({
        currency_id: currencyId,
        _sum: {
          balance: (
            sumCents(group.map((item) => item.balance)) / 100
          ).toString(),
        },
      }));
    },
  };

  movement = {
    aggregate: (args: {
      _sum: { amount: true };
      where: MovementWhere;
    }): { _sum: { amount: string | null } } => {
      const rows = this.movements.filter((movement) =>
        this.matchesMovement(movement, args.where),
      );
      if (rows.length === 0) {
        return { _sum: { amount: null } };
      }
      const cents = sumCents(rows.map((movement) => movement.amount));
      return { _sum: { amount: (cents / 100).toString() } };
    },
    groupBy: (args: {
      by: string[];
      _sum: { amount: true };
      where: MovementWhere;
    }): Array<Record<string, unknown>> => {
      const rows = this.movements.filter((movement) =>
        this.matchesMovement(movement, args.where),
      );
      const groups = new Map<string, FakeMovement[]>();
      for (const row of rows) {
        const key = args.by
          .map((field) =>
            String((row as unknown as Record<string, unknown>)[field]),
          )
          .join('|');
        const existing = groups.get(key) ?? [];
        existing.push(row);
        groups.set(key, existing);
      }
      return Array.from(groups.values()).map((group) => {
        const result: Record<string, unknown> = {};
        for (const field of args.by) {
          result[field] = (group[0] as unknown as Record<string, unknown>)[
            field
          ];
        }
        const cents = sumCents(group.map((item) => item.amount));
        result._sum = { amount: (cents / 100).toString() };
        return result;
      });
    },
    findMany: (args: {
      where: { user_id: string };
      take: number;
    }): Array<{
      id: string;
      type: string;
      amount: string;
      movement_date: Date;
      description: string | null;
      category: { id: string; name: string } | null;
      account: { id: string; name: string; type: string } | null;
      currency: { id: string; code: string; symbol: string | null } | null;
    }> => {
      return this.movements
        .filter((movement) => movement.user_id === args.where.user_id)
        .sort((a, b) => {
          const byDate = b.movement_date.getTime() - a.movement_date.getTime();
          return byDate !== 0
            ? byDate
            : b.created_at.getTime() - a.created_at.getTime();
        })
        .slice(0, args.take)
        .map((movement) => {
          const category = movement.category_id
            ? this.categories.find((item) => item.id === movement.category_id)
            : undefined;
          const account = this.accounts.find(
            (item) => item.id === movement.account_id,
          );
          const currency = this.currencies.find(
            (item) => item.id === movement.currency_id,
          );
          return {
            id: movement.id,
            type: movement.type,
            amount: movement.amount,
            movement_date: movement.movement_date,
            description: movement.description,
            category: category
              ? { id: category.id, name: category.name }
              : null,
            account: account
              ? { id: account.id, name: account.name, type: account.type }
              : null,
            currency: currency
              ? {
                  id: currency.id,
                  code: currency.code,
                  symbol: currency.symbol,
                }
              : null,
          };
        });
    },
  };

  category = {
    findMany: (args: {
      where: { id: { in: string[] } };
      select?: Record<string, boolean>;
    }): Array<{ id: string; name: string }> => {
      return this.categories
        .filter((category) => args.where.id.in.includes(category.id))
        .map((category) => ({ id: category.id, name: category.name }));
    },
  };

  budget = {
    count: (args: {
      where: { user_id: string; is_active?: boolean; status?: string };
    }): number => {
      return this.budgets.filter(
        (budget) =>
          budget.user_id === args.where.user_id &&
          (args.where.is_active === undefined ||
            budget.is_active === args.where.is_active) &&
          (args.where.status === undefined ||
            budget.status === args.where.status),
      ).length;
    },
  };

  savingsGoal = {
    count: (args: {
      where: { user_id: string; is_active?: boolean; status?: string };
    }): number => {
      return this.savingsGoals.filter(
        (goal) =>
          goal.user_id === args.where.user_id &&
          (args.where.is_active === undefined ||
            goal.is_active === args.where.is_active) &&
          (args.where.status === undefined ||
            goal.status === args.where.status),
      ).length;
    },
  };
}

async function createApp(
  prisma: InMemoryPrismaService,
): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue(configStub)
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

async function registerAndLogin(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<{ token: string; userId: string }> {
  const registered = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password })
    .expect(201);

  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    token: (response.body as { access_token: string }).access_token,
    userId: (registered.body as { id: string }).id,
  };
}

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let tokenA: string;
  let tokenB: string;
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  beforeAll(async () => {
    const prisma = new InMemoryPrismaService();
    app = await createApp(prisma);

    const ana = await registerAndLogin(app, 'ana@example.com', 'Password123');
    const bruno = await registerAndLogin(
      app,
      'bruno@example.com',
      'Password123',
    );
    tokenA = ana.token;
    tokenB = bruno.token;

    prisma.seedCategory({
      id: FOOD_CATEGORY_ID,
      name: 'Comida',
      type: 'expense',
    });

    const acc1 = prisma.seedAccount({
      user_id: ana.userId,
      name: 'Efectivo',
      balance: 100,
    });
    const acc2 = prisma.seedAccount({
      user_id: ana.userId,
      name: 'Banco',
      type: 'bank_account',
      balance: 50,
    });
    prisma.seedAccount({
      user_id: ana.userId,
      name: 'Inactiva',
      balance: 25,
      is_active: false,
    });
    prisma.seedAccount({ user_id: bruno.userId, name: 'Ajena', balance: 9999 });

    const accEur = prisma.seedAccount({
      user_id: ana.userId,
      name: 'Efectivo EUR',
      balance: 40,
      currency_id: EUR_ID,
    });

    const current = new Date(Date.UTC(year, month - 1, 15));
    const previous = new Date(Date.UTC(year, month - 2, 10));

    prisma.seedMovement({
      user_id: ana.userId,
      account_id: accEur,
      amount: 200,
      type: 'income',
      movement_date: current,
      currency_id: EUR_ID,
    });
    prisma.seedMovement({
      user_id: ana.userId,
      account_id: acc1,
      amount: 1000,
      type: 'income',
      movement_date: current,
      description: 'Salario',
    });
    prisma.seedMovement({
      user_id: ana.userId,
      account_id: acc1,
      category_id: FOOD_CATEGORY_ID,
      amount: 300,
      type: 'expense',
      movement_date: current,
      description: 'Supermercado',
    });
    prisma.seedMovement({
      user_id: ana.userId,
      account_id: acc2,
      amount: 50,
      type: 'expense',
      movement_date: current,
    });
    prisma.seedMovement({
      user_id: ana.userId,
      account_id: acc1,
      amount: 200,
      type: 'transfer',
      movement_date: current,
    });
    prisma.seedMovement({
      user_id: ana.userId,
      account_id: acc1,
      amount: 500,
      type: 'income',
      movement_date: previous,
    });
    prisma.seedMovement({
      user_id: bruno.userId,
      account_id: acc1,
      amount: 999,
      type: 'income',
      movement_date: current,
    });

    prisma.seedBudget({
      user_id: ana.userId,
      is_active: true,
      status: 'active',
    });
    prisma.seedBudget({
      user_id: ana.userId,
      is_active: true,
      status: 'completed',
    });
    prisma.seedBudget({
      user_id: bruno.userId,
      is_active: true,
      status: 'active',
    });

    prisma.seedSavingsGoal({
      user_id: ana.userId,
      is_active: true,
      status: 'active',
    });
    prisma.seedSavingsGoal({
      user_id: ana.userId,
      is_active: false,
      status: 'active',
    });
    prisma.seedSavingsGoal({
      user_id: bruno.userId,
      is_active: true,
      status: 'active',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('summary', () => {
    it('rejects unauthenticated access', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/summary')
        .expect(401);
    });

    it('aggregates balances, income and expenses separated by currency', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/summary?month=${month}&year=${year}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const body = response.body as {
        month: number;
        year: number;
        active_accounts_count: number;
        active_budgets_count: number;
        active_savings_goals_count: number;
        balances_by_currency: Array<{
          currency_id: string;
          currency_code: string;
          symbol: string | null;
          total: string;
        }>;
        totals_by_currency: Array<{
          currency_id: string;
          currency_code: string;
          symbol: string | null;
          income: string;
          expenses: string;
          net: string;
        }>;
      };
      expect(body.month).toBe(month);
      expect(body.year).toBe(year);
      expect(body).not.toHaveProperty('total_balance');
      expect(body).not.toHaveProperty('total_income');
      expect(body.active_accounts_count).toBe(3);
      expect(body.active_budgets_count).toBe(1);
      expect(body.active_savings_goals_count).toBe(1);
      expect(body.balances_by_currency).toEqual([
        {
          currency_id: USD_ID,
          currency_code: 'USD',
          symbol: '$',
          total: '150.00',
        },
        {
          currency_id: EUR_ID,
          currency_code: 'EUR',
          symbol: '€',
          total: '40.00',
        },
      ]);
      expect(body.totals_by_currency).toEqual([
        {
          currency_id: EUR_ID,
          currency_code: 'EUR',
          symbol: '€',
          income: '200.00',
          expenses: '0.00',
          net: '200.00',
        },
        {
          currency_id: USD_ID,
          currency_code: 'USD',
          symbol: '$',
          income: '1000.00',
          expenses: '350.00',
          net: '650.00',
        },
      ]);
    });

    it('returns no currency totals for a month without movements', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/summary?month=1&year=2020`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const body = response.body as {
        totals_by_currency: unknown[];
      };
      expect(body.totals_by_currency).toEqual([]);
    });

    it('rejects invalid month and year parameters', async () => {
      for (const query of ['month=13', 'month=0', 'month=abc', 'year=1999']) {
        await request(app.getHttpServer())
          .get(`/api/dashboard/summary?${query}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(400);
      }
    });
  });

  describe('expenses-by-category', () => {
    it('groups expenses by category and separates uncategorized ones', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/expenses-by-category?month=${month}&year=${year}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const body = response.body as {
        expenses: Array<{
          category_id: string | null;
          name: string | null;
          currency_id: string;
          currency_code: string;
          symbol: string | null;
          total: string;
        }>;
      };
      expect(body.expenses).toEqual([
        {
          category_id: FOOD_CATEGORY_ID,
          name: 'Comida',
          currency_id: USD_ID,
          currency_code: 'USD',
          symbol: '$',
          total: '300.00',
        },
        {
          category_id: null,
          name: null,
          currency_id: USD_ID,
          currency_code: 'USD',
          symbol: '$',
          total: '50.00',
        },
      ]);
    });
  });

  describe('monthly-trend', () => {
    it('returns six months by default including zero months', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/monthly-trend')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const body = response.body as {
        months: number;
        trend: Array<{
          year: number;
          month: number;
          totals_by_currency: Array<{
            currency_id: string;
            currency_code: string;
            symbol: string | null;
            income: string;
            expenses: string;
            net: string;
          }>;
        }>;
      };
      expect(body.months).toBe(6);
      expect(body.trend).toHaveLength(6);
      const currentEntry = body.trend.find(
        (item) => item.year === year && item.month === month,
      );
      expect(currentEntry).toEqual({
        year,
        month,
        totals_by_currency: [
          {
            currency_id: EUR_ID,
            currency_code: 'EUR',
            symbol: '€',
            income: '200.00',
            expenses: '0.00',
            net: '200.00',
          },
          {
            currency_id: USD_ID,
            currency_code: 'USD',
            symbol: '$',
            income: '1000.00',
            expenses: '350.00',
            net: '650.00',
          },
        ],
      });
      const zero = body.trend.find(
        (item) => !(item.year === year && item.month === month),
      );
      expect(zero?.totals_by_currency).toEqual([]);
    });

    it('validates the months parameter', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/monthly-trend?months=3')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/dashboard/monthly-trend?months=0')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/dashboard/monthly-trend?months=13')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });
  });

  describe('recent-movements', () => {
    it('returns only the user movements ordered newest first', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/recent-movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const body = response.body as Array<{
        type: string;
        amount: string;
        currency: { id: string; code: string; symbol: string | null } | null;
      }>;
      expect(body).toHaveLength(6);
      expect(body.some((item) => item.amount === '999.00')).toBe(false);
      expect(body[0].amount).toBe('200.00');
      expect(body.some((item) => item.type === 'transfer')).toBe(true);
      expect(body.every((item) => item.currency !== null)).toBe(true);
      expect(body.some((item) => item.currency?.code === 'EUR')).toBe(true);
    });

    it('applies and validates the limit parameter', async () => {
      const limited = await request(app.getHttpServer())
        .get('/api/dashboard/recent-movements?limit=1')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(limited.body as unknown[]).toHaveLength(1);

      for (const limit of ['0', '51']) {
        await request(app.getHttpServer())
          .get(`/api/dashboard/recent-movements?limit=${limit}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(400);
      }
    });
  });

  it("does not expose another user's data", async () => {
    const summary = await request(app.getHttpServer())
      .get(`/api/dashboard/summary?month=${month}&year=${year}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    const body = summary.body as {
      balances_by_currency: Array<{ currency_code: string; total: string }>;
      totals_by_currency: Array<{ currency_code: string; income: string }>;
    };
    expect(body.totals_by_currency).toEqual([
      {
        currency_id: USD_ID,
        currency_code: 'USD',
        symbol: '$',
        income: '999.00',
        expenses: '0.00',
        net: '999.00',
      },
    ]);
    expect(body.balances_by_currency).toEqual([
      {
        currency_id: USD_ID,
        currency_code: 'USD',
        symbol: '$',
        total: '9999.00',
      },
    ]);

    const movements = await request(app.getHttpServer())
      .get('/api/dashboard/recent-movements')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(movements.body as unknown[]).toHaveLength(1);
  });
});
