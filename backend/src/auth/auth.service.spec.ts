import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, BCRYPT_ROUNDS } from './auth.service';

interface MockPrisma {
  user: { create: jest.Mock; findUnique: jest.Mock };
  session: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
}

interface MockJwt {
  signAsync: jest.Mock;
}

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

function createContext(): {
  prisma: MockPrisma;
  jwtService: MockJwt;
  service: AuthService;
} {
  const prisma: MockPrisma = {
    user: { create: jest.fn(), findUnique: jest.fn() },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const jwtService: MockJwt = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwtService as unknown as JwtService,
  );
  return { prisma, jwtService, service };
}

function uniqueError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['email'] },
  });
}

describe('AuthService', () => {
  describe('register', () => {
    it('normalizes the email, hashes the password and returns a safe user', async () => {
      const { prisma, service } = createContext();
      let createdData: {
        email: string;
        password: string;
        first_name: string | null;
        last_name: string | null;
      } | null = null;

      prisma.user.create.mockImplementation(
        (args: {
          data: {
            email: string;
            password: string;
            first_name: string | null;
            last_name: string | null;
          };
        }) => {
          createdData = args.data;
          return {
            id: 'user-1',
            ...args.data,
            is_active: true,
            deleted_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          };
        },
      );

      const result = await service.register({
        email: '  User@Example.com ',
        password: 'Password123',
        first_name: 'Ana',
      });

      expect(createdData).not.toBeNull();
      expect(createdData!.email).toBe('user@example.com');
      expect(createdData!.password).not.toBe('Password123');
      expect(createdData!.password).toMatch(/^\$2[aby]\$12\$/);
      await expect(
        bcrypt.compare('Password123', createdData!.password),
      ).resolves.toBe(true);
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe('user@example.com');
    });

    it('rejects passwords longer than 72 bytes before hashing', async () => {
      const { prisma, service } = createContext();
      await expect(
        service.register({ email: 'a@b.com', password: 'a'.repeat(73) }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('maps duplicate email (P2002) to ConflictException', async () => {
      const { prisma, service } = createContext();
      prisma.user.create.mockRejectedValue(uniqueError());

      await expect(
        service.register({ email: 'a@b.com', password: 'Password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens and stores only the refresh-token hash', async () => {
      const { prisma, jwtService, service } = createContext();
      const passwordHash = await bcrypt.hash('Password123', BCRYPT_ROUNDS);
      let storedSession: {
        user_id: string;
        token: string;
        expires_at: Date;
        ip_address: string | null;
        user_agent: string | null;
      } | null = null;

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: passwordHash,
        is_active: true,
        deleted_at: null,
      });
      prisma.session.create.mockImplementation(
        (args: {
          data: {
            user_id: string;
            token: string;
            expires_at: Date;
            ip_address: string | null;
            user_agent: string | null;
          };
        }) => {
          storedSession = args.data;
          return { id: 'session-1', ...args.data };
        },
      );

      const tokens = await service.login(
        { email: 'user@example.com', password: 'Password123' },
        { ip: '127.0.0.1', userAgent: 'jest' },
      );

      expect(tokens.access_token).toBe('signed.jwt.token');
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.expires_in).toBe(1800);
      expect(tokens.refresh_token).toEqual(expect.any(String));
      expect(storedSession).not.toBeNull();
      expect(storedSession!.token).toBe(hashToken(tokens.refresh_token));
      expect(storedSession!.token).not.toBe(tokens.refresh_token);
      expect(storedSession!.user_id).toBe('user-1');
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'user@example.com',
        sid: 'session-1',
      });
    });

    it('returns a generic 401 for a wrong password', async () => {
      const { prisma, service } = createContext();
      const passwordHash = await bcrypt.hash('Password123', BCRYPT_ROUNDS);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: passwordHash,
        is_active: true,
        deleted_at: null,
      });

      await expect(
        service.login({ email: 'user@example.com', password: 'WrongPass1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns a generic 401 for an unknown user', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'Password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects inactive and soft-deleted users', async () => {
      const { prisma, service } = createContext();
      const passwordHash = await bcrypt.hash('Password123', BCRYPT_ROUNDS);

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        password: passwordHash,
        is_active: false,
        deleted_at: null,
      });
      await expect(
        service.login({ email: 'user@example.com', password: 'Password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        password: passwordHash,
        is_active: true,
        deleted_at: new Date(),
      });
      await expect(
        service.login({ email: 'user@example.com', password: 'Password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getCurrentUser', () => {
    it('returns only safe fields', async () => {
      const { prisma, service } = createContext();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-02T00:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: 'super-secret-hash',
        first_name: 'Ana',
        last_name: 'Pérez',
        is_active: true,
        deleted_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });

      const user = await service.getCurrentUser('user-1');

      expect(user).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        first_name: 'Ana',
        last_name: 'Pérez',
        is_active: true,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      expect(user).not.toHaveProperty('password');
    });

    it('rejects missing or inactive users', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.getCurrentUser('missing')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        password: 'hash',
        first_name: null,
        last_name: null,
        is_active: false,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      await expect(service.getCurrentUser('user-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    const rawToken = 'raw-refresh-token';
    const hashedToken = hashToken(rawToken);

    function primeValidSession(prisma: MockPrisma): void {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        user_id: 'user-1',
        token: hashedToken,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        is_active: true,
        deleted_at: null,
      });
    }

    it('reuses the same refresh token and issues a new access token', async () => {
      const { prisma, jwtService, service } = createContext();
      primeValidSession(prisma);
      let updatedData: { last_used_at: Date } | null = null;
      prisma.session.update.mockImplementation(
        (args: { data: { last_used_at: Date } }) => {
          updatedData = args.data;
          return { id: 'session-1' };
        },
      );

      const tokens = await service.refresh({ refresh_token: rawToken });

      expect(tokens.refresh_token).toBe(rawToken);
      expect(tokens.access_token).toBe('signed.jwt.token');
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { token: hashedToken },
      });
      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: updatedData,
      });
      expect(updatedData).not.toBeNull();
      expect(updatedData!.last_used_at).toBeInstanceOf(Date);
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'user@example.com',
        sid: 'session-1',
      });
    });

    it('rejects an unknown or expired token', async () => {
      const { prisma, service } = createContext();
      prisma.session.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.refresh({ refresh_token: rawToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      prisma.session.findUnique.mockResolvedValueOnce({
        id: 'session-1',
        user_id: 'user-1',
        token: hashedToken,
        expires_at: new Date(Date.now() - 1000),
      });
      await expect(
        service.refresh({ refresh_token: rawToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a valid token when the user is inactive', async () => {
      const { prisma, service } = createContext();
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        user_id: 'user-1',
        token: hashedToken,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        is_active: false,
        deleted_at: null,
      });

      await expect(
        service.refresh({ refresh_token: rawToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.session.update).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('deletes only the current session scoped by user', async () => {
      const { prisma, service } = createContext();
      prisma.session.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.logout({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-1', user_id: 'user-1' },
      });
      expect(result).toEqual({ success: true });
    });

    it('is idempotent when the session is already gone', async () => {
      const { prisma, service } = createContext();
      prisma.session.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.logout({ userId: 'user-1', sessionId: 'session-1' }),
      ).resolves.toEqual({ success: true });
    });
  });
});
