import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DmsMappingController } from './dms-mapping.controller';
import { DmsMappingService } from './dms-mapping.service';
import { DmsMapping } from '../entities/dms-mapping.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AppConfigModule } from '../config/app-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DmsMapping, AuditLog]),
    AppConfigModule,
  ],
  controllers: [DmsMappingController],
  providers: [DmsMappingService],
  exports: [DmsMappingService],
})
export class DmsMappingModule {}
