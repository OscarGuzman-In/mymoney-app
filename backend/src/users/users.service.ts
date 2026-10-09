import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import type { SafeUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const BCRYPT_MAX_BYTES = 72;

const PROFILE_SELECT = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<SafeUser> {
    return this.findProfileOrFail(userId);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<SafeUser> {
    await this.findProfileOrFail(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        first_name: dto.first_name,
        last_name: dto.last_name,
      },
      select: PROFILE_SELECT,
    });
  }

  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const currentMatches = await bcrypt.compare(
      dto.current_password,
      user.password,
    );
    if (!currentMatches) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }

    if (Buffer.byteLength(dto.new_password, 'utf8') > BCRYPT_MAX_BYTES) {
      throw new BadRequestException(
        'La contraseña no puede superar los 72 bytes',
      );
    }

    const passwordHash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });

    await this.prisma.session.deleteMany({
      where: { user_id: userId, id: { not: sessionId } },
    });

    return { success: true };
  }

  private async findProfileOrFail(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }
}
