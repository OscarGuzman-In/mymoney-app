import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetCategoryItemDto } from './dto/budget-category-item.dto';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateBudgetDto) {
    this.validateDates(dto.start_date, dto.end_date);
    await this.ensureCurrencyExists(dto.currency_id);
    await this.validateCategories(userId, dto.categories);

    return this.prisma.budget.create({
      data: {
        user_id: userId,
        currency_id: dto.currency_id,
        name: dto.name,
        amount: dto.amount.toString(),
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        status: dto.status,
        description: dto.description ?? null,
        ...this.buildCategoriesCreate(dto.categories),
      },
      include: { budget_categories: true },
    });
  }

  findAll(userId: string) {
    return this.prisma.budget.findMany({
      where: { user_id: userId },
      include: { budget_categories: true },
      orderBy: { created_at: 'desc' },
    });
  }

  findOne(userId: string, id: string) {
    return this.findOwnedOrFail(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateBudgetDto) {
    const budget = await this.findOwnedOrFail(userId, id);

    const startDate = dto.start_date ?? budget.start_date.toISOString();
    const endDate = dto.end_date ?? budget.end_date.toISOString();
    this.validateDates(startDate, endDate);

    if (dto.currency_id) {
      await this.ensureCurrencyExists(dto.currency_id);
    }
    await this.validateCategories(userId, dto.categories);

    return this.prisma.budget.update({
      where: { id },
      data: {
        currency_id: dto.currency_id,
        name: dto.name,
        amount: dto.amount !== undefined ? dto.amount.toString() : undefined,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        status: dto.status,
        description: dto.description,
        ...this.buildCategoriesReplace(dto.categories),
      },
      include: { budget_categories: true },
    });
  }

  async deactivate(userId: string, id: string) {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.budget.update({
      where: { id },
      data: { is_active: false },
    });
  }

  private buildCategoriesCreate(categories?: BudgetCategoryItemDto[]) {
    if (!categories || categories.length === 0) {
      return {};
    }
    return {
      budget_categories: {
        create: categories.map((item) => ({
          category_id: item.category_id,
          amount: item.amount.toString(),
        })),
      },
    };
  }

  private buildCategoriesReplace(categories?: BudgetCategoryItemDto[]) {
    if (categories === undefined) {
      return {};
    }
    return {
      budget_categories: {
        deleteMany: {},
        create: categories.map((item) => ({
          category_id: item.category_id,
          amount: item.amount.toString(),
        })),
      },
    };
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, user_id: userId },
      include: { budget_categories: true },
    });

    if (!budget) {
      throw new NotFoundException('Presupuesto no encontrado');
    }

    return budget;
  }

  private async ensureCurrencyExists(currencyId: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { id: currencyId },
    });

    if (!currency) {
      throw new BadRequestException('La moneda indicada no existe');
    }
  }

  private async validateCategories(
    userId: string,
    categories?: BudgetCategoryItemDto[],
  ) {
    if (!categories || categories.length === 0) {
      return;
    }

    const ids = categories.map((item) => item.category_id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('No se pueden repetir categorías');
    }

    const found = await this.prisma.category.findMany({
      where: {
        id: { in: ids },
        OR: [{ user_id: null }, { user_id: userId }],
      },
    });

    if (found.length !== ids.length) {
      throw new BadRequestException(
        'Alguna categoría no existe o no pertenece al usuario',
      );
    }
  }

  private validateDates(start: string, end: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (startDate > endDate) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin',
      );
    }
  }
}
