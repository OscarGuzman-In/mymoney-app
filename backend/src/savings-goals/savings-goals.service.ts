import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContributionDto } from './dto/create-contribution.dto';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto';

@Injectable()
export class SavingsGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSavingsGoalDto) {
    await this.ensureCurrencyExists(dto.currency_id);

    return this.prisma.savingsGoal.create({
      data: {
        user_id: userId,
        currency_id: dto.currency_id,
        name: dto.name,
        target_amount: dto.target_amount.toString(),
        target_date: new Date(dto.target_date),
        status: dto.status,
        description: dto.description ?? null,
      },
    });
  }

  findAll(userId: string) {
    return this.prisma.savingsGoal.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  findOne(userId: string, id: string) {
    return this.findOwnedOrFail(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateSavingsGoalDto) {
    await this.findOwnedOrFail(userId, id);

    if (dto.currency_id) {
      await this.ensureCurrencyExists(dto.currency_id);
    }

    return this.prisma.savingsGoal.update({
      where: { id },
      data: {
        currency_id: dto.currency_id,
        name: dto.name,
        target_amount:
          dto.target_amount !== undefined
            ? dto.target_amount.toString()
            : undefined,
        target_date: dto.target_date ? new Date(dto.target_date) : undefined,
        status: dto.status,
        description: dto.description,
      },
    });
  }

  async deactivate(userId: string, id: string) {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.savingsGoal.update({
      where: { id },
      data: { is_active: false },
    });
  }

  async complete(userId: string, id: string) {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.savingsGoal.update({
      where: { id },
      data: { status: 'completed' },
    });
  }

  async addContribution(
    userId: string,
    goalId: string,
    dto: CreateContributionDto,
  ) {
    const goal = await this.findOwnedOrFail(userId, goalId);

    const contributionAmount = new Prisma.Decimal(dto.amount);
    const updatedAmount = new Prisma.Decimal(goal.current_amount).plus(
      contributionAmount,
    );

    const [contribution] = await this.prisma.$transaction([
      this.prisma.savingsGoalContribution.create({
        data: {
          savings_goal_id: goalId,
          amount: contributionAmount,
          contribution_date: new Date(dto.contribution_date),
          notes: dto.notes ?? null,
        },
      }),
      this.prisma.savingsGoal.update({
        where: { id: goalId },
        data: { current_amount: updatedAmount },
      }),
    ]);

    return contribution;
  }

  async listContributions(userId: string, goalId: string) {
    await this.findOwnedOrFail(userId, goalId);

    return this.prisma.savingsGoalContribution.findMany({
      where: { savings_goal_id: goalId },
      orderBy: { contribution_date: 'desc' },
    });
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const goal = await this.prisma.savingsGoal.findFirst({
      where: { id, user_id: userId },
    });

    if (!goal) {
      throw new NotFoundException('Meta de ahorro no encontrada');
    }

    return goal;
  }

  private async ensureCurrencyExists(currencyId: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { id: currencyId },
    });

    if (!currency) {
      throw new BadRequestException('La moneda indicada no existe');
    }
  }
}
