import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as sql from 'mssql';
import { AppConfig } from '../entities/app-config.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { DmsMappingService } from '../dms-mapping/dms-mapping.service';
import { DmsMappingType } from '../entities/dms-mapping.entity';

export interface Product {
  id: string;
  reference: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  price: number; // Prix HT
  priceTTC?: number; // Prix TTC calculé
  stock: number;
  minStock?: number;
  location?: string;
  codeOrigine?: string;
  codeTva?: string;
  tvaRate?: number;
}

// Cache interface
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

@Injectable()
export class ProductsService {
  private pool: sql.ConnectionPool | null = null;

  // Cache en mémoire pour les recherches (TTL: 30 secondes)
  private searchCache: Map<string, CacheEntry<{ data: Product[]; total: number }>> = new Map();
  private readonly CACHE_TTL = 30000; // 30 secondes

  // Cache pour catégories et marques (TTL: 5 minutes)
  private categoriesCache: CacheEntry<string[]> | null = null;
  private brandsCache: CacheEntry<string[]> | null = null;
  private readonly STATIC_CACHE_TTL = 300000; // 5 minutes

  constructor(
    @InjectRepository(AppConfig)
    private appConfigRepository: Repository<AppConfig>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private dmsMappingService: DmsMappingService,
  ) {}

  // Log product consultation action
  async logProductConsultation(
    userId: string,
    action: string,
    details: any,
    ipAddress?: string,
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        userId,
        action,
        entityType: 'Product',
        entityId: details.reference || null,
        details,
        ipAddress,
      });
      await this.auditLogRepository.save(auditLog);
    } catch (error) {
      // Log silently fails - don't break the main operation
      console.error('Failed to log product consultation:', error);
    }
  }

  private async getConnection(): Promise<sql.ConnectionPool> {
    const config = await this.appConfigRepository.findOne({
      where: {},
      order: { id: 'ASC' },
    });

    if (!config?.sqlServerHost || !config?.sqlServerUser || !config?.sqlServerDatabase) {
      throw new ServiceUnavailableException('Configuration SQL Server non définie');
    }

    // Close existing pool if config changed
    if (this.pool) {
      try {
        await this.pool.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    // Parse server name for named instances (e.g., ".\MGSS_SQLSERVER" or "localhost\INSTANCE")
    let serverName = config.sqlServerHost;
    let instanceName: string | undefined;

    if (serverName.startsWith('.\\') || serverName.startsWith('./')) {
      instanceName = serverName.substring(2);
      serverName = 'localhost';
    } else if (serverName.includes('\\')) {
      const parts = serverName.split('\\');
      serverName = parts[0];
      instanceName = parts[1];
    } else if (serverName.includes('/')) {
      const parts = serverName.split('/');
      serverName = parts[0];
      instanceName = parts[1];
    }

    const sqlConfig: sql.config = {
      server: serverName,
      user: config.sqlServerUser,
      password: config.sqlServerPassword || '',
      database: config.sqlServerDatabase,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        instanceName: instanceName,
      },
      connectionTimeout: 15000,
      requestTimeout: 30000,
    };

    // Only set port if no instance name (named instances use SQL Browser)
    if (!instanceName && config.sqlServerPort) {
      sqlConfig.port = config.sqlServerPort;
    }

    try {
      this.pool = await sql.connect(sqlConfig);
      return this.pool;
    } catch (error: any) {
      throw new ServiceUnavailableException(`Erreur de connexion SQL Server: ${error.message}`);
    }
  }

  // Génère une clé de cache unique pour les paramètres de recherche
  private getCacheKey(query: string, options?: any): string {
    return JSON.stringify({ query, ...options });
  }

  // Vérifie si une entrée de cache est valide
  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined, ttl: number): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < ttl;
  }

  // Nettoie le cache des entrées expirées (appelé périodiquement)
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.searchCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.searchCache.delete(key);
      }
    }
  }

  async searchProducts(query: string, options?: {
    reference?: string;
    designation?: string;
    codeOrigine?: string;
    category?: string;
    brand?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: Product[]; total: number }> {
    // Générer la clé de cache
    const cacheKey = this.getCacheKey(query, options);

    // Vérifier le cache
    const cachedResult = this.searchCache.get(cacheKey);
    if (this.isCacheValid(cachedResult, this.CACHE_TTL)) {
      return cachedResult!.data;
    }

    try {
      const pool = await this.getConnection();
      const request = pool.request();

      // Build WHERE clause with multi-criteria search
      const conditions: string[] = [];

      // Check if we have specific field searches (ref, desig, origine)
      const hasRefSearch = options?.reference && options.reference.trim().length > 0;
      const hasDesigSearch = options?.designation && options.designation.trim().length > 0;
      const hasOrigineSearch = options?.codeOrigine && options.codeOrigine.trim().length > 0;
      const hasSpecificSearch = hasRefSearch || hasDesigSearch || hasOrigineSearch;

      // Legacy global search (q parameter) - only if no specific field search
      const hasQuery = !hasSpecificSearch && query && query.trim().length > 0;

      if (hasQuery) {
        // Multi-word search: split by space and search each word in all fields
        const searchTerms = query.trim().split(/\s+/).filter(t => t.length > 0);

        if (searchTerms.length === 1) {
          // Single word: original behavior with prefix optimization
          const searchTerm = searchTerms[0];
          request.input('query', sql.NVarChar, `%${searchTerm}%`);
          request.input('queryPrefix', sql.NVarChar, `${searchTerm}%`);
          conditions.push(`(a.Code_Article LIKE @queryPrefix OR a.Code_Article LIKE @query OR a.Designation LIKE @query OR a.Code_Origine LIKE @queryPrefix OR a.Code_Origine LIKE @query)`);
        } else {
          // Multiple words: each word must match at least one field (AND logic between words)
          const wordConditions: string[] = [];
          searchTerms.forEach((term, idx) => {
            request.input(`term${idx}`, sql.NVarChar, `%${term}%`);
            request.input(`termPrefix${idx}`, sql.NVarChar, `${term}%`);
            // Each word can be found in any of the fields
            wordConditions.push(`(a.Code_Article LIKE @termPrefix${idx} OR a.Code_Article LIKE @term${idx} OR a.Designation LIKE @term${idx} OR a.Code_Origine LIKE @termPrefix${idx} OR a.Code_Origine LIKE @term${idx})`);
          });
          // All words must be found (AND)
          conditions.push(`(${wordConditions.join(' AND ')})`);
        }
      }

      // Multi-criteria search: each field searches its specific column
      if (hasRefSearch) {
        const refTerm = options!.reference!.trim();
        request.input('refSearch', sql.NVarChar, `%${refTerm}%`);
        request.input('refPrefix', sql.NVarChar, `${refTerm}%`);
        // Préférer la recherche par préfixe pour Code_Article
        conditions.push(`(a.Code_Article LIKE @refPrefix OR a.Code_Article LIKE @refSearch)`);
      }
      if (hasDesigSearch) {
        request.input('desigSearch', sql.NVarChar, `%${options!.designation}%`);
        conditions.push(`a.Designation LIKE @desigSearch`);
      }
      if (hasOrigineSearch) {
        const origineTerm = options!.codeOrigine!.trim();
        request.input('origineSearch', sql.NVarChar, `%${origineTerm}%`);
        request.input('originePrefix', sql.NVarChar, `${origineTerm}%`);
        // Préférer la recherche par préfixe pour Code_Origine
        conditions.push(`(a.Code_Origine LIKE @originePrefix OR a.Code_Origine LIKE @origineSearch)`);
      }

      if (options?.category) {
        request.input('category', sql.NVarChar, options.category);
        conditions.push(`a.Famille = @category`);
      }

      if (options?.brand) {
        request.input('brand', sql.NVarChar, options.brand);
        conditions.push(`a.Marque = @brand`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get paginated data - default 50 per page for better performance
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      request.input('limit', sql.Int, limit);
      request.input('offset', sql.Int, offset);

      // OPTIMISATION: Une seule requête avec COUNT(*) OVER() au lieu de 2 requêtes séparées
      // Récupérer le mapping TVA dynamique
      const tvaMapping = await this.dmsMappingService.getMappingConfig('tva' as DmsMappingType);

      // Construire la jointure TVA si le mapping existe
      let tvaJoin = '';
      let tvaSelect = 'NULL as tvaRate';
      if (tvaMapping && tvaMapping.tableName && tvaMapping.columns.codeTva && tvaMapping.columns.taux) {
        const tvaTable = tvaMapping.tableName;
        const tvaCodeCol = tvaMapping.columns.codeTva;
        const tauxCol = tvaMapping.columns.taux;
        tvaJoin = `LEFT JOIN [${tvaTable}] t ON a.TVA = t.[${tvaCodeCol}]`;
        tvaSelect = `t.[${tauxCol}] as tvaRate`;
      }

      const result = await request.query(`
        SELECT
          a.Code_Article as id,
          a.Code_Article as reference,
          a.Designation as name,
          a.Affectation as description,
          a.Famille as category,
          a.Marque as brand,
          ISNULL(a.PV_HT, 0) as priceHT,
          ISNULL(a.Stock, 0) as stock,
          ISNULL(a.Stock_min, 0) as minStock,
          a.Position as location,
          a.Code_Origine as codeOrigine,
          a.S_Famille as subCategory,
          a.TVA as codeTva,
          ${tvaSelect},
          COUNT(*) OVER() as totalCount
        FROM Articles a
        ${tvaJoin}
        ${whereClause}
        ORDER BY
          CASE WHEN a.Stock > 0 THEN 0 ELSE 1 END,
          a.Code_Article
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);

      // Extraire le total depuis la première ligne (si disponible)
      const total = result.recordset.length > 0 ? result.recordset[0].totalCount : 0;

      const data: Product[] = result.recordset.map((row: any) => {
        const priceHT = parseFloat(row.priceHT) || 0;
        const tvaRate = row.tvaRate != null ? parseFloat(row.tvaRate) : null;
        // Calculer le prix TTC si on a le taux TVA
        const priceTTC = tvaRate != null ? priceHT * (1 + tvaRate / 100) : priceHT;

        return {
          id: row.id,
          reference: row.reference,
          name: row.name,
          description: row.description,
          category: row.category,
          brand: row.brand,
          price: priceHT, // Prix HT
          priceTTC: priceTTC, // Prix TTC calculé
          stock: parseFloat(row.stock) || 0,
          minStock: parseFloat(row.minStock) || 0,
          location: row.location,
          codeOrigine: row.codeOrigine || '',
          codeTva: row.codeTva || null,
          tvaRate: tvaRate,
        };
      });

      const resultData = { data, total };

      // Mettre en cache le résultat
      this.searchCache.set(cacheKey, {
        data: resultData,
        timestamp: Date.now(),
      });

      // Nettoyer le cache périodiquement (toutes les 100 requêtes)
      if (this.searchCache.size > 100) {
        this.cleanupCache();
      }

      return resultData;
    } catch (error: any) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(`Erreur lors de la recherche: ${error.message}`);
    }
  }

  // Méthode pour récupérer les prix en lot (batch)
  async getPricesBatch(references: string[]): Promise<Record<string, { priceHT: number; priceTTC: number; netPrice: number; stock: number; tvaRate: number | null }>> {
    if (!references || references.length === 0) {
      return {};
    }

    try {
      const pool = await this.getConnection();
      const request = pool.request();

      // Récupérer le mapping TVA dynamique
      const tvaMapping = await this.dmsMappingService.getMappingConfig('tva' as DmsMappingType);

      // Construire la jointure TVA si le mapping existe
      let tvaJoin = '';
      let tvaSelect = 'NULL as tvaRate';
      if (tvaMapping && tvaMapping.tableName && tvaMapping.columns.codeTva && tvaMapping.columns.taux) {
        const tvaTable = tvaMapping.tableName;
        const tvaCodeCol = tvaMapping.columns.codeTva;
        const tauxCol = tvaMapping.columns.taux;
        tvaJoin = `LEFT JOIN [${tvaTable}] t ON a.TVA = t.[${tvaCodeCol}]`;
        tvaSelect = `t.[${tauxCol}] as tvaRate`;
      }

      // Créer des paramètres pour chaque référence (évite l'injection SQL)
      const paramNames = references.map((_, i) => `@ref${i}`);
      references.forEach((ref, i) => {
        request.input(`ref${i}`, sql.NVarChar, ref);
      });

      const result = await request.query(`
        SELECT
          a.Code_Article as reference,
          ISNULL(a.PV_HT, 0) as priceHT,
          ISNULL(a.Stock, 0) as stock,
          ${tvaSelect}
        FROM Articles a
        ${tvaJoin}
        WHERE a.Code_Article IN (${paramNames.join(', ')})
      `);

      const pricesMap: Record<string, { priceHT: number; priceTTC: number; netPrice: number; stock: number; tvaRate: number | null }> = {};
      for (const row of result.recordset) {
        const priceHT = parseFloat(row.priceHT) || 0;
        const tvaRate = row.tvaRate != null ? parseFloat(row.tvaRate) : null;
        const priceTTC = tvaRate != null ? priceHT * (1 + tvaRate / 100) : priceHT;
        pricesMap[row.reference] = {
          priceHT,
          priceTTC,
          netPrice: priceHT * 0.65, // 35% de remise par défaut sur HT
          stock: parseFloat(row.stock) || 0,
          tvaRate,
        };
      }

      return pricesMap;
    } catch (error: any) {
      throw new ServiceUnavailableException(`Erreur lors de la récupération des prix: ${error.message}`);
    }
  }

  async getProductByRef(reference: string): Promise<Product | null> {
    try {
      const pool = await this.getConnection();

      // Récupérer le mapping TVA dynamique
      const tvaMapping = await this.dmsMappingService.getMappingConfig('tva' as DmsMappingType);

      // Construire la jointure TVA si le mapping existe
      let tvaJoin = '';
      let tvaSelect = 'NULL as tvaRate';
      if (tvaMapping && tvaMapping.tableName && tvaMapping.columns.codeTva && tvaMapping.columns.taux) {
        const tvaTable = tvaMapping.tableName;
        const tvaCodeCol = tvaMapping.columns.codeTva;
        const tauxCol = tvaMapping.columns.taux;
        tvaJoin = `LEFT JOIN [${tvaTable}] t ON a.TVA = t.[${tvaCodeCol}]`;
        tvaSelect = `t.[${tauxCol}] as tvaRate`;
      }

      const result = await pool.request()
        .input('reference', sql.NVarChar, reference)
        .query(`
          SELECT
            a.Code_Article as id,
            a.Code_Article as reference,
            a.Designation as name,
            a.Affectation as description,
            a.Famille as category,
            a.Marque as brand,
            ISNULL(a.PV_HT, 0) as priceHT,
            ISNULL(a.Stock, 0) as stock,
            ISNULL(a.Stock_min, 0) as minStock,
            a.Position as location,
            a.Code_Origine as codeOrigine,
            a.TVA as codeTva,
            ${tvaSelect}
          FROM Articles a
          ${tvaJoin}
          WHERE a.Code_Article = @reference
        `);

      if (result.recordset.length === 0) {
        return null;
      }

      const row = result.recordset[0];
      const priceHT = parseFloat(row.priceHT) || 0;
      const tvaRate = row.tvaRate != null ? parseFloat(row.tvaRate) : null;
      const priceTTC = tvaRate != null ? priceHT * (1 + tvaRate / 100) : priceHT;

      return {
        id: row.id,
        reference: row.reference,
        name: row.name,
        description: row.description,
        category: row.category,
        brand: row.brand,
        price: priceHT, // Prix HT
        priceTTC: priceTTC, // Prix TTC calculé
        stock: parseFloat(row.stock) || 0,
        minStock: parseFloat(row.minStock) || 0,
        location: row.location,
        codeOrigine: row.codeOrigine || '',
        codeTva: row.codeTva || null,
        tvaRate: tvaRate,
      };
    } catch (error: any) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(`Erreur lors de la recherche: ${error.message}`);
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const pool = await this.getConnection();

      const result = await pool.request().query(`
        SELECT DISTINCT Famille as category
        FROM Articles
        WHERE Famille IS NOT NULL AND Famille != ''
        ORDER BY Famille
      `);

      return result.recordset.map((row: any) => row.category);
    } catch (error: any) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(`Erreur lors de la récupération des catégories: ${error.message}`);
    }
  }

  async getBrands(): Promise<string[]> {
    try {
      const pool = await this.getConnection();

      const result = await pool.request().query(`
        SELECT DISTINCT Marque as brand
        FROM Articles
        WHERE Marque IS NOT NULL AND Marque != ''
        ORDER BY Marque
      `);

      return result.recordset.map((row: any) => row.brand);
    } catch (error: any) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(`Erreur lors de la récupération des marques: ${error.message}`);
    }
  }

  async checkConnection(): Promise<{ connected: boolean; message: string }> {
    try {
      const pool = await this.getConnection();
      await pool.request().query('SELECT 1');
      return { connected: true, message: 'Connexion au DMS réussie' };
    } catch (error: any) {
      return { connected: false, message: error.message };
    }
  }
}
