import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { CreateMovementDto } from './dto/create-movement.dto';
import { FilterMovementsDto } from './dto/filter-movements.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { MovementsService } from './movements.service';

@ApiTags('movements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un movimiento financiero' })
  @ApiResponse({ status: 201, description: 'Movimiento creado' })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o relaciones inexistentes',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMovementDto,
  ) {
    return this.movementsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar los movimientos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Listado de movimientos' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: FilterMovementsDto,
  ) {
    return this.movementsService.findAll(user.userId, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un movimiento del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Movimiento encontrado' })
  @ApiResponse({ status: 404, description: 'Movimiento no encontrado' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.movementsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un movimiento del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Movimiento actualizado' })
  @ApiResponse({ status: 404, description: 'Movimiento no encontrado' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMovementDto,
  ) {
    return this.movementsService.update(user.userId, id, dto);
  }
}
