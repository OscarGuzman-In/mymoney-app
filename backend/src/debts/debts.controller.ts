import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DebtsService } from './debts.service';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { CreateDebtDto } from './dto/create-debt.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';

@ApiTags('debts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una deuda' })
  @ApiResponse({ status: 201, description: 'Deuda creada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDebtDto) {
    return this.debtsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar las deudas del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Listado de deudas' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.debtsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una deuda del usuario' })
  @ApiResponse({ status: 200, description: 'Deuda encontrada' })
  @ApiResponse({ status: 404, description: 'Deuda no encontrada' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.debtsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una deuda del usuario' })
  @ApiResponse({ status: 200, description: 'Deuda actualizada' })
  @ApiResponse({ status: 404, description: 'Deuda no encontrada' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDebtDto,
  ) {
    return this.debtsService.update(user.userId, id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar una deuda del usuario' })
  @ApiResponse({ status: 200, description: 'Deuda desactivada' })
  @ApiResponse({ status: 404, description: 'Deuda no encontrada' })
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.debtsService.deactivate(user.userId, id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Registrar un pago contra una deuda del usuario' })
  @ApiResponse({ status: 201, description: 'Pago registrado' })
  @ApiResponse({ status: 400, description: 'Pago inválido' })
  @ApiResponse({ status: 404, description: 'Deuda no encontrada' })
  registerPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateDebtPaymentDto,
  ) {
    return this.debtsService.registerPayment(user.userId, id, dto);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'Listar el historial de pagos de una deuda' })
  @ApiResponse({ status: 200, description: 'Historial de pagos' })
  @ApiResponse({ status: 404, description: 'Deuda no encontrada' })
  listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.debtsService.listPayments(user.userId, id);
  }
}
