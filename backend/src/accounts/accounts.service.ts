import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAccountDto) {
    const currency = await this.prisma.currency.findUnique({
      where: { id: dto.currency_id },
    });
    if (!currency) {
      throw new BadRequestException('La moneda indicada no existe');
    }

    return this.prisma.account.create({
      data: {
        user_id: userId,
        currency_id: dto.currency_id,
        name: dto.name,
        type: dto.type,
        description: dto.description ?? null,
        ...(dto.initial_balance !== undefined
          ? { balance: new Prisma.Decimal(dto.initial_balance) }
          : {}),
      },
    });
  }

  findAll(userId: string) {
    return this.prisma.account.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  findOne(userId: string, id: string) {
    return this.findOwnedOrFail(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        description: dto.description,
      },
    });
  }

  async deactivate(userId: string, id: string) {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.account.update({
      where: { id },
      data: { is_active: false },
    });
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, user_id: userId },
    });

    if (!account) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    return account;
  }
}
