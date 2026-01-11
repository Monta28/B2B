import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  UseGuards,
  Request,
  Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(AuthGuard('jwt'))
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  private getClientIp(req: any, ip: string): string {
    return req.headers['x-forwarded-for']?.split(',')[0] || ip;
  }

  @Get('search')
  async searchProducts(
    @Query('q') query: string,
    @Query('ref') reference?: string,
    @Query('desig') designation?: string,
    @Query('origine') codeOrigine?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Request() req?: any,
    @Ip() ip?: string,
  ) {
    const result = await this.productsService.searchProducts(query || '', {
      reference,
      designation,
      codeOrigine,
      category,
      brand,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    // Log search asynchronously - only first page (offset=0) to avoid spam
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (req?.user?.id && offsetNum === 0) {
      const searchQuery = query || [reference, designation, codeOrigine].filter(Boolean).join(' | ');
      if (searchQuery) {
        this.productsService.logProductConsultation(
          req.user.id,
          'SEARCH_PRODUCTS',
          {
            query: searchQuery,
            filters: { reference, designation, codeOrigine, category, brand },
            resultsCount: result.total,
          },
          this.getClientIp(req, ip || ''),
        );
      }
    }

    return result;
  }

  // Endpoint batch pour récupérer les prix de plusieurs produits en une seule requête
  @Post('prices/batch')
  async getPricesBatch(
    @Body('references') references: string[],
    @Request() req?: any,
    @Ip() ip?: string,
  ) {
    const result = await this.productsService.getPricesBatch(references || []);

    // Log price check asynchronously
    if (req?.user?.id && references && references.length > 0) {
      this.productsService.logProductConsultation(
        req.user.id,
        'CHECK_PRICES',
        {
          references,
          count: references.length,
        },
        this.getClientIp(req, ip || ''),
      );
    }

    return result;
  }

  // Alternative GET pour le batch (avec query string)
  @Get('prices/batch')
  async getPricesBatchGet(
    @Query('refs') refs: string,
    @Request() req?: any,
    @Ip() ip?: string,
  ) {
    const references = refs ? refs.split(',').map(r => r.trim()).filter(r => r) : [];
    const result = await this.productsService.getPricesBatch(references);

    // Log price check asynchronously
    if (req?.user?.id && references.length > 0) {
      this.productsService.logProductConsultation(
        req.user.id,
        'CHECK_PRICES',
        {
          references,
          count: references.length,
        },
        this.getClientIp(req, ip || ''),
      );
    }

    return result;
  }

  @Get('categories')
  async getCategories() {
    return this.productsService.getCategories();
  }

  @Get('brands')
  async getBrands() {
    return this.productsService.getBrands();
  }

  @Get('check-connection')
  async checkConnection() {
    return this.productsService.checkConnection();
  }

  @Get(':reference')
  async getProductByRef(
    @Param('reference') reference: string,
    @Request() req?: any,
    @Ip() ip?: string,
  ) {
    const result = await this.productsService.getProductByRef(reference);

    // Log product view asynchronously
    if (req?.user?.id && result) {
      this.productsService.logProductConsultation(
        req.user.id,
        'VIEW_PRODUCT',
        {
          reference,
          productName: result.name,
        },
        this.getClientIp(req, ip || ''),
      );
    }

    return result;
  }
}
