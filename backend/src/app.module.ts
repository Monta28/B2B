import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { OrdersModule } from './orders/orders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NewsModule } from './news/news.module';
import { AppConfigModule } from './config/app-config.module';
import { AuditModule } from './audit/audit.module';
import { CartModule } from './cart/cart.module';
import { ProductsModule } from './products/products.module';
import { DmsMappingModule } from './dms-mapping/dms-mapping.module';
import { DocumentsModule } from './documents/documents.module';

// Import all entities explicitly
import { User } from './entities/user.entity';
import { Company } from './entities/company.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Notification } from './entities/notification.entity';
import { News } from './entities/news.entity';
import { AppConfig } from './entities/app-config.entity';
import { AuditLog } from './entities/audit-log.entity';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { DmsMapping } from './entities/dms-mapping.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: +configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [User, Company, Order, OrderItem, Notification, News, AppConfig, AuditLog, Cart, CartItem, DmsMapping],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    CompaniesModule,
    OrdersModule,
    NotificationsModule,
    NewsModule,
    AppConfigModule,
    AuditModule,
    CartModule,
    ProductsModule,
    DmsMappingModule,
    DocumentsModule,
  ],
})
export class AppModule { }
