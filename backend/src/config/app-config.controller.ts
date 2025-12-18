import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Request,
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

  @Get('app')
  async getConfig() {
    return this.appConfigService.getConfig();
  }

  @Put('app')
  @Roles(UserRole.SYSTEM_ADMIN)
  async updateConfig(@Body() updateConfigDto: UpdateAppConfigDto, @Request() req) {
    return this.appConfigService.updateConfig(updateConfigDto, req.user.id);
  }

  @Post('test-sql-connection')
  @Roles(UserRole.SYSTEM_ADMIN)
  async testSqlConnection(@Body() testDto: TestSqlConnectionDto) {
    return this.appConfigService.testSqlConnection(testDto);
  }
}
