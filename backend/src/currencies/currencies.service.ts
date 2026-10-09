import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.currency.findMany({
      where: { is_active: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, symbol: true },
    });
  }
}
