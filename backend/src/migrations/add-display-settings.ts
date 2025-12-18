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
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(10) DEFAULT 'TND'`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS decimal_places INTEGER DEFAULT 3`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS validation_cooldown_seconds INTEGER DEFAULT 30`,
    `ALTER TABLE app_config ADD COLUMN IF NOT EXISTS brand_logos TEXT`,
  ];

  for (const query of queries) {
    try {
      await dataSource.query(query);
      console.log('✓ Executed:', query.substring(0, 70) + '...');
    } catch (err: any) {
      console.error('✗ Error:', err.message);
    }
  }

  await dataSource.destroy();
  console.log('\nMigration completed!');
}

runMigration().catch(console.error);
