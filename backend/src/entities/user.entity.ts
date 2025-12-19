import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';
import { Order } from './order.entity';
import { Notification } from './notification.entity';
import { AuditLog } from './audit-log.entity';
import { Cart } from './cart.entity';

export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  FULL_ADMIN = 'FULL_ADMIN',
  PARTIAL_ADMIN = 'PARTIAL_ADMIN',
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  CLIENT_USER = 'CLIENT_USER',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: string;

  @ManyToOne(() => Company, company => company.users, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 50, unique: true, nullable: true })
  username: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ name: 'full_name', length: 100, nullable: true })
  fullName: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  role: UserRole;

  @Column({ name: 'dms_client_code', length: 50, nullable: true })
  dmsClientCode: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Order, order => order.createdByUser)
  orders: Order[];

  @OneToMany(() => Notification, notification => notification.user)
  notifications: Notification[];

  @OneToMany(() => AuditLog, auditLog => auditLog.user)
  auditLogs: AuditLog[];

  @OneToOne(() => Cart, cart => cart.user)
  cart: Cart;
}
