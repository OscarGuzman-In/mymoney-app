import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { Prisma } from './../src/generated/prisma/client';
import { PrismaService } from './../src/prisma/prisma.service';

const TEST_JWT_SECRET = 'e2e-test-jwt-secret-do-not-use-in-prod';

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
  private currencies: FakeCurrency[] = [
    {
      id: 'cur-usd',
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      is_active: true,
    },
    {
      id: 'cur-eur',
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      is_active: true,
    },
    {
      id: 'cur-cop',
      code: 'COP',
      name: 'Colombian Peso',
      symbol: '$',
      is_active: true,
    },
    {
      id: 'cur-old',
      code: 'XXX',
      name: 'Obsoleta',
      symbol: null,
      is_active: false,
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
    findMany: (args: {
      where: { is_active: boolean };
      orderBy: { code: 'asc' };
      select: Record<string, boolean>;
    }): Array<Pick<FakeCurrency, 'id' | 'code' | 'name' | 'symbol'>> => {
      return this.currencies
        .filter((currency) => currency.is_active === args.where.is_active)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((currency) => ({
          id: currency.id,
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol,
        }));
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

describe('Currencies (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

  beforeAll(async () => {
    const prisma = new InMemoryPrismaService();
    app = await createApp(prisma);
    token = await registerAndLogin(app, 'ana@example.com', 'Password123');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/currencies').expect(401);
  });

  it('returns active currencies ordered by code with the selector fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/currencies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([
      { id: 'cur-cop', code: 'COP', name: 'Colombian Peso', symbol: '$' },
      { id: 'cur-eur', code: 'EUR', name: 'Euro', symbol: '€' },
      { id: 'cur-usd', code: 'USD', name: 'US Dollar', symbol: '$' },
    ]);
  });

  it('does not expose inactive currencies', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/currencies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const codes = (response.body as Array<{ code: string }>).map(
      (item) => item.code,
    );
    expect(codes).not.toContain('XXX');
  });
});
