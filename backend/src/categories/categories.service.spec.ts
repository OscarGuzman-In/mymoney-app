import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

interface MockPrisma {
  category: {
    findMany: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
}

function createContext(): { prisma: MockPrisma; service: CategoriesService } {
  const prisma: MockPrisma = {
    category: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new CategoriesService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const ownCategory = {
  id: 'cat-1',
  user_id: 'user-1',
  name: 'Alimentación',
  type: 'expense',
  description: null,
  color: null,
  icon: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

describe('CategoriesService', () => {
  describe('findAll', () => {
    it('lists system categories and the user own categories', async () => {
      const { prisma, service } = createContext();
      prisma.category.findMany.mockResolvedValue([ownCategory]);

      await expect(service.findAll('user-1')).resolves.toEqual([ownCategory]);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { OR: [{ user_id: null }, { user_id: 'user-1' }] },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      });
    });

    it('applies the type filter when provided', async () => {
      const { prisma, service } = createContext();
      prisma.category.findMany.mockResolvedValue([]);

      await service.findAll('user-1', 'expense');

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ user_id: null }, { user_id: 'user-1' }],
          type: 'expense',
        },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      });
    });
  });

  describe('create', () => {
    it('creates a category owned by the authenticated user', async () => {
      const { prisma, service } = createContext();
      let createdData: Record<string, unknown> | null = null;
      prisma.category.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return ownCategory;
        },
      );

      const result = await service.create('user-1', {
        name: 'Alimentación',
        type: 'expense',
      });

      expect(result).toEqual(ownCategory);
      expect(createdData).toEqual({
        user_id: 'user-1',
        name: 'Alimentación',
        type: 'expense',
        description: null,
        color: null,
        icon: null,
      });
    });
  });

  describe('update', () => {
    it('updates an owned category', async () => {
      const { prisma, service } = createContext();
      prisma.category.findFirst.mockResolvedValue(ownCategory);
      prisma.category.update.mockResolvedValue({
        ...ownCategory,
        name: 'Comida',
      });

      const result = await service.update('user-1', 'cat-1', {
        name: 'Comida',
      });

      expect(result.name).toBe('Comida');
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-1', user_id: 'user-1' },
      });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: {
          name: 'Comida',
          description: undefined,
          color: undefined,
          icon: undefined,
        },
      });
    });

    it('cannot update a system category', async () => {
      const { prisma, service } = createContext();
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'system-cat', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it("cannot update another user's category", async () => {
      const { prisma, service } = createContext();
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-2', 'cat-1', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('deactivates an owned category', async () => {
      const { prisma, service } = createContext();
      prisma.category.findFirst.mockResolvedValue(ownCategory);
      prisma.category.update.mockResolvedValue({
        ...ownCategory,
        is_active: false,
      });

      const result = await service.deactivate('user-1', 'cat-1');

      expect(result.is_active).toBe(false);
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { is_active: false },
      });
    });

    it("cannot deactivate another user's category", async () => {
      const { prisma, service } = createContext();
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.deactivate('user-2', 'cat-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });
  });
});
