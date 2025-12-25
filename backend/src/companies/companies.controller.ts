import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompaniesService, ImportClientDto } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('companies')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  private getClientIp(req: any, ip: string): string {
    return req.headers['x-forwarded-for']?.split(',')[0] || ip;
  }

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN)
  async findAll() {
    return this.companiesService.findAll();
  }

  // Get clients from DMS SQL Server
  @Get('dms/clients')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async getDmsClients() {
    return this.companiesService.getDmsClients();
  }

  @Get(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN)
  async findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async create(@Body() createCompanyDto: CreateCompanyDto, @Request() req, @Ip() ip: string) {
    return this.companiesService.create(createCompanyDto, req.user.id, this.getClientIp(req, ip));
  }

  // Import multiple clients from DMS
  @Post('import')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async importClients(@Body() body: { clients: ImportClientDto[] }, @Request() req, @Ip() ip: string) {
    return this.companiesService.importClients(body.clients, req.user.id, this.getClientIp(req, ip));
  }

  @Put(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @Request() req,
    @Ip() ip: string,
  ) {
    return this.companiesService.update(id, updateCompanyDto, req.user.id, this.getClientIp(req, ip));
  }

  @Patch(':id/status')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async toggleStatus(@Param('id') id: string, @Request() req, @Ip() ip: string) {
    return this.companiesService.toggleStatus(id, req.user.id, this.getClientIp(req, ip));
  }

  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async remove(@Param('id') id: string, @Request() req, @Ip() ip: string) {
    return this.companiesService.remove(id, req.user.id, this.getClientIp(req, ip));
  }

  // Bulk delete companies
  @Post('bulk-delete')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async bulkDelete(@Body() body: { ids: string[] }, @Request() req, @Ip() ip: string) {
    return this.companiesService.bulkDelete(body.ids, req.user.id, this.getClientIp(req, ip));
  }
}
