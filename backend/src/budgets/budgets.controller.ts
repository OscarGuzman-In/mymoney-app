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
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@ApiTags('budgets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un presupuesto' })
  @ApiResponse({ status: 201, description: 'Presupuesto creado' })
  @ApiResponse({ status: 400, description: 'Datos o relaciones inválidas' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBudgetDto) {
    return this.budgetsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar los presupuestos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Listado de presupuestos' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.budgetsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un presupuesto del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Presupuesto encontrado' })
  @ApiResponse({ status: 404, description: 'Presupuesto no encontrado' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.budgetsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un presupuesto del usuario autenticado',
  })
  @ApiResponse({ status: 200, description: 'Presupuesto actualizado' })
  @ApiResponse({ status: 404, description: 'Presupuesto no encontrado' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgetsService.update(user.userId, id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({
    summary: 'Desactivar un presupuesto del usuario autenticado',
  })
  @ApiResponse({ status: 200, description: 'Presupuesto desactivado' })
  @ApiResponse({ status: 404, description: 'Presupuesto no encontrado' })
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.budgetsService.deactivate(user.userId, id);
  }
}
