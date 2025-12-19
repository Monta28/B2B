import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('app_config')
export class AppConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_name', length: 255, default: 'MECACOMM' })
  companyName: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string;

  @Column({ name: 'favicon_url', type: 'text', nullable: true })
  faviconUrl: string;

  @Column({ name: 'primary_color', length: 20, default: '#1976d2' })
  primaryColor: string;

  @Column({ name: 'accent_color', length: 20, nullable: true })
  accentColor: string;

  @Column({ name: 'accent_hover_color', length: 20, nullable: true })
  accentHoverColor: string;

  @Column({ name: 'accent_dark_color', length: 20, nullable: true })
  accentDarkColor: string;

  // Theme palette (optional overrides)
  @Column({ name: 'dark_brand_950', length: 20, nullable: true })
  darkBrand950: string;

  @Column({ name: 'dark_brand_900', length: 20, nullable: true })
  darkBrand900: string;

  @Column({ name: 'dark_brand_800', length: 20, nullable: true })
  darkBrand800: string;

  @Column({ name: 'light_brand_950', length: 20, nullable: true })
  lightBrand950: string;

  @Column({ name: 'light_brand_900', length: 20, nullable: true })
  lightBrand900: string;

  @Column({ name: 'light_brand_800', length: 20, nullable: true })
  lightBrand800: string;

  @Column({ name: 'theme_variables_json', type: 'text', nullable: true })
  themeVariablesJson: string; // JSON string: { \"--var\": \"value\" }

  @Column({ name: 'font_family', length: 100, nullable: true })
  fontFamily: string;

  @Column({ name: 'border_radius_style', length: 50, nullable: true })
  borderRadiusStyle: string;

  @Column({ name: 'default_discount', type: 'numeric', precision: 5, scale: 2, default: 0 })
  defaultDiscount: number;

  @Column({ name: 'order_cooldown_minutes', default: 30 })
  orderCooldownMinutes: number;

  // Display settings
  @Column({ name: 'currency_symbol', length: 10, default: 'TND' })
  currencySymbol: string;

  @Column({ name: 'decimal_places', default: 3 })
  decimalPlaces: number;

  @Column({ name: 'validation_cooldown_seconds', default: 30 })
  validationCooldownSeconds: number;

  @Column({ name: 'brand_logos', type: 'text', nullable: true })
  brandLogos: string; // JSON string array of base64 logos

  @Column({ name: 'weather_city', length: 100, default: 'Tunis' })
  weatherCity: string;

  @Column({ name: 'weather_country', length: 10, default: 'TN' })
  weatherCountry: string;

  // SQL Server DMS Configuration
  @Column({ name: 'sql_server_host', length: 255, nullable: true })
  sqlServerHost: string;

  @Column({ name: 'sql_server_port', default: 1433 })
  sqlServerPort: number;

  @Column({ name: 'sql_server_user', length: 255, nullable: true })
  sqlServerUser: string;

  @Column({ name: 'sql_server_password', length: 255, nullable: true })
  sqlServerPassword: string;

  @Column({ name: 'sql_server_database', length: 255, nullable: true })
  sqlServerDatabase: string;

  // DMS Sync interval in minutes (0 = disabled)
  @Column({ name: 'dms_sync_interval', default: 5 })
  dmsSyncInterval: number;

  // Catalog behavior: 'auto' = load products on page load, 'search' = require search
  @Column({ name: 'catalog_load_mode', length: 20, default: 'auto' })
  catalogLoadMode: string;

  // Company details for documents (invoices, BL, etc.)
  @Column({ name: 'company_legal_name', length: 255, nullable: true })
  companyLegalName: string; // Raison sociale

  @Column({ name: 'company_address', length: 255, nullable: true })
  companyAddress: string;

  @Column({ name: 'company_postal_code', length: 20, nullable: true })
  companyPostalCode: string;

  @Column({ name: 'company_city', length: 100, nullable: true })
  companyCity: string;

  @Column({ name: 'company_country', length: 100, nullable: true })
  companyCountry: string;

  @Column({ name: 'company_phone', length: 50, nullable: true })
  companyPhone: string;

  @Column({ name: 'company_fax', length: 50, nullable: true })
  companyFax: string;

  @Column({ name: 'company_email', length: 255, nullable: true })
  companyEmail: string;

  @Column({ name: 'company_website', length: 255, nullable: true })
  companyWebsite: string;

  @Column({ name: 'company_tax_id', length: 100, nullable: true })
  companyTaxId: string; // Matricule fiscale

  @Column({ name: 'company_registration', length: 100, nullable: true })
  companyRegistration: string; // Registre de commerce

  @Column({ name: 'company_capital', length: 100, nullable: true })
  companyCapital: string; // Capital social

  @Column({ name: 'company_bank_name', length: 255, nullable: true })
  companyBankName: string;

  @Column({ name: 'company_bank_rib', length: 100, nullable: true })
  companyBankRib: string; // RIB bancaire

  @Column({ name: 'document_logo_url', type: 'text', nullable: true })
  documentLogoUrl: string; // Logo spécifique pour documents (peut être différent du logo site)

  @Column({ name: 'document_footer_text', type: 'text', nullable: true })
  documentFooterText: string; // Texte de pied de page pour documents

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
