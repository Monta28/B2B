-- Migration: Add extended branding columns to app_config table
-- Run this script on your PostgreSQL database to add the new Identité Visuelle columns

ALTER TABLE app_config ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20) DEFAULT '#64748b';
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) DEFAULT '#06b6d4';
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS dark_mode_bg VARCHAR(20) DEFAULT '#1A1F2E';
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS light_mode_bg VARCHAR(20) DEFAULT '#F5F3EF';
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS login_bg_image VARCHAR(1000);
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS login_bg_gradient VARCHAR(500);
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS font_family VARCHAR(100) DEFAULT 'Inter';
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS border_radius_style VARCHAR(20) DEFAULT 'rounded';
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS favicon_url VARCHAR(500);

-- Verify the changes
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'app_config';
