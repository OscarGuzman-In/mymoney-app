import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';

interface MockPrisma {
  notification: {
    findFirst: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  budget: {
    findMany: jest.Mock;
  };
  movement: {
    aggregate: jest.Mock;
  };
  savingsGoal: {
    findMany: jest.Mock;
  };
  debt: {
    findMany: jest.Mock;
  };
}

function createContext(): { prisma: MockPrisma; service: NotificationsService } {
  const prisma: MockPrisma = {
    notification: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    budget: { findMany: jest.fn() },
    movement: { aggregate: jest.fn() },
    savingsGoal: { findMany: jest.fn() },
    debt: { findMany: jest.fn() },
  };
  const service = new NotificationsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('NotificationsService', () => {
  describe('evaluate', () => {
    it('creates budget warning notifications without duplicating existing ones', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findMany.mockResolvedValue([
        {
          id: 'bud-1',
          name: 'Alimentación',
          amount: '100',
          currency_id: 'cur-1',
          start_date: new Date('2026-10-01'),
          end_date: new Date('2026-10-31'),
          budget_categories: [],
        },
      ]);
      prisma.movement.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(91) },
      });
      prisma.savingsGoal.findMany.mockResolvedValue([]);
      prisma.debt.findMany.mockResolvedValue([]);

      // First evaluation: no existing notification → create
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.evaluate('user-1');

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'user-1',
            type: 'budget_warning',
          }),
        }),
      );

      // Second evaluation: existing found → no new create
      prisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });
      prisma.notification.create.mockClear();

      await service.evaluate('user-1');

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('creates budget exceeded notification when spending reaches limit', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findMany.mockResolvedValue([
        {
          id: 'bud-1',
          name: 'Servicios',
          amount: '100',
          currency_id: 'cur-1',
          start_date: new Date('2026-10-01'),
          end_date: new Date('2026-10-31'),
          budget_categories: [{ category_id: 'cat-1' }],
        },
      ]);
      prisma.movement.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(120) },
      });
      prisma.savingsGoal.findMany.mockResolvedValue([]);
      prisma.debt.findMany.mockResolvedValue([]);
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.evaluate('user-1');

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'budget_exceeded' }),
        }),
      );
    });

    it('creates savings goal reached notification when current_amount >= target', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findMany.mockResolvedValue([]);
      prisma.savingsGoal.findMany.mockResolvedValue([
        {
          id: 'sg-1',
          name: 'Viaje',
          target_amount: '500',
          current_amount: '500',
        },
      ]);
      prisma.debt.findMany.mockResolvedValue([]);
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.evaluate('user-1');

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'savings_goal_reached' }),
        }),
      );
    });

    it('creates debt due soon and debt overdue notifications', async () => {
      const { prisma, service } = createContext();
      prisma.budget.findMany.mockResolvedValue([]);
      prisma.savingsGoal.findMany.mockResolvedValue([]);
      const today = new Date();
      const inFiveDays = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      prisma.debt.findMany.mockResolvedValue([
        {
          id: 'd-1',
          name: 'Préstamo',
          remaining_amount: '200',
          due_date: inFiveDays,
          status: 'active',
        },
        {
          id: 'd-2',
          name: 'Tarjeta',
          remaining_amount: '150',
          due_date: yesterday,
          status: 'active',
        },
      ]);
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.evaluate('user-1');

      const types = (prisma.notification.create.mock.calls as unknown[][]).map(
        (c) => (c[0] as { data: { type: string } }).data.type,
      );
      expect(types).toContain('debt_due_soon');
      expect(types).toContain('debt_overdue');
    });
  });

  describe('count and actions', () => {
    it('returns unread count and marks notifications as read', async () => {
      const { prisma, service } = createContext();
      prisma.notification.count.mockResolvedValue(3);
      prisma.notification.update.mockResolvedValue({ id: 'n-1', is_read: true });
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.unreadCount('user-1')).resolves.toBe(3);
      await expect(service.markRead('user-1', 'n-1')).resolves.toEqual({
        id: 'n-1',
        is_read: true,
      });
      await expect(service.markAllRead('user-1')).resolves.toEqual({
        success: true,
      });

      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n-1' },
          data: expect.objectContaining({ is_read: true }),
        }),
      );
    });

    it('throws NotFoundException when marking a foreign notification as read', async () => {
      const { prisma, service } = createContext();
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('user-2', 'n-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });
});
