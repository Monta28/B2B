import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, order => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'product_ref', length: 100 })
  productRef: string;

  @Column({ name: 'product_name', length: 255 })
  productName: string;

  @Column()
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 3 })
  unitPrice: number;

  @Column({ name: 'discount_percent', type: 'numeric', precision: 5, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 12, scale: 3 })
  lineTotal: number;

  @Column({ name: 'availability', length: 20, nullable: true, default: null })
  availability: string; // 'DISPONIBLE' ou 'RUPTURE' au moment de la commande

  @Column({ name: 'tva_rate', type: 'decimal', precision: 5, scale: 2, nullable: false })
  tvaRate: number; // Taux TVA en % (ex: 7, 19, etc.)

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
