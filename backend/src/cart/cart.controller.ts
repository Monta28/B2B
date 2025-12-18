import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@Controller('cart')
@UseGuards(AuthGuard('jwt'))
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  async getCart(@Request() req) {
    return this.cartService.getCart(req.user.id);
  }

  @Post('items')
  async addItem(@Body() addItemDto: AddCartItemDto, @Request() req) {
    return this.cartService.addItem(req.user.id, addItemDto);
  }

  @Put('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateCartItemDto,
    @Request() req,
  ) {
    return this.cartService.updateItem(req.user.id, id, updateItemDto);
  }

  @Delete('items/:id')
  async removeItem(@Param('id') id: string, @Request() req) {
    return this.cartService.removeItem(req.user.id, id);
  }

  @Delete()
  async clearCart(@Request() req) {
    return this.cartService.clearCart(req.user.id);
  }
}
