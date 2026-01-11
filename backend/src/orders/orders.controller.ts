import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto, UpdateOrderStatusDto, ShipOrderDto } from './dto/create-order.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Order, OrderStatus } from '../entities/order.entity';
import { UserRole } from '../entities/user.entity';
import { DmsMappingService } from '../dms-mapping/dms-mapping.service';

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
    orderNumber: order.orderNumber || null,
    orderType: order.orderType,
    dmsRef: order.dmsRef || null,
    blNumber: order.blNumber || null,
    blDate: order.blDate?.toISOString() || null,
    invoiceNumber: order.invoiceNumber || null,
    invoiceDate: order.invoiceDate?.toISOString() || null,
    isEditing,
    editingByUserId: isEditing ? order.editingByUserId : null,
    editingByUser: isEditing && order.editingByUser ? {
      id: order.editingByUser.id,
      fullName: order.editingByUser.fullName,
    } : null,
    editingStartedAt: isEditing ? order.editingStartedAt?.toISOString() : null,
    date: order.createdAt?.toISOString().split('T')[0] || '',
    createdAt: order.createdAt?.toISOString() || '',
    lastModifiedAt: order.lastModifiedAt?.toISOString() || order.createdAt?.toISOString() || '',
    status: order.status,
    totalAmount: Number(order.totalHt) || 0,
    itemCount: order.items?.length || 0,
    companyName: order.company?.name || '',
    userEmail: order.createdByUser?.email || '',
    createdByUser: order.createdByUser ? {
      id: order.createdByUser.id,
      fullName: order.createdByUser.fullName,
    } : null,
    vehicleInfo: order.vehicleInfo || null,
    clientNotes: order.clientNotes || null,
    internalNotes: order.internalNotes || null,
    items: order.items?.map(item => ({
      id: item.id, // Inclure l'ID pour l'expédition
      reference: item.productRef,
      productRef: item.productRef,
      designation: item.productName,
      productName: item.productName,
      quantity: item.quantity,
      quantityDelivered: item.quantityDelivered || 0,
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
  constructor(
    private ordersService: OrdersService,
    private dmsMappingService: DmsMappingService,
  ) {}

  private getClientIp(req: any, ip: string): string {
    return req.headers['x-forwarded-for']?.split(',')[0] || ip;
  }

  @Get()
  async findAll(@Request() req) {
    // Nettoyer les verrous expirés à chaque requête (background, non-bloquant)
    this.ordersService.cleanupExpiredEditingLocks().catch(() => {
      // Silently ignore cleanup errors
    });

    const orders = await this.ordersService.findAll(req.user);
    return orders.map(transformOrder);
  }

  // Get daily order statistics for admin dashboard (current month)
  @Get('stats/daily')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN)
  async getDailyStats() {
    return this.ordersService.getDailyOrderStats();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.ordersService.findOne(id, req.user);
  }

  @Post()
  async create(@Body() createOrderDto: CreateOrderDto, @Request() req, @Ip() ip: string) {
    return this.ordersService.create(createOrderDto, req.user, this.getClientIp(req, ip));
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req,
    @Ip() ip: string,
  ) {
    return this.ordersService.update(id, updateOrderDto, req.user, this.getClientIp(req, ip));
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @Request() req,
    @Ip() ip: string,
  ) {
    return this.ordersService.updateStatus(id, updateStatusDto, req.user, this.getClientIp(req, ip));
  }

  @Post(':id/print')
  async printPreparation(@Param('id') id: string, @Request() req, @Ip() ip: string) {
    return this.ordersService.printPreparation(id, req.user, this.getClientIp(req, ip));
  }

  // Get article positions from DMS for preparation slip
  @Get(':id/positions')
  async getItemPositions(@Param('id') id: string, @Request() req) {
    const order = await this.ordersService.findOne(id, req.user);
    if (!order.items || order.items.length === 0) {
      return {};
    }
    const articleCodes = order.items.map(item => item.productRef);
    return this.dmsMappingService.getArticlePositions(articleCodes);
  }

  @Patch(':id/editing')
  async setEditing(
    @Param('id') id: string,
    @Body('isEditing') isEditing: boolean,
    @Request() req,
    @Ip() ip: string,
  ) {
    return this.ordersService.setEditing(id, !!isEditing, req.user, this.getClientIp(req, ip));
  }

  @Post('cleanup-editing-locks')
  async cleanupEditingLocks() {
    const count = await this.ordersService.cleanupExpiredEditingLocks();
    return { cleanedUp: count };
  }

  // Expédier une commande (totalement ou partiellement)
  @Patch(':id/ship')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN)
  async shipOrder(
    @Param('id') id: string,
    @Body() shipOrderDto: ShipOrderDto,
    @Request() req,
    @Ip() ip: string,
  ) {
    const order = await this.ordersService.shipOrder(id, shipOrderDto, req.user, this.getClientIp(req, ip));
    return transformOrder(order);
  }

  // Synchroniser les commandes avec le DMS pour détecter les BL et factures
  @Post('sync-dms')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN)
  async syncFromDms() {
    const result = await this.ordersService.syncOrdersFromDms();
    return {
      success: result.errors.length === 0,
      synced: result.synced,
      errors: result.errors,
      message: result.synced > 0
        ? `${result.synced} commande(s) synchronisée(s) avec le DMS`
        : 'Aucune nouvelle synchronisation détectée',
    };
  }

  // Supprimer une commande (SYSADMIN uniquement)
  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  async remove(@Param('id') id: string, @Request() req, @Ip() ip: string) {
    return this.ordersService.remove(id, req.user, this.getClientIp(req, ip));
  }
}
