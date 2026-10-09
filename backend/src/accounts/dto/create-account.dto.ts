import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { account_type } from '../../generated/prisma/client';

export class CreateAccountDto {
  @ApiProperty({ example: 'Cuenta de ahorros', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: account_type, example: account_type.savings_account })
  @IsEnum(account_type)
  type!: account_type;

  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID()
  currency_id!: string;

  @ApiPropertyOptional({
    example: 1500.0,
    description:
      'Saldo inicial de la cuenta. Representa el dinero que ya existe en la cuenta; no es un ingreso y no debe registrarse otra vez como movimiento.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  initial_balance?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
