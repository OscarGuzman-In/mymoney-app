import { PrismaService } from '../prisma/prisma.service';
import { CurrenciesService } from './currencies.service';

interface MockPrisma {
  currency: { findMany: jest.Mock };
}

function createContext(): { prisma: MockPrisma; service: CurrenciesService } {
  const prisma: MockPrisma = { currency: { findMany: jest.fn() } };
  const service = new CurrenciesService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const currencies = [
  { id: 'cur-eur', code: 'EUR', name: 'Euro', symbol: '€' },
  { id: 'cur-usd', code: 'USD', name: 'US Dollar', symbol: '$' },
];

describe('CurrenciesService', () => {
  describe('findAll', () => {
    it('returns the available currencies with only the required fields', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findMany.mockResolvedValue(currencies);

      await expect(service.findAll()).resolves.toEqual(currencies);
      expect(prisma.currency.findMany).toHaveBeenCalledWith({
        where: { is_active: true },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, symbol: true },
      });
    });

    it('returns an empty list when there are no active currencies', async () => {
      const { prisma, service } = createContext();
      prisma.currency.findMany.mockResolvedValue([]);

      await expect(service.findAll()).resolves.toEqual([]);
    });
  });
});
