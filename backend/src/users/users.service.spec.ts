import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

interface MockPrisma {
  user: { findUnique: jest.Mock; update: jest.Mock };
  session: { deleteMany: jest.Mock };
}

interface ProfileRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function createContext(): { prisma: MockPrisma; service: UsersService } {
  const prisma: MockPrisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const service = new UsersService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const profile: ProfileRow = {
  id: 'user-1',
  email: 'user@example.com',
  first_name: 'Ana',
  last_name: 'Pérez',
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
};

const profileSelect = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
  is_active: true,
  created_at: true,
  updated_at: true,
};

describe('UsersService', () => {
  describe('getProfile', () => {
    it('returns the selected profile fields for the user', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValue(profile);

      await expect(service.getProfile('user-1')).resolves.toEqual(profile);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: profileSelect,
      });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('updates only first_name and last_name', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValue(profile);
      let updateData: { first_name?: string; last_name?: string } | null = null;
      prisma.user.update.mockImplementation(
        (args: { data: { first_name?: string; last_name?: string } }) => {
          updateData = args.data;
          return { ...profile, first_name: 'Beatriz' };
        },
      );

      const result = await service.updateProfile('user-1', {
        first_name: 'Beatriz',
      });

      expect(result.first_name).toBe('Beatriz');
      expect(updateData).toEqual({
        first_name: 'Beatriz',
        last_name: undefined,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { first_name: 'Beatriz', last_name: undefined },
        select: profileSelect,
      });
    });

    it('throws NotFoundException and does not update a missing user', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('missing', { first_name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('verifies the current password, stores a new hash and revokes other sessions', async () => {
      const { prisma, service } = createContext();
      const currentHash = await bcrypt.hash('OldPass123', BCRYPT_ROUNDS);
      prisma.user.findUnique.mockResolvedValue({
        ...profile,
        password: currentHash,
      });
      let storedHash = '';
      prisma.user.update.mockImplementation(
        (args: { data: { password: string } }) => {
          storedHash = args.data.password;
          return profile;
        },
      );

      const result = await service.changePassword('user-1', 'session-1', {
        current_password: 'OldPass123',
        new_password: 'NewPass456',
      });

      expect(result).toEqual({ success: true });
      expect(storedHash).not.toBe(currentHash);
      await expect(bcrypt.compare('NewPass456', storedHash)).resolves.toBe(
        true,
      );
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', id: { not: 'session-1' } },
      });
    });

    it('rejects an incorrect current password', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValue({
        ...profile,
        password: await bcrypt.hash('OldPass123', BCRYPT_ROUNDS),
      });

      await expect(
        service.changePassword('user-1', 'session-1', {
          current_password: 'WrongPass',
          new_password: 'NewPass456',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects a new password longer than 72 bytes', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValue({
        ...profile,
        password: await bcrypt.hash('OldPass123', BCRYPT_ROUNDS),
      });

      await expect(
        service.changePassword('user-1', 'session-1', {
          current_password: 'OldPass123',
          new_password: 'a'.repeat(73),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown user', async () => {
      const { prisma, service } = createContext();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword('missing', 'session-1', {
          current_password: 'OldPass123',
          new_password: 'NewPass456',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
