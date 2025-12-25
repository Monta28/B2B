import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  PREPARATION = 'PREPARATION',
  SHIPPED = 'SHIPPED',
  INVOICED = 'INVOICED',
  CANCELLED = 'CANCELLED',
}

export enum OrderType {
  STOCK = 'STOCK',
  QUICK = 'QUICK',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_number', length: 50, unique: true })
  orderNumber: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company, company => company.orders)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User | null;

  @Column({ name: 'order_type', type: 'enum', enum: OrderType, enumName: 'order_type', default: OrderType.STOCK })
  orderType: OrderType;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status', default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ name: 'total_ht', type: 'numeric', precision: 12, scale: 3, default: 0 })
  totalHt: number;

  @Column({ name: 'is_editing', type: 'boolean', default: false })
  isEditing: boolean;

  @Column({ name: 'editing_by_user_id', nullable: true })
  editingByUserId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'editing_by_user_id' })
  editingByUser: User | null;

  @Column({ name: 'editing_started_at', type: 'timestamp with time zone', nullable: true })
  editingStartedAt: Date;

  @Column({ name: 'vehicle_info', length: 500, nullable: true })
  vehicleInfo: string;

  @Column({ name: 'client_notes', type: 'text', nullable: true })
  clientNotes: string;

  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes: string;

  @Column({ name: 'dms_ref', length: 100, nullable: true })
  dmsRef: string;

  @Column({ name: 'bl_number', length: 100, nullable: true })
  blNumber: string;

  @Column({ name: 'bl_date', type: 'timestamp with time zone', nullable: true })
  blDate: Date;

  @Column({ name: 'invoice_number', length: 100, nullable: true })
  invoiceNumber: string;

  @Column({ name: 'invoice_date', type: 'timestamp with time zone', nullable: true })
  invoiceDate: Date;

  @Column({ name: 'last_modified_at', type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  lastModifiedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OrderItem, item => item.order, { cascade: true })
  items: OrderItem[];
}
