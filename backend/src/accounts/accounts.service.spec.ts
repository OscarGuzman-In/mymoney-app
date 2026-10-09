import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from './accounts.service';

interface MockPrisma {
  currency: { findUnique: jest.Mock };
  account: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
}

function createContext(): { prisma: MockPrisma; service: AccountsService } {
  const prisma: MockPrisma = {
    currency: { findUnique: jest.fn() },
    account: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new AccountsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const account = {
  id: 'acc-1',
  user_id: 'user-1',
  currency_id: 'cur-1',
  name: 'Ahorros',
  type: 'savings_account',
  description: null,
  balance: '0',
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  deleted_at: null,
};

describe('AccountsService', () => {
  describe('create', () => {
    it('creates an account owned by the authenticated user', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      let createdData: Record<string, unknown> | null = null;
      prisma.account.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return account;
        },
      );

      await expect(
        service.create('user-1', {
          name: 'Ahorros',
          type: 'savings_account',
          currency_id: 'cur-1',
        }),
      ).resolves.toEqual(account);

      expect(createdData).toEqual({
        user_id: 'user-1',
        currency_id: 'cur-1',
        name: 'Ahorros',
        type: 'savings_account',
        description: null,
      });
    });

    it('stores the initial balance as the account starting balance', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      let createdData: Record<string, unknown> | null = null;
      prisma.account.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return account;
        },
      );

      await service.create('user-1', {
        name: 'Ahorros',
        type: 'savings_account',
        currency_id: 'cur-1',
        initial_balance: 1500.5,
      });

      expect(
        (createdData as { balance: { toString(): string } }).balance.toString(),
      ).toBe('1500');
      expect(createdData).toMatchObject({ user_id: 'user-1' });
    });

    it('does not set a balance when no initial balance is provided', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      let createdData: Record<string, unknown> | null = null;
      prisma.account.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return account;
        },
      );

      await service.create('user-1', {
        name: 'Ahorros',
        type: 'savings_account',
        currency_id: 'cur-1',
      });

      expect(createdData).not.toHaveProperty('balance');
    });

    it('rejects an unknown currency', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          name: 'Ahorros',
          type: 'savings_account',
          currency_id: 'missing',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.account.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lists only the accounts of the authenticated user', async () => {
      const { prisma, service } = createContext();
      prisma.account.findMany.mockResolvedValue([account]);

      await expect(service.findAll('user-1')).resolves.toEqual([account]);
      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns an account scoped by user', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue(account);

      await expect(service.findOne('user-1', 'acc-1')).resolves.toEqual(
        account,
      );
      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: { id: 'acc-1', user_id: 'user-1' },
      });
    });

    it("throws NotFoundException for another user's account", async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-2', 'acc-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates an owned account', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.account.update.mockResolvedValue({ ...account, name: 'Nueva' });

      const result = await service.update('user-1', 'acc-1', { name: 'Nueva' });

      expect(result.name).toBe('Nueva');
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { name: 'Nueva', type: undefined, description: undefined },
      });
    });

    it("rejects updating another user's account", async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-2', 'acc-1', { name: 'Nueva' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('sets is_active to false instead of deleting', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.account.update.mockResolvedValue({ ...account, is_active: false });

      const result = await service.deactivate('user-1', 'acc-1');

      expect(result.is_active).toBe(false);
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { is_active: false },
      });
    });

    it("rejects deactivating another user's account", async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.deactivate('user-2', 'acc-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });
  });
});
