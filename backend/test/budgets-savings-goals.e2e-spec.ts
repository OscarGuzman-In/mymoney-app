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

interface FakeCategory {
  id: string;
  user_id: string | null;
  name: string;
  type: string;
  is_active: boolean;
}

interface FakeBudget {
  id: string;
  user_id: string;
  currency_id: string;
  name: string;
  amount: string;
  start_date: Date;
  end_date: Date;
  status: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface FakeBudgetCategory {
  id: string;
  budget_id: string;
  category_id: string;
  amount: string;
  created_at: Date;
  updated_at: Date;
}

interface FakeSavingsGoal {
  id: string;
  user_id: string;
  currency_id: string;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: Date;
  status: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface FakeContribution {
  id: string;
  savings_goal_id: string;
  amount: string;
  contribution_date: Date;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CategoryAmount {
  category_id: string;
  amount: string;
}

interface BudgetCreateData {
  user_id: string;
  currency_id: string;
  name: string;
  amount: string;
  start_date: Date;
  end_date: Date;
  status?: string;
  description: string | null;
  budget_categories?: { create: CategoryAmount[] };
}

interface BudgetUpdateData {
  currency_id?: string;
  name?: string;
  amount?: string;
  start_date?: Date;
  end_date?: Date;
  status?: string;
  description?: string | null;
  budget_categories?: {
    deleteMany: Record<string, never>;
    create: CategoryAmount[];
  };
}

interface GoalCreateData {
  user_id: string;
  currency_id: string;
  name: string;
  target_amount: string;
  target_date: Date;
  status?: string;
  description: string | null;
}

interface GoalUpdateData {
  currency_id?: string;
  name?: string;
  target_amount?: string;
  target_date?: Date;
  status?: string;
  description?: string | null;
  current_amount?: unknown;
}

interface ContributionCreateData {
  savings_goal_id: string;
  amount: unknown;
  contribution_date: Date;
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
  private budgets: FakeBudget[] = [];
  private budgetCategories: FakeBudgetCategory[] = [];
  private savingsGoals: FakeSavingsGoal[] = [];
  private contributions: FakeContribution[] = [];
  private categories: FakeCategory[] = [
    {
      id: SYS_EXPENSE_ID,
      user_id: null,
      name: 'Sistema gasto',
      type: 'expense',
      is_active: true,
    },
  ];
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

  private withBudgetCategories(budget: FakeBudget) {
    return {
      ...budget,
      budget_categories: this.budgetCategories
        .filter((item) => item.budget_id === budget.id)
        .map((item) => ({ ...item })),
    };
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

  category = {
    findMany: (args: {
      where: {
        id?: { in: string[] };
        OR?: Array<{ user_id: string | null }>;
        type?: string;
      };
    }): FakeCategory[] => {
      const { where } = args;
      return this.categories.filter((category) => {
        if (where.id?.in && !where.id.in.includes(category.id)) {
          return false;
        }
        if (where.type && category.type !== where.type) {
          return false;
        }
        if (where.OR) {
          const allowed = where.OR.some((option) =>
            option.user_id === null
              ? category.user_id === null
              : category.user_id === option.user_id,
          );
          if (!allowed) {
            return false;
          }
        }
        return true;
      });
    },
    create: (args: { data: Partial<FakeCategory> }): FakeCategory => {
      const category: FakeCategory = {
        id: this.nextId(),
        user_id: args.data.user_id ?? null,
        name: args.data.name ?? '',
        type: args.data.type ?? 'expense',
        is_active: true,
      };
      this.categories.push(category);
      return category;
    },
  };

  budget = {
    create: (args: { data: BudgetCreateData }) => {
      const { data } = args;
      const now = new Date();
      const budget: FakeBudget = {
        id: this.nextId(),
        user_id: data.user_id,
        currency_id: data.currency_id,
        name: data.name,
        amount: data.amount,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status ?? 'active',
        description: data.description ?? null,
        is_active: true,
        created_at: now,
        updated_at: now,
      };
      this.budgets.push(budget);
      data.budget_categories?.create.forEach((item) => {
        this.budgetCategories.push({
          id: this.nextId(),
          budget_id: budget.id,
          category_id: item.category_id,
          amount: item.amount,
          created_at: now,
          updated_at: now,
        });
      });
      return this.withBudgetCategories(budget);
    },
    findMany: (args: { where: { user_id: string } }) => {
      return this.budgets
        .filter((budget) => budget.user_id === args.where.user_id)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map((budget) => this.withBudgetCategories(budget));
    },
    findFirst: (args: { where: { id: string; user_id: string } }): unknown => {
      const budget = this.budgets.find(
        (item) =>
          item.id === args.where.id && item.user_id === args.where.user_id,
      );
      return budget ? this.withBudgetCategories(budget) : null;
    },
    update: (args: { where: { id: string }; data: BudgetUpdateData }) => {
      const budget = this.budgets.find((item) => item.id === args.where.id);
      if (!budget) {
        throw new Error('Budget not found');
      }
      const { budget_categories, ...rest } = args.data;
      const target = budget as unknown as Record<string, unknown>;
      Object.entries(rest).forEach(([key, value]) => {
        if (value !== undefined) {
          target[key] = value;
        }
      });
      budget.updated_at = new Date();
      if (budget_categories) {
        this.budgetCategories = this.budgetCategories.filter(
          (item) => item.budget_id !== budget.id,
        );
        budget_categories.create.forEach((item) => {
          this.budgetCategories.push({
            id: this.nextId(),
            budget_id: budget.id,
            category_id: item.category_id,
            amount: item.amount,
            created_at: new Date(),
            updated_at: new Date(),
          });
        });
      }
      return this.withBudgetCategories(budget);
    },
  };

  savingsGoal = {
    create: (args: { data: GoalCreateData }): FakeSavingsGoal => {
      const { data } = args;
      const now = new Date();
      const goal: FakeSavingsGoal = {
        id: this.nextId(),
        user_id: data.user_id,
        currency_id: data.currency_id,
        name: data.name,
        target_amount: data.target_amount,
        current_amount: '0',
        target_date: data.target_date,
        status: data.status ?? 'active',
        description: data.description ?? null,
        is_active: true,
        created_at: now,
        updated_at: now,
      };
      this.savingsGoals.push(goal);
      return goal;
    },
    findMany: (args: { where: { user_id: string } }): FakeSavingsGoal[] => {
      return this.savingsGoals
        .filter((goal) => goal.user_id === args.where.user_id)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    },
    findFirst: (args: {
      where: { id: string; user_id: string };
    }): FakeSavingsGoal | null => {
      return (
        this.savingsGoals.find(
          (goal) =>
            goal.id === args.where.id && goal.user_id === args.where.user_id,
        ) ?? null
      );
    },
    update: (args: {
      where: { id: string };
      data: GoalUpdateData;
    }): FakeSavingsGoal => {
      const goal = this.savingsGoals.find((item) => item.id === args.where.id);
      if (!goal) {
        throw new Error('Savings goal not found');
      }
      const target = goal as unknown as Record<string, unknown>;
      Object.entries(args.data).forEach(([key, value]) => {
        if (value === undefined) {
          return;
        }
        target[key] = key === 'current_amount' ? String(value) : value;
      });
      goal.updated_at = new Date();
      return goal;
    },
  };

  savingsGoalContribution = {
    create: (args: { data: ContributionCreateData }): FakeContribution => {
      const { data } = args;
      const now = new Date();
      const contribution: FakeContribution = {
        id: this.nextId(),
        savings_goal_id: data.savings_goal_id,
        amount: String(data.amount),
        contribution_date: data.contribution_date,
        notes: data.notes,
        created_at: now,
        updated_at: now,
      };
      this.contributions.push(contribution);
      return contribution;
    },
    findMany: (args: {
      where: { savings_goal_id: string };
    }): FakeContribution[] => {
      return this.contributions
        .filter((item) => item.savings_goal_id === args.where.savings_goal_id)
        .sort(
          (a, b) =>
            b.contribution_date.getTime() - a.contribution_date.getTime(),
        );
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

describe('Budgets and Savings Goals (e2e)', () => {
  let app: INestApplication<App>;
  let tokenA: string;
  let tokenB: string;
  let budgetA: string;
  let budgetB: string;
  let goalA: string;
  let goalB: string;

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

    const createdBudgetA = await request(app.getHttpServer())
      .post('/api/budgets')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Presupuesto A',
        currency_id: USD_ID,
        amount: 500,
        start_date: '2026-01-01',
        end_date: '2026-01-31',
      })
      .expect(201);
    budgetA = (createdBudgetA.body as { id: string }).id;

    const createdBudgetB = await request(app.getHttpServer())
      .post('/api/budgets')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Presupuesto B',
        currency_id: USD_ID,
        amount: 300,
        start_date: '2026-01-01',
        end_date: '2026-01-31',
      })
      .expect(201);
    budgetB = (createdBudgetB.body as { id: string }).id;

    const createdGoalA = await request(app.getHttpServer())
      .post('/api/savings-goals')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Viaje',
        currency_id: USD_ID,
        target_amount: 2000,
        target_date: '2026-12-31',
      })
      .expect(201);
    goalA = (createdGoalA.body as { id: string }).id;

    const createdGoalB = await request(app.getHttpServer())
      .post('/api/savings-goals')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Auto',
        currency_id: USD_ID,
        target_amount: 5000,
        target_date: '2026-12-31',
      })
      .expect(201);
    goalB = (createdGoalB.body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('budgets', () => {
    it('rejects unauthenticated access', async () => {
      await request(app.getHttpServer()).get('/api/budgets').expect(401);
    });

    it('creates a budget with category assignments', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/budgets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Mensual',
          currency_id: USD_ID,
          amount: 800,
          start_date: '2026-02-01',
          end_date: '2026-02-28',
          categories: [{ category_id: SYS_EXPENSE_ID, amount: 200.5 }],
        })
        .expect(201);

      const body = response.body as {
        amount: string;
        budget_categories: Array<{ category_id: string; amount: string }>;
      };
      expect(body.amount).toBe('800');
      expect(body.budget_categories).toHaveLength(1);
      expect(body.budget_categories[0].amount).toBe('200.5');
    });

    it('rejects a start date after the end date', async () => {
      await request(app.getHttpServer())
        .post('/api/budgets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Mal',
          currency_id: USD_ID,
          amount: 800,
          start_date: '2026-03-01',
          end_date: '2026-02-01',
        })
        .expect(400);
    });

    it('rejects a non-positive or overly precise amount', async () => {
      for (const amount of [0, -10, 10.999]) {
        await request(app.getHttpServer())
          .post('/api/budgets')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({
            name: 'Mal',
            currency_id: USD_ID,
            amount,
            start_date: '2026-02-01',
            end_date: '2026-02-28',
          })
          .expect(400);
      }
    });

    it('rejects an unavailable category', async () => {
      await request(app.getHttpServer())
        .post('/api/budgets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Mal',
          currency_id: USD_ID,
          amount: 800,
          start_date: '2026-02-01',
          end_date: '2026-02-28',
          categories: [{ category_id: MISSING_ID, amount: 10 }],
        })
        .expect(400);
    });

    it('lists and retrieves the user budgets', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/budgets')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(list.body as unknown[]).toHaveLength(2);

      await request(app.getHttpServer())
        .get(`/api/budgets/${budgetA}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it("cannot read another user's budget", async () => {
      await request(app.getHttpServer())
        .get(`/api/budgets/${budgetB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('updates an owned budget and replaces its categories', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/budgets/${budgetA}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Presupuesto A2',
          categories: [{ category_id: SYS_EXPENSE_ID, amount: 99.99 }],
        })
        .expect(200);

      const body = response.body as {
        name: string;
        budget_categories: Array<{ amount: string }>;
      };
      expect(body.name).toBe('Presupuesto A2');
      expect(body.budget_categories).toHaveLength(1);
      expect(body.budget_categories[0].amount).toBe('99.99');
    });

    it('rejects updating with an unavailable category', async () => {
      await request(app.getHttpServer())
        .patch(`/api/budgets/${budgetA}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ categories: [{ category_id: MISSING_ID, amount: 10 }] })
        .expect(400);
    });

    it("cannot update another user's budget", async () => {
      await request(app.getHttpServer())
        .patch(`/api/budgets/${budgetB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hackeado' })
        .expect(404);
    });

    it('deactivates an owned budget', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/budgets/${budgetA}/deactivate`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((response.body as { is_active: boolean }).is_active).toBe(false);
    });

    it("cannot deactivate another user's budget", async () => {
      await request(app.getHttpServer())
        .patch(`/api/budgets/${budgetB}/deactivate`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });

  describe('savings goals', () => {
    it('rejects unauthenticated access', async () => {
      await request(app.getHttpServer()).get('/api/savings-goals').expect(401);
    });

    it('creates a savings goal', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/savings-goals')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Notebook',
          currency_id: USD_ID,
          target_amount: 1500,
          target_date: '2026-10-31',
        })
        .expect(201);

      const body = response.body as {
        target_amount: string;
        current_amount: string;
        status: string;
      };
      expect(body.target_amount).toBe('1500');
      expect(body.current_amount).toBe('0');
      expect(body.status).toBe('active');
    });

    it('rejects a non-positive or overly precise target amount', async () => {
      for (const target_amount of [0, -5, 1.123]) {
        await request(app.getHttpServer())
          .post('/api/savings-goals')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({
            name: 'Mal',
            currency_id: USD_ID,
            target_amount,
            target_date: '2026-10-31',
          })
          .expect(400);
      }
    });

    it('lists and retrieves the user goals', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/savings-goals')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(list.body as unknown[]).toHaveLength(2);

      await request(app.getHttpServer())
        .get(`/api/savings-goals/${goalA}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it("cannot read another user's goal", async () => {
      await request(app.getHttpServer())
        .get(`/api/savings-goals/${goalB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it("cannot update another user's goal", async () => {
      await request(app.getHttpServer())
        .patch(`/api/savings-goals/${goalB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hackeado' })
        .expect(404);
    });

    it('records contributions and updates the goal total', async () => {
      const first = await request(app.getHttpServer())
        .post(`/api/savings-goals/${goalA}/contributions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 100.5, contribution_date: '2026-06-15' })
        .expect(201);
      expect((first.body as { amount: string }).amount).toBe('100.5');

      await request(app.getHttpServer())
        .post(`/api/savings-goals/${goalA}/contributions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 50.25, contribution_date: '2026-07-15' })
        .expect(201);

      const goal = await request(app.getHttpServer())
        .get(`/api/savings-goals/${goalA}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((goal.body as { current_amount: string }).current_amount).toBe(
        '150.75',
      );
    });

    it('lists the contribution history', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/savings-goals/${goalA}/contributions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(response.body as unknown[]).toHaveLength(2);
    });

    it("rejects a contribution to another user's goal", async () => {
      await request(app.getHttpServer())
        .post(`/api/savings-goals/${goalB}/contributions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 10, contribution_date: '2026-06-15' })
        .expect(404);
    });

    it("rejects listing another user's contributions", async () => {
      await request(app.getHttpServer())
        .get(`/api/savings-goals/${goalB}/contributions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('rejects a non-positive contribution amount', async () => {
      await request(app.getHttpServer())
        .post(`/api/savings-goals/${goalA}/contributions`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 0, contribution_date: '2026-06-15' })
        .expect(400);
    });

    it('marks an owned goal as completed', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/savings-goals/${goalA}/complete`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((response.body as { status: string }).status).toBe('completed');
    });

    it('deactivates an owned goal', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/savings-goals/${goalA}/deactivate`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((response.body as { is_active: boolean }).is_active).toBe(false);
    });
  });
});
