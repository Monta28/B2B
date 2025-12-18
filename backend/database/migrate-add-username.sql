-- =============================================
-- Migration: Ajouter la colonne username à la table users
-- Date: 2025-12-12
-- Description: Permet la connexion par username en plus de l'email
-- =============================================

-- Ajouter la colonne username (nullable et unique)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Créer l'index sur username
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Rendre dms_client_code nullable (était requis avant)
ALTER TABLE users ALTER COLUMN dms_client_code DROP NOT NULL;

-- Message de confirmation
SELECT 'Migration terminée: colonne username ajoutée avec succès!' AS message;
