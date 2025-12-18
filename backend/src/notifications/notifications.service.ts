import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification, NotificationType } from '../entities/notification.entity';
import { User, UserRole } from '../entities/user.entity';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // Créer une notification pour un utilisateur spécifique
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      message: dto.message,
      relatedEntityType: dto.relatedEntityType,
      relatedEntityId: dto.relatedEntityId,
    });
    return this.notificationRepository.save(notification);
  }

  // Créer une notification pour tous les admins
  async notifyAllAdmins(
    type: NotificationType,
    title: string,
    message: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
  ): Promise<Notification[]> {
    // Trouver tous les admins (SYSTEM_ADMIN et PARTIAL_ADMIN)
    const admins = await this.userRepository.find({
      where: { role: In([UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]) },
    });

    const notifications: Notification[] = [];
    for (const admin of admins) {
      const notification = await this.create({
        userId: admin.id,
        type,
        title,
        message,
        relatedEntityType,
        relatedEntityId,
      });
      notifications.push(notification);
    }

    return notifications;
  }

  // Créer une notification pour tous les utilisateurs d'une entreprise
  async notifyCompanyUsers(
    companyId: string,
    type: NotificationType,
    title: string,
    message: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
  ): Promise<Notification[]> {
    const users = await this.userRepository.find({
      where: { companyId },
    });

    const notifications: Notification[] = [];
    for (const user of users) {
      const notification = await this.create({
        userId: user.id,
        type,
        title,
        message,
        relatedEntityType,
        relatedEntityId,
      });
      notifications.push(notification);
    }

    return notifications;
  }

  async findAll(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findUnread(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
    });
  }

  async countUnread(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification non trouvée');
    }

    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<{ message: string }> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );

    return { message: 'Toutes les notifications ont été marquées comme lues' };
  }

  async remove(id: string, userId: string): Promise<{ message: string }> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification non trouvée');
    }

    await this.notificationRepository.remove(notification);
    return { message: 'Notification supprimée' };
  }
}
