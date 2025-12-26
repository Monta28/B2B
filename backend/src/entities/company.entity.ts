import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Order } from './order.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'dms_client_code', length: 100, unique: true })
  dmsClientCode: string;

  @Column({ length: 100, nullable: true })
  siret: string;

  @Column({ name: 'email_contact', length: 255, nullable: true })
  emailContact: string;

  @Column({ name: 'global_discount', type: 'decimal', precision: 5, scale: 2, default: 0 })
  globalDiscount: number;

  @Column({ name: 'type_remise', type: 'int', default: 0 })
  typeRemise: number;

  @Column({ name: 'taux_majoration', type: 'decimal', precision: 5, scale: 2, nullable: true })
  tauxMajoration: number | null;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ length: 100, nullable: true })
  phone: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => User, user => user.company)
  users: User[];

  @OneToMany(() => Order, order => order.company)
  orders: Order[];
}
