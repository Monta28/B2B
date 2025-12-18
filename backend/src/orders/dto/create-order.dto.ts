import { IsNotEmpty, IsOptional, IsEnum, IsArray, ValidateNested, IsNumber, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType, OrderStatus } from '../../entities/order.entity';

export class OrderItemDto {
  @IsNotEmpty()
  productRef: string;

  @IsNotEmpty()
  productName: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountPercent?: number;

  @IsOptional()
  availability?: 'DISPONIBLE' | 'RUPTURE'; // Disponibilité au moment de la commande

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tvaRate?: number; // Taux TVA en %
}

export class CreateOrderDto {
  @IsEnum(OrderType)
  orderType: OrderType;

  @IsOptional()
  vehicleInfo?: string;

  @IsOptional()
  clientNotes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @IsOptional()
  vehicleInfo?: string;

  @IsOptional()
  clientNotes?: string;

  @IsOptional()
  internalNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  internalNotes?: string;
}
