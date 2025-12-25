import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { Notification } from '../entities/notification.entity';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track connected clients by userId
  private connectedClients: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private socketToUser: Map<string, string> = new Map(); // socketId -> userId

  afterInit(server: Server) {
    this.server = server;
  }

  handleConnection(_client: Socket) {
    // Client connected
  }

  handleDisconnect(client: Socket) {

    // Remove from tracking
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      const userSockets = this.connectedClients.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedClients.delete(userId);
        }
      }
      this.socketToUser.delete(client.id);
    }
  }

  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    // Track user connection
    this.socketToUser.set(client.id, data.userId);

    if (!this.connectedClients.has(data.userId)) {
      this.connectedClients.set(data.userId, new Set());
    }
    this.connectedClients.get(data.userId)!.add(client.id);

    // Join user-specific room
    client.join(`user:${data.userId}`);

    return { status: 'registered' };
  }

  // Envoyer une notification à un utilisateur spécifique
  sendNotificationToUser(userId: string, notification: Notification) {
    if (!this.server) {
      return;
    }

    // Émettre à la room de l'utilisateur
    this.server.to(`user:${userId}`).emit('newNotification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      createdAt: notification.createdAt,
      isRead: notification.isRead,
    });
  }

  // Envoyer une notification à plusieurs utilisateurs
  sendNotificationToUsers(userIds: string[], notification: Notification) {
    for (const userId of userIds) {
      this.sendNotificationToUser(userId, notification);
    }
  }

  // Broadcast à tous les utilisateurs connectés
  broadcastNotification(notification: Notification) {
    this.server.emit('newNotification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      createdAt: notification.createdAt,
      isRead: notification.isRead,
    });
  }

  // Vérifier si un utilisateur est connecté
  isUserConnected(userId: string): boolean {
    return this.connectedClients.has(userId) && this.connectedClients.get(userId)!.size > 0;
  }
}
