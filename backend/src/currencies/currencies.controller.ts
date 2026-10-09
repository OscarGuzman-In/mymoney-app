import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrenciesService } from './currencies.service';

@ApiTags('currencies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar las monedas disponibles' })
  @ApiResponse({
    status: 200,
    description: 'Monedas activas ordenadas por código',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  findAll() {
    return this.currenciesService.findAll();
  }
}
