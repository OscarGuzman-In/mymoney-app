import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DebtsService } from './debts.service';

interface MockPrisma {
  debt: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  debtPayment: { create: jest.Mock; findMany: jest.Mock };
  currency: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

function createContext(): { prisma: MockPrisma; service: DebtsService } {
  const prisma: MockPrisma = {
    debt: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    debtPayment: { create: jest.fn(), findMany: jest.fn() },
    currency: { findUnique: jest.fn() },
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
  const service = new DebtsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const existingDebt = {
  id: 'debt-1',
  user_id: 'user-1',
  currency_id: 'cur-1',
  name: 'Préstamo',
  original_amount: '1000',
  remaining_amount: '1000',
  due_date: new Date('2026-12-31'),
  status: 'active',
  description: null,
  is_active: true,
};

describe('DebtsService', () => {
  describe('create', () => {
    it('creates a debt owned by the user with remaining equal to original', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      let createdData: Record<string, unknown> | null = null;
      prisma.debt.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return { id: 'debt-1' };
        },
      );

      await service.create('user-1', {
        name: 'Préstamo',
        currency_id: 'cur-1',
        original_amount: 1000,
        due_date: '2026-12-31',
      });

      expect(createdData).toMatchObject({
        user_id: 'user-1',
        currency_id: 'cur-1',
        name: 'Préstamo',
        due_date: new Date('2026-12-31'),
        description: null,
      });
      expect(
        String((createdData as Record<string, unknown>).original_amount),
      ).toBe('1000');
      expect(
        String((createdData as Record<string, unknown>).remaining_amount),
      ).toBe('1000');
    });

    it('rejects a remaining amount greater than the original', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });

      await expect(
        service.create('user-1', {
          name: 'Préstamo',
          currency_id: 'cur-1',
          original_amount: 1000,
          remaining_amount: 1500,
          due_date: '2026-12-31',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.debt.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown currency', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          name: 'Préstamo',
          currency_id: 'missing',
          original_amount: 1000,
          due_date: '2026-12-31',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('lists only the user debts', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findMany.mockResolvedValue([existingDebt]);

      await expect(service.findAll('user-1')).resolves.toEqual([existingDebt]);
      expect(prisma.debt.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns an owned debt', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(existingDebt);

      await expect(service.findOne('user-1', 'debt-1')).resolves.toEqual(
        existingDebt,
      );
      expect(prisma.debt.findFirst).toHaveBeenCalledWith({
        where: { id: 'debt-1', user_id: 'user-1' },
      });
    });

    it("throws NotFoundException for another user's debt", async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-2', 'debt-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates an owned debt', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(existingDebt);
      prisma.debt.update.mockResolvedValue({
        ...existingDebt,
        name: 'Préstamo largo',
      });

      const result = await service.update('user-1', 'debt-1', {
        name: 'Préstamo largo',
      });

      expect(result.name).toBe('Préstamo largo');
      expect(prisma.debt.update).toHaveBeenCalledWith({
        where: { id: 'debt-1' },
        data: {
          currency_id: undefined,
          name: 'Préstamo largo',
          original_amount: undefined,
          remaining_amount: undefined,
          due_date: undefined,
          status: undefined,
          description: undefined,
        },
      });
    });

    it('rejects a remaining amount greater than the original', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(existingDebt);

      await expect(
        service.update('user-1', 'debt-1', { remaining_amount: 2000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.debt.update).not.toHaveBeenCalled();
    });

    it("rejects updating another user's debt", async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-2', 'debt-1', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.debt.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('deactivates an owned debt', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(existingDebt);
      prisma.debt.update.mockResolvedValue({
        ...existingDebt,
        is_active: false,
      });

      const result = await service.deactivate('user-1', 'debt-1');

      expect(result.is_active).toBe(false);
      expect(prisma.debt.update).toHaveBeenCalledWith({
        where: { id: 'debt-1' },
        data: { is_active: false },
      });
    });
  });

  describe('registerPayment', () => {
    it('records the payment and reduces the remaining amount atomically', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(existingDebt);
      let paymentRaw: unknown = null;
      let updatedData: { remaining_amount?: unknown; status?: string } | null =
        null;
      prisma.debtPayment.create.mockImplementation(
        (args: { data: { amount: unknown } }) => {
          paymentRaw = args.data.amount;
          return Promise.resolve({ id: 'payment-1' });
        },
      );
      prisma.debt.update.mockImplementation(
        (args: { data: { remaining_amount?: unknown; status?: string } }) => {
          updatedData = args.data;
          return Promise.resolve({ ...existingDebt, remaining_amount: '800' });
        },
      );

      const result = await service.registerPayment('user-1', 'debt-1', {
        amount: 200,
        payment_date: '2026-06-15',
      });

      expect(result).toEqual({ id: 'payment-1' });
      expect(String(paymentRaw)).toBe('200');
      expect(updatedData).not.toBeNull();
      expect(String(updatedData?.remaining_amount)).toBe('800');
      expect(updatedData?.status).toBe('active');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.debtPayment.create).toHaveBeenCalledWith({
        data: {
          debt_id: 'debt-1',
          amount: paymentRaw,
          payment_date: new Date('2026-06-15'),
          notes: null,
        },
      });
    });

    it('marks the debt as paid when the remaining balance reaches zero', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(existingDebt);
      prisma.debtPayment.create.mockResolvedValue({ id: 'payment-1' });
      let updatedStatus: string | undefined;
      prisma.debt.update.mockImplementation(
        (args: { data: { status?: string } }) => {
          updatedStatus = args.data.status;
          return Promise.resolve({ ...existingDebt, status: 'paid' });
        },
      );

      await service.registerPayment('user-1', 'debt-1', {
        amount: 1000,
        payment_date: '2026-06-15',
      });

      expect(updatedStatus).toBe('paid');
    });

    it('rejects a payment that exceeds the remaining balance', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(existingDebt);

      await expect(
        service.registerPayment('user-1', 'debt-1', {
          amount: 1500,
          payment_date: '2026-06-15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a payment against another user's debt", async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(null);

      await expect(
        service.registerPayment('user-2', 'debt-1', {
          amount: 100,
          payment_date: '2026-06-15',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('listPayments', () => {
    it('lists the payment history of an owned debt', async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(existingDebt);
      prisma.debtPayment.findMany.mockResolvedValue([{ id: 'payment-1' }]);

      await expect(service.listPayments('user-1', 'debt-1')).resolves.toEqual([
        { id: 'payment-1' },
      ]);
      expect(prisma.debtPayment.findMany).toHaveBeenCalledWith({
        where: { debt_id: 'debt-1' },
        orderBy: { payment_date: 'desc' },
      });
    });

    it("rejects listing another user's payment history", async () => {
      const { prisma, service } = createContext();
      prisma.debt.findFirst.mockResolvedValue(null);

      await expect(
        service.listPayments('user-2', 'debt-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.debtPayment.findMany).not.toHaveBeenCalled();
    });
  });
});
