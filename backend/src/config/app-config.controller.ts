import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Request,
  Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppConfigService } from './app-config.service';
import { UpdateAppConfigDto, TestSqlConnectionDto } from './dto/update-config.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('config')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AppConfigController {
  constructor(private appConfigService: AppConfigService) {}

  private getClientIp(req: any, ip: string): string {
    return req.headers['x-forwarded-for']?.split(',')[0] || ip;
  }

  @Get('app')
  async getConfig() {
    return this.appConfigService.getConfig();
  }

  @Put('app')
  @Roles(UserRole.SYSTEM_ADMIN)
  async updateConfig(@Body() updateConfigDto: UpdateAppConfigDto, @Request() req, @Ip() ip: string) {
    return this.appConfigService.updateConfig(updateConfigDto, req.user.id, this.getClientIp(req, ip));
  }

  @Post('test-sql-connection')
  @Roles(UserRole.SYSTEM_ADMIN)
  async testSqlConnection(@Body() testDto: TestSqlConnectionDto) {
    return this.appConfigService.testSqlConnection(testDto);
  }
}
