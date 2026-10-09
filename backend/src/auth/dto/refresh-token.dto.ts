import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token emitido por login o refresh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refresh_token!: string;
}
