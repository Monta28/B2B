
export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN', // Config, Users, Orders, Companies, News, Audit
  FULL_ADMIN = 'FULL_ADMIN', // Same as SYSTEM_ADMIN but NO Config access
  PARTIAL_ADMIN = 'PARTIAL_ADMIN', // Orders only
  CLIENT_ADMIN = 'CLIENT_ADMIN', // Company Users, Orders (Cancel), View
  CLIENT_USER = 'CLIENT_USER' // View only
}

export enum OrderStatus {
  PENDING = 'PENDING',        // En attente de validation Admin
  VALIDATED = 'VALIDATED',    // Validé par Admin -> Envoyé SQL Server
  PREPARATION = 'PREPARATION', // Traitement DMS
  SHIPPED = 'SHIPPED',        // Expédié
  INVOICED = 'INVOICED',      // Facturé
  CANCELLED = 'CANCELLED'     // Annulé
}

export type NewsType = 'INFO' | 'WARNING' | 'PROMO';
export type OrderType = 'STOCK' | 'QUICK';
export type NotificationType = 'ORDER_STATUS' | 'NEW_ORDER' | 'SYSTEM' | 'ALERT';

export interface AuditLog {
  id: string;
  timestamp: string;
  userEmail: string; // Qui a fait l'action
  action: string;    // Code action (LOGIN, ORDER_CREATE, VALIDATE...)
  details: string;   // Description lisible
  ip?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  relatedEntityType?: string; // 'Order', etc.
  relatedEntityId?: string;
  createdAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  type: NewsType;
  date: string;
  isActive: boolean;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  companyId?: string;
  companyName: string;
  dmsClientCode: string;
  role: UserRole;
  isActive?: boolean;
  globalDiscount?: number; // Remise client en %
}

export interface Company {
  id: string;
  name: string;
  dmsClientCode: string;
  siret: string;
  emailContact: string;
  isActive: boolean;
  createdAt: string;
  globalDiscount?: number; // Remise globale en %
}

export interface Product {
  reference: string;
  designation: string;
  brand: string;
  family: string;
  stock: number;
  priceHT: number; // Prix HT (Hors Taxe)
  priceTTC?: number; // Prix TTC calculé
  pricePublic?: number; // Alias pour priceHT (rétrocompatibilité)
  codeOrigine?: string; // Code OEM
  codeTva?: string; // Code TVA (ex: "1", "2", etc.)
  tvaRate?: number; // Taux TVA en % (ex: 19, 7, etc.)
  tauxTVA?: number; // Alias pour tvaRate
  tvaCode?: string; // Alias pour codeTva
}

export interface ClientPrice {
  reference: string;
  netPrice: number;
  discountPercentage: number;
  tvaRate?: number; // Taux TVA en %
  tvaCode?: string; // Code TVA
  publicPrice?: number; // Prix public
}

export interface CartItem extends Product {
  quantity: number;
  clientNetPrice?: number;
  availability?: 'DISPONIBLE' | 'RUPTURE'; // Disponibilité au moment de l'ajout
}

export interface OrderItem {
  id?: string;
  reference: string;
  productRef?: string; // Alias for reference from backend
  designation: string;
  productName?: string; // Alias for designation from backend
  quantity: number;
  unitPrice: number;
  totalLine: number;
  lineTotal?: number; // Alias from backend
  availability?: 'DISPONIBLE' | 'RUPTURE'; // Disponibilité au moment de la commande
  tvaRate?: number; // Taux TVA en %
  location?: string; // Emplacement en stock (Position)
}

export interface OrderDocumentRef {
  type: 'BL' | 'INVOICE';
  ref: string;
  url: string;
}

export interface Order {
  id: string;
  orderNumber?: string; // N° de commande (ex: CMD-20251217-0001)
  orderType: OrderType; // STOCK or QUICK
  dmsRef?: string; // Peut être null si pas encore dans SQL Server
  blNumber?: string; // Numéro du Bon de Livraison
  blDate?: string; // Date du BL
  invoiceNumber?: string; // Numéro de facture
  invoiceDate?: string; // Date de facture
  isEditing?: boolean; // Verrouillage en cours de modification par client
  editingByUserId?: string; // ID de l'utilisateur qui modifie
  editingByUser?: { id: string; fullName: string }; // Utilisateur qui modifie
  editingStartedAt?: string; // Quand la modification a commencé
  date: string;
  createdAt?: string; // Date de création ISO
  lastModifiedAt?: string; // Timestamp ISO for safety cooldown
  status: OrderStatus;
  totalAmount: number;
  totalHt?: number; // Total HT from backend
  itemCount: number;
  companyId?: string;
  companyName?: string;
  userEmail?: string; // Qui a passé la commande
  createdByUser?: { id: string; fullName: string }; // Utilisateur qui a créé la commande
  vehicleInfo?: string; // Info véhicule
  clientNotes?: string; // Notes client
  internalNotes?: string; // Notes internes (admin)
  items?: OrderItem[]; // Détail des lignes
  documents?: OrderDocumentRef[]; // Liens directs
}

export interface Document {
  id: string;
  dmsRef: string;
  type: 'BL' | 'INVOICE';
  date: string;
  amount: number;
  totalHT: number;
  totalTTC: number;
  numFacture?: string; // For BL: linked invoice number (undefined if not invoiced)
  downloadUrl: string;
}

export interface SqlServerConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  encrypted: boolean;
  syncInterval: number;
}

export interface AppConfig {
  currencySymbol: string;
  decimalPlaces: number;
  validationCooldownSeconds: number; // Delay before admin can validate
  brandLogos: string[]; // List of base64 or URL images for header marquee
  weatherLocation?: string; // City for weather widget
  catalogLoadMode?: 'auto' | 'search'; // 'auto' = load on page load, 'search' = require search
  dmsSyncInterval?: number; // DMS sync interval in minutes (0 = disabled)

  // Branding / Theme (optional)
  companyName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  accentHoverColor?: string;
  accentDarkColor?: string;
  darkBrand950?: string;
  darkBrand900?: string;
  darkBrand800?: string;
  lightBrand950?: string;
  lightBrand900?: string;
  lightBrand800?: string;
  themeVariablesJson?: string;
   fontFamily?: string;
   borderRadiusStyle?: string;

  // Company details for documents (invoices, BL, etc.)
  companyLegalName?: string; // Raison sociale
  companyAddress?: string;
  companyPostalCode?: string;
  companyCity?: string;
  companyCountry?: string;
  companyPhone?: string;
  companyFax?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyTaxId?: string; // Matricule fiscale
  companyRegistration?: string; // Registre de commerce
  companyCapital?: string; // Capital social
  companyBankName?: string;
  companyBankRib?: string; // RIB bancaire
  documentLogoUrl?: string; // Logo for documents
  documentFooterText?: string; // Footer text for documents
}
