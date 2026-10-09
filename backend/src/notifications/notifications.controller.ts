import {
  Controller,
  Get,
  Param,
  Patch,
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
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Evaluar y listar las notificaciones del usuario autenticado (evaluación idempotente)',
  })
  @ApiResponse({ status: 200, description: 'Notificaciones y contador sin leer' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.evaluate(user.userId);
    const [items, unread_count] = await Promise.all([
      this.notificationsService.findAll(user.userId),
      this.notificationsService.unreadCount(user.userId),
    ]);

    return { items, unread_count };
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Evaluar y contar las notificaciones sin leer del usuario',
  })
  @ApiResponse({ status: 200, description: 'Contador de notificaciones sin leer' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.evaluate(user.userId);
    const count = await this.notificationsService.unreadCount(user.userId);

    return { count };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  @ApiResponse({ status: 200, description: 'Notificaciones marcadas como leídas' })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar una notificación propia como leída' })
  @ApiResponse({ status: 200, description: 'Notificación marcada como leída' })
  @ApiResponse({ status: 404, description: 'Notificación no encontrada' })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.userId, id);
  }
}
