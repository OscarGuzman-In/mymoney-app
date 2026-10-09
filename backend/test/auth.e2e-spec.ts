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

class InMemoryPrismaService {
  private users: FakeUser[] = [];
  private sessions: FakeSession[] = [];
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
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
        id: this.nextId('user'),
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
    }): FakeUser | null => {
      const { where } = args;
      if (where.id) {
        return this.users.find((user) => user.id === where.id) ?? null;
      }
      if (where.email) {
        return this.users.find((user) => user.email === where.email) ?? null;
      }
      return null;
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
        throw new Error(`Session ${args.where.id} not found`);
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
}

async function createAuthApp(
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

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = await createAuthApp(new InMemoryPrismaService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/auth/register creates a user without exposing the hash', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'User@Example.com',
        password: 'Password123',
        first_name: 'Ana',
      })
      .expect(201);

    const body = response.body as { email: string; first_name: string };
    expect(body.email).toBe('user@example.com');
    expect(body.first_name).toBe('Ana');
    expect(response.body).not.toHaveProperty('password');
  });

  it('POST /api/auth/register returns 409 for a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'Password123' })
      .expect(409);
  });

  it('POST /api/auth/register returns 400 for an invalid DTO', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('POST /api/auth/register returns 400 for unexpected fields', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'extra@example.com',
        password: 'Password123',
        is_active: true,
      })
      .expect(400);
  });

  it('POST /api/auth/login returns tokens for valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Password123' })
      .expect(200);

    const body = response.body as {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    };
    expect(body.access_token).toEqual(expect.any(String));
    expect(body.refresh_token).toEqual(expect.any(String));
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(1800);
    accessToken = body.access_token;
    refreshToken = body.refresh_token;
  });

  it('POST /api/auth/login returns generic 401 for wrong credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass1' })
      .expect(401);
  });

  it('GET /api/auth/me rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('GET /api/auth/me returns the authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as { email: string };
    expect(body.email).toBe('user@example.com');
    expect(response.body).not.toHaveProperty('password');
  });

  it('POST /api/auth/refresh issues a new access token and reuses the refresh token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(200);

    const body = response.body as {
      access_token: string;
      refresh_token: string;
    };
    expect(body.access_token).toEqual(expect.any(String));
    expect(body.refresh_token).toBe(refreshToken);
    accessToken = body.access_token;
  });

  it('POST /api/auth/logout invalidates only the current session', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(401);
  });
});

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createAuthApp(new InMemoryPrismaService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 after 5 login attempts in a minute', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password123' });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});
