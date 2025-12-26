import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type DmsMappingType =
  | 'articles'
  | 'clients'
  | 'commandes_entete'
  | 'commandes_detail'
  | 'factures_entete'
  | 'factures_detail'
  | 'bl_entete'
  | 'bl_detail'
  | 'tva'
  | 'positions' // Table des positions/emplacements
  | 'majoration'; // Table des majorations (id -> taux)

@Entity('dms_mappings')
export class DmsMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'mapping_type', length: 50 })
  mappingType: DmsMappingType; // 'articles', 'clients', 'commandes'

  @Column({ name: 'dms_table_name', length: 255 })
  dmsTableName: string; // Name of the table in DMS SQL Server

  @Column({ name: 'column_mappings', type: 'text' })
  columnMappings: string; // JSON object: { localField: dmsColumn, ... }

  @Column({ name: 'filter_clause', type: 'text', nullable: true })
  filterClause: string; // Optional WHERE clause filter

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
