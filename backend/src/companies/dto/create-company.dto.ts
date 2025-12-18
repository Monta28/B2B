import { IsNotEmpty, IsOptional, IsEmail, IsNumber, Min, Max } from 'class-validator';

export class CreateCompanyDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  dmsClientCode: string;

  @IsOptional()
  siret?: string;

  @IsOptional()
  address?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  @IsEmail()
  emailContact?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  globalDiscount?: number;
}

export class UpdateCompanyDto {
  @IsOptional()
  name?: string;

  @IsOptional()
  dmsClientCode?: string;

  @IsOptional()
  siret?: string;

  @IsOptional()
  address?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  @IsEmail()
  emailContact?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  globalDiscount?: number;

  @IsOptional()
  isActive?: boolean;
}
