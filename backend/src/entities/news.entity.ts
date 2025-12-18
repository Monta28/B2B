import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum NewsType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  PROMO = 'PROMO',
}

@Entity('news')
export class News {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: NewsType, enumName: 'news_type', default: NewsType.INFO })
  type: NewsType;

  @Column({ name: 'publish_date', type: 'date', default: () => 'CURRENT_DATE' })
  publishDate: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
