import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

interface MockPrisma {
  movement: {
    groupBy: jest.Mock;
    findMany: jest.Mock;
  };
  account: { groupBy: jest.Mock; count: jest.Mock };
  budget: { count: jest.Mock };
  savingsGoal: { count: jest.Mock };
  currency: { findMany: jest.Mock };
  category: { findMany: jest.Mock };
}

function createContext(): { prisma: MockPrisma; service: DashboardService } {
  const prisma: MockPrisma = {
    movement: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    account: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    budget: { count: jest.fn() },
    savingsGoal: { count: jest.fn() },
    currency: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
  };
  const service = new DashboardService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const USD = { id: 'cur-usd', code: 'USD', symbol: '$' };
const EUR = { id: 'cur-eur', code: 'EUR', symbol: '€' };

describe('DashboardService', () => {
  describe('getSummary', () => {
    it('keeps balances and totals separated by currency', async () => {
      const { prisma, service } = createContext();
      prisma.account.groupBy.mockResolvedValue([
        { currency_id: 'cur-usd', _sum: { balance: '150' } },
        { currency_id: 'cur-eur', _sum: { balance: '40' } },
      ]);
      prisma.currency.findMany.mockResolvedValue([USD, EUR]);
      prisma.movement.groupBy.mockResolvedValue([
        { currency_id: 'cur-usd', type: 'income', _sum: { amount: '1000' } },
        { currency_id: 'cur-usd', type: 'expense', _sum: { amount: '350' } },
        { currency_id: 'cur-eur', type: 'income', _sum: { amount: '200' } },
      ]);
      prisma.account.count.mockResolvedValue(3);
      prisma.budget.count.mockResolvedValue(1);
      prisma.savingsGoal.count.mockResolvedValue(1);

      const result = await service.getSummary('user-1', {
        month: 6,
        year: 2026,
      });

      expect(result).toEqual({
        month: 6,
        year: 2026,
        balances_by_currency: [
          {
            currency_id: 'cur-usd',
            currency_code: 'USD',
            symbol: '$',
            total: '150.00',
          },
          {
            currency_id: 'cur-eur',
            currency_code: 'EUR',
            symbol: '€',
            total: '40.00',
          },
        ],
        totals_by_currency: [
          {
            currency_id: 'cur-eur',
            currency_code: 'EUR',
            symbol: '€',
            income: '200.00',
            expenses: '0.00',
            net: '200.00',
          },
          {
            currency_id: 'cur-usd',
            currency_code: 'USD',
            symbol: '$',
            income: '1000.00',
            expenses: '350.00',
            net: '650.00',
          },
        ],
        active_accounts_count: 3,
        active_budgets_count: 1,
        active_savings_goals_count: 1,
      });
      expect(result).not.toHaveProperty('total_balance');
      expect(result).not.toHaveProperty('total_income');
    });

    it('queries monthly movements scoped by user, type and date range', async () => {
      const { prisma, service } = createContext();
      prisma.account.groupBy.mockResolvedValue([]);
      prisma.currency.findMany.mockResolvedValue([]);
      let where: { user_id?: string; type?: { in: string[] } } | undefined;
      prisma.movement.groupBy.mockImplementation(
        (args: { where: { user_id: string; type: { in: string[] } } }) => {
          where = args.where;
          return [];
        },
      );
      prisma.account.count.mockResolvedValue(0);
      prisma.budget.count.mockResolvedValue(0);
      prisma.savingsGoal.count.mockResolvedValue(0);

      await service.getSummary('user-1', { month: 6, year: 2026 });

      expect(where?.user_id).toBe('user-1');
      expect(where?.type).toEqual({ in: ['income', 'expense'] });
    });

    it('returns empty currency lists when the user has no data', async () => {
      const { prisma, service } = createContext();
      prisma.account.groupBy.mockResolvedValue([]);
      prisma.movement.groupBy.mockResolvedValue([]);
      prisma.currency.findMany.mockResolvedValue([]);
      prisma.account.count.mockResolvedValue(0);
      prisma.budget.count.mockResolvedValue(0);
      prisma.savingsGoal.count.mockResolvedValue(0);

      const result = await service.getSummary('user-1', {
        month: 1,
        year: 2026,
      });

      expect(result.balances_by_currency).toEqual([]);
      expect(result.totals_by_currency).toEqual([]);
      expect(result.active_accounts_count).toBe(0);
    });

    it('defaults to the current month and year when omitted', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00Z'));
      try {
        const { prisma, service } = createContext();
        prisma.account.groupBy.mockResolvedValue([]);
        prisma.movement.groupBy.mockResolvedValue([]);
        prisma.currency.findMany.mockResolvedValue([]);
        prisma.account.count.mockResolvedValue(0);
        prisma.budget.count.mockResolvedValue(0);
        prisma.savingsGoal.count.mockResolvedValue(0);

        const result = await service.getSummary('user-1', {});

        expect(result.month).toBe(6);
        expect(result.year).toBe(2026);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getExpensesByCategory', () => {
    it('groups expenses by category and currency, keeping uncategorized ones', async () => {
      const { prisma, service } = createContext();
      let groupBy: string[] | undefined;
      prisma.movement.groupBy.mockImplementation((args: { by: string[] }) => {
        groupBy = args.by;
        return [
          {
            category_id: 'cat-2',
            currency_id: 'cur-usd',
            _sum: { amount: '100' },
          },
          {
            category_id: 'cat-1',
            currency_id: 'cur-usd',
            _sum: { amount: '300' },
          },
          { category_id: null, currency_id: 'cur-usd', _sum: { amount: '50' } },
        ];
      });
      prisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Comida' },
        { id: 'cat-2', name: 'Transporte' },
      ]);
      prisma.currency.findMany.mockResolvedValue([USD]);

      const result = await service.getExpensesByCategory('user-1', {
        month: 6,
        year: 2026,
      });

      expect(groupBy).toEqual(['category_id', 'currency_id']);
      expect(result.expenses).toEqual([
        {
          category_id: 'cat-1',
          name: 'Comida',
          currency_id: 'cur-usd',
          currency_code: 'USD',
          symbol: '$',
          total: '300.00',
        },
        {
          category_id: 'cat-2',
          name: 'Transporte',
          currency_id: 'cur-usd',
          currency_code: 'USD',
          symbol: '$',
          total: '100.00',
        },
        {
          category_id: null,
          name: null,
          currency_id: 'cur-usd',
          currency_code: 'USD',
          symbol: '$',
          total: '50.00',
        },
      ]);
    });

    it('does not merge the same category across currencies', async () => {
      const { prisma, service } = createContext();
      prisma.movement.groupBy.mockResolvedValue([
        {
          category_id: 'cat-1',
          currency_id: 'cur-usd',
          _sum: { amount: '100' },
        },
        {
          category_id: 'cat-1',
          currency_id: 'cur-eur',
          _sum: { amount: '80' },
        },
      ]);
      prisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Comida' },
      ]);
      prisma.currency.findMany.mockResolvedValue([USD, EUR]);

      const result = await service.getExpensesByCategory('user-1', {
        month: 6,
        year: 2026,
      });

      expect(result.expenses).toEqual([
        {
          category_id: 'cat-1',
          name: 'Comida',
          currency_id: 'cur-eur',
          currency_code: 'EUR',
          symbol: '€',
          total: '80.00',
        },
        {
          category_id: 'cat-1',
          name: 'Comida',
          currency_id: 'cur-usd',
          currency_code: 'USD',
          symbol: '$',
          total: '100.00',
        },
      ]);
    });

    it('returns an empty list when there are no expenses', async () => {
      const { prisma, service } = createContext();
      prisma.movement.groupBy.mockResolvedValue([]);
      prisma.currency.findMany.mockResolvedValue([]);

      const result = await service.getExpensesByCategory('user-1', {
        month: 6,
        year: 2026,
      });

      expect(result.expenses).toEqual([]);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getMonthlyTrend', () => {
    it('returns the last six months with per-currency totals', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00Z'));
      try {
        const { prisma, service } = createContext();
        let call = 0;
        let where: { user_id?: string; type?: { in: string[] } } | undefined;
        prisma.movement.groupBy.mockImplementation(
          (args: { where: { user_id: string; type: { in: string[] } } }) => {
            where = args.where;
            call += 1;
            if (call === 6) {
              return [
                {
                  currency_id: 'cur-usd',
                  type: 'income',
                  _sum: { amount: '1000' },
                },
                {
                  currency_id: 'cur-usd',
                  type: 'expense',
                  _sum: { amount: '350' },
                },
              ];
            }
            return [];
          },
        );
        prisma.currency.findMany.mockResolvedValue([USD]);

        const result = await service.getMonthlyTrend('user-1', {});

        expect(result.months).toBe(6);
        expect(result.trend).toHaveLength(6);
        expect(result.trend[0]).toEqual({
          year: 2026,
          month: 1,
          totals_by_currency: [],
        });
        expect(result.trend[5]).toEqual({
          year: 2026,
          month: 6,
          totals_by_currency: [
            {
              currency_id: 'cur-usd',
              currency_code: 'USD',
              symbol: '$',
              income: '1000.00',
              expenses: '350.00',
              net: '650.00',
            },
          ],
        });
        expect(where?.user_id).toBe('user-1');
        expect(where?.type).toEqual({ in: ['income', 'expense'] });
      } finally {
        jest.useRealTimers();
      }
    });

    it('honours a custom number of months', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00Z'));
      try {
        const { prisma, service } = createContext();
        prisma.movement.groupBy.mockResolvedValue([]);
        prisma.currency.findMany.mockResolvedValue([]);

        const result = await service.getMonthlyTrend('user-1', { months: 3 });

        expect(result.months).toBe(3);
        expect(result.trend.map((item) => item.month)).toEqual([4, 5, 6]);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getRecentMovements', () => {
    it('returns recent movements with their currency', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findMany.mockResolvedValue([
        {
          id: 'mov-1',
          type: 'expense',
          amount: '300',
          movement_date: new Date('2026-06-20'),
          description: null,
          category: { id: 'cat-1', name: 'Comida' },
          account: { id: 'acc-1', name: 'Efectivo', type: 'cash' },
          currency: USD,
        },
      ]);

      const result = await service.getRecentMovements('user-1', {});

      expect(prisma.movement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
          take: 10,
          orderBy: [{ movement_date: 'desc' }, { created_at: 'desc' }],
        }),
      );
      expect(result).toEqual([
        {
          id: 'mov-1',
          type: 'expense',
          amount: '300.00',
          movement_date: new Date('2026-06-20'),
          description: null,
          category: { id: 'cat-1', name: 'Comida' },
          account: { id: 'acc-1', name: 'Efectivo', type: 'cash' },
          currency: { id: 'cur-usd', code: 'USD', symbol: '$' },
        },
      ]);
    });

    it('applies the requested limit and maps missing relations to null', async () => {
      const { prisma, service } = createContext();
      prisma.movement.findMany.mockResolvedValue([
        {
          id: 'mov-2',
          type: 'transfer',
          amount: '75.5',
          movement_date: new Date('2026-06-21'),
          description: 'Ahorro',
          category: null,
          account: { id: 'acc-1', name: 'Banco', type: 'bank_account' },
          currency: USD,
        },
      ]);

      const result = await service.getRecentMovements('user-1', { limit: 1 });

      expect(prisma.movement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
      expect(result[0].category).toBeNull();
      expect(result[0].amount).toBe('75.50');
      expect(result[0].currency).toEqual({
        id: 'cur-usd',
        code: 'USD',
        symbol: '$',
      });
    });
  });
});
