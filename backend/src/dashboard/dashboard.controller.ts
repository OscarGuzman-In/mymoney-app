import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardPeriodDto } from './dto/dashboard-period.dto';
import { MonthlyTrendQueryDto } from './dto/monthly-trend-query.dto';
import { RecentMovementsQueryDto } from './dto/recent-movements-query.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen financiero del usuario para un mes' })
  @ApiResponse({ status: 200, description: 'Resumen del mes' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardPeriodDto,
  ) {
    return this.dashboardService.getSummary(user.userId, query);
  }

  @Get('expenses-by-category')
  @ApiOperation({ summary: 'Gastos del mes agrupados por categoría' })
  @ApiResponse({ status: 200, description: 'Gastos por categoría' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  getExpensesByCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardPeriodDto,
  ) {
    return this.dashboardService.getExpensesByCategory(user.userId, query);
  }

  @Get('monthly-trend')
  @ApiOperation({ summary: 'Ingresos y gastos de los últimos meses' })
  @ApiResponse({ status: 200, description: 'Tendencia mensual' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  getMonthlyTrend(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyTrendQueryDto,
  ) {
    return this.dashboardService.getMonthlyTrend(user.userId, query);
  }

  @Get('recent-movements')
  @ApiOperation({ summary: 'Movimientos más recientes del usuario' })
  @ApiResponse({ status: 200, description: 'Movimientos recientes' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  getRecentMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RecentMovementsQueryDto,
  ) {
    return this.dashboardService.getRecentMovements(user.userId, query);
  }
}
