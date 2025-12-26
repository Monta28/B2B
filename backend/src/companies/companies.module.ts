import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { Company } from '../entities/company.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AppConfigModule } from '../config/app-config.module';
import { DmsMappingModule } from '../dms-mapping/dms-mapping.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, AuditLog]),
    AppConfigModule,
    DmsMappingModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
