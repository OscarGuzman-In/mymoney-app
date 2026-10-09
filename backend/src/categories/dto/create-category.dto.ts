import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { category_type } from '../../generated/prisma/client';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Alimentación', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: category_type, example: category_type.expense })
  @IsEnum(category_type)
  type!: category_type;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: '#FF5733' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color debe tener el formato hexadecimal #RRGGBB',
  })
  color?: string;

  @ApiPropertyOptional({ example: 'fastfood', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;
}
