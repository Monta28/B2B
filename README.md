# Architecture Technique & Spécifications - AutoPart B2B

Ce document détaille l'architecture complète, le schéma de base de données et la stratégie d'intégration demandés.

## 1. Architecture Technique Globale

### Diagramme Logique

```mermaid
graph TD
    Client[Navigateur Client (React SPA)] -->|HTTPS / JSON| NestLB[Load Balancer / Reverse Proxy]
    NestLB --> NestApp[Backend NestJS API]
    
    subgraph "Zone Cloud / DMZ"
        NestApp
        Postgres[(PostgreSQL - Données Plateforme)]
        Redis[(Redis - Cache Session/Data)]
    end
    
    subgraph "Zone Interne (LAN/VPN)"
        NestApp -->|VPN Tunnel / Secure Link| SQLServer[(SQL Server - DMS Existant)]
        SQLServer -->|Export PDF| FileServer[Serveur de Fichiers (BL/Factures)]
        NestApp -->|SMB/S3| FileServer
    end
    
    NestApp -->|Auth & User Data| Postgres
    NestApp -->|Read Catalog/Stock/Prices| SQLServer
    NestApp -->|Write Web Orders| SQLServer
```

### Modules NestJS

1.  **AuthModule**: Gestion JWT, Refresh Token, Hashing (Argon2).
2.  **UsersModule**: Gestion des utilisateurs plateforme (Postgres).
3.  **CompaniesModule**: Gestion des liaisons entre User Web et Code Client DMS.
4.  **CatalogModule**: (Lecture SQL Server) Recherche articles, familles, marques.
5.  **PricingModule**: (Lecture SQL Server) Calcul du prix net selon règles DMS.
6.  **StockModule**: (Lecture SQL Server) Disponibilité temps réel.
7.  **OrdersModule**:
    *   *Write*: Insertion dans table tampon SQL Server `WEB_ORDERS`.
    *   *Read*: Lecture historique depuis tables DMS `ENT_CDE`.
8.  **DocumentsModule**: Accès sécurisé aux PDFs (BL/Factures).

---

## 2. Schéma de Données PostgreSQL (Plateforme)

Cette base gère l'accès web et le panier. Les données "métier" (Articles, Clients) restent dans SQL Server.

```sql
-- Table: Entreprises (Liaison Web -> DMS)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL, -- Nom d'affichage web
    dms_client_code VARCHAR(50) NOT NULL UNIQUE, -- Clé de jointure vers SQL Server
    siret VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table: Utilisateurs
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN_CLIENT', 'USER_CLIENT')),
    full_name VARCHAR(100),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Table: Paniers (Persistance temporaire)
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Table: Lignes de Panier
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
    product_ref VARCHAR(50) NOT NULL, -- Référence article (SQL Server)
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(cart_id, product_ref)
);

-- Table: Traceur de Commandes Web
CREATE TABLE web_order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    company_id UUID REFERENCES companies(id),
    dms_order_ref VARCHAR(50), -- Référence retournée par SQL Server après insertion
    total_amount DECIMAL(10, 2),
    status VARCHAR(50), -- 'PENDING_DMS', 'INTEGRATED', 'ERROR'
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 3. Stratégie d'Intégration SQL Server

### A. Lecture Temps Réel (Stock & Prix)
Ne pas synchroniser ces données. Utiliser des **Vues SQL Server** optimisées pour la lecture.

*   **Vue Articles**: `V_WEB_ARTICLES` (Ref, Label, Famille, Marque, EAN).
*   **Vue Stock**: `V_WEB_STOCK` (Ref, Depot, QteDispo, QteReserve).
*   **Procédure Prix**: `sp_GetNetPrice(@ClientCode, @ArticleRef, @Qty)`
    *   C'est impératif d'utiliser la logique du DMS (cascade de remises, prix nets, promos). Ne pas recoder la logique de prix en Node.js.

### B. Écriture des Commandes (Strategy: Staging Tables)
Créer des tables tampons dans SQL Server pour découpler le Web du Core DMS.

1.  **Table**: `WEB_IMPORT_HEAD` (ID, ClientCode, Date, RefCommandeWeb, Commentaire)
2.  **Table**: `WEB_IMPORT_LINES` (HeadID, ArticleRef, Qty)
3.  **Processus**:
    *   NestJS insère dans ces tables.
    *   Un Job SQL Server ou un Service Windows du DMS scanne ces tables toutes les minutes et crée les vraies commandes.
    *   Avantage : Si le DMS bloque une commande (en-cours dépassé), l'erreur est gérée côté DMS et remontée via un statut.

---

## 4. Contract API (NestJS)

| Verb | Endpoint | Description | Body / Params |
| :--- | :--- | :--- | :--- |
| **Auth** | | | |
| POST | `/auth/login` | Connexion | `{email, password}` |
| **Catalog** | | | |
| GET | `/products` | Recherche (SQL) | `?q=filter&page=1` |
| GET | `/products/:ref` | Détail + Stock (SQL) | - |
| GET | `/products/:ref/price` | Prix Client (Proc SQL) | - |
| **Orders** | | | |
| POST | `/orders` | Créer commande | `{cartItems: []}` |
| GET | `/orders` | Historique (SQL) | `?status=OPEN` |
| **Docs** | | | |
| GET | `/documents/invoices` | Liste Factures (SQL) | `?year=2024` |
| GET | `/documents/:id/pdf` | Stream PDF | - |
