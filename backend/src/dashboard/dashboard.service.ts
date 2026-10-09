import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardPeriodDto } from './dto/dashboard-period.dto';
import { MonthlyTrendQueryDto } from './dto/monthly-trend-query.dto';
import { RecentMovementsQueryDto } from './dto/recent-movements-query.dto';

const DEFAULT_TREND_MONTHS = 6;
const DEFAULT_RECENT_LIMIT = 10;

interface DateRange {
  gte: Date;
  lt: Date;
}

export interface CurrencyInfo {
  id: string;
  code: string;
  symbol: string | null;
}

export interface CurrencyTotalRow {
  currency_id: string;
  type: string;
  _sum: { amount: Prisma.Decimal | null };
}

export interface CurrencyTotals {
  currency_id: string;
  currency_code: string | null;
  symbol: string | null;
  income: string;
  expenses: string;
  net: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, query: DashboardPeriodDto) {
    const { month, year } = this.resolvePeriod(query);

    const [
      balancesByCurrency,
      movementTotals,
      accountsCount,
      budgetsCount,
      savingsGoalsCount,
    ] = await Promise.all([
      this.prisma.account.groupBy({
        by: ['currency_id'],
        _sum: { balance: true },
        where: { user_id: userId, is_active: true },
      }),
      this.prisma.movement.groupBy({
        by: ['currency_id', 'type'],
        _sum: { amount: true },
        where: {
          user_id: userId,
          type: { in: ['income', 'expense'] },
          movement_date: this.monthRange(year, month),
        },
      }),
      this.prisma.account.count({
        where: { user_id: userId, is_active: true },
      }),
      this.prisma.budget.count({
        where: { user_id: userId, is_active: true, status: 'active' },
      }),
      this.prisma.savingsGoal.count({
        where: { user_id: userId, is_active: true, status: 'active' },
      }),
    ]);

    const currencyMap = await this.loadCurrencyMap();

    return {
      month,
      year,
      balances_by_currency: balancesByCurrency.map((item) => ({
        currency_id: item.currency_id,
        currency_code: currencyMap.get(item.currency_id)?.code ?? null,
        symbol: currencyMap.get(item.currency_id)?.symbol ?? null,
        total: this.toMoney(item._sum.balance),
      })),
      totals_by_currency: this.buildCurrencyTotals(movementTotals, currencyMap),
      active_accounts_count: accountsCount,
      active_budgets_count: budgetsCount,
      active_savings_goals_count: savingsGoalsCount,
    };
  }

  async getExpensesByCategory(userId: string, query: DashboardPeriodDto) {
    const { month, year } = this.resolvePeriod(query);

    const grouped = await this.prisma.movement.groupBy({
      by: ['category_id', 'currency_id'],
      _sum: { amount: true },
      where: {
        user_id: userId,
        type: 'expense',
        movement_date: this.monthRange(year, month),
      },
    });

    const categoryIds = grouped
      .map((item) => item.category_id)
      .filter((id): id is string => id !== null);
    const categories = categoryIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(categories.map((item) => [item.id, item.name]));

    const currencyMap = await this.loadCurrencyMap();

    const expenses = grouped
      .map((item) => ({
        category_id: item.category_id,
        name: item.category_id ? (nameMap.get(item.category_id) ?? null) : null,
        currency_id: item.currency_id,
        currency_code: currencyMap.get(item.currency_id)?.code ?? null,
        symbol: currencyMap.get(item.currency_id)?.symbol ?? null,
        total: this.toMoney(item._sum.amount),
      }))
      .sort((a, b) => {
        const byCurrency = (a.currency_code ?? '').localeCompare(
          b.currency_code ?? '',
        );
        if (byCurrency !== 0) {
          return byCurrency;
        }
        return new Prisma.Decimal(b.total)
          .minus(new Prisma.Decimal(a.total))
          .toNumber();
      });

    return { month, year, expenses };
  }

  async getMonthlyTrend(userId: string, query: MonthlyTrendQueryDto) {
    const months = query.months ?? DEFAULT_TREND_MONTHS;
    const now = new Date();

    const periods = Array.from({ length: months }, (_, index) => {
      const offset = months - 1 - index;
      const date = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
      );
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
    });

    const currencyMap = await this.loadCurrencyMap();

    const trend = await Promise.all(
      periods.map(async (period) => {
        const grouped = await this.prisma.movement.groupBy({
          by: ['currency_id', 'type'],
          _sum: { amount: true },
          where: {
            user_id: userId,
            type: { in: ['income', 'expense'] },
            movement_date: this.monthRange(period.year, period.month),
          },
        });

        return {
          year: period.year,
          month: period.month,
          totals_by_currency: this.buildCurrencyTotals(grouped, currencyMap),
        };
      }),
    );

    return { months, trend };
  }

  async getRecentMovements(userId: string, query: RecentMovementsQueryDto) {
    const limit = query.limit ?? DEFAULT_RECENT_LIMIT;

    const movements = await this.prisma.movement.findMany({
      where: { user_id: userId },
      orderBy: [{ movement_date: 'desc' }, { created_at: 'desc' }],
      take: limit,
      select: {
        id: true,
        type: true,
        amount: true,
        movement_date: true,
        description: true,
        category: { select: { id: true, name: true } },
        account: { select: { id: true, name: true, type: true } },
        currency: { select: { id: true, code: true, symbol: true } },
      },
    });

    return movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amount: this.toMoney(movement.amount),
      movement_date: movement.movement_date,
      description: movement.description,
      category: movement.category
        ? { id: movement.category.id, name: movement.category.name }
        : null,
      account: movement.account
        ? {
            id: movement.account.id,
            name: movement.account.name,
            type: movement.account.type,
          }
        : null,
      currency: movement.currency
        ? {
            id: movement.currency.id,
            code: movement.currency.code,
            symbol: movement.currency.symbol,
          }
        : null,
    }));
  }

  private buildCurrencyTotals(
    rows: CurrencyTotalRow[],
    currencyMap: Map<string, CurrencyInfo>,
  ): CurrencyTotals[] {
    const totals = new Map<
      string,
      { income: Prisma.Decimal; expenses: Prisma.Decimal }
    >();

    for (const row of rows) {
      const entry = totals.get(row.currency_id) ?? {
        income: new Prisma.Decimal(0),
        expenses: new Prisma.Decimal(0),
      };
      if (row.type === 'income') {
        entry.income = entry.income.plus(row._sum.amount ?? 0);
      } else {
        entry.expenses = entry.expenses.plus(row._sum.amount ?? 0);
      }
      totals.set(row.currency_id, entry);
    }

    return Array.from(totals.entries())
      .map(([currencyId, entry]) => ({
        currency_id: currencyId,
        currency_code: currencyMap.get(currencyId)?.code ?? null,
        symbol: currencyMap.get(currencyId)?.symbol ?? null,
        income: entry.income.toFixed(2),
        expenses: entry.expenses.toFixed(2),
        net: entry.income.minus(entry.expenses).toFixed(2),
      }))
      .sort((a, b) =>
        (a.currency_code ?? '').localeCompare(b.currency_code ?? ''),
      );
  }

  private async loadCurrencyMap(): Promise<Map<string, CurrencyInfo>> {
    const currencies = await this.prisma.currency.findMany({
      select: { id: true, code: true, symbol: true },
    });
    return new Map(currencies.map((item) => [item.id, item]));
  }

  private resolvePeriod(query: DashboardPeriodDto): {
    month: number;
    year: number;
  } {
    const now = new Date();
    return {
      month: query.month ?? now.getUTCMonth() + 1,
      year: query.year ?? now.getUTCFullYear(),
    };
  }

  private monthRange(year: number, month: number): DateRange {
    return {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }

  private toMoney(value: Prisma.Decimal | null | undefined): string {
    return new Prisma.Decimal(value ?? 0).toFixed(2);
  }
}
