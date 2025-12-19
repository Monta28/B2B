-- Migration: Ajouter la colonne dms_sync_interval à app_config
-- Date: 2024-12-19

-- Ajouter la colonne pour l'intervalle de synchronisation DMS (en minutes)
ALTER TABLE app_config
ADD COLUMN IF NOT EXISTS dms_sync_interval INTEGER DEFAULT 5;

-- Message de confirmation
SELECT 'Migration terminée: colonne dms_sync_interval ajoutée à la table app_config' AS message;
