import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Company } from '../entities/company.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';
import { AppConfigService } from '../config/app-config.service';

// Interface for DMS Client data
export interface DmsClient {
  codeClient: string;
  raisonSociale: string;
  codeTva: string;
  telephone: string;
  email: string;
  tauxRemise: number;
}

// DTO for bulk import
export interface ImportClientDto {
  codeClient: string;
  raisonSociale: string;
  codeTva: string;
  telephone: string;
  email: string;
  tauxRemise: number;
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private appConfigService: AppConfigService,
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

  async create(createCompanyDto: CreateCompanyDto, currentUserId: string): Promise<Company> {
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
    });

    return savedCompany;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, currentUserId: string): Promise<Company> {
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
    await this.logAuditAction(currentUserId, 'UPDATE_COMPANY', 'Company', savedCompany.id, updateCompanyDto);

    return savedCompany;
  }

  async toggleStatus(id: string, currentUserId: string): Promise<Company> {
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
    );

    return savedCompany;
  }

  async remove(id: string, currentUserId: string): Promise<{ message: string }> {
    const company = await this.findOne(id);

    // Check if company has linked users
    if (company.users && company.users.length > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce client. ${company.users.length} utilisateur(s) est/sont lié(s) à cette entreprise. Veuillez d'abord supprimer ou réaffecter ces utilisateurs.`
      );
    }

    await this.companyRepository.remove(company);

    // Audit log
    await this.logAuditAction(currentUserId, 'DELETE_COMPANY', 'Company', id, { name: company.name });

    return { message: 'Entreprise supprimée avec succès' };
  }

  // Get clients from DMS SQL Server
  async getDmsClients(): Promise<{ success: boolean; clients?: DmsClient[]; message?: string }> {
    const pool = await this.appConfigService.getSqlConnection();

    if (!pool) {
      return {
        success: false,
        message: 'Connexion SQL Server non configurée. Veuillez configurer la connexion dans les paramètres.',
      };
    }

    try {
      // Query to get clients from DMS - using actual MGSS_CommDB schema
      const result = await pool.request().query(`
        SELECT
          RTRIM(LTRIM(ISNULL(Code_Client, ''))) as codeClient,
          RTRIM(LTRIM(ISNULL(Raison_Social, ''))) as raisonSociale,
          RTRIM(LTRIM(ISNULL(Code_Tva, ''))) as codeTva,
          RTRIM(LTRIM(ISNULL(Telephone, ''))) as telephone,
          RTRIM(LTRIM(ISNULL(Mail, ''))) as email,
          ISNULL(Remise, 0) as tauxRemise
        FROM Clients
        WHERE Code_Client IS NOT NULL AND Code_Client != ''
        ORDER BY Raison_Social
      `);

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
  async importClients(clients: ImportClientDto[], currentUserId: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    // Get existing DMS codes
    const existingCodes = await this.companyRepository.find({
      select: ['dmsClientCode'],
    });
    const existingCodeSet = new Set(existingCodes.map(c => c.dmsClientCode));

    for (const client of clients) {
      try {
        // Skip if already exists
        if (existingCodeSet.has(client.codeClient)) {
          skipped++;
          continue;
        }

        // Create company
        const company = this.companyRepository.create({
          name: client.raisonSociale,
          dmsClientCode: client.codeClient,
          siret: client.codeTva,
          phone: client.telephone,
          emailContact: client.email,
          globalDiscount: client.tauxRemise,
          isActive: true,
        });

        const savedCompany = await this.companyRepository.save(company);
        existingCodeSet.add(client.codeClient);

        // Audit log
        await this.logAuditAction(currentUserId, 'IMPORT_COMPANY', 'Company', savedCompany.id, {
          name: savedCompany.name,
          dmsClientCode: savedCompany.dmsClientCode,
          source: 'DMS_IMPORT',
        });

        imported++;
      } catch (error: any) {
        errors.push(`${client.codeClient}: ${error.message}`);
      }
    }

    return { imported, skipped, errors };
  }

  // Bulk delete companies
  async bulkDelete(ids: string[], currentUserId: string): Promise<{ deleted: number; skipped: number; errors: string[] }> {
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
        await this.logAuditAction(currentUserId, 'DELETE_COMPANY', 'Company', id, { name: company.name, source: 'BULK_DELETE' });

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
  ) {
    const auditLog = this.auditLogRepository.create({
      userId,
      action,
      entityType,
      entityId,
      details,
    });
    await this.auditLogRepository.save(auditLog);
  }
}
