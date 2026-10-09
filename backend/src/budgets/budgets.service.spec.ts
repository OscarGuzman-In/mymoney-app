import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from './budgets.service';

interface MockPrisma {
  budget: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  currency: { findUnique: jest.Mock };
  category: { findMany: jest.Mock };
}

function createContext(): { prisma: MockPrisma; service: BudgetsService } {
  const prisma: MockPrisma = {
    budget: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    currency: { findUnique: jest.fn() },
    category: { findMany: jest.fn() },
  };
  const service = new BudgetsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const existingBudget = {
  id: 'bud-1',
  user_id: 'user-1',
  currency_id: 'cur-1',
  name: 'Presupuesto',
  amount: '500',
  start_date: new Date('2026-01-01'),
  end_date: new Date('2026-01-31'),
  status: 'active',
  description: null,
  is_active: true,
  budget_categories: [],
};

describe('BudgetsService', () => {
  describe('create', () => {
    it('creates a budget with assigned categories', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);
      let createdData: Record<string, unknown> | null = null;
      prisma.budget.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return { id: 'bud-1' };
        },
      );

      await service.create('user-1', {
        name: 'Presupuesto',
        currency_id: 'cur-1',
        amount: 500,
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        categories: [{ category_id: 'cat-1', amount: 100.5 }],
      });

      expect(createdData).toEqual({
        user_id: 'user-1',
        currency_id: 'cur-1',
        name: 'Presupuesto',
        amount: '500',
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-01-31'),
        status: undefined,
        description: null,
        budget_categories: {
          create: [{ category_id: 'cat-1', amount: '100.5' }],
        },
      });
    });

    it('rejects a start date after the end date', async () => {
      const { prisma, service } = createContext();

      await expect(
        service.create('user-1', {
          name: 'B',
          currency_id: 'cur-1',
          amount: 500,
          start_date: '2026-02-01',
          end_date: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.budget.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown currency', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          name: 'B',
          currency_id: 'missing',
          amount: 500,
          start_date: '2026-01-01',
          end_date: '2026-01-31',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a category that does not exist or is not available', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      prisma.category.findMany.mockResolvedValue([]);

      await expect(
        service.create('user-1', {
          name: 'B',
          currency_id: 'cur-1',
          amount: 500,
          start_date: '2026-01-01',
          end_date: '2026-01-31',
          categories: [{ category_id: 'cat-other', amount: 10 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.budget.create).not.toHaveBeenCalled();
    });

    it('rejects duplicated categories', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });

      await expect(
        service.create('user-1', {
          name: 'B',
          currency_id: 'cur-1',
          amount: 500,
          start_date: '2026-01-01',
          end_date: '2026-01-31',
          categories: [
            { category_id: 'cat-1', amount: 10 },
            { category_id: 'cat-1', amount: 20 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lists only the user budgets with their categories', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findMany.mockResolvedValue([existingBudget]);

      await expect(service.findAll('user-1')).resolves.toEqual([
        existingBudget,
      ]);
      expect(prisma.budget.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        include: { budget_categories: true },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns an owned budget', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findFirst.mockResolvedValue(existingBudget);

      await expect(service.findOne('user-1', 'bud-1')).resolves.toEqual(
        existingBudget,
      );
      expect(prisma.budget.findFirst).toHaveBeenCalledWith({
        where: { id: 'bud-1', user_id: 'user-1' },
        include: { budget_categories: true },
      });
    });

    it("throws NotFoundException for another user's budget", async () => {
      const { prisma, service } = createContext();
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-2', 'bud-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates an owned budget and replaces its categories', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findFirst.mockResolvedValue(existingBudget);
      prisma.category.findMany.mockResolvedValue([{ id: 'cat-2' }]);
      let updatedData: Record<string, unknown> | null = null;
      prisma.budget.update.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          updatedData = args.data;
          return { ...existingBudget, name: 'Nuevo' };
        },
      );

      const result = await service.update('user-1', 'bud-1', {
        name: 'Nuevo',
        categories: [{ category_id: 'cat-2', amount: 50 }],
      });

      expect(result.name).toBe('Nuevo');
      expect(updatedData).toMatchObject({
        name: 'Nuevo',
        budget_categories: {
          deleteMany: {},
          create: [{ category_id: 'cat-2', amount: '50' }],
        },
      });
    });

    it("rejects updating another user's budget", async () => {
      const { prisma, service } = createContext();
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-2', 'bud-1', { name: 'Nuevo' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.budget.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid date range on update', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findFirst.mockResolvedValue(existingBudget);

      await expect(
        service.update('user-1', 'bud-1', {
          start_date: '2026-03-01',
          end_date: '2026-02-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.budget.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('deactivates an owned budget', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findFirst.mockResolvedValue(existingBudget);
      prisma.budget.update.mockResolvedValue({
        ...existingBudget,
        is_active: false,
      });

      const result = await service.deactivate('user-1', 'bud-1');

      expect(result.is_active).toBe(false);
      expect(prisma.budget.update).toHaveBeenCalledWith({
        where: { id: 'bud-1' },
        data: { is_active: false },
      });
    });

    it("cannot deactivate another user's budget", async () => {
      const { prisma, service } = createContext();
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        service.deactivate('user-2', 'bud-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.budget.update).not.toHaveBeenCalled();
    });
  });
});
