import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { movement_type } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { FilterMovementsDto } from './dto/filter-movements.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';

interface MovementRelations {
  account_id: string;
  category_id?: string | null;
  payment_method_id?: string | null;
  currency_id: string;
  transfer_account_id?: string | null;
  type: movement_type;
}

interface MovementEffectSource {
  type: movement_type;
  amount: string | Prisma.Decimal;
  account_id: string;
  transfer_account_id: string | null;
}

type TransactionClient = {
  movement: Pick<PrismaService['movement'], 'create' | 'update'>;
  account: Pick<PrismaService['account'], 'update'>;
};

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateMovementDto) {
    await this.validateRelations(userId, {
      account_id: dto.account_id,
      category_id: dto.category_id,
      payment_method_id: dto.payment_method_id,
      currency_id: dto.currency_id,
      transfer_account_id: dto.transfer_account_id,
      type: dto.type,
    });

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.movement.create({
        data: {
          user_id: userId,
          account_id: dto.account_id,
          category_id: dto.category_id ?? null,
          payment_method_id: dto.payment_method_id ?? null,
          currency_id: dto.currency_id,
          transfer_account_id: dto.transfer_account_id ?? null,
          amount: dto.amount.toString(),
          type: dto.type,
          description: dto.description ?? null,
          movement_date: new Date(dto.movement_date),
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
        },
      });

      await this.applyDeltas(tx, this.effectsByAccount(movement));
      return movement;
    });
  }

  findAll(userId: string, filters: FilterMovementsDto) {
    return this.prisma.movement.findMany({
      where: {
        user_id: userId,
        ...(filters.account_id ? { account_id: filters.account_id } : {}),
        ...(filters.category_id ? { category_id: filters.category_id } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.start_date || filters.end_date
          ? {
              movement_date: {
                ...(filters.start_date
                  ? { gte: new Date(filters.start_date) }
                  : {}),
                ...(filters.end_date
                  ? { lte: new Date(filters.end_date) }
                  : {}),
              },
            }
          : {}),
      },
      orderBy: [{ movement_date: 'desc' }, { created_at: 'desc' }],
    });
  }

  findOne(userId: string, id: string) {
    return this.findOwnedOrFail(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateMovementDto) {
    const movement = await this.findOwnedOrFail(userId, id);

    await this.validateRelations(userId, {
      account_id: dto.account_id ?? movement.account_id,
      category_id:
        dto.category_id !== undefined ? dto.category_id : movement.category_id,
      payment_method_id:
        dto.payment_method_id !== undefined
          ? dto.payment_method_id
          : movement.payment_method_id,
      currency_id: dto.currency_id ?? movement.currency_id,
      transfer_account_id:
        dto.transfer_account_id !== undefined
          ? dto.transfer_account_id
          : movement.transfer_account_id,
      type: dto.type ?? movement.type,
    });

    const data = {
      account_id: dto.account_id,
      category_id: dto.category_id,
      payment_method_id: dto.payment_method_id,
      currency_id: dto.currency_id,
      transfer_account_id: dto.transfer_account_id,
      amount: dto.amount !== undefined ? dto.amount.toString() : undefined,
      type: dto.type,
      description: dto.description,
      movement_date:
        dto.movement_date !== undefined
          ? new Date(dto.movement_date)
          : undefined,
      reference: dto.reference,
      notes: dto.notes,
    };

    const deltas = this.netDeltas(movement, {
      type: dto.type ?? movement.type,
      amount:
        dto.amount !== undefined ? dto.amount.toString() : movement.amount,
      account_id: dto.account_id ?? movement.account_id,
      transfer_account_id:
        dto.transfer_account_id !== undefined
          ? dto.transfer_account_id
          : movement.transfer_account_id,
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.movement.update({ where: { id }, data });
      await this.applyDeltas(tx, deltas);
      return updated;
    });
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const movement = await this.prisma.movement.findFirst({
      where: { id, user_id: userId },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    return movement;
  }

  private async validateRelations(
    userId: string,
    relations: MovementRelations,
  ): Promise<void> {
    const origin = await this.ensureAccountOwned(userId, relations.account_id);
    await this.ensureCurrencyExists(relations.currency_id);

    if (origin.currency_id !== relations.currency_id) {
      throw new BadRequestException(
        'La moneda del movimiento no coincide con la moneda de la cuenta',
      );
    }

    if (relations.category_id) {
      await this.ensureCategoryAvailable(
        userId,
        relations.category_id,
        relations.type,
      );
    }

    if (relations.payment_method_id) {
      await this.ensurePaymentMethodOwned(userId, relations.payment_method_id);
    }

    if (relations.type === movement_type.transfer) {
      if (!relations.transfer_account_id) {
        throw new BadRequestException(
          'Una transferencia requiere una cuenta destino',
        );
      }
      if (relations.transfer_account_id === relations.account_id) {
        throw new BadRequestException(
          'La cuenta destino debe ser distinta de la cuenta origen',
        );
      }
      const destination = await this.ensureAccountOwned(
        userId,
        relations.transfer_account_id,
      );
      if (destination.currency_id !== relations.currency_id) {
        throw new BadRequestException(
          'Las cuentas de una transferencia deben usar la misma moneda',
        );
      }
    } else if (relations.transfer_account_id) {
      throw new BadRequestException(
        'Solo las transferencias pueden tener una cuenta destino',
      );
    }
  }

  private async ensureAccountOwned(
    userId: string,
    accountId: string,
  ): Promise<{ id: string; currency_id: string }> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, user_id: userId },
      select: { id: true, currency_id: true },
    });

    if (!account) {
      throw new BadRequestException('La cuenta indicada no existe');
    }

    return account;
  }

  private async ensureCurrencyExists(currencyId: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { id: currencyId },
    });

    if (!currency) {
      throw new BadRequestException('La moneda indicada no existe');
    }
  }

  private async ensureCategoryAvailable(
    userId: string,
    categoryId: string,
    type: movement_type,
  ) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, OR: [{ user_id: null }, { user_id: userId }] },
    });

    if (!category) {
      throw new BadRequestException('La categoría indicada no existe');
    }

    if (type !== movement_type.transfer && category.type !== type) {
      throw new BadRequestException(
        'El tipo de la categoría no coincide con el tipo del movimiento',
      );
    }
  }

  private async ensurePaymentMethodOwned(
    userId: string,
    paymentMethodId: string,
  ) {
    const paymentMethod = await this.prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, user_id: userId },
    });

    if (!paymentMethod) {
      throw new BadRequestException('El método de pago indicado no existe');
    }
  }

  private effectsByAccount(
    movement: MovementEffectSource,
  ): Map<string, Prisma.Decimal> {
    const amount =
      movement.amount instanceof Prisma.Decimal
        ? movement.amount
        : new Prisma.Decimal(movement.amount);
    const effects = new Map<string, Prisma.Decimal>();

    if (movement.type === movement_type.income) {
      effects.set(movement.account_id, amount);
    } else {
      effects.set(movement.account_id, amount.negated());
      if (movement.transfer_account_id) {
        const transferred = effects.get(movement.transfer_account_id);
        effects.set(
          movement.transfer_account_id,
          transferred ? transferred.plus(amount) : amount,
        );
      }
    }

    return effects;
  }

  private netDeltas(
    previous: MovementEffectSource,
    current: MovementEffectSource,
  ): Map<string, Prisma.Decimal> {
    const deltas = new Map<string, Prisma.Decimal>();

    for (const [accountId, amount] of this.effectsByAccount(previous)) {
      deltas.set(
        accountId,
        (deltas.get(accountId) ?? new Prisma.Decimal(0)).minus(amount),
      );
    }
    for (const [accountId, amount] of this.effectsByAccount(current)) {
      deltas.set(
        accountId,
        (deltas.get(accountId) ?? new Prisma.Decimal(0)).plus(amount),
      );
    }

    return deltas;
  }

  private async applyDeltas(
    tx: TransactionClient,
    deltas: Map<string, Prisma.Decimal>,
  ): Promise<void> {
    for (const [accountId, delta] of deltas) {
      if (delta.isZero()) {
        continue;
      }
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: delta } },
      });
    }
  }
}
