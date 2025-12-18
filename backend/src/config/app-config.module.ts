import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigController } from './app-config.controller';
import { PublicConfigController } from './public-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig } from '../entities/app-config.entity';
import { AuditLog } from '../entities/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppConfig, AuditLog])],
  controllers: [AppConfigController, PublicConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
