import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(AuthGuard('jwt'))
export class ProductsController {
  constructor(private productsService: ProductsService) {}

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
  ) {
    return this.productsService.searchProducts(query || '', {
      reference,
      designation,
      codeOrigine,
      category,
      brand,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // Endpoint batch pour récupérer les prix de plusieurs produits en une seule requête
  @Post('prices/batch')
  async getPricesBatch(@Body('references') references: string[]) {
    return this.productsService.getPricesBatch(references || []);
  }

  // Alternative GET pour le batch (avec query string)
  @Get('prices/batch')
  async getPricesBatchGet(@Query('refs') refs: string) {
    const references = refs ? refs.split(',').map(r => r.trim()).filter(r => r) : [];
    return this.productsService.getPricesBatch(references);
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
  async getProductByRef(@Param('reference') reference: string) {
    return this.productsService.getProductByRef(reference);
  }
}
