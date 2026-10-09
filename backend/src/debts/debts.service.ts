import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDebtDto } from './dto/create-debt.dto';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';

@Injectable()
export class DebtsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateDebtDto) {
    await this.ensureCurrencyExists(dto.currency_id);

    const originalAmount = new Prisma.Decimal(dto.original_amount);
    const remainingAmount =
      dto.remaining_amount !== undefined
        ? new Prisma.Decimal(dto.remaining_amount)
        : originalAmount;

    if (remainingAmount.gt(originalAmount)) {
      throw new BadRequestException(
        'El saldo pendiente no puede superar el monto original',
      );
    }

    return this.prisma.debt.create({
      data: {
        user_id: userId,
        currency_id: dto.currency_id,
        name: dto.name,
        original_amount: originalAmount,
        remaining_amount: remainingAmount,
        due_date: new Date(dto.due_date),
        status: dto.status,
        description: dto.description ?? null,
      },
    });
  }

  findAll(userId: string) {
    return this.prisma.debt.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  findOne(userId: string, id: string) {
    return this.findOwnedOrFail(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateDebtDto) {
    const debt = await this.findOwnedOrFail(userId, id);

    if (dto.currency_id) {
      await this.ensureCurrencyExists(dto.currency_id);
    }

    const originalAmount =
      dto.original_amount !== undefined
        ? new Prisma.Decimal(dto.original_amount)
        : new Prisma.Decimal(debt.original_amount);
    const remainingAmount =
      dto.remaining_amount !== undefined
        ? new Prisma.Decimal(dto.remaining_amount)
        : new Prisma.Decimal(debt.remaining_amount);

    if (remainingAmount.gt(originalAmount)) {
      throw new BadRequestException(
        'El saldo pendiente no puede superar el monto original',
      );
    }

    return this.prisma.debt.update({
      where: { id },
      data: {
        currency_id: dto.currency_id,
        name: dto.name,
        original_amount:
          dto.original_amount !== undefined ? originalAmount : undefined,
        remaining_amount:
          dto.remaining_amount !== undefined ? remainingAmount : undefined,
        due_date: dto.due_date ? new Date(dto.due_date) : undefined,
        status: dto.status,
        description: dto.description,
      },
    });
  }

  async deactivate(userId: string, id: string) {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.debt.update({
      where: { id },
      data: { is_active: false },
    });
  }

  async registerPayment(
    userId: string,
    debtId: string,
    dto: CreateDebtPaymentDto,
  ) {
    const debt = await this.findOwnedOrFail(userId, debtId);

    const paymentAmount = new Prisma.Decimal(dto.amount);
    const remainingAmount = new Prisma.Decimal(debt.remaining_amount);

    if (paymentAmount.gt(remainingAmount)) {
      throw new BadRequestException(
        'El pago no puede superar el saldo pendiente de la deuda',
      );
    }

    const newRemainingAmount = remainingAmount.minus(paymentAmount);
    const newStatus = newRemainingAmount.isZero() ? 'paid' : debt.status;

    const [payment] = await this.prisma.$transaction([
      this.prisma.debtPayment.create({
        data: {
          debt_id: debtId,
          amount: paymentAmount,
          payment_date: new Date(dto.payment_date),
          notes: dto.notes ?? null,
        },
      }),
      this.prisma.debt.update({
        where: { id: debtId },
        data: {
          remaining_amount: newRemainingAmount,
          status: newStatus,
        },
      }),
    ]);

    return payment;
  }

  async listPayments(userId: string, debtId: string) {
    await this.findOwnedOrFail(userId, debtId);

    return this.prisma.debtPayment.findMany({
      where: { debt_id: debtId },
      orderBy: { payment_date: 'desc' },
    });
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, user_id: userId },
    });

    if (!debt) {
      throw new NotFoundException('Deuda no encontrada');
    }

    return debt;
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
