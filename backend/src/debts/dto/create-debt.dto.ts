import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { debt_status } from '../../generated/prisma/client';

export class CreateDebtDto {
  @ApiProperty({ example: 'Préstamo del banco', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '00000000-0000-4000-8000-000000000000' })
  @IsUUID()
  currency_id!: string;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  original_amount!: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Saldo pendiente. Por defecto es igual al monto original.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  remaining_amount?: number;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  due_date!: string;

  @ApiPropertyOptional({ enum: debt_status, example: debt_status.active })
  @IsOptional()
  @IsEnum(debt_status)
  status?: debt_status;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
