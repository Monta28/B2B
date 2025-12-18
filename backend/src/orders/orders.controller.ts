import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Order } from '../entities/order.entity';

// Durée maximale d'édition avant expiration automatique (1 minute)
const EDITING_TIMEOUT_MS = 1 * 60 * 1000;

// Transform Order entity to frontend format
function transformOrder(order: Order) {
  // Vérifier si le verrou d'édition a expiré (plus de 1 minute)
  let isEditing = order.isEditing ?? false;
  if (isEditing && order.editingStartedAt) {
    const editingAge = Date.now() - new Date(order.editingStartedAt).getTime();
    if (editingAge > EDITING_TIMEOUT_MS) {
      // Le verrou a expiré, on le considère comme libéré
      isEditing = false;
    }
  }

  return {
    id: order.id,
    orderType: order.orderType,
    dmsRef: order.dmsRef || null,
    isEditing,
    editingByUserId: isEditing ? order.editingByUserId : null,
    editingByUser: isEditing && order.editingByUser ? {
      id: order.editingByUser.id,
      fullName: order.editingByUser.fullName,
    } : null,
    editingStartedAt: isEditing ? order.editingStartedAt?.toISOString() : null,
    date: order.createdAt?.toISOString().split('T')[0] || '',
    lastModifiedAt: order.lastModifiedAt?.toISOString() || order.createdAt?.toISOString() || '',
    status: order.status,
    totalAmount: Number(order.totalHt) || 0,
    itemCount: order.items?.length || 0,
    companyName: order.company?.name || '',
    userEmail: order.createdByUser?.email || '',
    vehicleInfo: order.vehicleInfo || null,
    clientNotes: order.clientNotes || null,
    internalNotes: order.internalNotes || null,
    items: order.items?.map(item => ({
      reference: item.productRef,
      productRef: item.productRef,
      designation: item.productName,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice) || 0,
      totalLine: Number(item.lineTotal) || 0,
      lineTotal: Number(item.lineTotal) || 0,
      availability: item.availability || null,
      tvaRate: item.tvaRate != null ? Number(item.tvaRate) : null,
    })) || [],
  };
}

@Controller('orders')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  async findAll(@Request() req) {
    // Nettoyer les verrous expirés à chaque requête (background, non-bloquant)
    this.ordersService.cleanupExpiredEditingLocks().catch(err => {
      console.error('[OrdersController] Error cleaning up expired locks:', err);
    });

    const orders = await this.ordersService.findAll(req.user);
    return orders.map(transformOrder);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.ordersService.findOne(id, req.user);
  }

  @Post()
  async create(@Body() createOrderDto: CreateOrderDto, @Request() req) {
    return this.ordersService.create(createOrderDto, req.user);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req,
  ) {
    return this.ordersService.update(id, updateOrderDto, req.user);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @Request() req,
  ) {
    return this.ordersService.updateStatus(id, updateStatusDto, req.user);
  }

  @Post(':id/print')
  async printPreparation(@Param('id') id: string, @Request() req) {
    return this.ordersService.printPreparation(id, req.user);
  }

  @Patch(':id/editing')
  async setEditing(
    @Param('id') id: string,
    @Body('isEditing') isEditing: boolean,
    @Request() req,
  ) {
    return this.ordersService.setEditing(id, !!isEditing, req.user);
  }

  @Post('cleanup-editing-locks')
  async cleanupEditingLocks() {
    const count = await this.ordersService.cleanupExpiredEditingLocks();
    return { cleanedUp: count };
  }
}
