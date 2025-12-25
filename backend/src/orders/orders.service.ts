import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as sql from 'mssql';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Company } from '../entities/company.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { Notification, NotificationType } from '../entities/notification.entity';
import { User, UserRole } from '../entities/user.entity';
import { CreateOrderDto, UpdateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { OrdersGateway } from './orders.gateway';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { DmsMappingService } from '../dms-mapping/dms-mapping.service';
import { AppConfigService } from '../config/app-config.service';

// Labels des statuts pour les messages
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'En attente',
  [OrderStatus.VALIDATED]: 'Validée',
  [OrderStatus.PREPARATION]: 'En préparation',
  [OrderStatus.SHIPPED]: 'Expédiée',
  [OrderStatus.INVOICED]: 'Facturée',
  [OrderStatus.CANCELLED]: 'Annulée',
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private ordersGateway: OrdersGateway,
    private notificationsGateway: NotificationsGateway,
    private dmsMappingService: DmsMappingService,
    private appConfigService: AppConfigService,
  ) { }

  async findAll(currentUser: any): Promise<Order[]> {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.company', 'company')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.createdByUser', 'createdByUser')
      .leftJoinAndSelect('order.editingByUser', 'editingByUser');

    // Filter by company for client users
    if ([UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER].includes(currentUser.role)) {
      queryBuilder.where('order.companyId = :companyId', { companyId: currentUser.companyId });
    }

    return queryBuilder.orderBy('order.createdAt', 'DESC').getMany();
  }

  async findOne(id: string, currentUser: any): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['company', 'items', 'editingByUser'],
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    // Check access for client users
    if (
      [UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER].includes(currentUser.role) &&
      order.companyId !== currentUser.companyId
    ) {
      throw new ForbiddenException('Accès non autorisé à cette commande');
    }

    return order;
  }

  async create(createOrderDto: CreateOrderDto, currentUser: any): Promise<Order> {
    const company = await this.companyRepository.findOne({
      where: { id: currentUser.companyId },
    });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée');
    }

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    // Calculate totals
    let totalHt = 0;
    const items = createOrderDto.items.map((item) => {
      // Arrondir à 2 décimales pour éviter les erreurs de précision
      const lineTotal = Math.round(item.quantity * item.unitPrice * (1 - (item.discountPercent || 0) / 100) * 100) / 100;
      totalHt += lineTotal;

      const tvaRateValue = item.tvaRate ?? 7;
      return this.orderItemRepository.create({
        productRef: item.productRef,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent || 0,
        lineTotal,
        availability: item.availability || null, // Disponibilité au moment de la commande
        tvaRate: tvaRateValue, // Taux TVA (défaut 7%)
      });
    });

    // Créer l'ordre SANS les items d'abord
    const order = this.orderRepository.create({
      orderNumber,
      company,
      companyId: company.id,
      createdByUserId: currentUser.id,
      orderType: createOrderDto.orderType,
      vehicleInfo: createOrderDto.vehicleInfo,
      clientNotes: createOrderDto.clientNotes,
      totalHt: Math.round(totalHt * 100) / 100, // Arrondir à 2 décimales
      status: OrderStatus.PENDING,
    });

    // Sauvegarder l'ordre d'abord
    const savedOrder = await this.orderRepository.save(order);

    // Assigner l'orderId à chaque item et sauvegarder séparément
    const itemsWithOrderId = items.map(item => {
      item.orderId = savedOrder.id;
      return item;
    });

    // Sauvegarder les items séparément avec leurs valeurs tvaRate
    await this.orderItemRepository.save(itemsWithOrderId);

    // Audit log
    await this.logAuditAction(currentUser.id, 'CREATE_ORDER', 'Order', savedOrder.id, {
      orderNumber: savedOrder.orderNumber,
      totalHt: savedOrder.totalHt,
    });

    // Notifier tous les admins de la nouvelle commande
    await this.notifyAdminsNewOrder(savedOrder, company.name);

    return savedOrder;
  }

  // Notifier tous les admins d'une nouvelle commande
  private async notifyAdminsNewOrder(order: Order, companyName: string) {
    try {
      // Trouver tous les admins
      const admins = await this.userRepository.find({
        where: { role: In([UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN]) },
      });

      // Formater le montant de manière sécurisée
      const totalAmount = Number(order.totalHt) || 0;
      const formattedAmount = totalAmount.toFixed(2);

      for (const admin of admins) {
        // Créer la notification en base
        const notification = this.notificationRepository.create({
          userId: admin.id,
          type: NotificationType.NEW_ORDER,
          title: `Nouvelle commande de ${companyName}`,
          message: `Commande ${order.orderNumber} - Montant: ${formattedAmount} DT`,
          relatedEntityType: 'Order',
          relatedEntityId: order.id,
        });
        const savedNotification = await this.notificationRepository.save(notification);

        // Envoyer via WebSocket en temps réel
        this.notificationsGateway.sendNotificationToUser(admin.id, savedNotification);
      }
    } catch (error) {
      // Silently ignore notification errors
    }
  }

  async update(id: string, updateOrderDto: UpdateOrderDto, currentUser: any): Promise<Order> {
    const order = await this.findOne(id, currentUser);

    // Check if order can be modified (only PENDING orders)
    if (order.status !== OrderStatus.PENDING) {
      throw new ForbiddenException('Seules les commandes en attente peuvent être modifiées');
    }

    // Update items if provided
    if (updateOrderDto.items) {
      // Remove old items
      await this.orderItemRepository.delete({ orderId: order.id });

      // Calculate new totals and create new items
      let totalHt = 0;
      const items = updateOrderDto.items.map((item) => {
        // Arrondir à 2 décimales pour éviter les erreurs de précision
        const lineTotal = Math.round(item.quantity * item.unitPrice * (1 - (item.discountPercent || 0) / 100) * 100) / 100;
        totalHt += lineTotal;

        return this.orderItemRepository.create({
          orderId: order.id,
          productRef: item.productRef,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent || 0,
          lineTotal,
          availability: item.availability || null,
          tvaRate: item.tvaRate ?? 7, // Taux TVA (défaut 7%)
        });
      });

      const savedItems = await this.orderItemRepository.save(items);
      order.totalHt = Math.round(totalHt * 100) / 100; // Arrondir à 2 décimales
      // Update the order.items reference to prevent cascade conflicts
      order.items = savedItems;
    }

    Object.assign(order, {
      orderType: updateOrderDto.orderType ?? order.orderType,
      vehicleInfo: updateOrderDto.vehicleInfo ?? order.vehicleInfo,
      clientNotes: updateOrderDto.clientNotes ?? order.clientNotes,
      internalNotes: updateOrderDto.internalNotes ?? order.internalNotes,
      isEditing: false, // libérer le verrou d'édition après sauvegarde
      editingByUserId: null,
      editingStartedAt: null,
      lastModifiedAt: new Date(),
    });

    const savedOrder = await this.orderRepository.save(order);

    // Notify admins that editing is done
    this.ordersGateway.notifyOrderEditingStatus({
      orderId: savedOrder.id,
      isEditing: false,
    });

    // Notify about order update
    this.ordersGateway.notifyOrderUpdated(savedOrder.id, {
      status: savedOrder.status,
      totalHt: savedOrder.totalHt,
      lastModifiedAt: savedOrder.lastModifiedAt,
    });

    // Audit log
    await this.logAuditAction(currentUser.id, 'UPDATE_ORDER', 'Order', savedOrder.id, updateOrderDto);

    return this.findOne(savedOrder.id, currentUser);
  }

  async updateStatus(id: string, updateStatusDto: UpdateOrderStatusDto, currentUser: any): Promise<Order> {
    const order = await this.findOne(id, currentUser);

    const isAdmin = [UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN].includes(currentUser.role);
    const isClient = [UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER].includes(currentUser.role);

    // Clients can only cancel their own PENDING orders
    if (isClient) {
      if (order.status !== OrderStatus.PENDING) {
        throw new ForbiddenException('Vous ne pouvez annuler que les commandes en attente de validation');
      }
      if (updateStatusDto.status !== OrderStatus.CANCELLED) {
        throw new ForbiddenException('Vous ne pouvez que annuler vos commandes');
      }
    } else if (!isAdmin) {
      throw new ForbiddenException('Seuls les administrateurs peuvent changer le statut');
    }

    // Empêcher la validation si la commande est verrouillée pour édition par le client
    if (order.isEditing && updateStatusDto.status === OrderStatus.VALIDATED) {
      throw new ForbiddenException('Commande en cours de modification par le client. Validation impossible pour le moment.');
    }

    // Si le statut passe à VALIDATED, exporter vers le DMS AVANT de confirmer le changement de statut
    const oldStatus = order.status;
    if (updateStatusDto.status === OrderStatus.VALIDATED && oldStatus !== OrderStatus.VALIDATED) {
      const dmsResult = await this.exportOrderToDms(order.id);

      if (!dmsResult.success) {
        throw new BadRequestException(`Échec du transfert vers le DMS : ${dmsResult.error}. La commande n'a pas été validée.`);
      }

      // L'export DMS met déjà à jour dmsRef dans la base, on met à jour notre instance
      order.dmsRef = dmsResult.dmsRef;
    }

    order.status = updateStatusDto.status;
    order.internalNotes = updateStatusDto.internalNotes ?? order.internalNotes;
    order.lastModifiedAt = new Date();

    const savedOrder = await this.orderRepository.save(order);

    // Notifier le client et son entreprise du changement de statut (temps réel + DB)
    await this.notifyClientStatusChange(order, oldStatus, updateStatusDto.status, isAdmin);

    // Audit log
    await this.logAuditAction(currentUser.id, 'UPDATE_ORDER_STATUS', 'Order', savedOrder.id, {
      oldStatus,
      newStatus: updateStatusDto.status,
    });

    return this.findOne(savedOrder.id, currentUser);
  }

  // Notifier les utilisateurs d'une entreprise d'un changement de statut
  private async notifyClientStatusChange(
    order: Order,
    oldStatus: OrderStatus,
    newStatus: OrderStatus,
    changedByAdmin: boolean,
  ) {
    try {
      // Trouver tous les utilisateurs de l'entreprise du client
      const companyUsers = await this.userRepository.find({
        where: { companyId: order.companyId },
      });

      const oldStatusLabel = ORDER_STATUS_LABELS[oldStatus];
      const newStatusLabel = ORDER_STATUS_LABELS[newStatus];

      // Message personnalisé selon le nouveau statut
      let title = `Commande ${order.orderNumber}`;
      let message = `Le statut est passé de "${oldStatusLabel}" à "${newStatusLabel}"`;

      if (newStatus === OrderStatus.VALIDATED) {
        title = `Commande ${order.orderNumber} validée`;
        message = `Votre commande a été validée et va être préparée.`;
      } else if (newStatus === OrderStatus.PREPARATION) {
        title = `Commande ${order.orderNumber} en préparation`;
        message = `Votre commande est en cours de préparation.`;
      } else if (newStatus === OrderStatus.SHIPPED) {
        title = `Commande ${order.orderNumber} expédiée`;
        message = `Votre commande a été expédiée.`;
      } else if (newStatus === OrderStatus.INVOICED) {
        title = `Commande ${order.orderNumber} facturée`;
        message = `Votre commande a été facturée.`;
      } else if (newStatus === OrderStatus.CANCELLED) {
        title = `Commande ${order.orderNumber} annulée`;
        message = changedByAdmin
          ? `Votre commande a été annulée par l'administrateur.`
          : `Votre commande a été annulée.`;
      }

      for (const user of companyUsers) {
        // Créer la notification en base
        const notification = this.notificationRepository.create({
          userId: user.id,
          type: NotificationType.ORDER_STATUS,
          title,
          message,
          relatedEntityType: 'Order',
          relatedEntityId: order.id,
        });
        const savedNotification = await this.notificationRepository.save(notification);

        // Envoyer via WebSocket en temps réel
        this.notificationsGateway.sendNotificationToUser(user.id, savedNotification);
      }

    } catch (error) {
      // Silently ignore notification errors
    }
  }

  async printPreparation(id: string, currentUser: any): Promise<{ message: string; orderNumber: string }> {
    const order = await this.findOne(id, currentUser);

    // Audit log
    await this.logAuditAction(currentUser.id, 'PRINT_PREPARATION', 'Order', order.id, null);

    return {
      message: 'Bon de préparation imprimé',
      orderNumber: order.orderNumber,
    };
  }

  async setEditing(id: string, isEditing: boolean, currentUser: any): Promise<Order> {
    const order = await this.findOne(id, currentUser);

    // Seules les commandes en attente peuvent être verrouillées/déverrouillées pour édition
    if (order.status !== OrderStatus.PENDING) {
      throw new ForbiddenException('Seules les commandes en attente peuvent être modifiées');
    }

    // Get user info for notification
    const user = await this.userRepository.findOne({ where: { id: currentUser.id } });

    order.isEditing = isEditing;
    order.editingByUserId = isEditing ? currentUser.id : null;
    order.editingStartedAt = isEditing ? new Date() : null;
    order.lastModifiedAt = new Date();

    const savedOrder = await this.orderRepository.save(order);

    // Notify admins via WebSocket
    this.ordersGateway.notifyOrderEditingStatus({
      orderId: savedOrder.id,
      isEditing,
      editingByUserId: isEditing ? currentUser.id : undefined,
      editingByUserName: isEditing && user ? user.fullName : undefined,
      editingStartedAt: isEditing ? savedOrder.editingStartedAt : undefined,
    });

    await this.logAuditAction(currentUser.id, 'LOCK_EDIT', 'Order', savedOrder.id, { isEditing });
    return savedOrder;
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const prefix = `CMD-${year}${month}${day}`;

    // Count orders today
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const count = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.createdAt >= :todayStart', { todayStart })
      .getCount();

    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  private async logAuditAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
  ) {
    const auditLog = this.auditLogRepository.create({
      userId,
      action,
      entityType,
      entityId,
      details,
    });
    await this.auditLogRepository.save(auditLog);
  }

  // Durée maximale d'édition avant expiration automatique (1 minute)
  private readonly EDITING_TIMEOUT_MS = 1 * 60 * 1000;

  // Nettoyer les verrous d'édition expirés
  async cleanupExpiredEditingLocks(): Promise<number> {
    const expirationTime = new Date(Date.now() - this.EDITING_TIMEOUT_MS);

    // Trouver toutes les commandes avec un verrou expiré
    const expiredOrders = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.isEditing = :isEditing', { isEditing: true })
      .andWhere('order.editingStartedAt < :expirationTime', { expirationTime })
      .getMany();

    if (expiredOrders.length === 0) {
      return 0;
    }

    // Libérer les verrous expirés
    for (const order of expiredOrders) {
      order.isEditing = false;
      order.editingByUserId = null;
      order.editingStartedAt = null;
      await this.orderRepository.save(order);

      // Notifier via WebSocket
      this.ordersGateway.notifyOrderEditingStatus({
        orderId: order.id,
        isEditing: false,
      });
    }

    return expiredOrders.length;
  }

  // Exporter une commande vers le DMS SQL Server
  async exportOrderToDms(orderId: string): Promise<{ success: boolean; dmsRef?: string; error?: string }> {
    try {
      // Charger la commande avec ses items et la company
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: ['items', 'company'],
      });

      if (!order) {
        return { success: false, error: 'Commande non trouvée' };
      }

      if (!order.company) {
        return { success: false, error: 'Entreprise non trouvée pour cette commande' };
      }

      // Vérifier que la company a un code client DMS
      if (!order.company.dmsClientCode) {
        return { success: false, error: `L'entreprise ${order.company.name} n'a pas de code client DMS configuré` };
      }

      // Récupérer les mappings pour l'entête et le détail
      const headerMapping = await this.dmsMappingService.getMappingConfig('commandes_entete');
      const detailMapping = await this.dmsMappingService.getMappingConfig('commandes_detail');

      if (!headerMapping || !detailMapping) {
        return { success: false, error: 'Mapping DMS non configuré pour les commandes' };
      }

      // Connexion SQL Server
      const pool = await this.appConfigService.getSqlConnection();
      if (!pool) {
        return { success: false, error: 'Impossible de se connecter au serveur SQL DMS' };
      }

      try {
        // Générer un numéro de commande DMS unique
        const dmsOrderNumber = await this.generateDmsOrderNumber(pool, headerMapping.tableName, headerMapping.columns.numCommande);

        // Calculer le total TTC et TVA
        let totalTTC = 0;
        let totalTVA = 0;
        for (const item of order.items) {
          const lineHT = Number(item.lineTotal) || 0;
          const tvaRate = Number(item.tvaRate) || 0;
          totalTVA += lineHT * (tvaRate / 100);
          totalTTC += lineHT * (1 + tvaRate / 100);
        }

        // 1. Insérer l'entête de commande
        const headerColumns: string[] = [];
        const headerValues: any[] = [];
        const headerParams: string[] = [];

        // Mapper les valeurs de l'entête - conformité absolue au schéma utilisateur
        const headerData: Record<string, any> = {
          numCommande: dmsOrderNumber,
          dateCommande: order.createdAt || new Date(),
          codeClient: order.company.dmsClientCode,
          devise: null,
          modeReg: 2,
          dateLiv: new Date(),
          totalHT: Number(order.totalHt) || 0,
          totalTVA: totalTVA,
          totalTTC: totalTTC,
          status: 'E', // 'E' comme demandé
          orderType: order.orderType === OrderType.QUICK ? 'U' : 'N', // 'U' pour rapide, 'N' pour stock
          totalRemise: 0,
          totalDC: 0,
          designation: order.company.name,
          adresseLivraison: null,
        };

        let paramIndex = 1;
        for (const [localField, dmsColumn] of Object.entries(headerMapping.columns)) {
          // Vérifier que la colonne DMS est définie et non vide, et que la donnée existe
          if (dmsColumn && dmsColumn.trim() !== '' && headerData[localField] !== undefined) {
            headerColumns.push(`[${dmsColumn}]`);
            headerValues.push(headerData[localField]);
            headerParams.push(`@p${paramIndex}`);
            paramIndex++;
          }
        }

        if (headerColumns.length > 0) {
          const headerInsertQuery = `INSERT INTO [${headerMapping.tableName}] (${headerColumns.join(', ')}) VALUES (${headerParams.join(', ')})`;

          // Champs qui doivent rester en string (codes avec zéros en tête)
        const stringFields = ['codeClient', 'codeArticle', 'numCommande', 'designation', 'adresseLivraison', 'status', 'orderType', 'devise'];
        const headerFieldNames = Object.keys(headerMapping.columns).filter(k => headerMapping.columns[k] && headerMapping.columns[k].trim() !== '' && headerData[k] !== undefined);

        const headerRequest = pool.request();
          headerValues.forEach((value, index) => {
            const paramName = `p${index + 1}`;
            const fieldName = headerFieldNames[index];
            const isStringField = stringFields.includes(fieldName);

            if (value === null) {
              headerRequest.input(paramName, sql.NVarChar, null);
            } else if (value instanceof Date) {
              headerRequest.input(paramName, sql.DateTime, value);
            } else if (typeof value === 'number') {
              headerRequest.input(paramName, sql.Float, value);
            } else if (isStringField) {
              // Garder comme string sans conversion (préserver les zéros en tête)
              headerRequest.input(paramName, sql.NVarChar, String(value));
            } else {
              // Essayer de convertir en nombre si c'est une chaîne numérique
              const numValue = Number(value);
              if (!isNaN(numValue) && String(value).trim() !== '' && typeof value !== 'boolean') {
                headerRequest.input(paramName, sql.Float, numValue);
              } else {
                headerRequest.input(paramName, sql.NVarChar, String(value));
              }
            }
          });

          await headerRequest.query(headerInsertQuery);
        }

        // 2. Insérer les lignes de détail
        for (let i = 0; i < order.items.length; i++) {
          const item = order.items[i];
          const lineHT = Number(item.lineTotal) || 0;
          const tvaRate = Number(item.tvaRate) || 0;
          const lineTTC = lineHT * (1 + tvaRate / 100);

          const detailData: Record<string, any> = {
            numCommande: dmsOrderNumber,
            codeArticle: item.productRef,
            codeClient: order.company.dmsClientCode,
            dateCommande: order.createdAt || new Date(),
            devise: null,
            modeReg: 2,
            dateLiv: new Date(),
            quantite: item.quantity,
            quantiteRecue: 0,
            tauxTVA: tvaRate, // Déjà un nombre (ex: 19)
            prixUnitaire: Number(item.unitPrice) || 0,
            designation: item.productName,
            remise: 0,
            numDevis: -1,
            dc: 0,
            typeDC: 'P',
          };

          const detailColumns: string[] = [];
          const detailValues: any[] = [];
          const detailParams: string[] = [];

          let detailParamIndex = 1;
          for (const [localField, dmsColumn] of Object.entries(detailMapping.columns)) {
            // Vérifier que la colonne DMS est définie et non vide, et que la donnée existe
            if (dmsColumn && dmsColumn.trim() !== '' && detailData[localField] !== undefined) {
              detailColumns.push(`[${dmsColumn}]`);
              detailValues.push(detailData[localField]);
              detailParams.push(`@p${detailParamIndex}`);
              detailParamIndex++;
            }
          }

          if (detailColumns.length > 0) {
            const detailInsertQuery = `INSERT INTO [${detailMapping.tableName}] (${detailColumns.join(', ')}) VALUES (${detailParams.join(', ')})`;

            // Champs qui doivent rester en string (codes avec zéros en tête)
            const detailStringFields = ['codeClient', 'codeArticle', 'numCommande', 'designation', 'devise', 'typeDC'];
            const detailFieldNames = Object.keys(detailMapping.columns).filter(k => detailMapping.columns[k] && detailMapping.columns[k].trim() !== '' && detailData[k] !== undefined);

            const detailRequest = pool.request();
            detailValues.forEach((value, index) => {
              const paramName = `p${index + 1}`;
              const fieldName = detailFieldNames[index];
              const isStringField = detailStringFields.includes(fieldName);

              if (value === null) {
                detailRequest.input(paramName, sql.NVarChar, null);
              } else if (value instanceof Date) {
                detailRequest.input(paramName, sql.DateTime, value);
              } else if (typeof value === 'number') {
                detailRequest.input(paramName, sql.Float, value);
              } else if (isStringField) {
                // Garder comme string sans conversion (préserver les zéros en tête)
                detailRequest.input(paramName, sql.NVarChar, String(value));
              } else {
                // Essayer de convertir en nombre si c'est une chaîne numérique
                const numValue = Number(value);
                if (!isNaN(numValue) && String(value).trim() !== '' && typeof value !== 'boolean') {
                  detailRequest.input(paramName, sql.Float, numValue);
                } else {
                  detailRequest.input(paramName, sql.NVarChar, String(value));
                }
              }
            });

            await detailRequest.query(detailInsertQuery);
          }
        }

        // 3. Mettre à jour la référence DMS dans la commande locale
        order.dmsRef = dmsOrderNumber;
        await this.orderRepository.save(order);

        return { success: true, dmsRef: dmsOrderNumber };

      } finally {
        await pool.close();
      }

    } catch (error: any) {
      return { success: false, error: error.message || 'Erreur lors de l\'export vers le DMS' };
    }
  }

  // Synchroniser les commandes avec le DMS pour détecter les BL et factures
  async syncOrdersFromDms(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      // Récupérer les mappings pour BL et Factures
      const blDetailMapping = await this.dmsMappingService.getMappingConfig('bl_detail');
      const blHeaderMapping = await this.dmsMappingService.getMappingConfig('bl_entete');
      const factureDetailMapping = await this.dmsMappingService.getMappingConfig('factures_detail');
      const factureHeaderMapping = await this.dmsMappingService.getMappingConfig('factures_entete');

      if (!blDetailMapping || !blHeaderMapping) {
        errors.push('Mapping DMS pour BL non configuré');
        return { synced: 0, errors };
      }

      // Connexion SQL Server
      const pool = await this.appConfigService.getSqlConnection();
      if (!pool) {
        errors.push('Impossible de se connecter au serveur SQL DMS');
        return { synced: 0, errors };
      }

      try {
        // Récupérer les commandes VALIDATED sans BL (qui ont un dmsRef)
        const ordersToCheck = await this.orderRepository.find({
          where: [
            { status: OrderStatus.VALIDATED, blNumber: null as any },
            { status: OrderStatus.PREPARATION, blNumber: null as any },
            { status: OrderStatus.SHIPPED, invoiceNumber: null as any },
          ],
        });

        for (const order of ordersToCheck) {
          if (!order.dmsRef) continue; // Pas de ref DMS, on ne peut pas chercher

          try {
            // Vérifier si un BL existe pour cette commande
            if (!order.blNumber && blDetailMapping.columns.numCommande) {
              const blResult = await pool.request()
                .input('numCmd', sql.NVarChar, order.dmsRef)
                .query(`
                  SELECT DISTINCT d.[${blDetailMapping.columns.numBL}] as numBL, h.[${blHeaderMapping.columns.dateBL}] as dateBL
                  FROM [${blDetailMapping.tableName}] d
                  LEFT JOIN [${blHeaderMapping.tableName}] h ON d.[${blDetailMapping.columns.numBL}] = h.[${blHeaderMapping.columns.numBL}]
                  WHERE d.[${blDetailMapping.columns.numCommande}] = @numCmd
                `);

              if (blResult.recordset.length > 0) {
                const blData = blResult.recordset[0];
                order.blNumber = String(blData.numBL);
                order.blDate = blData.dateBL ? new Date(blData.dateBL) : new Date();

                // Mettre à jour le statut si pas encore SHIPPED ou plus
                if (order.status === OrderStatus.VALIDATED || order.status === OrderStatus.PREPARATION) {
                  const oldStatus = order.status;
                  order.status = OrderStatus.SHIPPED;

                  // Notifier le client du changement de statut
                  await this.notifyClientStatusChange(order, oldStatus, OrderStatus.SHIPPED, true);
                }

                synced++;
              }
            }

            // Vérifier si une facture existe pour cette commande
            if (!order.invoiceNumber && factureDetailMapping && factureHeaderMapping && factureDetailMapping.columns.numCommande) {
              const factureResult = await pool.request()
                .input('numCmd', sql.NVarChar, order.dmsRef)
                .query(`
                  SELECT DISTINCT d.[${factureDetailMapping.columns.numFacture}] as numFacture, h.[${factureHeaderMapping.columns.dateFacture}] as dateFacture
                  FROM [${factureDetailMapping.tableName}] d
                  LEFT JOIN [${factureHeaderMapping.tableName}] h ON d.[${factureDetailMapping.columns.numFacture}] = h.[${factureHeaderMapping.columns.numFacture}]
                  WHERE d.[${factureDetailMapping.columns.numCommande}] = @numCmd
                `);

              if (factureResult.recordset.length > 0) {
                const factureData = factureResult.recordset[0];
                order.invoiceNumber = String(factureData.numFacture);
                order.invoiceDate = factureData.dateFacture ? new Date(factureData.dateFacture) : new Date();

                // Mettre à jour le statut si pas encore INVOICED
                if (order.status !== OrderStatus.INVOICED && order.status !== OrderStatus.CANCELLED) {
                  const oldStatus = order.status;
                  order.status = OrderStatus.INVOICED;

                  // Notifier le client du changement de statut
                  await this.notifyClientStatusChange(order, oldStatus, OrderStatus.INVOICED, true);
                }

                synced++;
              }
            }

            // Sauvegarder les modifications
            order.lastModifiedAt = new Date();
            await this.orderRepository.save(order);

          } catch (orderError: any) {
            errors.push(`Erreur pour commande ${order.orderNumber}: ${orderError.message}`);
          }
        }

      } finally {
        await pool.close();
      }

    } catch (error: any) {
      errors.push(error.message || 'Erreur lors de la synchronisation DMS');
    }

    return { synced, errors };
  }

  // Supprimer une commande (SYSADMIN uniquement)
  async remove(id: string, currentUser: any): Promise<{ message: string }> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    const orderNumber = order.orderNumber;

    // Supprimer la commande (cascade supprime les items)
    await this.orderRepository.remove(order);

    // Log dans l'audit
    await this.logAuditAction(currentUser.id, 'DELETE_ORDER', 'Order', id, {
      orderNumber,
      deletedBy: currentUser.email,
    });

    return { message: `Commande ${orderNumber} supprimée avec succès` };
  }

  // Générer un numéro de commande unique pour le DMS (format numérique: YYYYMM + séquence)
  private async generateDmsOrderNumber(pool: sql.ConnectionPool, tableName: string, columnName: string): Promise<string> {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      // Format numérique: YYYYMM + 3 digits (ex: 202512001)
      const prefix = `${year}${month}`;
      const minValue = parseInt(`${prefix}000`, 10);
      const maxValue = parseInt(`${prefix}999`, 10);

      // Récupérer le dernier numéro de commande du mois en cours
      // Utiliser CAST pour gérer les colonnes numériques correctement
      const result = await pool.request().query(`
        SELECT TOP 1 [${columnName}] as lastNum
        FROM [${tableName}]
        WHERE CAST([${columnName}] AS BIGINT) BETWEEN ${minValue} AND ${maxValue}
        ORDER BY CAST([${columnName}] AS BIGINT) DESC
      `);

      let newOrderNumber: string;

      if (result.recordset.length > 0 && result.recordset[0].lastNum) {
        const lastNum = String(result.recordset[0].lastNum);
        // Extraire la séquence (3 derniers chiffres)
        const sequence = parseInt(lastNum.slice(-3), 10);
        if (!isNaN(sequence) && sequence < 999) {
          // Incrémenter la séquence
          newOrderNumber = `${prefix}${String(sequence + 1).padStart(3, '0')}`;
        } else {
          // Séquence max atteinte, utiliser timestamp pour ce mois
          newOrderNumber = `${prefix}${String(Math.floor(Math.random() * 900) + 100)}`;
        }
      } else {
        // Premier numéro du mois: YYYYMM001
        newOrderNumber = `${prefix}001`;
      }

      // Vérifier que le numéro n'existe pas déjà (double sécurité)
      const existsCheck = await pool.request().query(`
        SELECT COUNT(*) as cnt FROM [${tableName}] WHERE [${columnName}] = '${newOrderNumber}'
      `);

      if (existsCheck.recordset[0].cnt > 0) {
        // Trouver le prochain numéro disponible
        for (let i = 1; i <= 999; i++) {
          const candidate = `${prefix}${String(i).padStart(3, '0')}`;
          const check = await pool.request().query(`
            SELECT COUNT(*) as cnt FROM [${tableName}] WHERE [${columnName}] = '${candidate}'
          `);
          if (check.recordset[0].cnt === 0) {
            newOrderNumber = candidate;
            break;
          }
        }
      }

      return newOrderNumber;

    } catch (error) {
      // Fallback: utiliser un numéro basé sur timestamp plus court (compatible avec les colonnes numériques)
      const ts = Date.now();
      const shortTs = ts % 1000000000; // Garder les 9 derniers chiffres
      return String(shortTs);
    }
  }
}
