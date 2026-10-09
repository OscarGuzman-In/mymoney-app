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
import { savings_goal_status } from '../../generated/prisma/client';

export class CreateSavingsGoalDto {
  @ApiProperty({ example: 'Viaje a la playa', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '00000000-0000-4000-8000-000000000000' })
  @IsUUID()
  currency_id!: string;

  @ApiProperty({ example: 2000 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  target_amount!: number;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  target_date!: string;

  @ApiPropertyOptional({
    enum: savings_goal_status,
    example: savings_goal_status.active,
  })
  @IsOptional()
  @IsEnum(savings_goal_status)
  status?: savings_goal_status;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
