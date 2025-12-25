import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { Company } from '../entities/company.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { Order } from '../entities/order.entity';
import { Cart } from '../entities/cart.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Company, AuditLog, Order, Cart])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
