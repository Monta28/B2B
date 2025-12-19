-- Migration: Ajouter la colonne company_legal_name à app_config
-- Date: 2024-12-19

-- Ajouter la colonne pour la raison sociale
ALTER TABLE app_config
ADD COLUMN IF NOT EXISTS company_legal_name VARCHAR(255);

-- Message de confirmation
SELECT 'Migration terminée: colonne company_legal_name ajoutée à la table app_config' AS message;
