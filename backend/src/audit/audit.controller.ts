import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from './audit.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  async findAll(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditService.findAll({
      userId,
      action,
      entityType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('actions')
  async getActions() {
    return this.auditService.getActions();
  }

  @Get('entity-types')
  async getEntityTypes() {
    return this.auditService.getEntityTypes();
  }
}
