import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentPass123', maxLength: 72 })
  @IsString()
  @MaxLength(72)
  current_password!: string;

  @ApiProperty({ example: 'NewStrongPass123', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  new_password!: string;
}
