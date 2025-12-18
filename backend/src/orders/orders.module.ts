import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Company } from '../entities/company.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { DmsMappingModule } from '../dms-mapping/dms-mapping.module';
import { AppConfigModule } from '../config/app-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Company, AuditLog, Notification, User]),
    DmsMappingModule,
    AppConfigModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
