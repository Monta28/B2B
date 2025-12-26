import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Company } from '../entities/company.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';
import { AppConfigService } from '../config/app-config.service';
import { DmsMappingService } from '../dms-mapping/dms-mapping.service';

// Interface for DMS Client data
export interface DmsClient {
  codeClient: string;
  raisonSociale: string;
  codeTva: string;
  telephone: string;
  email: string;
  tauxRemise: number;
  typeRemise: number;
  tauxMajoration: number | null; // Taux de majoration (si typeRemise = 2 ou 4)
}

// DTO for bulk import
export interface ImportClientDto {
  codeClient: string;
  raisonSociale: string;
  codeTva: string;
  telephone: string;
  email: string;
  tauxRemise: number;
  typeRemise: number;
  tauxMajoration: number | null;
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private appConfigService: AppConfigService,
    private dmsMappingService: DmsMappingService,
  ) {}

  async findAll(): Promise<Company[]> {
    return this.companyRepository.find({
      relations: ['users'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée');
    }

    return company;
  }

  async findByDmsCode(dmsClientCode: string): Promise<Company | null> {
    return this.companyRepository.findOne({
      where: { dmsClientCode },
    });
  }

  async create(createCompanyDto: CreateCompanyDto, currentUserId: string, ipAddress?: string): Promise<Company> {
    // Check if DMS code already exists
    const existingCompany = await this.findByDmsCode(createCompanyDto.dmsClientCode);

    if (existingCompany) {
      throw new ConflictException('Une entreprise avec ce code DMS existe déjà');
    }

    const company = this.companyRepository.create(createCompanyDto);
    const savedCompany = await this.companyRepository.save(company);

    // Audit log
    await this.logAuditAction(currentUserId, 'CREATE_COMPANY', 'Company', savedCompany.id, {
      name: savedCompany.name,
      dmsClientCode: savedCompany.dmsClientCode,
    }, ipAddress);

    return savedCompany;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, currentUserId: string, ipAddress?: string): Promise<Company> {
    const company = await this.findOne(id);

    // Check DMS code conflict
    if (updateCompanyDto.dmsClientCode && updateCompanyDto.dmsClientCode !== company.dmsClientCode) {
      const existingCompany = await this.findByDmsCode(updateCompanyDto.dmsClientCode);

      if (existingCompany) {
        throw new ConflictException('Une entreprise avec ce code DMS existe déjà');
      }
    }

    Object.assign(company, updateCompanyDto);
    const savedCompany = await this.companyRepository.save(company);

    // Audit log
    await this.logAuditAction(currentUserId, 'UPDATE_COMPANY', 'Company', savedCompany.id, updateCompanyDto, ipAddress);

    return savedCompany;
  }

  async toggleStatus(id: string, currentUserId: string, ipAddress?: string): Promise<Company> {
    const company = await this.findOne(id);
    company.isActive = !company.isActive;

    const savedCompany = await this.companyRepository.save(company);

    // Audit log
    await this.logAuditAction(
      currentUserId,
      company.isActive ? 'ACTIVATE_COMPANY' : 'DEACTIVATE_COMPANY',
      'Company',
      savedCompany.id,
      null,
      ipAddress,
    );

    return savedCompany;
  }

  async remove(id: string, currentUserId: string, ipAddress?: string): Promise<{ message: string }> {
    const company = await this.findOne(id);

    // Check if company has linked users
    if (company.users && company.users.length > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce client. ${company.users.length} utilisateur(s) est/sont lié(s) à cette entreprise. Veuillez d'abord supprimer ou réaffecter ces utilisateurs.`
      );
    }

    await this.companyRepository.remove(company);

    // Audit log
    await this.logAuditAction(currentUserId, 'DELETE_COMPANY', 'Company', id, { name: company.name }, ipAddress);

    return { message: 'Entreprise supprimée avec succès' };
  }

  // Get clients from DMS SQL Server using configured DMS mappings
  async getDmsClients(): Promise<{ success: boolean; clients?: DmsClient[]; message?: string }> {
    const pool = await this.appConfigService.getSqlConnection();

    if (!pool) {
      return {
        success: false,
        message: 'Connexion SQL Server non configurée. Veuillez configurer la connexion dans les paramètres.',
      };
    }

    try {
      // Get DMS mapping configuration for clients and majoration tables
      const clientsMapping = await this.dmsMappingService.getMappingConfig('clients');
      const majorationMapping = await this.dmsMappingService.getMappingConfig('majoration');

      if (!clientsMapping) {
        await pool.close();
        return {
          success: false,
          message: 'Configuration de mapping clients non trouvée.',
        };
      }

      // Get column names from user's configuration
      const clientTable = clientsMapping.tableName;
      const cols = clientsMapping.columns;

      const codeClientCol = cols.codeClient || 'Code_Client';
      const raisonSocialeCol = cols.raisonSociale || 'Raison_Social';
      const codeTvaCol = cols.codeTva || 'Code_Tva';
      const telephoneCol = cols.telephone || 'Telephone';
      const emailCol = cols.email || 'Mail';
      const tauxRemiseCol = cols.tauxRemise || 'Remise';
      const typeRemiseCol = cols.typeRemise || 'Type_Remise';
      const tauxMajorationCol = cols.tauxMajoration || 'Majoration';

      // Majoration table columns (for JOIN)
      let majorationTable = 'Majoration';
      let majorationIdCol = 'ID';
      let majorationTauxCol = 'Taux';

      if (majorationMapping) {
        majorationTable = majorationMapping.tableName;
        majorationIdCol = majorationMapping.columns.id || 'ID';
        majorationTauxCol = majorationMapping.columns.taux || 'Taux';
      }

      let result;

      // Query 1: Full query with Majoration join and Type_Remise column
      const fullQuery = `
        SELECT
          RTRIM(LTRIM(ISNULL(c.[${codeClientCol}], ''))) as codeClient,
          RTRIM(LTRIM(ISNULL(c.[${raisonSocialeCol}], ''))) as raisonSociale,
          RTRIM(LTRIM(ISNULL(c.[${codeTvaCol}], ''))) as codeTva,
          RTRIM(LTRIM(ISNULL(c.[${telephoneCol}], ''))) as telephone,
          RTRIM(LTRIM(ISNULL(c.[${emailCol}], ''))) as email,
          ISNULL(c.[${tauxRemiseCol}], 0) as tauxRemise,
          ISNULL(c.[${typeRemiseCol}], 0) as typeRemise,
          CASE WHEN c.[${typeRemiseCol}] IN (2, 4) THEN m.[${majorationTauxCol}] ELSE NULL END as tauxMajoration
        FROM [${clientTable}] c
        LEFT JOIN [${majorationTable}] m ON c.[${tauxMajorationCol}] = m.[${majorationIdCol}]
        WHERE c.[${codeClientCol}] IS NOT NULL AND c.[${codeClientCol}] != ''
        ORDER BY c.[${raisonSocialeCol}]
      `;

      // Query 2: Without Majoration table but with Type_Remise
      const noMajorationQuery = `
        SELECT
          RTRIM(LTRIM(ISNULL(c.[${codeClientCol}], ''))) as codeClient,
          RTRIM(LTRIM(ISNULL(c.[${raisonSocialeCol}], ''))) as raisonSociale,
          RTRIM(LTRIM(ISNULL(c.[${codeTvaCol}], ''))) as codeTva,
          RTRIM(LTRIM(ISNULL(c.[${telephoneCol}], ''))) as telephone,
          RTRIM(LTRIM(ISNULL(c.[${emailCol}], ''))) as email,
          ISNULL(c.[${tauxRemiseCol}], 0) as tauxRemise,
          ISNULL(c.[${typeRemiseCol}], 0) as typeRemise,
          NULL as tauxMajoration
        FROM [${clientTable}] c
        WHERE c.[${codeClientCol}] IS NOT NULL AND c.[${codeClientCol}] != ''
        ORDER BY c.[${raisonSocialeCol}]
      `;

      // Query 3: Basic query without Type_Remise and Majoration (fallback)
      const basicQuery = `
        SELECT
          RTRIM(LTRIM(ISNULL(c.[${codeClientCol}], ''))) as codeClient,
          RTRIM(LTRIM(ISNULL(c.[${raisonSocialeCol}], ''))) as raisonSociale,
          RTRIM(LTRIM(ISNULL(c.[${codeTvaCol}], ''))) as codeTva,
          RTRIM(LTRIM(ISNULL(c.[${telephoneCol}], ''))) as telephone,
          RTRIM(LTRIM(ISNULL(c.[${emailCol}], ''))) as email,
          ISNULL(c.[${tauxRemiseCol}], 0) as tauxRemise,
          0 as typeRemise,
          NULL as tauxMajoration
        FROM [${clientTable}] c
        WHERE c.[${codeClientCol}] IS NOT NULL AND c.[${codeClientCol}] != ''
        ORDER BY c.[${raisonSocialeCol}]
      `;

      // Try queries in order: full -> no majoration -> basic
      try {
        result = await pool.request().query(fullQuery);
      } catch (err1: any) {
        try {
          result = await pool.request().query(noMajorationQuery);
        } catch (err2: any) {
          // Fall back to basic query without Type_Remise
          result = await pool.request().query(basicQuery);
        }
      }

      await pool.close();

      return {
        success: true,
        clients: result.recordset.map((row: any) => ({
          codeClient: row.codeClient || '',
          raisonSociale: row.raisonSociale || '',
          codeTva: row.codeTva || '',
          telephone: row.telephone || '',
          email: row.email || '',
          tauxRemise: parseInt(row.tauxRemise) || 0,
          typeRemise: parseInt(row.typeRemise) || 0,
          tauxMajoration: row.tauxMajoration !== null ? parseFloat(row.tauxMajoration) : null,
        })),
      };
    } catch (error: any) {
      await pool.close();
      return {
        success: false,
        message: `Erreur lors de la récupération des clients: ${error.message}`,
      };
    }
  }

  // Import multiple clients from DMS
  async importClients(clients: ImportClientDto[], currentUserId: string, ipAddress?: string): Promise<{ imported: number; updated: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    // Get existing companies by DMS code
    const existingCompanies = await this.companyRepository.find({
      select: ['id', 'dmsClientCode', 'typeRemise', 'tauxMajoration', 'globalDiscount'],
    });
    const existingCodeMap = new Map(existingCompanies.map(c => [c.dmsClientCode, c]));

    for (const client of clients) {
      try {
        const existingCompany = existingCodeMap.get(client.codeClient);

        if (existingCompany) {
          // Update existing company with typeRemise and tauxMajoration if changed
          const needsUpdate =
            existingCompany.typeRemise !== client.typeRemise ||
            existingCompany.tauxMajoration !== client.tauxMajoration ||
            existingCompany.globalDiscount !== client.tauxRemise;

          if (needsUpdate) {
            await this.companyRepository.update(existingCompany.id, {
              typeRemise: client.typeRemise,
              tauxMajoration: client.tauxMajoration,
              globalDiscount: client.tauxRemise,
            });

            // Audit log for update
            await this.logAuditAction(currentUserId, 'UPDATE_COMPANY_DMS', 'Company', existingCompany.id, {
              dmsClientCode: client.codeClient,
              typeRemise: client.typeRemise,
              tauxMajoration: client.tauxMajoration,
              globalDiscount: client.tauxRemise,
              source: 'DMS_SYNC',
            }, ipAddress);

            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        // Create new company
        const company = this.companyRepository.create({
          name: client.raisonSociale,
          dmsClientCode: client.codeClient,
          siret: client.codeTva,
          phone: client.telephone,
          emailContact: client.email,
          globalDiscount: client.tauxRemise,
          typeRemise: client.typeRemise,
          tauxMajoration: client.tauxMajoration,
          isActive: true,
        });

        const savedCompany = await this.companyRepository.save(company);
        existingCodeMap.set(client.codeClient, savedCompany);

        // Audit log
        await this.logAuditAction(currentUserId, 'IMPORT_COMPANY', 'Company', savedCompany.id, {
          name: savedCompany.name,
          dmsClientCode: savedCompany.dmsClientCode,
          source: 'DMS_IMPORT',
        }, ipAddress);

        imported++;
      } catch (error: any) {
        errors.push(`${client.codeClient}: ${error.message}`);
      }
    }

    return { imported, updated, skipped, errors };
  }

  // Bulk delete companies
  async bulkDelete(ids: string[], currentUserId: string, ipAddress?: string): Promise<{ deleted: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;
    let skipped = 0;

    for (const id of ids) {
      try {
        const company = await this.companyRepository.findOne({
          where: { id },
          relations: ['users'],
        });

        if (!company) {
          errors.push(`ID ${id}: Entreprise non trouvée`);
          skipped++;
          continue;
        }

        // Check if company has linked users
        if (company.users && company.users.length > 0) {
          errors.push(`${company.name}: ${company.users.length} utilisateur(s) lié(s)`);
          skipped++;
          continue;
        }

        await this.companyRepository.remove(company);

        // Audit log
        await this.logAuditAction(currentUserId, 'DELETE_COMPANY', 'Company', id, { name: company.name, source: 'BULK_DELETE' }, ipAddress);

        deleted++;
      } catch (error: any) {
        errors.push(`ID ${id}: ${error.message}`);
        skipped++;
      }
    }

    return { deleted, skipped, errors };
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
