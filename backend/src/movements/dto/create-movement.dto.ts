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
} from 'class-validator';
import { movement_type } from '../../generated/prisma/client';

export class CreateMovementDto {
  @ApiProperty({ example: '00000000-0000-4000-8000-000000000000' })
  @IsUUID()
  account_id!: string;

  @ApiPropertyOptional({ example: '00000000-0000-4000-8000-000000000000' })
  @IsOptional()
  @IsUUID()
  category_id?: string | null;

  @ApiPropertyOptional({ example: '00000000-0000-4000-8000-000000000000' })
  @IsOptional()
  @IsUUID()
  payment_method_id?: string | null;

  @ApiProperty({ example: '00000000-0000-4000-8000-000000000000' })
  @IsUUID()
  currency_id!: string;

  @ApiPropertyOptional({ example: '00000000-0000-4000-8000-000000000000' })
  @IsOptional()
  @IsUUID()
  transfer_account_id?: string | null;

  @ApiProperty({ example: 125.5 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: movement_type, example: movement_type.expense })
  @IsEnum(movement_type)
  type!: movement_type;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString()
  movement_date!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
