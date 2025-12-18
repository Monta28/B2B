import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';

export interface OrderEditingStatus {
  orderId: string;
  isEditing: boolean;
  editingByUserId?: string;
  editingByUserName?: string;
  editingStartedAt?: Date;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  // Track connected clients by userId
  private connectedClients: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private socketToUser: Map<string, string> = new Map(); // socketId -> userId

  handleConnection(client: Socket) {
    console.log(`[OrdersGateway] Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    console.log(`[OrdersGateway] Client disconnected: ${client.id}`);

    // Remove from tracking
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      const userSockets = this.connectedClients.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedClients.delete(userId);

          // Libérer tous les verrous d'édition de cet utilisateur
          await this.releaseUserEditingLocks(userId);
        }
      }
      this.socketToUser.delete(client.id);
    }
  }

  // Libérer tous les verrous d'édition d'un utilisateur déconnecté
  private async releaseUserEditingLocks(userId: string) {
    try {
      const lockedOrders = await this.orderRepository.find({
        where: {
          editingByUserId: userId,
          isEditing: true,
        },
      });

      if (lockedOrders.length > 0) {
        console.log(`[OrdersGateway] Releasing ${lockedOrders.length} editing locks for disconnected user ${userId}`);

        for (const order of lockedOrders) {
          order.isEditing = false;
          order.editingByUserId = null;
          order.editingStartedAt = null;
          await this.orderRepository.save(order);

          // Notifier les admins
          this.notifyOrderEditingStatus({
            orderId: order.id,
            isEditing: false,
          });
        }
      }
    } catch (error) {
      console.error('[OrdersGateway] Error releasing editing locks:', error);
    }
  }

  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; role: string },
  ) {
    console.log(`[OrdersGateway] User registered: ${data.userId}, role: ${data.role}`);

    // Track user connection
    this.socketToUser.set(client.id, data.userId);

    if (!this.connectedClients.has(data.userId)) {
      this.connectedClients.set(data.userId, new Set());
    }
    this.connectedClients.get(data.userId)!.add(client.id);

    // Join role-based room
    if (data.role === 'ADMIN' || data.role === 'SUPER_ADMIN') {
      client.join('admins');
      console.log(`[OrdersGateway] User ${data.userId} joined admins room`);
    } else {
      client.join('clients');
    }

    return { status: 'registered' };
  }

  @SubscribeMessage('subscribeToOrder')
  handleSubscribeToOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    client.join(`order:${data.orderId}`);
    console.log(`[OrdersGateway] Client ${client.id} subscribed to order:${data.orderId}`);
    return { status: 'subscribed', orderId: data.orderId };
  }

  @SubscribeMessage('unsubscribeFromOrder')
  handleUnsubscribeFromOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    client.leave(`order:${data.orderId}`);
    console.log(`[OrdersGateway] Client ${client.id} unsubscribed from order:${data.orderId}`);
    return { status: 'unsubscribed', orderId: data.orderId };
  }

  // Notify all admins about order editing status change
  notifyOrderEditingStatus(status: OrderEditingStatus) {
    console.log(`[OrdersGateway] Broadcasting order editing status:`, status);

    // Notify all admins
    this.server.to('admins').emit('orderEditingStatusChanged', status);

    // Also notify anyone subscribed to this specific order
    this.server.to(`order:${status.orderId}`).emit('orderEditingStatusChanged', status);
  }

  // Notify about order updates (validation, status change, etc.)
  notifyOrderUpdated(orderId: string, update: any) {
    console.log(`[OrdersGateway] Broadcasting order update for ${orderId}:`, update);

    // Notify admins
    this.server.to('admins').emit('orderUpdated', { orderId, ...update });

    // Notify subscribers to this order
    this.server.to(`order:${orderId}`).emit('orderUpdated', { orderId, ...update });
  }

  // Check if a specific user is connected
  isUserConnected(userId: string): boolean {
    return this.connectedClients.has(userId) && this.connectedClients.get(userId)!.size > 0;
  }
}
