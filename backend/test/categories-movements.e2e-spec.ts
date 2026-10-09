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
const SYS_EXPENSE_ID = '00000000-0000-4000-8000-ffffffff0002';
const SYS_INCOME_ID = '00000000-0000-4000-8000-ffffffff0003';
const MISSING_ID = '00000000-0000-4000-8000-ffffffff00ff';

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
  description: string | null;
  balance: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface FakeCategory {
  id: string;
  user_id: string | null;
  name: string;
  type: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface FakePaymentMethod {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface FakeMovement {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  payment_method_id: string | null;
  currency_id: string;
  transfer_account_id: string | null;
  amount: string;
  type: string;
  description: string | null;
  movement_date: Date;
  reference: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MovementWhere {
  user_id?: string;
  account_id?: string;
  category_id?: string;
  type?: string;
  movement_date?: { gte?: Date; lte?: Date };
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
  private accounts: FakeAccount[] = [];
  private categories: FakeCategory[] = [];
  private paymentMethods: FakePaymentMethod[] = [];
  private movements: FakeMovement[] = [];
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

  $transaction = (arg: unknown): Promise<unknown> => {
    if (typeof arg === 'function') {
      return Promise.resolve(
        (arg as (client: InMemoryPrismaService) => unknown)(this),
      );
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  };

  constructor() {
    const now = new Date();
    this.categories.push(
      {
        id: SYS_EXPENSE_ID,
        user_id: null,
        name: 'Sistema gasto',
        type: 'expense',
        description: null,
        color: null,
        icon: null,
        is_active: true,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: SYS_INCOME_ID,
        user_id: null,
        name: 'Sistema ingreso',
        type: 'income',
        description: null,
        color: null,
        icon: null,
        is_active: true,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    );
  }

  private nextId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
  }

  addPaymentMethod(userId: string, name: string): FakePaymentMethod {
    const now = new Date();
    const paymentMethod: FakePaymentMethod = {
      id: this.nextId(),
      user_id: userId,
      name,
      description: null,
      is_active: true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    this.paymentMethods.push(paymentMethod);
    return paymentMethod;
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
    update: (args: {
      where: { id: string };
      data: Partial<FakeUser>;
      select?: Record<string, boolean>;
    }): unknown => {
      const user = this.users.find((item) => item.id === args.where.id);
      if (!user) {
        throw new Error('User not found');
      }
      Object.assign(user, args.data, { updated_at: new Date() });
      return args.select ? toSafeUser(user) : user;
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
    deleteMany: (args: {
      where: { id: string; user_id: string };
    }): { count: number } => {
      const before = this.sessions.length;
      this.sessions = this.sessions.filter(
        (session) =>
          !(
            session.id === args.where.id &&
            session.user_id === args.where.user_id
          ),
      );
      return { count: before - this.sessions.length };
    },
  };

  currency = {
    findUnique: (args: { where: { id: string } }): FakeCurrency | null => {
      return this.currencies.find((item) => item.id === args.where.id) ?? null;
    },
  };

  account = {
    create: (args: { data: Partial<FakeAccount> }): FakeAccount => {
      const now = new Date();
      const account: FakeAccount = {
        id: this.nextId(),
        user_id: args.data.user_id ?? '',
        currency_id: args.data.currency_id ?? '',
        name: args.data.name ?? '',
        type: args.data.type ?? 'cash',
        description: args.data.description ?? null,
        balance: '0',
        is_active: true,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.accounts.push(account);
      return account;
    },
    findFirst: (args: {
      where: { id: string; user_id: string };
    }): FakeAccount | null => {
      return (
        this.accounts.find(
          (account) =>
            account.id === args.where.id &&
            account.user_id === args.where.user_id,
        ) ?? null
      );
    },
    findMany: (args: { where: { user_id: string } }): FakeAccount[] => {
      return this.accounts.filter(
        (account) => account.user_id === args.where.user_id,
      );
    },
    update: (args: {
      where: { id: string };
      data: Partial<FakeAccount>;
    }): FakeAccount => {
      const account = this.accounts.find((item) => item.id === args.where.id);
      if (!account) {
        throw new Error('Account not found');
      }
      for (const [key, value] of Object.entries(args.data)) {
        const record = account as unknown as Record<string, unknown>;
        if (
          value &&
          typeof value === 'object' &&
          'increment' in (value as Record<string, unknown>)
        ) {
          record[key] = new Prisma.Decimal(record[key] ?? 0)
            .plus((value as { increment: Prisma.Decimal }).increment)
            .toFixed(2);
        } else if (
          value &&
          typeof value === 'object' &&
          'decrement' in (value as Record<string, unknown>)
        ) {
          record[key] = new Prisma.Decimal(record[key] ?? 0)
            .minus((value as { decrement: Prisma.Decimal }).decrement)
            .toFixed(2);
        } else {
          record[key] = value;
        }
      }
      account.updated_at = new Date();
      return account;
    },
  };

  category = {
    create: (args: { data: Partial<FakeCategory> }): FakeCategory => {
      const now = new Date();
      const category: FakeCategory = {
        id: this.nextId(),
        user_id: args.data.user_id ?? null,
        name: args.data.name ?? '',
        type: args.data.type ?? 'expense',
        description: args.data.description ?? null,
        color: args.data.color ?? null,
        icon: args.data.icon ?? null,
        is_active: true,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.categories.push(category);
      return category;
    },
    findMany: (args: {
      where: { OR: Array<{ user_id: string | null }>; type?: string };
    }): FakeCategory[] => {
      const userId = args.where.OR[1].user_id;
      return this.categories.filter(
        (category) =>
          (category.user_id === null || category.user_id === userId) &&
          (!args.where.type || category.type === args.where.type),
      );
    },
    findFirst: (args: {
      where: {
        id: string;
        user_id?: string;
        OR?: Array<{ user_id: string | null }>;
      };
    }): FakeCategory | null => {
      const { where } = args;
      return (
        this.categories.find((category) => {
          if (category.id !== where.id) {
            return false;
          }
          if (where.OR) {
            return (
              category.user_id === null ||
              category.user_id === where.OR[1].user_id
            );
          }
          return category.user_id === where.user_id;
        }) ?? null
      );
    },
    update: (args: {
      where: { id: string };
      data: Partial<FakeCategory>;
    }): FakeCategory => {
      const category = this.categories.find(
        (item) => item.id === args.where.id,
      );
      if (!category) {
        throw new Error('Category not found');
      }
      Object.assign(category, args.data, { updated_at: new Date() });
      return category;
    },
  };

  paymentMethod = {
    findFirst: (args: {
      where: { id: string; user_id: string };
    }): FakePaymentMethod | null => {
      return (
        this.paymentMethods.find(
          (method) =>
            method.id === args.where.id &&
            method.user_id === args.where.user_id,
        ) ?? null
      );
    },
  };

  movement = {
    create: (args: { data: Partial<FakeMovement> }): FakeMovement => {
      const now = new Date();
      const movement: FakeMovement = {
        id: this.nextId(),
        user_id: args.data.user_id ?? '',
        account_id: args.data.account_id ?? '',
        category_id: args.data.category_id ?? null,
        payment_method_id: args.data.payment_method_id ?? null,
        currency_id: args.data.currency_id ?? '',
        transfer_account_id: args.data.transfer_account_id ?? null,
        amount: args.data.amount ?? '0',
        type: args.data.type ?? 'expense',
        description: args.data.description ?? null,
        movement_date: args.data.movement_date ?? new Date(),
        reference: args.data.reference ?? null,
        notes: args.data.notes ?? null,
        created_at: now,
        updated_at: now,
      };
      this.movements.push(movement);
      return movement;
    },
    findMany: (args: { where: MovementWhere }): FakeMovement[] => {
      const { where } = args;
      return this.movements
        .filter((movement) => {
          if (where.user_id && movement.user_id !== where.user_id) {
            return false;
          }
          if (where.account_id && movement.account_id !== where.account_id) {
            return false;
          }
          if (where.category_id && movement.category_id !== where.category_id) {
            return false;
          }
          if (where.type && movement.type !== where.type) {
            return false;
          }
          if (
            where.movement_date?.gte &&
            movement.movement_date < where.movement_date.gte
          ) {
            return false;
          }
          if (
            where.movement_date?.lte &&
            movement.movement_date > where.movement_date.lte
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.movement_date.getTime() - a.movement_date.getTime());
    },
    findFirst: (args: {
      where: { id: string; user_id: string };
    }): FakeMovement | null => {
      return (
        this.movements.find(
          (movement) =>
            movement.id === args.where.id &&
            movement.user_id === args.where.user_id,
        ) ?? null
      );
    },
    update: (args: {
      where: { id: string };
      data: Partial<FakeMovement>;
    }): FakeMovement => {
      const movement = this.movements.find((item) => item.id === args.where.id);
      if (!movement) {
        throw new Error('Movement not found');
      }
      Object.assign(movement, args.data, { updated_at: new Date() });
      return movement;
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

async function createAccount(
  app: INestApplication<App>,
  token: string,
  name: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/accounts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, type: 'cash', currency_id: USD_ID })
    .expect(201);
  return (response.body as { id: string }).id;
}

async function createCategory(
  app: INestApplication<App>,
  token: string,
  name: string,
  type: 'income' | 'expense',
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, type })
    .expect(201);
  return (response.body as { id: string }).id;
}

describe('Categories and Movements (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: InMemoryPrismaService;
  let tokenA: string;
  let tokenB: string;
  let userAId: string;
  let userBId: string;
  let accountA1: string;
  let accountA2: string;
  let accountB1: string;
  let categoryA: string;
  let categoryB: string;
  let paymentMethodA: string;
  let paymentMethodB: string;
  let movementId: string;

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();
    app = await createApp(prisma);

    const ana = await registerAndLogin(app, 'ana@example.com', 'Password123');
    const bruno = await registerAndLogin(
      app,
      'bruno@example.com',
      'Password123',
    );
    tokenA = ana.token;
    userAId = ana.userId;
    tokenB = bruno.token;
    userBId = bruno.userId;

    paymentMethodA = prisma.addPaymentMethod(userAId, 'Tarjeta A').id;
    paymentMethodB = prisma.addPaymentMethod(userBId, 'Tarjeta B').id;

    accountA1 = await createAccount(app, tokenA, 'Cuenta A1');
    accountA2 = await createAccount(app, tokenA, 'Cuenta A2');
    accountB1 = await createAccount(app, tokenB, 'Cuenta B1');

    categoryA = await createCategory(app, tokenA, 'Alimentación', 'expense');
    categoryB = await createCategory(app, tokenB, 'Ocio', 'expense');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('categories', () => {
    it('rejects unauthenticated access', async () => {
      await request(app.getHttpServer()).get('/api/categories').expect(401);
    });

    it('lists system categories and the user own categories', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const ids = (response.body as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toEqual(
        expect.arrayContaining([SYS_EXPENSE_ID, SYS_INCOME_ID, categoryA]),
      );
      expect(ids).not.toContain(categoryB);
    });

    it('creates a custom category', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Transporte', type: 'expense', color: '#123456' })
        .expect(201);

      const body = response.body as {
        user_id: string;
        is_active: boolean;
        type: string;
      };
      expect(body.user_id).toBe(userAId);
      expect(body.is_active).toBe(true);
      expect(body.type).toBe('expense');
    });

    it('rejects an invalid category type', async () => {
      await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Mala', type: 'nope' })
        .expect(400);
    });

    it('updates an owned category', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/categories/${categoryA}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Comida' })
        .expect(200);
      expect((response.body as { name: string }).name).toBe('Comida');
    });

    it('cannot modify a system category', async () => {
      await request(app.getHttpServer())
        .patch(`/api/categories/${SYS_EXPENSE_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hackeada' })
        .expect(404);
    });

    it("cannot modify another user's category", async () => {
      await request(app.getHttpServer())
        .patch(`/api/categories/${categoryB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hackeada' })
        .expect(404);
    });

    it('deactivates an owned category', async () => {
      const temp = await createCategory(app, tokenA, 'Temporal', 'expense');
      const response = await request(app.getHttpServer())
        .patch(`/api/categories/${temp}/deactivate`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((response.body as { is_active: boolean }).is_active).toBe(false);
    });
  });

  describe('movements', () => {
    it('rejects unauthenticated access', async () => {
      await request(app.getHttpServer()).get('/api/movements').expect(401);
    });

    it('creates an income movement', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          category_id: SYS_INCOME_ID,
          currency_id: USD_ID,
          amount: 100.5,
          type: 'income',
          movement_date: '2026-01-15',
        })
        .expect(201);

      const body = response.body as { amount: string; type: string };
      expect(body.amount).toBe('100.5');
      expect(body.type).toBe('income');
    });

    it('creates an expense movement with a payment method', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          category_id: categoryA,
          payment_method_id: paymentMethodA,
          currency_id: USD_ID,
          amount: 25,
          type: 'expense',
          movement_date: '2026-01-16',
        })
        .expect(201);

      movementId = (response.body as { id: string }).id;
      expect(movementId).toBeDefined();
    });

    it('rejects an account the user does not own', async () => {
      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountB1,
          currency_id: USD_ID,
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        })
        .expect(400);
    });

    it('rejects a non-positive amount', async () => {
      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          currency_id: USD_ID,
          amount: 0,
          type: 'expense',
          movement_date: '2026-01-15',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          currency_id: USD_ID,
          amount: -5,
          type: 'expense',
          movement_date: '2026-01-15',
        })
        .expect(400);
    });

    it('rejects an amount with more than two decimals', async () => {
      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          currency_id: USD_ID,
          amount: 10.999,
          type: 'expense',
          movement_date: '2026-01-15',
        })
        .expect(400);
    });

    it('rejects a missing required field (account_id)', async () => {
      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          currency_id: USD_ID,
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        })
        .expect(400);
    });

    it('rejects a category type that does not match the movement', async () => {
      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          category_id: categoryA,
          currency_id: USD_ID,
          amount: 10,
          type: 'income',
          movement_date: '2026-01-15',
        })
        .expect(400);
    });

    it("rejects another user's category", async () => {
      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          category_id: categoryB,
          currency_id: USD_ID,
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        })
        .expect(400);
    });

    it("rejects another user's payment method", async () => {
      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          payment_method_id: paymentMethodB,
          currency_id: USD_ID,
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        })
        .expect(400);
    });

    it('requires a destination account for transfers', async () => {
      await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          currency_id: USD_ID,
          amount: 10,
          type: 'transfer',
          movement_date: '2026-01-15',
        })
        .expect(400);
    });

    it('creates a transfer between two owned accounts', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          account_id: accountA1,
          transfer_account_id: accountA2,
          currency_id: USD_ID,
          amount: 30,
          type: 'transfer',
          movement_date: '2026-01-17',
        })
        .expect(201);
      expect((response.body as { type: string }).type).toBe('transfer');
    });

    it('lists the user movements', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/movements')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(response.body as unknown[]).toHaveLength(3);
    });

    it('filters by type', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/movements')
        .query({ type: 'income' })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const body = response.body as Array<{ type: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].type).toBe('income');
    });

    it('filters by category', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/movements')
        .query({ category_id: categoryA })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const body = response.body as Array<{ category_id: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].category_id).toBe(categoryA);
    });

    it('filters by date range', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/movements')
        .query({ start_date: '2026-01-17', end_date: '2026-01-31' })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const body = response.body as Array<{ type: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].type).toBe('transfer');
    });

    it('rejects an invalid filter value', async () => {
      await request(app.getHttpServer())
        .get('/api/movements')
        .query({ type: 'invalid' })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/movements')
        .query({ account_id: 'not-a-uuid' })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });

    it('retrieves one owned movement and rejects another user movement', async () => {
      await request(app.getHttpServer())
        .get(`/api/movements/${movementId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/movements/${movementId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('updates an owned movement', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/movements/${movementId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 40, description: 'Ajustado' })
        .expect(200);
      const body = response.body as { amount: string; description: string };
      expect(body.amount).toBe('40');
      expect(body.description).toBe('Ajustado');
    });

    it('validates the new account when updating', async () => {
      await request(app.getHttpServer())
        .patch(`/api/movements/${movementId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ account_id: accountB1 })
        .expect(400);
    });

    it("rejects updating another user's movement", async () => {
      await request(app.getHttpServer())
        .patch(`/api/movements/${movementId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ amount: 40 })
        .expect(404);
    });

    it('returns 404 for a missing movement', async () => {
      await request(app.getHttpServer())
        .get(`/api/movements/${MISSING_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });

  describe('account balances (H-02)', () => {
    async function balanceOf(
      accountId: string,
      token: string,
    ): Promise<string> {
      const response = await request(app.getHttpServer())
        .get('/api/accounts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const account = (
        response.body as Array<{ id: string; balance: string }>
      ).find((item) => item.id === accountId);
      return account?.balance ?? '';
    }

    it('reflects incomes, expenses, transfers and the edit adjustment', async () => {
      expect(await balanceOf(accountA1, tokenA)).toBe('30.50');
      expect(await balanceOf(accountA2, tokenA)).toBe('30.00');
    });

    it('does not modify other users accounts', async () => {
      expect(await balanceOf(accountB1, tokenB)).toBe('0');
    });
  });
});
