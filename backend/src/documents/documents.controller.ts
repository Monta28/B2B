import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { DocumentsService } from './documents.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
  ) {}

  // Get all documents (admin sees all, clients see their own)
  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async findAll(@Req() req: any) {
    const user = req.user;
    const isAdmin = user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.FULL_ADMIN || user.role === UserRole.PARTIAL_ADMIN;

    if (isAdmin) {
      // Admin sees all documents
      const documents = await this.documentsService.getAllDocuments();
      // Enrich with company names
      return this.enrichWithCompanyNames(documents);
    } else {
      // Client sees only their documents
      const dmsClientCode = user.dmsClientCode;
      if (!dmsClientCode) {
        return [];
      }
      const documents = await this.documentsService.getAllDocuments(dmsClientCode);
      return documents;
    }
  }

  // Get only invoices
  @Get('invoices')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getInvoices(@Req() req: any) {
    const user = req.user;
    const isAdmin = user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.FULL_ADMIN || user.role === UserRole.PARTIAL_ADMIN;

    if (isAdmin) {
      const invoices = await this.documentsService.getInvoices();
      return this.enrichWithCompanyNames(invoices);
    } else {
      const dmsClientCode = user.dmsClientCode;
      if (!dmsClientCode) {
        return [];
      }
      return this.documentsService.getInvoices(dmsClientCode);
    }
  }

  // Get only delivery notes (BL)
  @Get('delivery-notes')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getDeliveryNotes(@Req() req: any) {
    const user = req.user;
    const isAdmin = user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.FULL_ADMIN || user.role === UserRole.PARTIAL_ADMIN;

    if (isAdmin) {
      const deliveryNotes = await this.documentsService.getDeliveryNotes();
      return this.enrichWithCompanyNames(deliveryNotes);
    } else {
      const dmsClientCode = user.dmsClientCode;
      if (!dmsClientCode) {
        return [];
      }
      return this.documentsService.getDeliveryNotes(dmsClientCode);
    }
  }

  // Get invoice with lines
  @Get('invoices/:numFacture')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getInvoiceDetail(@Param('numFacture') numFacture: string, @Req() req: any) {
    const user = req.user;
    const isAdmin = user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.FULL_ADMIN || user.role === UserRole.PARTIAL_ADMIN;

    if (isAdmin) {
      return this.documentsService.getInvoiceWithLines(numFacture);
    } else {
      const dmsClientCode = user.dmsClientCode;
      if (!dmsClientCode) {
        return null;
      }
      return this.documentsService.getInvoiceWithLines(numFacture, dmsClientCode);
    }
  }

  // Get delivery note with lines
  @Get('delivery-notes/:numBL')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getDeliveryNoteDetail(@Param('numBL') numBL: string, @Req() req: any) {
    const user = req.user;
    const isAdmin = user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.FULL_ADMIN || user.role === UserRole.PARTIAL_ADMIN;

    if (isAdmin) {
      return this.documentsService.getDeliveryNoteWithLines(numBL);
    } else {
      const dmsClientCode = user.dmsClientCode;
      if (!dmsClientCode) {
        return null;
      }
      return this.documentsService.getDeliveryNoteWithLines(numBL, dmsClientCode);
    }
  }

  // Helper to enrich documents with company names from local database
  private async enrichWithCompanyNames(documents: any[]): Promise<any[]> {
    if (documents.length === 0) return documents;

    // Get unique client codes
    const clientCodes = [...new Set(documents.map(d => d.codeClient).filter(Boolean))];

    if (clientCodes.length === 0) return documents;

    // Fetch companies by DMS client codes
    const companies = await this.companyRepository
      .createQueryBuilder('company')
      .where('company.dmsClientCode IN (:...codes)', { codes: clientCodes })
      .getMany();

    // Create a map for quick lookup
    const companyMap = new Map<string, string>();
    companies.forEach(c => companyMap.set(c.dmsClientCode, c.name));

    // Enrich documents
    return documents.map(doc => ({
      ...doc,
      companyName: companyMap.get(doc.codeClient) || doc.codeClient,
    }));
  }
}
