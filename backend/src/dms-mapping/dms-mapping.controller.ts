import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req, Ip } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { DmsMappingService, CreateMappingDto } from './dms-mapping.service';
import { DmsMappingType } from '../entities/dms-mapping.entity';

@Controller('admin/dms-mapping')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class DmsMappingController {
  constructor(private readonly dmsMappingService: DmsMappingService) {}

  private getClientIp(req: any, ip: string): string {
    return req.headers['x-forwarded-for']?.split(',')[0] || ip;
  }

  // Get all mappings
  @Get()
  async findAll() {
    const mappings = await this.dmsMappingService.findAll();
    // Parse columnMappings JSON for each mapping
    return mappings.map(m => ({
      ...m,
      columnMappings: m.columnMappings ? JSON.parse(m.columnMappings) : {},
    }));
  }

  // Get mapping by type
  @Get('type/:type')
  async findByType(@Param('type') type: DmsMappingType) {
    const mapping = await this.dmsMappingService.findByType(type);
    if (mapping) {
      return {
        ...mapping,
        columnMappings: mapping.columnMappings ? JSON.parse(mapping.columnMappings) : {},
      };
    }
    // Return default table names
    const defaultTableNames: Record<DmsMappingType, string> = {
      articles: 'Articles',
      clients: 'Clients',
      commandes_entete: 'Commandes',
      commandes_detail: 'Commandes_Lignes',
      factures_entete: 'Factures',
      factures_detail: 'Factures_Lignes',
      bl_entete: 'BonsLivraison',
      bl_detail: 'BonsLivraison_Lignes',
      tva: 'TVA',
      positions: 'Positions',
      majoration: 'Majoration',
    };
    return {
      mappingType: type,
      dmsTableName: defaultTableNames[type] || type,
      columnMappings: this.dmsMappingService.getDefaultFields(type),
      isActive: false,
      isDefault: true,
    };
  }

  // Get all DMS tables
  @Get('tables')
  async getTables() {
    return this.dmsMappingService.getDmsTables();
  }

  // Get columns for a specific table
  @Get('tables/:tableName/columns')
  async getTableColumns(@Param('tableName') tableName: string) {
    return this.dmsMappingService.getTableColumns(tableName);
  }

  // Get default field mappings for a type
  @Get('defaults/:type')
  getDefaults(@Param('type') type: DmsMappingType) {
    return this.dmsMappingService.getDefaultFields(type);
  }

  // Preview data with mapping
  @Post('preview')
  async previewData(
    @Body() body: { tableName: string; columnMappings: Record<string, string> },
  ) {
    return this.dmsMappingService.previewData(body.tableName, body.columnMappings);
  }

  // Create or update mapping
  @Post()
  async upsertMapping(
    @Body() dto: CreateMappingDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const mapping = await this.dmsMappingService.upsertMapping(dto, req.user.id, this.getClientIp(req, ip));
    return {
      ...mapping,
      columnMappings: mapping.columnMappings ? JSON.parse(mapping.columnMappings) : {},
    };
  }

  // Delete mapping (revert to default)
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any, @Ip() ip: string) {
    return this.dmsMappingService.remove(id, req.user.id, this.getClientIp(req, ip));
  }
}
