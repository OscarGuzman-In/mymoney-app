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

interface FakeDebt {
  id: string;
  user_id: string;
  currency_id: string;
  name: string;
  original_amount: string;
  remaining_amount: string;
  due_date: Date;
  status: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface FakeDebtPayment {
  id: string;
  debt_id: string;
  amount: string;
  payment_date: Date;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DebtCreateData {
  user_id: string;
  currency_id: string;
  name: string;
  original_amount: unknown;
  remaining_amount: unknown;
  due_date: Date;
  status?: string;
  description: string | null;
}

interface DebtUpdateData {
  currency_id?: string;
  name?: string;
  original_amount?: unknown;
  remaining_amount?: unknown;
  due_date?: Date;
  status?: string;
  description?: string | null;
}

interface PaymentCreateData {
  debt_id: string;
  amount: unknown;
  payment_date: Date;
  notes: string | null;
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

class InMemoryPrismaService {
  private users: FakeUser[] = [];
  private sessions: FakeSession[] = [];
  private debts: FakeDebt[] = [];
  private debtPayments: FakeDebtPayment[] = [];
  private currencies: FakeCurrency[] = [
    {
      id: USD_ID,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      is_active: true,
    },
  ];
  private seq = 0;

  private nextId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
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
    findUnique: (args: { where: { id: string } }): FakeCurrency | null => {
      return this.currencies.find((item) => item.id === args.where.id) ?? null;
    },
  };

  debt = {
    create: (args: { data: DebtCreateData }): FakeDebt => {
      const { data } = args;
      const now = new Date();
      const debt: FakeDebt = {
        id: this.nextId(),
        user_id: data.user_id,
        currency_id: data.currency_id,
        name: data.name,
        original_amount: String(data.original_amount),
        remaining_amount: String(data.remaining_amount),
        due_date: data.due_date,
        status: data.status ?? 'active',
        description: data.description ?? null,
        is_active: true,
        created_at: now,
        updated_at: now,
      };
      this.debts.push(debt);
      return debt;
    },
    findMany: (args: { where: { user_id: string } }): FakeDebt[] => {
      return this.debts
        .filter((debt) => debt.user_id === args.where.user_id)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    },
    findFirst: (args: {
      where: { id: string; user_id: string };
    }): FakeDebt | null => {
      return (
        this.debts.find(
          (debt) =>
            debt.id === args.where.id && debt.user_id === args.where.user_id,
        ) ?? null
      );
    },
    update: (args: {
      where: { id: string };
      data: DebtUpdateData;
    }): FakeDebt => {
      const debt = this.debts.find((item) => item.id === args.where.id);
      if (!debt) {
        throw new Error('Debt not found');
      }
      const target = debt as unknown as Record<string, unknown>;
      Object.entries(args.data).forEach(([key, value]) => {
        if (value === undefined) {
          return;
        }
        target[key] =
          key === 'original_amount' || key === 'remaining_amount'
            ? String(value)
            : value;
      });
      debt.updated_at = new Date();
      return debt;
    },
  };

  debtPayment = {
    create: (args: { data: PaymentCreateData }): FakeDebtPayment => {
      const { data } = args;
      const now = new Date();
      const payment: FakeDebtPayment = {
        id: this.nextId(),
        debt_id: data.debt_id,
        amount: String(data.amount),
        payment_date: data.payment_date,
        notes: data.notes,
        created_at: now,
        updated_at: now,
      };
      this.debtPayments.push(payment);
      return payment;
    },
    findMany: (args: { where: { debt_id: string } }): FakeDebtPayment[] => {
      return this.debtPayments
        .filter((payment) => payment.debt_id === args.where.debt_id)
        .sort((a, b) => b.payment_date.getTime() - a.payment_date.getTime());
    },
  };

  $transaction(operations: unknown[]): Promise<unknown[]> {
    return Promise.all(operations);
  }
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

describe('Debts (e2e)', () => {
  let app: INestApplication<App>;
  let tokenA: string;
  let tokenB: string;
  let debtA: string;
  let debtB: string;

  beforeAll(async () => {
    app = await createApp(new InMemoryPrismaService());

    const ana = await registerAndLogin(app, 'ana@example.com', 'Password123');
    const bruno = await registerAndLogin(
      app,
      'bruno@example.com',
      'Password123',
    );
    tokenA = ana.token;
    tokenB = bruno.token;

    const createdDebtA = await request(app.getHttpServer())
      .post('/api/debts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Préstamo A',
        currency_id: USD_ID,
        original_amount: 1000,
        due_date: '2026-12-31',
      })
      .expect(201);
    debtA = (createdDebtA.body as { id: string }).id;

    const createdDebtB = await request(app.getHttpServer())
      .post('/api/debts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Préstamo B',
        currency_id: USD_ID,
        original_amount: 500,
        due_date: '2026-12-31',
      })
      .expect(201);
    debtB = (createdDebtB.body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/debts').expect(401);
  });

  it('creates a debt with remaining equal to original', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/debts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Tarjeta',
        currency_id: USD_ID,
        original_amount: 2500,
        due_date: '2026-11-30',
      })
      .expect(201);

    const body = response.body as {
      original_amount: string;
      remaining_amount: string;
      status: string;
      is_active: boolean;
    };
    expect(body.original_amount).toBe('2500');
    expect(body.remaining_amount).toBe('2500');
    expect(body.status).toBe('active');
    expect(body.is_active).toBe(true);
  });

  it('rejects a remaining amount greater than the original', async () => {
    await request(app.getHttpServer())
      .post('/api/debts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Mal',
        currency_id: USD_ID,
        original_amount: 100,
        remaining_amount: 200,
        due_date: '2026-11-30',
      })
      .expect(400);
  });

  it('rejects a non-positive or overly precise original amount', async () => {
    for (const original_amount of [0, -10, 10.999]) {
      await request(app.getHttpServer())
        .post('/api/debts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Mal',
          currency_id: USD_ID,
          original_amount,
          due_date: '2026-11-30',
        })
        .expect(400);
    }
  });

  it('lists and retrieves the user debts', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/debts')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(list.body as unknown[]).toHaveLength(2);

    await request(app.getHttpServer())
      .get(`/api/debts/${debtA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });

  it("cannot read another user's debt", async () => {
    await request(app.getHttpServer())
      .get(`/api/debts/${debtB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('updates an owned debt', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/debts/${debtA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Préstamo A2' })
      .expect(200);
    expect((response.body as { name: string }).name).toBe('Préstamo A2');
  });

  it("cannot update another user's debt", async () => {
    await request(app.getHttpServer())
      .patch(`/api/debts/${debtB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hackeado' })
      .expect(404);
  });

  it('deactivates an owned debt', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/debts/${debtA}/deactivate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect((response.body as { is_active: boolean }).is_active).toBe(false);
  });

  it("cannot deactivate another user's debt", async () => {
    await request(app.getHttpServer())
      .patch(`/api/debts/${debtB}/deactivate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('records a payment and reduces the remaining balance', async () => {
    const payment = await request(app.getHttpServer())
      .post(`/api/debts/${debtA}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: 200, payment_date: '2026-06-15' })
      .expect(201);
    expect((payment.body as { amount: string }).amount).toBe('200');

    const debt = await request(app.getHttpServer())
      .get(`/api/debts/${debtA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect((debt.body as { remaining_amount: string }).remaining_amount).toBe(
      '800',
    );
  });

  it('marks the debt as paid when the balance reaches zero', async () => {
    await request(app.getHttpServer())
      .post(`/api/debts/${debtA}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: 800, payment_date: '2026-07-15' })
      .expect(201);

    const debt = await request(app.getHttpServer())
      .get(`/api/debts/${debtA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const body = debt.body as { remaining_amount: string; status: string };
    expect(body.remaining_amount).toBe('0');
    expect(body.status).toBe('paid');
  });

  it('rejects a payment that exceeds the remaining balance', async () => {
    await request(app.getHttpServer())
      .post(`/api/debts/${debtA}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: 50, payment_date: '2026-08-15' })
      .expect(400);
  });

  it("rejects a payment against another user's debt", async () => {
    await request(app.getHttpServer())
      .post(`/api/debts/${debtB}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: 10, payment_date: '2026-06-15' })
      .expect(404);
  });

  it('rejects a non-positive payment amount', async () => {
    await request(app.getHttpServer())
      .post(`/api/debts/${debtB}/payments`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: 0, payment_date: '2026-06-15' })
      .expect(400);
  });

  it('lists the payment history in order', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/debts/${debtA}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const body = response.body as Array<{ amount: string }>;
    expect(body).toHaveLength(2);
    expect(body[0].amount).toBe('800');
    expect(body[1].amount).toBe('200');
  });

  it("rejects listing another user's payment history", async () => {
    await request(app.getHttpServer())
      .get(`/api/debts/${debtB}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });
});
