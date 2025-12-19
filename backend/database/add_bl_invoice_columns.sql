-- Migration: Ajouter les colonnes BL et Facture à la table orders
-- Date: 2024-12-19

-- Ajouter les colonnes pour le numéro de BL et sa date
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS bl_number VARCHAR(100) NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS bl_date TIMESTAMP WITH TIME ZONE NULL;

-- Ajouter les colonnes pour le numéro de facture et sa date
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMP WITH TIME ZONE NULL;

-- Créer des index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_orders_bl_number ON orders(bl_number);
CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders(invoice_number);

-- Message de confirmation
SELECT 'Migration terminée: colonnes bl_number, bl_date, invoice_number, invoice_date ajoutées à la table orders' AS message;
