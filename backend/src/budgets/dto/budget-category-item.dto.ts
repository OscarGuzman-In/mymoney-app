import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class BudgetCategoryItemDto {
  @ApiProperty({ example: '00000000-0000-4000-8000-000000000000' })
  @IsUUID()
  category_id!: string;

  @ApiProperty({ example: 150.5 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  amount!: number;
}
