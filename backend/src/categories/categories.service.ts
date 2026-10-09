import { Injectable, NotFoundException } from '@nestjs/common';
import type { category_type } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string, type?: category_type) {
    return this.prisma.category.findMany({
      where: {
        OR: [{ user_id: null }, { user_id: userId }],
        ...(type ? { type } : {}),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  create(userId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        user_id: userId,
        name: dto.name,
        type: dto.type,
        description: dto.description ?? null,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
      },
    });
  }

  async deactivate(userId: string, id: string) {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.category.update({
      where: { id },
      data: { is_active: false },
    });
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, user_id: userId },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return category;
  }
}
