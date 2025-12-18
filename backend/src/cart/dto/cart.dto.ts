import { IsNotEmpty, IsNumber, Min, IsOptional } from 'class-validator';

export class AddCartItemDto {
  @IsNotEmpty()
  productRef: string;

  @IsNotEmpty()
  productName: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;
}

export class UpdateCartItemDto {
  @IsNumber()
  @Min(1)
  quantity: number;
}
