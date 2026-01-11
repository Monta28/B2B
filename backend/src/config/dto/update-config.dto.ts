import { IsOptional, IsNumber, Min, Max, IsString, IsArray } from 'class-validator';

export class UpdateAppConfigDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  faviconUrl?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  accentHoverColor?: string;

  @IsOptional()
  @IsString()
  accentDarkColor?: string;

  @IsOptional()
  @IsString()
  darkBrand950?: string;

  @IsOptional()
  @IsString()
  darkBrand900?: string;

  @IsOptional()
  @IsString()
  darkBrand800?: string;

  @IsOptional()
  @IsString()
  lightBrand950?: string;

  @IsOptional()
  @IsString()
  lightBrand900?: string;

  @IsOptional()
  @IsString()
  lightBrand800?: string;

  @IsOptional()
  @IsString()
  themeVariablesJson?: string; // JSON string: { \"--var\": \"value\" }

  @IsOptional()
  @IsString()
  fontFamily?: string;

  @IsOptional()
  @IsString()
  borderRadiusStyle?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultDiscount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  orderCooldownMinutes?: number;

  // Display settings
  @IsOptional()
  @IsString()
  currencySymbol?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  decimalPlaces?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  validationCooldownSeconds?: number;

  @IsOptional()
  @IsArray()
  brandLogos?: string[];

  @IsOptional()
  @IsString()
  weatherCity?: string;

  @IsOptional()
  @IsString()
  weatherCountry?: string;

  // SQL Server connection
  @IsOptional()
  @IsString()
  sqlServerHost?: string;

  @IsOptional()
  @IsNumber()
  sqlServerPort?: number;

  @IsOptional()
  @IsString()
  sqlServerUser?: string;

  @IsOptional()
  @IsString()
  sqlServerPassword?: string;

  @IsOptional()
  @IsString()
  sqlServerDatabase?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1440) // Max 24 hours
  dmsSyncInterval?: number; // DMS sync interval in minutes (0 = disabled)

  @IsOptional()
  @IsString()
  catalogLoadMode?: string; // 'auto' or 'search'

  // Company details for documents
  @IsOptional()
  @IsString()
  companyLegalName?: string; // Raison sociale

  @IsOptional()
  @IsString()
  companyAddress?: string;

  @IsOptional()
  @IsString()
  companyPostalCode?: string;

  @IsOptional()
  @IsString()
  companyCity?: string;

  @IsOptional()
  @IsString()
  companyCountry?: string;

  @IsOptional()
  @IsString()
  companyPhone?: string;

  @IsOptional()
  @IsString()
  companyFax?: string;

  @IsOptional()
  @IsString()
  companyEmail?: string;

  @IsOptional()
  @IsString()
  companyWebsite?: string;

  @IsOptional()
  @IsString()
  companyTaxId?: string; // Matricule fiscale

  @IsOptional()
  @IsString()
  companyRegistration?: string; // Registre de commerce

  @IsOptional()
  @IsString()
  companyCapital?: string; // Capital social

  @IsOptional()
  @IsString()
  companyBankName?: string;

  @IsOptional()
  @IsString()
  companyBankRib?: string; // RIB bancaire

  @IsOptional()
  @IsString()
  documentLogoUrl?: string; // Logo for documents

  @IsOptional()
  @IsString()
  documentFooterText?: string; // Footer text for documents

  // B2B Efficiency settings
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  ordersPerCommercialPerDay?: number; // Nombre moyen de commandes par commercial par jour
}

export class TestSqlConnectionDto {
  @IsString()
  host: string;

  @IsNumber()
  port: number;

  @IsString()
  user: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsString()
  database: string;
}
