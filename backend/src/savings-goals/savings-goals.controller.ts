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
import { CreateContributionDto } from './dto/create-contribution.dto';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto';
import { SavingsGoalsService } from './savings-goals.service';

@ApiTags('savings-goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('savings-goals')
export class SavingsGoalsController {
  constructor(private readonly savingsGoalsService: SavingsGoalsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una meta de ahorro' })
  @ApiResponse({ status: 201, description: 'Meta creada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavingsGoalDto,
  ) {
    return this.savingsGoalsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar las metas de ahorro del usuario autenticado',
  })
  @ApiResponse({ status: 200, description: 'Listado de metas' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.savingsGoalsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una meta de ahorro del usuario' })
  @ApiResponse({ status: 200, description: 'Meta encontrada' })
  @ApiResponse({ status: 404, description: 'Meta no encontrada' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.savingsGoalsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una meta de ahorro del usuario' })
  @ApiResponse({ status: 200, description: 'Meta actualizada' })
  @ApiResponse({ status: 404, description: 'Meta no encontrada' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavingsGoalDto,
  ) {
    return this.savingsGoalsService.update(user.userId, id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar una meta de ahorro del usuario' })
  @ApiResponse({ status: 200, description: 'Meta desactivada' })
  @ApiResponse({ status: 404, description: 'Meta no encontrada' })
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.savingsGoalsService.deactivate(user.userId, id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Marcar una meta de ahorro como completada' })
  @ApiResponse({ status: 200, description: 'Meta completada' })
  @ApiResponse({ status: 404, description: 'Meta no encontrada' })
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.savingsGoalsService.complete(user.userId, id);
  }

  @Post(':id/contributions')
  @ApiOperation({ summary: 'Registrar una aportación a una meta de ahorro' })
  @ApiResponse({ status: 201, description: 'Aportación registrada' })
  @ApiResponse({ status: 404, description: 'Meta no encontrada' })
  addContribution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateContributionDto,
  ) {
    return this.savingsGoalsService.addContribution(user.userId, id, dto);
  }

  @Get(':id/contributions')
  @ApiOperation({ summary: 'Listar el historial de aportaciones de una meta' })
  @ApiResponse({ status: 200, description: 'Historial de aportaciones' })
  @ApiResponse({ status: 404, description: 'Meta no encontrada' })
  listContributions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.savingsGoalsService.listContributions(user.userId, id);
  }
}
