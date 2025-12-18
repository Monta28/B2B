import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: fs.existsSync(envPath) ? envPath : undefined });

async function runMigration() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '123456789',
    database: process.env.DB_DATABASE || 'mecacomm_b2b',
  });

  await dataSource.initialize();
  console.log('Connected to database');

  const queries = [
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS favicon_url VARCHAR(500)`,
    `ALTER TABLE app_config ALTER COLUMN logo_url TYPE TEXT`,
    `ALTER TABLE app_config ALTER COLUMN favicon_url TYPE TEXT`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS accent_hover_color VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS accent_dark_color VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS dark_brand_950 VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS dark_brand_900 VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS dark_brand_800 VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS light_brand_950 VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS light_brand_900 VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS light_brand_800 VARCHAR(20)`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS theme_variables_json TEXT`,
  ];

  for (const query of queries) {
    try {
      await dataSource.query(query);
      console.log('✓ Executed:', query);
    } catch (err: any) {
      console.error('✗ Error:', err.message);
    }
  }

  await dataSource.destroy();
  console.log('\nMigration completed!');
}

runMigration().catch(console.error);
