import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { AppConfig } from '../entities/app-config.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { DmsMappingModule } from '../dms-mapping/dms-mapping.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppConfig, AuditLog]),
    DmsMappingModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
