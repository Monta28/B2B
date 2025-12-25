import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { User, UserRole } from '../entities/user.entity';

export type AuditLogWithUser = AuditLog;

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll(options?: {
    userId?: string;
    action?: string;
    entityType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    currentUserRole?: UserRole;
  }): Promise<{ data: AuditLogWithUser[]; total: number }> {
    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user');

    // Si l'utilisateur connecté est FULL_ADMIN, exclure les logs des SYSTEM_ADMIN
    if (options?.currentUserRole === UserRole.FULL_ADMIN) {
      queryBuilder.andWhere(
        '(user.role IS NULL OR user.role != :systemAdminRole)',
        { systemAdminRole: UserRole.SYSTEM_ADMIN }
      );
    }

    if (options?.userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId: options.userId });
    }

    if (options?.action) {
      queryBuilder.andWhere('audit.action = :action', { action: options.action });
    }

    if (options?.entityType) {
      queryBuilder.andWhere('audit.entityType = :entityType', { entityType: options.entityType });
    }

    if (options?.startDate) {
      queryBuilder.andWhere('audit.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options?.endDate) {
      queryBuilder.andWhere('audit.createdAt <= :endDate', { endDate: options.endDate });
    }

    const total = await queryBuilder.getCount();

    queryBuilder
      .orderBy('audit.createdAt', 'DESC')
      .skip(options?.offset || 0);

    // Only apply limit if explicitly specified
    if (options?.limit) {
      queryBuilder.take(options.limit);
    }

    const data = await queryBuilder.getMany();

    return { data, total };
  }

  async getActions(): Promise<string[]> {
    const result = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('DISTINCT audit.action', 'action')
      .getRawMany();

    return result.map((r) => r.action);
  }

  async getEntityTypes(): Promise<string[]> {
    const result = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('DISTINCT audit.entityType', 'entityType')
      .getRawMany();

    return result.map((r) => r.entityType);
  }
}
