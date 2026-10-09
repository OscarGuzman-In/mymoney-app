import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SavingsGoalsService } from './savings-goals.service';

interface MockPrisma {
  savingsGoal: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  savingsGoalContribution: { create: jest.Mock; findMany: jest.Mock };
  currency: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

function createContext(): {
  prisma: MockPrisma;
  service: SavingsGoalsService;
} {
  const prisma: MockPrisma = {
    savingsGoal: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    savingsGoalContribution: { create: jest.fn(), findMany: jest.fn() },
    currency: { findUnique: jest.fn() },
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
  const service = new SavingsGoalsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const existingGoal = {
  id: 'goal-1',
  user_id: 'user-1',
  currency_id: 'cur-1',
  name: 'Viaje',
  target_amount: '2000',
  current_amount: '100',
  target_date: new Date('2026-12-31'),
  status: 'active',
  description: null,
  is_active: true,
};

describe('SavingsGoalsService', () => {
  describe('create', () => {
    it('creates a savings goal owned by the user', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1' });
      let createdData: Record<string, unknown> | null = null;
      prisma.savingsGoal.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return { id: 'goal-1' };
        },
      );

      await service.create('user-1', {
        name: 'Viaje',
        currency_id: 'cur-1',
        target_amount: 2000,
        target_date: '2026-12-31',
      });

      expect(createdData).toEqual({
        user_id: 'user-1',
        currency_id: 'cur-1',
        name: 'Viaje',
        target_amount: '2000',
        target_date: new Date('2026-12-31'),
        status: undefined,
        description: null,
      });
    });

    it('rejects an unknown currency', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          name: 'Viaje',
          currency_id: 'missing',
          target_amount: 2000,
          target_date: '2026-12-31',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.savingsGoal.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lists only the user goals', async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findMany.mockResolvedValue([existingGoal]);

      await expect(service.findAll('user-1')).resolves.toEqual([existingGoal]);
      expect(prisma.savingsGoal.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns an owned goal', async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(existingGoal);

      await expect(service.findOne('user-1', 'goal-1')).resolves.toEqual(
        existingGoal,
      );
      expect(prisma.savingsGoal.findFirst).toHaveBeenCalledWith({
        where: { id: 'goal-1', user_id: 'user-1' },
      });
    });

    it("throws NotFoundException for another user's goal", async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-2', 'goal-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates an owned goal', async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(existingGoal);
      let updatedData: Record<string, unknown> | null = null;
      prisma.savingsGoal.update.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          updatedData = args.data;
          return { ...existingGoal, name: 'Viaje largo' };
        },
      );

      const result = await service.update('user-1', 'goal-1', {
        name: 'Viaje largo',
      });

      expect(result.name).toBe('Viaje largo');
      expect(updatedData).toMatchObject({ name: 'Viaje largo' });
    });

    it("rejects updating another user's goal", async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-2', 'goal-1', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savingsGoal.update).not.toHaveBeenCalled();
    });
  });

  describe('addContribution', () => {
    it('records the contribution and updates the goal total atomically', async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(existingGoal);
      let contributionRaw: unknown = null;
      let contributionAmount = '';
      prisma.savingsGoalContribution.create.mockImplementation(
        (args: { data: { amount: unknown } }) => {
          contributionRaw = args.data.amount;
          contributionAmount = String(args.data.amount);
          return Promise.resolve({ id: 'contrib-1' });
        },
      );
      let updatedTotal = '';
      prisma.savingsGoal.update.mockImplementation(
        (args: { data: { current_amount: unknown } }) => {
          updatedTotal = String(args.data.current_amount);
          return Promise.resolve({
            ...existingGoal,
            current_amount: updatedTotal,
          });
        },
      );

      const result = await service.addContribution('user-1', 'goal-1', {
        amount: 150.5,
        contribution_date: '2026-06-15',
      });

      expect(result).toEqual({ id: 'contrib-1' });
      expect(contributionAmount).toBe('150.5');
      expect(updatedTotal).toBe('250.5');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.savingsGoalContribution.create).toHaveBeenCalledWith({
        data: {
          savings_goal_id: 'goal-1',
          amount: contributionRaw,
          contribution_date: new Date('2026-06-15'),
          notes: null,
        },
      });
    });

    it("rejects a contribution to another user's goal", async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(null);

      await expect(
        service.addContribution('user-2', 'goal-1', {
          amount: 50,
          contribution_date: '2026-06-15',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('listContributions', () => {
    it('lists the contribution history of an owned goal', async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(existingGoal);
      prisma.savingsGoalContribution.findMany.mockResolvedValue([
        { id: 'contrib-1' },
      ]);

      await expect(
        service.listContributions('user-1', 'goal-1'),
      ).resolves.toEqual([{ id: 'contrib-1' }]);
      expect(prisma.savingsGoalContribution.findMany).toHaveBeenCalledWith({
        where: { savings_goal_id: 'goal-1' },
        orderBy: { contribution_date: 'desc' },
      });
    });

    it("rejects listing another user's goal contributions", async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(null);

      await expect(
        service.listContributions('user-2', 'goal-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savingsGoalContribution.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deactivate and complete', () => {
    it('deactivates an owned goal', async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(existingGoal);
      prisma.savingsGoal.update.mockResolvedValue({
        ...existingGoal,
        is_active: false,
      });

      const result = await service.deactivate('user-1', 'goal-1');

      expect(result.is_active).toBe(false);
      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { is_active: false },
      });
    });

    it('marks an owned goal as completed', async () => {
      const { prisma, service } = createContext();
      prisma.savingsGoal.findFirst.mockResolvedValue(existingGoal);
      prisma.savingsGoal.update.mockResolvedValue({
        ...existingGoal,
        status: 'completed',
      });

      const result = await service.complete('user-1', 'goal-1');

      expect(result.status).toBe('completed');
      expect(prisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { status: 'completed' },
      });
    });
  });
});
