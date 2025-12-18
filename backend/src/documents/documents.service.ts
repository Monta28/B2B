import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { DmsMappingService } from '../dms-mapping/dms-mapping.service';
import { AppConfigService } from '../config/app-config.service';

export interface DocumentHeader {
  id: string;
  dmsRef: string;
  type: 'INVOICE' | 'BL';
  date: string;
  codeClient: string;
  companyName?: string;
  totalHT: number;
  totalTVA?: number;
  totalTTC: number;
  observation?: string;
  numFacture?: string; // For BL: linked invoice number (null if not invoiced)
}

export interface DocumentLine {
  numLigne: number;
  codeArticle: string;
  designation: string;
  quantite: number;
  prixUnitaire: number;
  remise?: number;
  tauxTVA?: number;
  montantHT: number;
  montantTTC: number;
  numBL?: string;  // For invoice lines: BL reference (for grouping)
  dateBL?: string; // For invoice lines: BL date
}

export interface DocumentWithLines extends DocumentHeader {
  lines: DocumentLine[];
}

@Injectable()
export class DocumentsService {
  constructor(
    private dmsMappingService: DmsMappingService,
    private appConfigService: AppConfigService,
  ) { }

  // Get all invoices (factures) for a client or all clients
  async getInvoices(dmsClientCode?: string): Promise<DocumentHeader[]> {
    const mapping = await this.dmsMappingService.getMappingConfig('factures_entete');
    if (!mapping) return [];

    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) return [];

    try {
      // Build SELECT clause from column mappings
      const columns = mapping.columns;
      const selectClauses: string[] = [];

      // Map the columns - use available mappings
      if (columns.numFacture) selectClauses.push(`[${columns.numFacture}] as numFacture`);
      if (columns.dateFacture) selectClauses.push(`[${columns.dateFacture}] as dateFacture`);
      if (columns.codeClient) selectClauses.push(`[${columns.codeClient}] as codeClient`);
      if (columns.totalHT) selectClauses.push(`[${columns.totalHT}] as totalHT`);
      if (columns.totalTTC) selectClauses.push(`[${columns.totalTTC}] as totalTTC`);
      if (columns.observation) selectClauses.push(`[${columns.observation}] as observation`);

      if (selectClauses.length === 0) {
        await pool.close();
        return [];
      }

      let query = `SELECT ${selectClauses.join(', ')} FROM [${mapping.tableName}]`;

      // Add WHERE clause for client filtering
      const request = pool.request();
      if (dmsClientCode) {
        query += ` WHERE [${columns.codeClient}] = @codeClient`;
        request.input('codeClient', sql.NVarChar, dmsClientCode);
      }

      // Add filter clause from mapping if exists
      if (mapping.filter) {
        query += dmsClientCode ? ` AND (${mapping.filter})` : ` WHERE ${mapping.filter}`;
      }

      // Order by date descending
      if (columns.dateFacture) {
        query += ` ORDER BY [${columns.dateFacture}] DESC`;
      }

      const result = await request.query(query);
      await pool.close();

      return result.recordset.map((row: any) => ({
        id: String(row.numFacture),
        dmsRef: String(row.numFacture),
        type: 'INVOICE' as const,
        date: row.dateFacture ? this.formatDate(row.dateFacture) : '',
        codeClient: row.codeClient || '',
        totalHT: parseFloat(row.totalHT) || 0,
        totalTTC: parseFloat(row.totalTTC) || 0,
        observation: row.observation || '',
      }));
    } catch (error) {
      console.error('Error fetching invoices:', error);
      if (pool) await pool.close();
      return [];
    }
  }

  // Get all delivery notes (BL) for a client or all clients
  async getDeliveryNotes(dmsClientCode?: string): Promise<DocumentHeader[]> {
    const mapping = await this.dmsMappingService.getMappingConfig('bl_entete');
    if (!mapping) return [];

    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) return [];

    try {
      const columns = mapping.columns;
      const selectClauses: string[] = [];

      if (columns.numBL) selectClauses.push(`[${columns.numBL}] as numBL`);
      if (columns.dateBL) selectClauses.push(`[${columns.dateBL}] as dateBL`);
      if (columns.codeClient) selectClauses.push(`[${columns.codeClient}] as codeClient`);
      if (columns.totalHT) selectClauses.push(`[${columns.totalHT}] as totalHT`);
      if (columns.totalTTC) selectClauses.push(`[${columns.totalTTC}] as totalTTC`);
      if (columns.observation) selectClauses.push(`[${columns.observation}] as observation`);
      if (columns.numFacture) selectClauses.push(`[${columns.numFacture}] as numFacture`);

      if (selectClauses.length === 0) {
        await pool.close();
        return [];
      }

      let query = `SELECT ${selectClauses.join(', ')} FROM [${mapping.tableName}]`;

      const request = pool.request();
      if (dmsClientCode) {
        query += ` WHERE [${columns.codeClient}] = @codeClient`;
        request.input('codeClient', sql.NVarChar, dmsClientCode);
      }

      if (mapping.filter) {
        query += dmsClientCode ? ` AND (${mapping.filter})` : ` WHERE ${mapping.filter}`;
      }

      if (columns.dateBL) {
        query += ` ORDER BY [${columns.dateBL}] DESC`;
      }

      const result = await request.query(query);
      await pool.close();

      return result.recordset.map((row: any) => ({
        id: String(row.numBL),
        dmsRef: String(row.numBL),
        type: 'BL' as const,
        date: row.dateBL ? this.formatDate(row.dateBL) : '',
        codeClient: row.codeClient || '',
        totalHT: parseFloat(row.totalHT) || 0,
        totalTTC: parseFloat(row.totalTTC) || 0,
        observation: row.observation || '',
        numFacture: row.numFacture ? String(row.numFacture) : undefined,
      }));
    } catch (error) {
      console.error('Error fetching delivery notes:', error);
      if (pool) await pool.close();
      return [];
    }
  }

  // Get all documents (invoices + BL) for a client
  async getAllDocuments(dmsClientCode?: string): Promise<DocumentHeader[]> {
    const [invoices, deliveryNotes] = await Promise.all([
      this.getInvoices(dmsClientCode),
      this.getDeliveryNotes(dmsClientCode),
    ]);

    // Combine and sort by date
    const allDocs = [...invoices, ...deliveryNotes];
    allDocs.sort((a, b) => {
      if (a.date < b.date) return 1;
      if (a.date > b.date) return -1;
      return 0;
    });

    return allDocs;
  }

  // Get invoice detail lines
  async getInvoiceLines(numFacture: string): Promise<DocumentLine[]> {
    console.log('[DocumentsService] ========== getInvoiceLines START ==========');
    console.log('[DocumentsService] getInvoiceLines called with numFacture:', numFacture);

    const mapping = await this.dmsMappingService.getMappingConfig('factures_detail');
    console.log('[DocumentsService] factures_detail mapping:', JSON.stringify(mapping, null, 2));

    if (!mapping) {
      console.log('[DocumentsService] No mapping found for factures_detail');
      return [];
    }

    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) {
      console.log('[DocumentsService] No SQL connection available');
      return [];
    }

    try {
      // Get actual columns in the table
      const colsResult = await pool.request()
        .input('tableName', sql.NVarChar, mapping.tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`);

      const actualColumns = new Set(colsResult.recordset.map((r: any) => r.COLUMN_NAME));
      console.log(`[DocumentsService] Actual columns in ${mapping.tableName}:`, Array.from(actualColumns));

      if (actualColumns.size === 0) {
        console.log(`[DocumentsService] ERROR: Table '${mapping.tableName}' does NOT exist or has no columns!`);
        await pool.close();
        return [];
      }

      const columns = mapping.columns;

      // Check if numFacture column is mapped and exists (required)
      if (!columns.numFacture || !actualColumns.has(columns.numFacture)) {
        console.log('[DocumentsService] ERROR: numFacture column not mapped or does not exist!');
        console.log(`[DocumentsService] Mapped to: ${columns.numFacture}, exists: ${actualColumns.has(columns.numFacture)}`);
        await pool.close();
        return [];
      }

      // Build SELECT clause - only include columns that are mapped AND exist in the table
      // numLigne, montantHT, montantTTC are optional and will be calculated if not mapped or not existing
      const selectClauses: string[] = [];
      const validColumns: Record<string, boolean> = {};

      // Helper to add column only if it exists
      const addColumnIfExists = (mappedName: string, alias: string) => {
        if (columns[mappedName] && actualColumns.has(columns[mappedName])) {
          selectClauses.push(`[${columns[mappedName]}] as ${alias}`);
          validColumns[mappedName] = true;
        } else if (columns[mappedName]) {
          console.log(`[DocumentsService] Column ${mappedName} mapped to '${columns[mappedName]}' but does NOT exist in table - will be calculated`);
          validColumns[mappedName] = false;
        }
      };

      addColumnIfExists('numLigne', 'numLigne');
      addColumnIfExists('numBL', 'numBL');
      addColumnIfExists('dateBL', 'dateBL');
      addColumnIfExists('codeArticle', 'codeArticle');
      addColumnIfExists('designation', 'designation');
      addColumnIfExists('quantite', 'quantite');
      addColumnIfExists('prixUnitaire', 'prixUnitaire');
      addColumnIfExists('remise', 'remise');
      addColumnIfExists('tauxTVA', 'tauxTVA');
      addColumnIfExists('montantHT', 'montantHT');
      addColumnIfExists('montantTTC', 'montantTTC');

      // Must have at least some columns to select (besides numFacture for filtering)
      if (selectClauses.length === 0) {
        console.log('[DocumentsService] No valid columns mapped, returning empty');
        await pool.close();
        return [];
      }

      // Build ORDER BY clause - order by numBL first (for grouping), then numLigne
      let orderByClause = '';
      if (validColumns.numBL && validColumns.numLigne) {
        orderByClause = `ORDER BY [${columns.numBL}], [${columns.numLigne}]`;
      } else if (validColumns.numBL) {
        orderByClause = `ORDER BY [${columns.numBL}]`;
      } else if (validColumns.numLigne) {
        orderByClause = `ORDER BY [${columns.numLigne}]`;
      }

      const query = `SELECT ${selectClauses.join(', ')} FROM [${mapping.tableName}] WHERE [${columns.numFacture}] = @numFacture ${orderByClause}`;
      console.log('[DocumentsService] Executing query:', query);

      const result = await pool.request()
        .input('numFacture', sql.NVarChar, numFacture)
        .query(query);

      console.log('[DocumentsService] Result count:', result.recordset.length);

      // Map results and calculate missing fields
      let lines: DocumentLine[] = result.recordset.map((row: any, index: number) => {
        const quantite = parseFloat(row.quantite) || 0;
        const prixUnitaire = parseFloat(row.prixUnitaire) || 0;
        const remise = parseFloat(row.remise) || 0;
        const tauxTVA = row.tauxTVA !== undefined && row.tauxTVA !== null ? parseFloat(row.tauxTVA) : 0;

        // Calculate montantHT if not mapped or column doesn't exist: quantite * prixUnitaire * (1 - remise/100)
        let montantHT: number;
        if (validColumns.montantHT && row.montantHT !== undefined && row.montantHT !== null) {
          montantHT = parseFloat(row.montantHT) || 0;
        } else {
          montantHT = quantite * prixUnitaire * (1 - remise / 100);
        }

        // Calculate montantTTC if not mapped or column doesn't exist: montantHT * (1 + tauxTVA/100)
        let montantTTC: number;
        if (validColumns.montantTTC && row.montantTTC !== undefined && row.montantTTC !== null) {
          montantTTC = parseFloat(row.montantTTC) || 0;
        } else {
          montantTTC = montantHT * (1 + tauxTVA / 100);
        }

        // Use numLigne if mapped and exists, otherwise auto-increment starting from 1
        const numLigne = validColumns.numLigne && row.numLigne !== undefined ? parseInt(row.numLigne) : index + 1;

        // Format dateBL if present
        let dateBL: string | undefined;
        if (validColumns.dateBL && row.dateBL) {
          dateBL = this.formatDate(row.dateBL);
        }

        return {
          numLigne,
          codeArticle: row.codeArticle || '',
          designation: row.designation || '',
          quantite,
          prixUnitaire,
          remise,
          tauxTVA: tauxTVA || undefined,
          montantHT,
          montantTTC,
          numBL: validColumns.numBL && row.numBL ? String(row.numBL) : undefined,
          dateBL,
        };
      });

      // If numBL/dateBL not available in factures_detail, try to get BL info from bl_entete
      const hasAnyBLInfo = lines.some(l => l.numBL);
      if (!hasAnyBLInfo) {
        console.log('[DocumentsService] No BL info in factures_detail, trying to get from bl_entete...');
        // Note: pool connection is still open, will be closed after enrichment
        lines = await this.enrichLinesWithBLInfo(numFacture, lines);
      }

      await pool.close();
      return lines;
    } catch (error: any) {
      console.error('[DocumentsService] ========== ERROR fetching invoice lines ==========');
      console.error('[DocumentsService] Error message:', error?.message);
      console.error('[DocumentsService] Full error:', error);
      if (pool) await pool.close();
      return [];
    }
  }

  // Try to enrich invoice lines with BL info from bl_entete table
  private async enrichLinesWithBLInfo(numFacture: string, lines: DocumentLine[]): Promise<DocumentLine[]> {
    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) {
      console.log('[DocumentsService] No SQL connection for BL enrichment');
      return lines;
    }

    try {
      const blMapping = await this.dmsMappingService.getMappingConfig('bl_entete');
      if (!blMapping) {
        console.log('[DocumentsService] No bl_entete mapping available');
        await pool.close();
        return lines;
      }

      const blColumns = blMapping.columns;
      if (!blColumns.numFacture || !blColumns.numBL) {
        console.log('[DocumentsService] bl_entete mapping missing numFacture or numBL column');
        await pool.close();
        return lines;
      }

      // Get actual columns in bl_entete
      const colsResult = await pool.request()
        .input('tableName', sql.NVarChar, blMapping.tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`);

      const actualColumns = new Set(colsResult.recordset.map((r: any) => r.COLUMN_NAME));

      if (!actualColumns.has(blColumns.numFacture) || !actualColumns.has(blColumns.numBL)) {
        console.log('[DocumentsService] bl_entete table missing required columns');
        await pool.close();
        return lines;
      }

      // Build query to get all BLs linked to this invoice
      const selectParts = [`[${blColumns.numBL}] as numBL`];
      if (blColumns.dateBL && actualColumns.has(blColumns.dateBL)) {
        selectParts.push(`[${blColumns.dateBL}] as dateBL`);
      }

      const blQuery = `SELECT ${selectParts.join(', ')} FROM [${blMapping.tableName}] WHERE [${blColumns.numFacture}] = @numFacture ORDER BY [${blColumns.numBL}]`;
      console.log('[DocumentsService] BL enrichment query:', blQuery);

      const blResult = await pool.request()
        .input('numFacture', sql.NVarChar, numFacture)
        .query(blQuery);

      const linkedBLs = blResult.recordset;
      console.log('[DocumentsService] Found linked BLs:', linkedBLs.length);

      if (linkedBLs.length === 0) {
        await pool.close();
        return lines;
      }

      // If there's only one BL, assign it to all lines
      if (linkedBLs.length === 1) {
        const bl = linkedBLs[0];
        const dateBL = bl.dateBL ? this.formatDate(bl.dateBL) : undefined;
        await pool.close();
        return lines.map(line => ({
          ...line,
          numBL: String(bl.numBL),
          dateBL,
        }));
      }

      // If multiple BLs, try to match via bl_detail
      const blDetailMapping = await this.dmsMappingService.getMappingConfig('bl_detail');
      if (!blDetailMapping) {
        console.log('[DocumentsService] No bl_detail mapping, assigning first BL to all lines');
        const bl = linkedBLs[0];
        const dateBL = bl.dateBL ? this.formatDate(bl.dateBL) : undefined;
        await pool.close();
        return lines.map(line => ({
          ...line,
          numBL: String(bl.numBL),
          dateBL,
        }));
      }

      const blDetailColumns = blDetailMapping.columns;
      if (!blDetailColumns.numBL || !blDetailColumns.codeArticle) {
        console.log('[DocumentsService] bl_detail mapping missing numBL or codeArticle column');
        await pool.close();
        return lines;
      }

      // Get bl_detail columns
      const detailColsResult = await pool.request()
        .input('tableName', sql.NVarChar, blDetailMapping.tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`);

      const detailActualColumns = new Set(detailColsResult.recordset.map((r: any) => r.COLUMN_NAME));

      if (!detailActualColumns.has(blDetailColumns.numBL) || !detailActualColumns.has(blDetailColumns.codeArticle)) {
        console.log('[DocumentsService] bl_detail table missing required columns');
        await pool.close();
        return lines;
      }

      // Create a map of code_article -> numBL from bl_detail
      const articleToBLMap = new Map<string, { numBL: string; dateBL?: string }>();

      for (const bl of linkedBLs) {
        const numBL = String(bl.numBL);
        const dateBL = bl.dateBL ? this.formatDate(bl.dateBL) : undefined;

        const detailQuery = `SELECT [${blDetailColumns.codeArticle}] as codeArticle FROM [${blDetailMapping.tableName}] WHERE [${blDetailColumns.numBL}] = @numBL`;
        const detailResult = await pool.request()
          .input('numBL', sql.NVarChar, numBL)
          .query(detailQuery);

        for (const row of detailResult.recordset) {
          const codeArticle = String(row.codeArticle);
          if (!articleToBLMap.has(codeArticle)) {
            articleToBLMap.set(codeArticle, { numBL, dateBL });
          }
        }
      }

      console.log('[DocumentsService] Article to BL map size:', articleToBLMap.size);

      await pool.close();

      // Assign BL info to lines based on codeArticle match
      return lines.map(line => {
        const blInfo = articleToBLMap.get(line.codeArticle);
        if (blInfo) {
          return {
            ...line,
            numBL: blInfo.numBL,
            dateBL: blInfo.dateBL,
          };
        }
        return line;
      });

    } catch (error: any) {
      console.error('[DocumentsService] Error enriching lines with BL info:', error?.message);
      if (pool) await pool.close();
      return lines;
    }
  }

  // Get delivery note detail lines
  async getDeliveryNoteLines(numBL: string): Promise<DocumentLine[]> {
    console.log('[DocumentsService] ========== getDeliveryNoteLines START ==========');
    console.log('[DocumentsService] getDeliveryNoteLines called with numBL:', numBL);

    const mapping = await this.dmsMappingService.getMappingConfig('bl_detail');
    if (!mapping) {
      console.log('[DocumentsService] No mapping found for bl_detail');
      return [];
    }

    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) return [];

    try {
      // Get actual columns in the table
      const colsResult = await pool.request()
        .input('tableName', sql.NVarChar, mapping.tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`);

      const actualColumns = new Set(colsResult.recordset.map((r: any) => r.COLUMN_NAME));
      console.log(`[DocumentsService] Actual columns in ${mapping.tableName}:`, Array.from(actualColumns));

      if (actualColumns.size === 0) {
        console.log(`[DocumentsService] ERROR: Table '${mapping.tableName}' does NOT exist or has no columns!`);
        await pool.close();
        return [];
      }

      const columns = mapping.columns;

      // Check if numBL column is mapped and exists (required)
      if (!columns.numBL || !actualColumns.has(columns.numBL)) {
        console.log('[DocumentsService] ERROR: numBL column not mapped or does not exist!');
        await pool.close();
        return [];
      }

      // Build SELECT clause - only include columns that are mapped AND exist in the table
      const selectClauses: string[] = [];
      const validColumns: Record<string, boolean> = {};

      // Helper to add column only if it exists
      const addColumnIfExists = (mappedName: string, alias: string) => {
        if (columns[mappedName] && actualColumns.has(columns[mappedName])) {
          selectClauses.push(`[${columns[mappedName]}] as ${alias}`);
          validColumns[mappedName] = true;
        } else if (columns[mappedName]) {
          console.log(`[DocumentsService] Column ${mappedName} mapped to '${columns[mappedName]}' but does NOT exist in table - will be calculated`);
          validColumns[mappedName] = false;
        }
      };

      addColumnIfExists('numLigne', 'numLigne');
      addColumnIfExists('codeArticle', 'codeArticle');
      addColumnIfExists('designation', 'designation');
      addColumnIfExists('quantite', 'quantite');
      addColumnIfExists('prixUnitaire', 'prixUnitaire');
      addColumnIfExists('remise', 'remise');
      addColumnIfExists('tauxTVA', 'tauxTVA');
      addColumnIfExists('montantHT', 'montantHT');
      addColumnIfExists('montantTTC', 'montantTTC');

      if (selectClauses.length === 0) {
        console.log('[DocumentsService] No valid columns mapped, returning empty');
        await pool.close();
        return [];
      }

      // Build ORDER BY clause - use numLigne if mapped AND exists, otherwise no specific order
      const orderByClause = validColumns.numLigne ? `ORDER BY [${columns.numLigne}]` : '';

      const query = `SELECT ${selectClauses.join(', ')} FROM [${mapping.tableName}] WHERE [${columns.numBL}] = @numBL ${orderByClause}`;
      console.log('[DocumentsService] Executing query:', query);

      const result = await pool.request()
        .input('numBL', sql.NVarChar, numBL)
        .query(query);

      console.log('[DocumentsService] Result count:', result.recordset.length);
      await pool.close();

      // Map results and calculate missing fields
      return result.recordset.map((row: any, index: number) => {
        const quantite = parseFloat(row.quantite) || 0;
        const prixUnitaire = parseFloat(row.prixUnitaire) || 0;
        const remise = parseFloat(row.remise) || 0;
        const tauxTVA = row.tauxTVA !== undefined && row.tauxTVA !== null ? parseFloat(row.tauxTVA) : 0;

        // Calculate montantHT if not mapped or column doesn't exist
        let montantHT: number;
        if (validColumns.montantHT && row.montantHT !== undefined && row.montantHT !== null) {
          montantHT = parseFloat(row.montantHT) || 0;
        } else {
          montantHT = quantite * prixUnitaire * (1 - remise / 100);
        }

        // Calculate montantTTC if not mapped or column doesn't exist
        let montantTTC: number;
        if (validColumns.montantTTC && row.montantTTC !== undefined && row.montantTTC !== null) {
          montantTTC = parseFloat(row.montantTTC) || 0;
        } else {
          montantTTC = montantHT * (1 + tauxTVA / 100);
        }

        // Use numLigne if mapped and exists, otherwise auto-increment
        const numLigne = validColumns.numLigne && row.numLigne !== undefined ? parseInt(row.numLigne) : index + 1;

        return {
          numLigne,
          codeArticle: row.codeArticle || '',
          designation: row.designation || '',
          quantite,
          prixUnitaire,
          remise,
          tauxTVA: tauxTVA || undefined,
          montantHT,
          montantTTC,
        };
      });
    } catch (error: any) {
      console.error('[DocumentsService] ========== ERROR fetching BL lines ==========');
      console.error('[DocumentsService] Error message:', error?.message);
      if (pool) await pool.close();
      return [];
    }
  }

  // Get invoice header by numFacture
  async getInvoiceHeader(numFacture: string): Promise<DocumentHeader | null> {
    const mapping = await this.dmsMappingService.getMappingConfig('factures_entete');
    if (!mapping) return null;

    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) return null;

    try {
      const columns = mapping.columns;
      const selectClauses: string[] = [];

      if (columns.numFacture) selectClauses.push(`[${columns.numFacture}] as numFacture`);
      if (columns.dateFacture) selectClauses.push(`[${columns.dateFacture}] as dateFacture`);
      if (columns.codeClient) selectClauses.push(`[${columns.codeClient}] as codeClient`);
      if (columns.totalHT) selectClauses.push(`[${columns.totalHT}] as totalHT`);
      if (columns.totalTVA) selectClauses.push(`[${columns.totalTVA}] as totalTVA`);
      if (columns.totalTTC) selectClauses.push(`[${columns.totalTTC}] as totalTTC`);
      if (columns.observation) selectClauses.push(`[${columns.observation}] as observation`);

      if (selectClauses.length === 0 || !columns.numFacture) {
        await pool.close();
        return null;
      }

      const query = `SELECT TOP 1 ${selectClauses.join(', ')} FROM [${mapping.tableName}] WHERE [${columns.numFacture}] = @numFacture`;

      const result = await pool.request()
        .input('numFacture', sql.NVarChar, numFacture)
        .query(query);

      await pool.close();

      if (result.recordset.length === 0) return null;

      const row = result.recordset[0];
      const codeClient = row.codeClient || '';

      // Get client name (raisonSociale) from clients table
      const companyName = await this.getClientName(codeClient);

      return {
        id: String(row.numFacture),
        dmsRef: String(row.numFacture),
        type: 'INVOICE' as const,
        date: row.dateFacture ? this.formatDate(row.dateFacture) : '',
        codeClient,
        companyName: companyName || undefined,
        totalHT: parseFloat(row.totalHT) || 0,
        totalTVA: row.totalTVA !== undefined && row.totalTVA !== null ? parseFloat(row.totalTVA) : undefined,
        totalTTC: parseFloat(row.totalTTC) || 0,
        observation: row.observation || '',
      };
    } catch (error) {
      console.error('Error fetching invoice header:', error);
      if (pool) await pool.close();
      return null;
    }
  }

  // Get invoice with lines
  async getInvoiceWithLines(numFacture: string, dmsClientCode?: string): Promise<DocumentWithLines | null> {
    // Get header directly by numFacture instead of searching in list
    const invoice = await this.getInvoiceHeader(numFacture);
    if (!invoice) return null;

    // Verify client code if provided (security check)
    if (dmsClientCode && invoice.codeClient !== dmsClientCode) {
      console.log(`[DocumentsService] Client code mismatch: expected ${dmsClientCode}, got ${invoice.codeClient}`);
      return null;
    }

    const lines = await this.getInvoiceLines(numFacture);
    console.log(`[DocumentsService] getInvoiceWithLines: Found ${lines.length} lines for invoice ${numFacture}`);
    return { ...invoice, lines };
  }

  // Get delivery note header by numBL
  async getDeliveryNoteHeader(numBL: string): Promise<DocumentHeader | null> {
    const mapping = await this.dmsMappingService.getMappingConfig('bl_entete');
    if (!mapping) return null;

    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) return null;

    try {
      const columns = mapping.columns;
      const selectClauses: string[] = [];

      if (columns.numBL) selectClauses.push(`[${columns.numBL}] as numBL`);
      if (columns.dateBL) selectClauses.push(`[${columns.dateBL}] as dateBL`);
      if (columns.codeClient) selectClauses.push(`[${columns.codeClient}] as codeClient`);
      if (columns.totalHT) selectClauses.push(`[${columns.totalHT}] as totalHT`);
      if (columns.totalTTC) selectClauses.push(`[${columns.totalTTC}] as totalTTC`);
      if (columns.observation) selectClauses.push(`[${columns.observation}] as observation`);

      if (selectClauses.length === 0 || !columns.numBL) {
        await pool.close();
        return null;
      }

      const query = `SELECT TOP 1 ${selectClauses.join(', ')} FROM [${mapping.tableName}] WHERE [${columns.numBL}] = @numBL`;

      const result = await pool.request()
        .input('numBL', sql.NVarChar, numBL)
        .query(query);

      await pool.close();

      if (result.recordset.length === 0) return null;

      const row = result.recordset[0];
      const codeClient = row.codeClient || '';

      // Get client name (raisonSociale) from clients table
      const companyName = await this.getClientName(codeClient);

      return {
        id: String(row.numBL),
        dmsRef: String(row.numBL),
        type: 'BL' as const,
        date: row.dateBL ? this.formatDate(row.dateBL) : '',
        codeClient,
        companyName: companyName || undefined,
        totalHT: parseFloat(row.totalHT) || 0,
        totalTTC: parseFloat(row.totalTTC) || 0,
        observation: row.observation || '',
      };
    } catch (error) {
      console.error('Error fetching delivery note header:', error);
      if (pool) await pool.close();
      return null;
    }
  }

  // Get delivery note with lines
  async getDeliveryNoteWithLines(numBL: string, dmsClientCode?: string): Promise<DocumentWithLines | null> {
    // Get header directly by numBL instead of searching in list
    const bl = await this.getDeliveryNoteHeader(numBL);
    if (!bl) return null;

    // Verify client code if provided (security check)
    if (dmsClientCode && bl.codeClient !== dmsClientCode) {
      console.log(`[DocumentsService] Client code mismatch for BL: expected ${dmsClientCode}, got ${bl.codeClient}`);
      return null;
    }

    const lines = await this.getDeliveryNoteLines(numBL);
    console.log(`[DocumentsService] getDeliveryNoteWithLines: Found ${lines.length} lines for BL ${numBL}`);
    return { ...bl, lines };
  }

  // Get client name (raisonSociale) from clients table
  private async getClientName(codeClient: string): Promise<string | null> {
    if (!codeClient) return null;

    const mapping = await this.dmsMappingService.getMappingConfig('clients');
    if (!mapping) {
      console.log('[DocumentsService] No clients mapping found');
      return null;
    }

    const pool = await this.appConfigService.getSqlConnection();
    if (!pool) return null;

    try {
      const columns = mapping.columns;

      if (!columns.codeClient || !columns.raisonSociale) {
        console.log('[DocumentsService] clients mapping missing codeClient or raisonSociale column');
        await pool.close();
        return null;
      }

      // Get actual columns in the table to verify they exist
      const colsResult = await pool.request()
        .input('tableName', sql.NVarChar, mapping.tableName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`);

      const actualColumns = new Set(colsResult.recordset.map((r: any) => r.COLUMN_NAME));

      if (!actualColumns.has(columns.codeClient) || !actualColumns.has(columns.raisonSociale)) {
        console.log('[DocumentsService] clients table missing required columns');
        await pool.close();
        return null;
      }

      const query = `SELECT TOP 1 [${columns.raisonSociale}] as raisonSociale FROM [${mapping.tableName}] WHERE [${columns.codeClient}] = @codeClient`;
      console.log('[DocumentsService] getClientName query:', query, 'codeClient:', codeClient);

      const result = await pool.request()
        .input('codeClient', sql.NVarChar, codeClient)
        .query(query);

      await pool.close();

      if (result.recordset.length === 0) {
        console.log('[DocumentsService] No client found for codeClient:', codeClient);
        return null;
      }

      const raisonSociale = result.recordset[0].raisonSociale;
      console.log('[DocumentsService] Found raisonSociale:', raisonSociale);
      return raisonSociale || null;
    } catch (error: any) {
      console.error('[DocumentsService] Error fetching client name:', error?.message);
      if (pool) await pool.close();
      return null;
    }
  }

  private formatDate(date: any): string {
    if (!date) return '';
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    if (typeof date === 'string') {
      // Try to parse and format
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
      return date;
    }
    return String(date);
  }
}
