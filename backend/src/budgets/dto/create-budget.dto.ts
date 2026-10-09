import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { budget_status } from '../../generated/prisma/client';
import { BudgetCategoryItemDto } from './budget-category-item.dto';

export class CreateBudgetDto {
  @ApiProperty({ example: 'Presupuesto mensual', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '00000000-0000-4000-8000-000000000000' })
  @IsUUID()
  currency_id!: string;

  @ApiProperty({ example: 500 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  start_date!: string;

  @ApiProperty({ example: '2026-01-31' })
  @IsDateString()
  end_date!: string;

  @ApiPropertyOptional({ enum: budget_status, example: budget_status.active })
  @IsOptional()
  @IsEnum(budget_status)
  status?: budget_status;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [BudgetCategoryItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCategoryItemDto)
  categories?: BudgetCategoryItemDto[];
}
