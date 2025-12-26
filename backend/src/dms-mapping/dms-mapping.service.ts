import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as sql from 'mssql';
import { DmsMapping, DmsMappingType } from '../entities/dms-mapping.entity';
import { AppConfigService } from '../config/app-config.service';
import { AuditLog } from '../entities/audit-log.entity';

// Default field mappings for each entity type
export const DEFAULT_MAPPINGS: Record<string, Record<string, string>> = {
  articles: {
    id: 'Code_Article',
    reference: 'Code_Article',
    name: 'Designation',
    description: 'Affectation',
    category: 'Famille',
    subCategory: 'S_Famille',
    brand: 'Marque',
    price: 'PV_TTC',
    stock: 'Stock',
    minStock: 'Stock_min',
    location: 'Position',
    codeOrigine: 'Code_Origine',
    codeTva: 'TVA',
  },
  clients: {
    codeClient: 'Code_Client',
    raisonSociale: 'Raison_Social',
    codeTva: 'Code_Tva',
    telephone: 'Telephone',
    email: 'Mail',
    tauxRemise: 'Remise',
    typeRemise: 'Type_Remise',
    tauxMajoration: 'Majoration', // ID vers table Majoration
  },
  // Commandes - Entête
  commandes_entete: {
    numCommande: 'Num_Cmd',
    dateCommande: 'Date',
    codeClient: 'Code_Client',
    devise: 'Devise',
    modeReg: 'Mode_Reg',
    dateLiv: 'Date_Liv',
    totalHT: 'Total_HT',
    totalTVA: 'Total_Tva',
    totalTTC: 'Total_TTC',
    status: 'Etat',
    orderType: 'Type',
    totalRemise: 'Total_Remise',
    totalDC: 'Total_DC',
    designation: 'Designation',
    adresseLivraison: 'AdresseLivraisonUtilisee',
  },
  // Commandes - Détail (lignes)
  commandes_detail: {
    numCommande: 'Num_Cmd',
    codeArticle: 'Code_Article',
    codeClient: 'Code_Client',
    dateCommande: 'Date',
    devise: 'Devise',
    modeReg: 'Mode_Reg',
    dateLiv: 'Date_Liv',
    quantite: 'Qte',
    quantiteRecue: 'Qte_Recue',
    tauxTVA: 'Tva',
    prixUnitaire: 'Prix_Unit',
    designation: 'Designation',
    remise: 'Remise',
    numDevis: 'Num_Devis',
    dc: 'DC',
    typeDC: 'Type_DC',
  },
  // Factures - Entête
  factures_entete: {
    numFacture: 'Num_Facture',
    dateFacture: 'Date_Facture',
    codeClient: 'Code_Client',
    totalHT: 'Total_HT',
    totalTVA: 'Total_TVA',
    totalTTC: 'Total_TTC',
    resteAPayer: 'Reste_A_Payer',
    observation: 'Observation',
  },
  // Factures - Détail (lignes)
  factures_detail: {
    numFacture: 'Num_Facture',
    numLigne: 'Num_Ligne',
    numBL: 'Num_BL',
    numCommande: 'Num_Cmd', // Lien vers la commande d'origine
    dateBL: 'Date_BL',
    codeArticle: 'Code_Article',
    designation: 'Designation',
    quantite: 'Quantite',
    prixUnitaire: 'Prix_Unitaire',
    remise: 'Remise',
    montantHT: 'Montant_HT',
    tauxTVA: 'Taux_TVA',
    montantTTC: 'Montant_TTC',
  },
  // Bons de Livraison - Entête
  bl_entete: {
    numBL: 'Num_BL',
    dateBL: 'Date_BL',
    codeClient: 'Code_Client',
    numFacture: 'Num_Facture',
    totalHT: 'Total_HT',
    totalTTC: 'Total_TTC',
    observation: 'Observation',
  },
  // Bons de Livraison - Détail (lignes)
  bl_detail: {
    numBL: 'Num_BL',
    numLigne: 'Num_Ligne',
    numCommande: 'Num_Cmd', // Lien vers la commande d'origine
    codeArticle: 'Code_Article',
    designation: 'Designation',
    quantite: 'Quantite',
    prixUnitaire: 'Prix_Unitaire',
    tauxTVA: 'Taux_TVA',
    montantHT: 'Montant_HT',
    montantTTC: 'Montant_TTC',
  },
  // Table TVA (code -> taux)
  tva: {
    codeTva: 'Code_TVA',
    taux: 'Taux',
  },
  // Table Positions/Emplacements (id -> nom)
  // La table Articles contient une colonne Position qui référence l'ID de cette table
  positions: {
    id: 'ID',
    nom: 'Nom',
  },
  // Table Majoration (id -> taux)
  // La table Clients contient une colonne Majoration qui référence l'ID de cette table
  majoration: {
    id: 'ID',
    taux: 'Taux',
  },
};

export interface DmsTableInfo {
  tableName: string;
  columns: DmsColumnInfo[];
}

export interface DmsColumnInfo {
  name: string;
  dataType: string;
  maxLength: number | null;
  isNullable: boolean;
}

export interface CreateMappingDto {
  mappingType: DmsMappingType;
  dmsTableName: string;
  columnMappings: Record<string, string>;
  filterClause?: string;
}

export interface UpdateMappingDto {
  dmsTableName?: string;
  columnMappings?: Record<string, string>;
  filterClause?: string;
  isActive?: boolean;
}

@Injectable()
export class DmsMappingService {
  constructor(
    @InjectRepository(DmsMapping)
    private dmsMappingRepository: Repository<DmsMapping>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private appConfigService: AppConfigService,
  ) { }

  // Get all mappings
  async findAll(): Promise<DmsMapping[]> {
    return this.dmsMappingRepository.find({
      order: { mappingType: 'ASC' },
    });
  }

  // Get mapping by type
  async findByType(mappingType: DmsMappingType): Promise<DmsMapping | null> {
    return this.dmsMappingRepository.findOne({
      where: { mappingType, isActive: true },
    });
  }

  // Get mapping with parsed columnMappings
  async getMappingConfig(mappingType: DmsMappingType): Promise<{
    tableName: string;
    columns: Record<string, string>;
    filter?: string;
  } | null> {
    const mapping = await this.findByType(mappingType);

    if (!mapping) {
      // Return default mapping
      const defaultTableNames: Record<DmsMappingType, string> = {
        articles: 'Articles',
        clients: 'Clients',
        commandes_entete: 'Commandes',
        commandes_detail: 'Commandes_Lignes',
        factures_entete: 'Factures',
        factures_detail: 'Factures_Lignes',
        bl_entete: 'BonsLivraison',
        bl_detail: 'BonsLivraison_Lignes',
        tva: 'TVA',
        positions: 'Positions',
        majoration: 'Majoration',
      };
      return {
        tableName: defaultTableNames[mappingType] || mappingType,
        columns: DEFAULT_MAPPINGS[mappingType] || {},
      };
    }

    try {
      const config = {
        tableName: mapping.dmsTableName,
        columns: JSON.parse(mapping.columnMappings),
        filter: mapping.filterClause || undefined,
      };
      return config;
    } catch (e) {
      return null;
    }
  }

  // Create or update mapping
  async upsertMapping(dto: CreateMappingDto, currentUserId: string, ipAddress?: string): Promise<DmsMapping> {
    let mapping = await this.dmsMappingRepository.findOne({
      where: { mappingType: dto.mappingType },
    });

    if (mapping) {
      // Update existing
      mapping.dmsTableName = dto.dmsTableName;
      mapping.columnMappings = JSON.stringify(dto.columnMappings);
      mapping.filterClause = dto.filterClause || null;
      mapping.isActive = true;
    } else {
      // Create new
      mapping = this.dmsMappingRepository.create({
        mappingType: dto.mappingType,
        dmsTableName: dto.dmsTableName,
        columnMappings: JSON.stringify(dto.columnMappings),
        filterClause: dto.filterClause || null,
        isActive: true,
      });
    }

    const savedMapping = await this.dmsMappingRepository.save(mapping);

    // Audit log
    await this.logAuditAction(currentUserId, 'UPSERT_DMS_MAPPING', 'DmsMapping', savedMapping.id, {
      mappingType: dto.mappingType,
      dmsTableName: dto.dmsTableName,
    }, ipAddress);

    return savedMapping;
  }

  // Delete mapping
  async remove(id: string, currentUserId: string, ipAddress?: string): Promise<{ message: string }> {
    const mapping = await this.dmsMappingRepository.findOne({ where: { id } });

    if (!mapping) {
      throw new NotFoundException('Mapping non trouvé');
    }

    await this.dmsMappingRepository.remove(mapping);

    // Audit log
    await this.logAuditAction(currentUserId, 'DELETE_DMS_MAPPING', 'DmsMapping', id, {
      mappingType: mapping.mappingType,
    }, ipAddress);

    return { message: 'Mapping supprimé avec succès' };
  }

  // Get list of tables from DMS database
  async getDmsTables(): Promise<string[]> {
    const pool = await this.appConfigService.getSqlConnection();

    if (!pool) {
      return [];
    }

    try {
      const result = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);

      await pool.close();
      return result.recordset.map((row: any) => row.TABLE_NAME);
    } catch {
      if (pool) await pool.close();
      return [];
    }
  }

  // Get columns for a specific table
  async getTableColumns(tableName: string): Promise<DmsColumnInfo[]> {
    const pool = await this.appConfigService.getSqlConnection();

    if (!pool) {
      return [];
    }

    try {
      const result = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .query(`
          SELECT
            COLUMN_NAME as name,
            DATA_TYPE as dataType,
            CHARACTER_MAXIMUM_LENGTH as maxLength,
            CASE WHEN IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as isNullable
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @tableName
          ORDER BY ORDINAL_POSITION
        `);

      await pool.close();
      return result.recordset.map((row: any) => ({
        name: row.name,
        dataType: row.dataType,
        maxLength: row.maxLength,
        isNullable: row.isNullable === 1,
      }));
    } catch {
      if (pool) await pool.close();
      return [];
    }
  }

  // Get full table info (table name + columns)
  async getTableInfo(tableName: string): Promise<DmsTableInfo | null> {
    const columns = await this.getTableColumns(tableName);

    if (columns.length === 0) {
      return null;
    }

    return {
      tableName,
      columns,
    };
  }

  // Preview data from a table with mapping
  // Supports calculable fields: numLigne (auto-increment), montantHT, montantTTC
  async previewData(tableName: string, columnMappings: Record<string, string>, limit: number = 5): Promise<any[]> {
    const pool = await this.appConfigService.getSqlConnection();

    if (!pool) {
      return [];
    }

    try {
      // Filter out empty mappings and build SELECT clause only for mapped columns
      const mappedEntries = Object.entries(columnMappings).filter(([, dmsColumn]) => dmsColumn && dmsColumn.trim() !== '');

      if (mappedEntries.length === 0) {
        await pool.close();
        return [];
      }

      const selectClauses = mappedEntries
        .map(([localField, dmsColumn]) => `[${dmsColumn}] as [${localField}]`)
        .join(', ');

      const query = `SELECT TOP ${limit} ${selectClauses} FROM [${tableName}]`;

      const result = await pool.request().query(query);
      await pool.close();

      // Post-process to calculate missing fields
      const hasNumLigne = columnMappings.numLigne && columnMappings.numLigne.trim() !== '';
      const hasMontantHT = columnMappings.montantHT && columnMappings.montantHT.trim() !== '';
      const hasMontantTTC = columnMappings.montantTTC && columnMappings.montantTTC.trim() !== '';

      return result.recordset.map((row: any, index: number) => {
        const processedRow = { ...row };

        // Auto-increment numLigne if not mapped
        if (!hasNumLigne) {
          processedRow.numLigne = index + 1;
        }

        // Calculate montantHT if not mapped: quantite * prixUnitaire * (1 - remise/100)
        if (!hasMontantHT && row.quantite !== undefined && row.prixUnitaire !== undefined) {
          const quantite = parseFloat(row.quantite) || 0;
          const prixUnitaire = parseFloat(row.prixUnitaire) || 0;
          const remise = parseFloat(row.remise) || 0;
          processedRow.montantHT = quantite * prixUnitaire * (1 - remise / 100);
        }

        // Calculate montantTTC if not mapped: montantHT * (1 + tauxTVA/100)
        if (!hasMontantTTC) {
          const montantHT = processedRow.montantHT !== undefined ? parseFloat(processedRow.montantHT) : 0;
          const tauxTVA = parseFloat(row.tauxTVA) || 0;
          processedRow.montantTTC = montantHT * (1 + tauxTVA / 100);
        }

        return processedRow;
      });
    } catch {
      if (pool) await pool.close();
      return [];
    }
  }

  // Get article positions from DMS (JOIN between Articles and Positions tables)
  // Articles table contains a Position column (ID) that references Positions table (id -> nom)
  async getArticlePositions(articleCodes: string[]): Promise<Record<string, string>> {
    if (!articleCodes || articleCodes.length === 0) {
      return {};
    }

    // Get both mappings: articles (for the position ID column) and positions (for the lookup table)
    const articlesMapping = await this.getMappingConfig('articles');
    const positionsMapping = await this.getMappingConfig('positions');

    if (!articlesMapping) {
      return {};
    }

    if (!positionsMapping) {
      return {};
    }

    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) {
      return {};
    }

    try {
      // Articles table columns
      const articleCodeCol = articlesMapping.columns.reference || articlesMapping.columns.id || 'Code_Article';
      const articlePositionCol = articlesMapping.columns.location || 'Position';

      // Positions table columns
      const positionIdCol = positionsMapping.columns.id || 'ID';
      const positionNomCol = positionsMapping.columns.nom || 'Nom';

      // Build parameterized query for multiple article codes
      const placeholders = articleCodes.map((_, i) => `@code${i}`).join(', ');
      const request = pool.request();
      articleCodes.forEach((code, i) => {
        request.input(`code${i}`, sql.NVarChar, code);
      });

      // JOIN Articles with Positions to get the position name
      const query = `
        SELECT a.[${articleCodeCol}] as codeArticle, p.[${positionNomCol}] as position
        FROM [${articlesMapping.tableName}] a
        LEFT JOIN [${positionsMapping.tableName}] p ON a.[${articlePositionCol}] = p.[${positionIdCol}]
        WHERE a.[${articleCodeCol}] IN (${placeholders})
      `;

      const result = await request.query(query);
      await pool.close();

      // Build lookup map: articleCode -> position name
      const positionsMap: Record<string, string> = {};
      for (const row of result.recordset) {
        if (row.codeArticle && row.position) {
          positionsMap[row.codeArticle] = row.position;
        }
      }

      return positionsMap;
    } catch (error) {
      if (pool) await pool.close();
      return {};
    }
  }

  // Get default mapping fields for a type
  getDefaultFields(mappingType: DmsMappingType): Record<string, string> {
    return DEFAULT_MAPPINGS[mappingType] || {};
  }

  private async logAuditAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
    ipAddress?: string,
  ) {
    const auditLog = this.auditLogRepository.create({
      userId,
      action,
      entityType,
      entityId,
      details,
      ipAddress,
    });
    await this.auditLogRepository.save(auditLog);
  }
}
