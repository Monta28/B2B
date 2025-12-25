import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../entities/user.entity';
import { Company } from '../entities/company.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { Order } from '../entities/order.entity';
import { Cart } from '../entities/cart.entity';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
  ) {}

  async findAll(currentUser: any, companyId?: string): Promise<User[]> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company');

    if (currentUser.role === UserRole.CLIENT_ADMIN) {
      queryBuilder.where('user.companyId = :companyId', { companyId: currentUser.companyId });
    } else if (currentUser.role === UserRole.FULL_ADMIN) {
      // FULL_ADMIN cannot see SYSTEM_ADMIN users
      queryBuilder.where('user.role != :systemAdminRole', { systemAdminRole: UserRole.SYSTEM_ADMIN });
      if (companyId) {
        queryBuilder.andWhere('user.companyId = :companyId', { companyId });
      }
    } else if (companyId) {
      queryBuilder.where('user.companyId = :companyId', { companyId });
    }

    return queryBuilder.orderBy('user.createdAt', 'DESC').getMany();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['company'],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return user;
  }

  async create(createUserDto: CreateUserDto, currentUserId: string): Promise<User> {
    // Check email uniqueness
    const existingByEmail = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingByEmail) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    // Check username uniqueness if provided
    if (createUserDto.username) {
      const existingByUsername = await this.userRepository.findOne({
        where: { username: createUserDto.username },
      });

      if (existingByUsername) {
        throw new ConflictException('Ce nom d\'utilisateur est déjà pris');
      }
    }

    let companyId: string | undefined = undefined;
    let dmsClientCode: string | undefined = createUserDto.dmsClientCode;

    if (createUserDto.companyId) {
      const company = await this.companyRepository.findOne({
        where: { id: createUserDto.companyId },
      });

      if (!company) {
        throw new NotFoundException('Entreprise non trouvée');
      }
      companyId = company.id;
      // Auto-fill dmsClientCode from company if not provided
      if (!dmsClientCode) {
        dmsClientCode = company.dmsClientCode;
      }
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);

    const user = new User();
    user.email = createUserDto.email;
    user.username = createUserDto.username || null;
    user.passwordHash = passwordHash;
    user.fullName = createUserDto.fullName;
    user.role = createUserDto.role;
    user.companyId = companyId as any;
    user.dmsClientCode = dmsClientCode;

    const savedUser = await this.userRepository.save(user);

    await this.logAuditAction(currentUserId, 'CREATE_USER', 'User', savedUser.id, {
      email: savedUser.email,
      username: savedUser.username,
      role: savedUser.role,
    });

    return savedUser;
  }

  async update(id: string, updateUserDto: UpdateUserDto, currentUserId: string): Promise<User> {
    console.log('=== UPDATE USER DEBUG ===');
    console.log('User ID:', id);
    console.log('UpdateUserDto:', JSON.stringify(updateUserDto, null, 2));
    console.log('companyId value:', updateUserDto.companyId);
    console.log('companyId type:', typeof updateUserDto.companyId);
    console.log('companyId !== undefined:', updateUserDto.companyId !== undefined);

    const user = await this.findOne(id);
    console.log('Current user companyId:', user.companyId);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Un utilisateur avec cet email existe déjà');
      }
    }

    // Check username uniqueness if changed
    if (updateUserDto.username !== undefined && updateUserDto.username !== user.username) {
      if (updateUserDto.username) {
        const existingByUsername = await this.userRepository.findOne({
          where: { username: updateUserDto.username },
        });

        if (existingByUsername) {
          throw new ConflictException('Ce nom d\'utilisateur est déjà pris');
        }
      }
    }

    if (updateUserDto.companyId !== undefined) {
      if (updateUserDto.companyId) {
        const company = await this.companyRepository.findOne({
          where: { id: updateUserDto.companyId },
        });

        if (!company) {
          throw new NotFoundException('Entreprise non trouvée');
        }
        user.companyId = company.id;
        user.company = company;
        // Auto-update dmsClientCode from the new company
        user.dmsClientCode = company.dmsClientCode;
      } else {
        user.companyId = null as any;
        user.company = null;
        user.dmsClientCode = null;
      }
    }

    if (updateUserDto.email) user.email = updateUserDto.email;
    if (updateUserDto.username !== undefined) user.username = updateUserDto.username || null;
    if (updateUserDto.fullName) user.fullName = updateUserDto.fullName;
    if (updateUserDto.role) user.role = updateUserDto.role;
    if (updateUserDto.dmsClientCode !== undefined) user.dmsClientCode = updateUserDto.dmsClientCode;
    if (updateUserDto.isActive !== undefined) user.isActive = updateUserDto.isActive;

    const savedUser = await this.userRepository.save(user);

    await this.logAuditAction(currentUserId, 'UPDATE_USER', 'User', savedUser.id, updateUserDto);

    return savedUser;
  }

  async toggleStatus(id: string, currentUserId: string): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = !user.isActive;

    const savedUser = await this.userRepository.save(user);

    await this.logAuditAction(currentUserId, user.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'User', savedUser.id, null);

    return savedUser;
  }

  async resetPassword(id: string, resetPasswordDto: ResetPasswordDto, currentUserId: string): Promise<{ message: string }> {
    const user = await this.findOne(id);

    user.passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    await this.userRepository.save(user);

    await this.logAuditAction(currentUserId, 'RESET_PASSWORD', 'User', id, null);

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  async remove(id: string, currentUserId: string, forceDelete: boolean = false): Promise<{ message: string }> {
    const user = await this.findOne(id);

    // Check for dependencies before deletion
    const dependencies: string[] = [];

    // Check for orders created by this user
    const ordersCount = await this.orderRepository.count({
      where: { createdByUserId: id },
    });
    if (ordersCount > 0) {
      dependencies.push(`${ordersCount} commande(s)`);
    }

    // Check for orders being edited by this user
    const editingOrdersCount = await this.orderRepository.count({
      where: { editingByUserId: id },
    });
    if (editingOrdersCount > 0) {
      dependencies.push(`${editingOrdersCount} commande(s) en cours d'édition`);
    }

    // Check for cart
    const cart = await this.cartRepository.findOne({
      where: { userId: id },
    });
    if (cart) {
      dependencies.push('un panier');
    }

    // If there are dependencies and not force delete, throw error with details
    if (dependencies.length > 0 && !forceDelete) {
      throw new BadRequestException(
        `Impossible de supprimer cet utilisateur. Il possède: ${dependencies.join(', ')}. ` +
        `Veuillez d'abord réassigner ou supprimer ces éléments, ou utilisez la suppression forcée (SYSADMIN uniquement).`
      );
    }

    // If force delete, delete all related data first
    if (forceDelete && dependencies.length > 0) {
      // Delete orders and their items (cascade will handle order items)
      const orders = await this.orderRepository.find({
        where: { createdByUserId: id },
        relations: ['items'],
      });
      for (const order of orders) {
        await this.orderRepository.remove(order);
      }

      // Clear editing status on orders being edited by this user
      await this.orderRepository.update(
        { editingByUserId: id },
        { editingByUserId: null, isEditing: false, editingStartedAt: null }
      );

      // Delete cart (cascade will handle cart items)
      if (cart) {
        await this.cartRepository.remove(cart);
      }

      // Delete notifications (should be handled by CASCADE but be explicit)
      await this.userRepository.manager.query(
        'DELETE FROM notifications WHERE user_id = $1',
        [id]
      );

      // Log the force delete action with details
      await this.logAuditAction(currentUserId, 'FORCE_DELETE_USER_DATA', 'User', id, {
        email: user.email,
        deletedOrders: ordersCount,
        hadCart: !!cart,
      });
    }

    await this.userRepository.remove(user);

    await this.logAuditAction(currentUserId, 'DELETE_USER', 'User', id, {
      email: user.email,
      forceDelete,
    });

    return { message: forceDelete
      ? 'Utilisateur et toutes ses données supprimés avec succès'
      : 'Utilisateur supprimé avec succès'
    };
  }

  private async logAuditAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
  ) {
    const auditLog = new AuditLog();
    auditLog.userId = userId;
    auditLog.action = action;
    auditLog.entityType = entityType;
    auditLog.entityId = entityId;
    auditLog.details = details;
    await this.auditLogRepository.save(auditLog);
  }
}
