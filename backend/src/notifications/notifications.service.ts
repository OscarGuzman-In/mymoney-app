import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  debt_status,
  movement_type,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const NOTIFICATION_TYPES = {
  budgetWarning: 'budget_warning',
  budgetExceeded: 'budget_exceeded',
  savingsGoalReached: 'savings_goal_reached',
  debtDueSoon: 'debt_due_soon',
  debtOverdue: 'debt_overdue',
} as const;

interface NotificationCandidate {
  type: string;
  title: string;
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7;

function startOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function periodLabel(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function formatAmount(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Explicit, idempotent evaluation of the user's financial state. Produces
   * notifications for budgets, savings goals and debts without a background
   * scheduler and without duplicating already-existing notifications.
   */
  async evaluate(userId: string): Promise<void> {
    const candidates = [
      ...(await this.buildBudgetCandidates(userId)),
      ...(await this.buildSavingsGoalCandidates(userId)),
      ...(await this.buildDebtCandidates(userId)),
    ];

    for (const candidate of candidates) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          user_id: userId,
          type: candidate.type,
          title: candidate.title,
          is_active: true,
        },
      });

      if (existing) {
        continue;
      }

      await this.prisma.notification.create({
        data: {
          user_id: userId,
          type: candidate.type,
          title: candidate.title,
          message: candidate.message,
        },
      });
    }
  }

  findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { user_id: userId, is_active: true },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { user_id: userId, is_active: true, is_read: false },
    });
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, user_id: userId },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { is_read: true, read_at: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { user_id: userId, is_active: true, is_read: false },
      data: { is_read: true, read_at: new Date() },
    });

    return { success: true as const };
  }

  private async buildBudgetCandidates(
    userId: string,
  ): Promise<NotificationCandidate[]> {
    const budgets = await this.prisma.budget.findMany({
      where: { user_id: userId, is_active: true, status: 'active' },
      include: { budget_categories: true },
    });

    const candidates: NotificationCandidate[] = [];

    for (const budget of budgets) {
      const limit = new Prisma.Decimal(budget.amount);
      if (limit.lte(0)) {
        continue;
      }

      const categoryIds = budget.budget_categories.map(
        (item) => item.category_id,
      );

      const aggregate = await this.prisma.movement.aggregate({
        where: {
          user_id: userId,
          type: movement_type.expense,
          currency_id: budget.currency_id,
          movement_date: { gte: budget.start_date, lte: budget.end_date },
          ...(categoryIds.length > 0
            ? { category_id: { in: categoryIds } }
            : {}),
        },
        _sum: { amount: true },
      });

      const spent = new Prisma.Decimal(aggregate._sum.amount ?? 0);
      const ratio = spent.div(limit).toNumber();
      const period = periodLabel(budget.start_date);

      if (ratio >= 1) {
        candidates.push({
          type: NOTIFICATION_TYPES.budgetExceeded,
          title: truncate(`Presupuesto superado: ${budget.name} (${period})`, 100),
          message: `Gastaste ${formatAmount(spent)} de un límite de ${formatAmount(limit)}. Revisa tus gastos de este periodo.`,
        });
      } else if (ratio >= 0.9) {
        candidates.push({
          type: NOTIFICATION_TYPES.budgetWarning,
          title: truncate(
            `Presupuesto casi agotado: ${budget.name} (${period})`,
            100,
          ),
          message: `Ya usaste el ${Math.round(ratio * 100)}% de tu presupuesto (${formatAmount(spent)} de ${formatAmount(limit)}).`,
        });
      }
    }

    return candidates;
  }

  private async buildSavingsGoalCandidates(
    userId: string,
  ): Promise<NotificationCandidate[]> {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { user_id: userId, is_active: true, status: 'active' },
    });

    const candidates: NotificationCandidate[] = [];

    for (const goal of goals) {
      const target = new Prisma.Decimal(goal.target_amount);
      const current = new Prisma.Decimal(goal.current_amount);
      if (target.gt(0) && current.gte(target)) {
        candidates.push({
          type: NOTIFICATION_TYPES.savingsGoalReached,
          title: truncate(`Meta de ahorro alcanzada: ${goal.name}`, 100),
          message: `¡Felicidades! Alcanzaste tu meta de ${formatAmount(target)}. Considera marcarla como completada.`,
        });
      }
    }

    return candidates;
  }

  private async buildDebtCandidates(
    userId: string,
  ): Promise<NotificationCandidate[]> {
    const debts = await this.prisma.debt.findMany({
      where: { user_id: userId, is_active: true, status: debt_status.active },
    });

    const today = startOfToday();
    const candidates: NotificationCandidate[] = [];

    for (const debt of debts) {
      const remaining = new Prisma.Decimal(debt.remaining_amount);
      if (remaining.lte(0)) {
        continue;
      }

      const due = debt.due_date;
      const diffDays = Math.round((due.getTime() - today.getTime()) / DAY_MS);
      const dueLabel = due.toISOString().slice(0, 10);

      if (diffDays < 0) {
        candidates.push({
          type: NOTIFICATION_TYPES.debtOverdue,
          title: truncate(`Deuda vencida: ${debt.name} (${dueLabel})`, 100),
          message: `La deuda venció el ${dueLabel} y aún tienes ${formatAmount(remaining)} pendientes.`,
        });
      } else if (diffDays <= DUE_SOON_DAYS) {
        candidates.push({
          type: NOTIFICATION_TYPES.debtDueSoon,
          title: truncate(`Deuda próxima a vencer: ${debt.name} (${dueLabel})`, 100),
          message: `Vence el ${dueLabel}. Saldo pendiente: ${formatAmount(remaining)}.`,
        });
      }
    }

    return candidates;
  }
}
