import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class MonthlyTrendQueryDto {
  @ApiPropertyOptional({
    example: 6,
    minimum: 1,
    maximum: 12,
    default: 6,
    description: 'Cantidad de meses recientes a incluir (máximo 12)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months?: number;
}
