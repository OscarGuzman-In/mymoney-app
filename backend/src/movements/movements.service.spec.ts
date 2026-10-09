import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsService } from './movements.service';

interface MockPrisma {
  movement: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  account: { findFirst: jest.Mock; update: jest.Mock };
  category: { findFirst: jest.Mock };
  paymentMethod: { findFirst: jest.Mock };
  currency: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

function createContext(): { prisma: MockPrisma; service: MovementsService } {
  const prisma: MockPrisma = {
    movement: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    account: { findFirst: jest.fn(), update: jest.fn() },
    category: { findFirst: jest.fn() },
    paymentMethod: { findFirst: jest.fn() },
    currency: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (arg: ((client: MockPrisma) => unknown) | unknown[]) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  prisma.account.update.mockResolvedValue({});
  const service = new MovementsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

function incrementFor(prisma: MockPrisma, accountId: string): string | null {
  const calls = prisma.account.update.mock.calls as Array<
    [
      {
        where: { id: string };
        data: { balance: { increment: Prisma.Decimal } };
      },
    ]
  >;
  const call = calls.find((args) => args[0].where.id === accountId);
  if (!call) {
    return null;
  }
  return new Prisma.Decimal(call[0].data.balance.increment).toFixed(2);
}

const existingMovement = {
  id: 'mov-1',
  user_id: 'user-1',
  account_id: 'acc-1',
  category_id: 'cat-1',
  payment_method_id: null,
  currency_id: 'cur-1',
  transfer_account_id: null,
  amount: '10',
  type: 'expense',
  description: null,
  movement_date: new Date('2026-01-10'),
  reference: null,
  notes: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('MovementsService', () => {
  describe('create', () => {
    it('creates an income movement owned by the user', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'income',
      });
      let createdData: Record<string, unknown> | null = null;
      prisma.movement.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return { id: 'mov-1', ...args.data };
        },
      );

      await service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        currency_id: 'cur-1',
        amount: 100.5,
        type: 'income',
        movement_date: '2026-01-15',
      });

      expect(createdData).toEqual({
        user_id: 'user-1',
        account_id: 'acc-1',
        category_id: 'cat-1',
        payment_method_id: null,
        currency_id: 'cur-1',
        transfer_account_id: null,
        amount: '100.5',
        type: 'income',
        description: null,
        movement_date: new Date('2026-01-15'),
        reference: null,
        notes: null,
      });
    });

    it('increases the account balance when registering an income', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.movement.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => ({
          id: 'mov-1',
          ...args.data,
        }),
      );

      await service.create('user-1', {
        account_id: 'acc-1',
        currency_id: 'cur-1',
        amount: 100.5,
        type: 'income',
        movement_date: '2026-01-15',
      });

      expect(incrementFor(prisma, 'acc-1')).toBe('100.50');
    });

    it('decreases the account balance when registering an expense', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.movement.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => ({
          id: 'mov-1',
          ...args.data,
        }),
      );

      await service.create('user-1', {
        account_id: 'acc-1',
        currency_id: 'cur-1',
        amount: 25,
        type: 'expense',
        movement_date: '2026-01-15',
      });

      expect(incrementFor(prisma, 'acc-1')).toBe('-25.00');
    });

    it('stores the amount as a decimal string without floating point math', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      let createdData: { amount?: unknown } | null = null;
      prisma.movement.create.mockImplementation(
        (args: { data: { amount?: unknown } }) => {
          createdData = args.data;
          return { id: 'mov-1', ...args.data };
        },
      );

      await service.create('user-1', {
        account_id: 'acc-1',
        currency_id: 'cur-1',
        amount: 0.1,
        type: 'expense',
        movement_date: '2026-01-15',
      });

      expect(createdData?.amount).toBe('0.1');
      expect(incrementFor(prisma, 'acc-1')).toBe('-0.10');
    });

    it('rejects a movement for an account the user does not own', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          account_id: 'acc-other',
          currency_id: 'cur-1',
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.movement.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown currency', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          currency_id: 'missing',
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.movement.create).not.toHaveBeenCalled();
    });

    it('rejects a currency that does not match the account currency', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-2' });

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          currency_id: 'cur-2',
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.movement.create).not.toHaveBeenCalled();
    });

    it('rejects an unavailable (system/other) category', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          category_id: 'cat-other',
          currency_id: 'cur-1',
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a category whose type does not match the movement type', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'income',
      });

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          category_id: 'cat-1',
          currency_id: 'cur-1',
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a payment method the user does not own', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.paymentMethod.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          payment_method_id: 'pm-other',
          currency_id: 'cur-1',
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires a destination account for transfers', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          currency_id: 'cur-1',
          amount: 10,
          type: 'transfer',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a transfer whose destination equals the origin', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          transfer_account_id: 'acc-1',
          currency_id: 'cur-1',
          amount: 10,
          type: 'transfer',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a transfer between accounts of different currencies', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockImplementation(
        (args: { where: { id: string } }) =>
          args.where.id === 'acc-2'
            ? { id: 'acc-2', currency_id: 'cur-2' }
            : { id: 'acc-1', currency_id: 'cur-1' },
      );
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          transfer_account_id: 'acc-2',
          currency_id: 'cur-1',
          amount: 10,
          type: 'transfer',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.movement.create).not.toHaveBeenCalled();
    });

    it('rejects a destination account on a non-transfer movement', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });

      await expect(
        service.create('user-1', {
          account_id: 'acc-1',
          transfer_account_id: 'acc-2',
          currency_id: 'cur-1',
          amount: 10,
          type: 'expense',
          movement_date: '2026-01-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a transfer between two owned accounts', async () => {
      const { prisma, service } = createContext();
      prisma.account.findFirst.mockImplementation(
        (args: { where: { id: string } }) =>
          args.where.id === 'acc-2'
            ? { id: 'acc-2', currency_id: 'cur-1' }
            : { id: 'acc-1', currency_id: 'cur-1' },
      );
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      let createdData: Record<string, unknown> | null = null;
      prisma.movement.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return { id: 'mov-1', ...args.data };
        },
      );

      await service.create('user-1', {
        account_id: 'acc-1',
        transfer_account_id: 'acc-2',
        currency_id: 'cur-1',
        amount: 50,
        type: 'transfer',
        movement_date: '2026-01-15',
      });

      expect(createdData).toMatchObject({
        type: 'transfer',
        account_id: 'acc-1',
        transfer_account_id: 'acc-2',
        amount: '50',
      });
      expect(incrementFor(prisma, 'acc-1')).toBe('-50.00');
      expect(incrementFor(prisma, 'acc-2')).toBe('50.00');
    });
  });

  describe('findAll', () => {
    it('lists only the user movements', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findMany.mockResolvedValue([existingMovement]);

      await expect(service.findAll('user-1', {})).resolves.toEqual([
        existingMovement,
      ]);
      expect(prisma.movement.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        orderBy: [{ movement_date: 'desc' }, { created_at: 'desc' }],
      });
    });

    it('applies account, category, type and date filters', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findMany.mockResolvedValue([]);

      await service.findAll('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        type: 'expense',
        start_date: '2026-01-01',
        end_date: '2026-01-31',
      });

      expect(prisma.movement.findMany).toHaveBeenCalledWith({
        where: {
          user_id: 'user-1',
          account_id: 'acc-1',
          category_id: 'cat-1',
          type: 'expense',
          movement_date: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-01-31'),
          },
        },
        orderBy: [{ movement_date: 'desc' }, { created_at: 'desc' }],
      });
    });
  });

  describe('findOne', () => {
    it('returns an owned movement', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findFirst.mockResolvedValue(existingMovement);

      await expect(service.findOne('user-1', 'mov-1')).resolves.toEqual(
        existingMovement,
      );
      expect(prisma.movement.findFirst).toHaveBeenCalledWith({
        where: { id: 'mov-1', user_id: 'user-1' },
      });
    });

    it("throws NotFoundException for another user's movement", async () => {
      const { prisma, service } = createContext();
      prisma.movement.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-2', 'mov-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates an owned movement after validating relations', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findFirst.mockResolvedValue(existingMovement);
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'expense',
      });
      prisma.movement.update.mockResolvedValue({
        ...existingMovement,
        amount: '20',
      });

      const result = await service.update('user-1', 'mov-1', { amount: 20 });

      expect(result.amount).toBe('20');
      expect(prisma.movement.update).toHaveBeenCalledWith({
        where: { id: 'mov-1' },
        data: {
          account_id: undefined,
          category_id: undefined,
          payment_method_id: undefined,
          currency_id: undefined,
          transfer_account_id: undefined,
          amount: '20',
          type: undefined,
          description: undefined,
          movement_date: undefined,
          reference: undefined,
          notes: undefined,
        },
      });
    });

    it('applies only the difference between the previous and new amount', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findFirst.mockResolvedValue(existingMovement);
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'expense',
      });
      prisma.movement.update.mockResolvedValue({
        ...existingMovement,
        amount: '30',
      });

      await service.update('user-1', 'mov-1', { amount: 30 });

      expect(incrementFor(prisma, 'acc-1')).toBe('-20.00');
    });

    it('reverts the previous account and applies the new one when the account changes', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findFirst.mockResolvedValue(existingMovement);
      prisma.account.findFirst.mockImplementation(
        (args: { where: { id: string } }) =>
          args.where.id === 'acc-2'
            ? { id: 'acc-2', currency_id: 'cur-1' }
            : { id: 'acc-1', currency_id: 'cur-1' },
      );
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'expense',
      });
      prisma.movement.update.mockResolvedValue({
        ...existingMovement,
        account_id: 'acc-2',
      });

      await service.update('user-1', 'mov-1', { account_id: 'acc-2' });

      expect(incrementFor(prisma, 'acc-1')).toBe('10.00');
      expect(incrementFor(prisma, 'acc-2')).toBe('-10.00');
    });

    it("rejects updating another user's movement", async () => {
      const { prisma, service } = createContext();
      prisma.movement.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-2', 'mov-1', { amount: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.movement.update).not.toHaveBeenCalled();
    });

    it('validates the new account when it changes', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findFirst.mockResolvedValue(existingMovement);
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'mov-1', { account_id: 'acc-other' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.movement.update).not.toHaveBeenCalled();
    });

    it('rejects an update that would mix currencies with the account', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findFirst.mockResolvedValue(existingMovement);
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-2' });
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        currency_id: 'cur-1',
      });

      await expect(
        service.update('user-1', 'mov-1', { currency_id: 'cur-2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.movement.update).not.toHaveBeenCalled();
    });
  });
});
