import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private cartItemRepository: Repository<CartItem>,
  ) {}

  async getCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      cart = this.cartRepository.create({
        userId,
        items: [],
      });
      await this.cartRepository.save(cart);
    }

    return cart;
  }

  async addItem(userId: string, addItemDto: AddCartItemDto): Promise<Cart> {
    const cart = await this.getCart(userId);

    // Check if item already exists in cart
    const existingItem = cart.items.find((item) => item.productRef === addItemDto.productRef);

    if (existingItem) {
      // Update quantity
      existingItem.quantity += addItemDto.quantity;
      existingItem.lineTotal = existingItem.quantity * existingItem.unitPrice * (1 - (existingItem.discountPercent || 0) / 100);
      await this.cartItemRepository.save(existingItem);
    } else {
      // Add new item
      const lineTotal = addItemDto.quantity * addItemDto.unitPrice * (1 - (addItemDto.discountPercent || 0) / 100);
      const newItem = this.cartItemRepository.create({
        cartId: cart.id,
        productRef: addItemDto.productRef,
        productName: addItemDto.productName,
        quantity: addItemDto.quantity,
        unitPrice: addItemDto.unitPrice,
        discountPercent: addItemDto.discountPercent || 0,
        lineTotal,
      });
      await this.cartItemRepository.save(newItem);
    }

    // Update cart total
    await this.updateCartTotal(cart.id);

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, updateItemDto: UpdateCartItemDto): Promise<Cart> {
    const cart = await this.getCart(userId);
    const item = cart.items.find((i) => i.id === itemId);

    if (!item) {
      throw new NotFoundException('Article non trouvé dans le panier');
    }

    item.quantity = updateItemDto.quantity;
    item.lineTotal = item.quantity * item.unitPrice * (1 - (item.discountPercent || 0) / 100);
    await this.cartItemRepository.save(item);

    // Update cart total
    await this.updateCartTotal(cart.id);

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<Cart> {
    const cart = await this.getCart(userId);
    const item = cart.items.find((i) => i.id === itemId);

    if (!item) {
      throw new NotFoundException('Article non trouvé dans le panier');
    }

    await this.cartItemRepository.remove(item);

    // Update cart total
    await this.updateCartTotal(cart.id);

    return this.getCart(userId);
  }

  async clearCart(userId: string): Promise<{ message: string }> {
    const cart = await this.getCart(userId);

    await this.cartItemRepository.delete({ cartId: cart.id });
    cart.totalHt = 0;
    await this.cartRepository.save(cart);

    return { message: 'Panier vidé avec succès' };
  }

  private async updateCartTotal(cartId: string): Promise<void> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: ['items'],
    });

    if (cart) {
      cart.totalHt = cart.items.reduce((sum, item) => sum + item.lineTotal, 0);
      await this.cartRepository.save(cart);
    }
  }
}
