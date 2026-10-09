import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { Prisma } from './../src/generated/prisma/client';
import { PrismaService } from './../src/prisma/prisma.service';

const TEST_JWT_SECRET = 'e2e-test-jwt-secret-do-not-use-in-prod';
const USD_ID = '00000000-0000-4000-8000-000000000001';
const MISSING_CURRENCY_ID = '00000000-0000-4000-8000-000000000099';

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

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  user = {
    create: (args: {
      data: Partial<FakeUser> & { password: string };
    }): FakeUser => {
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
        id: this.nextId('user'),
        email: data.email ?? '',
        password: data.password,
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
        id: this.nextId('session'),
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
      where: { id?: string | { not: string }; user_id: string };
    }): { count: number } => {
      const before = this.sessions.length;
      const { user_id } = args.where;
      const idFilter = args.where.id;
      this.sessions = this.sessions.filter((session) => {
        if (session.user_id !== user_id) {
          return true;
        }
        if (typeof idFilter === 'string') {
          return session.id !== idFilter;
        }
        if (idFilter && typeof idFilter === 'object') {
          return session.id === idFilter.not;
        }
        return false;
      });
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
        id: this.nextId('account'),
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
    findMany: (args: { where: { user_id: string } }): FakeAccount[] => {
      return this.accounts
        .filter((account) => account.user_id === args.where.user_id)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
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
    update: (args: {
      where: { id: string };
      data: Partial<FakeAccount>;
    }): FakeAccount => {
      const account = this.accounts.find((item) => item.id === args.where.id);
      if (!account) {
        throw new Error('Account not found');
      }
      Object.assign(account, args.data, { updated_at: new Date() });
      return account;
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
): Promise<string> {
  await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password })
    .expect(201);

  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return (response.body as { access_token: string }).access_token;
}

describe('Users and Accounts (e2e)', () => {
  let app: INestApplication<App>;
  let tokenA: string;
  let tokenB: string;
  let accountId: string;
  let anaSecondToken: string;

  beforeAll(async () => {
    app = await createApp(new InMemoryPrismaService());
    tokenA = await registerAndLogin(app, 'ana@example.com', 'Password123');
    tokenB = await registerAndLogin(app, 'bruno@example.com', 'Password123');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('users', () => {
    it('rejects unauthenticated profile access', async () => {
      await request(app.getHttpServer()).get('/api/users/me').expect(401);
    });

    it('returns the authenticated profile without the password', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const body = response.body as { email: string };
      expect(body.email).toBe('ana@example.com');
      expect(response.body).not.toHaveProperty('password');
    });

    it('updates only the editable profile fields', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ first_name: 'Ana', last_name: 'García', is_active: false })
        .expect(400);

      expect(response.status).toBe(400);

      const updated = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ first_name: 'Ana', last_name: 'García' })
        .expect(200);

      const body = updated.body as { first_name: string; last_name: string };
      expect(body.first_name).toBe('Ana');
      expect(body.last_name).toBe('García');
    });

    it('changes the password and allows login with the new one', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ current_password: 'Password123', new_password: 'NewPass456' })
        .expect(200);

      const secondSession = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: 'NewPass456' })
        .expect(200);
      anaSecondToken = (secondSession.body as { access_token: string })
        .access_token;

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: 'Password123' })
        .expect(401);
    });

    it('rejects a password change with an incorrect current password', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ current_password: 'WrongPass0', new_password: 'OtherPass789' })
        .expect(400);
    });

    it('revokes other sessions but keeps the current one after a password change', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          current_password: 'NewPass456',
          new_password: 'RotatedPass456',
        })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${anaSecondToken}`)
        .expect(401);
    });
  });

  describe('accounts', () => {
    it('rejects unauthenticated account access', async () => {
      await request(app.getHttpServer()).get('/api/accounts').expect(401);
    });

    it('rejects an unknown currency', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Caja', type: 'cash', currency_id: MISSING_CURRENCY_ID })
        .expect(400);
    });

    it('rejects an invalid account type', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Caja', type: 'nope', currency_id: USD_ID })
        .expect(400);
    });

    it('creates an account owned by the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Ahorros',
          type: 'savings_account',
          currency_id: USD_ID,
        })
        .expect(201);

      const body = response.body as { id: string; name: string };
      accountId = body.id;
      expect(body.name).toBe('Ahorros');
    });

    it('lists only the authenticated user accounts', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const body = response.body as Array<{ id: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(accountId);

      const otherUser = await request(app.getHttpServer())
        .get('/api/accounts')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(otherUser.body as unknown[]).toHaveLength(0);
    });

    it('retrieves one owned account', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/accounts/${accountId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((response.body as { id: string }).id).toBe(accountId);
    });

    it("rejects access to another user's account", async () => {
      await request(app.getHttpServer())
        .get(`/api/accounts/${accountId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/accounts/${accountId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hackeada' })
        .expect(404);
    });

    it('updates an owned account', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/accounts/${accountId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Ahorros 2026' })
        .expect(200);
      expect((response.body as { name: string }).name).toBe('Ahorros 2026');
    });

    it('deactivates an owned account instead of deleting it', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/accounts/${accountId}/deactivate`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((response.body as { is_active: boolean }).is_active).toBe(false);
    });

    it('returns 404 for a missing account', async () => {
      await request(app.getHttpServer())
        .get('/api/accounts/does-not-exist')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });
});
