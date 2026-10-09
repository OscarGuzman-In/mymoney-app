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
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una cuenta financiera' })
  @ApiResponse({ status: 201, description: 'Cuenta creada' })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o moneda inexistente',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar las cuentas del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Listado de cuentas' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.accountsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una cuenta del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Cuenta encontrada' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una cuenta del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Cuenta actualizada' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(user.userId, id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar una cuenta del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Cuenta desactivada' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.deactivate(user.userId, id);
  }
}
