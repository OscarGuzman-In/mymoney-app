import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

export const BCRYPT_ROUNDS = 12;
export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const BCRYPT_MAX_BYTES = 72;

const DUMMY_PASSWORD_HASH =
  '$2b$12$uoRQdFmFtOADg/UHwn7nEu5Jzk27qHxXLpAdAySSJGRk5a.dzCghG';

export interface SafeUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}

interface JwtPayload {
  sub: string;
  email: string;
  sid: string;
}

interface UserWithStatus {
  is_active: boolean;
  deleted_at: Date | null;
}

interface UserRecord {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<SafeUser> {
    const email = this.normalizeEmail(dto.email);
    this.assertPasswordByteLength(dto.password);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: passwordHash,
          first_name: dto.first_name ?? null,
          last_name: dto.last_name ?? null,
        },
      });
      return this.toSafeUser(user);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('El correo electrónico ya está registrado');
      }
      throw error;
    }
  }

  async login(
    dto: LoginDto,
    metadata: RequestMetadata = {},
  ): Promise<AuthTokens> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !this.isUserActive(user)) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.issueSession(user, metadata);
  }

  async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !this.isUserActive(user)) {
      throw new UnauthorizedException('Sesión no válida');
    }
    return this.toSafeUser(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    const presentedHash = this.hashRefreshToken(dto.refresh_token);

    const session = await this.prisma.session.findUnique({
      where: { token: presentedHash },
    });

    if (!session || session.expires_at.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.user_id },
    });

    if (!user || !this.isUserActive(user)) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { last_used_at: new Date() },
    });

    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      sid: session.id,
    });

    return this.buildTokenResponse(accessToken, dto.refresh_token);
  }

  async logout(user: {
    userId: string;
    sessionId: string;
  }): Promise<{ success: boolean }> {
    await this.prisma.session.deleteMany({
      where: { id: user.sessionId, user_id: user.userId },
    });
    return { success: true };
  }

  private async issueSession(
    user: { id: string; email: string },
    metadata: RequestMetadata,
  ): Promise<AuthTokens> {
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashRefreshToken(refreshToken);

    const session = await this.prisma.session.create({
      data: {
        user_id: user.id,
        token: tokenHash,
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ip_address: metadata.ip ?? null,
        user_agent: metadata.userAgent ?? null,
      },
    });

    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      sid: session.id,
    });

    return this.buildTokenResponse(accessToken, refreshToken);
  }

  private signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  private buildTokenResponse(
    accessToken: string,
    refreshToken: string,
  ): AuthTokens {
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private assertPasswordByteLength(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
      throw new BadRequestException(
        'La contraseña no puede superar los 72 bytes',
      );
    }
  }

  private isUserActive(user: UserWithStatus): boolean {
    return user.is_active && user.deleted_at === null;
  }

  private toSafeUser(user: UserRecord): SafeUser {
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

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
