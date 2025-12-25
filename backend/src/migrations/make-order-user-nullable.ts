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
    // Make created_by_user_id nullable
    `ALTER TABLE orders ALTER COLUMN created_by_user_id DROP NOT NULL`,

    // Drop existing foreign key constraint on created_by_user_id (if exists)
    `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'FK_orders_created_by_user'
                 AND table_name = 'orders') THEN
        ALTER TABLE orders DROP CONSTRAINT "FK_orders_created_by_user";
      END IF;
    END $$`,

    // Also try dropping with auto-generated constraint name pattern
    `DO $$
    DECLARE
      constraint_name_var TEXT;
    BEGIN
      SELECT tc.constraint_name INTO constraint_name_var
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'orders'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.column_name = 'created_by_user_id'
      LIMIT 1;

      IF constraint_name_var IS NOT NULL THEN
        EXECUTE 'ALTER TABLE orders DROP CONSTRAINT "' || constraint_name_var || '"';
        RAISE NOTICE 'Dropped constraint: %', constraint_name_var;
      END IF;
    END $$`,

    // Add foreign key with ON DELETE SET NULL for created_by_user_id
    `ALTER TABLE orders
     ADD CONSTRAINT "FK_orders_created_by_user"
     FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL`,

    // Drop and recreate constraint for editing_by_user_id with ON DELETE SET NULL
    `DO $$
    DECLARE
      constraint_name_var TEXT;
    BEGIN
      SELECT tc.constraint_name INTO constraint_name_var
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'orders'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.column_name = 'editing_by_user_id'
      LIMIT 1;

      IF constraint_name_var IS NOT NULL THEN
        EXECUTE 'ALTER TABLE orders DROP CONSTRAINT "' || constraint_name_var || '"';
        RAISE NOTICE 'Dropped constraint: %', constraint_name_var;
      END IF;
    END $$`,

    `ALTER TABLE orders
     ADD CONSTRAINT "FK_orders_editing_by_user"
     FOREIGN KEY (editing_by_user_id) REFERENCES users(id) ON DELETE SET NULL`,
  ];

  for (const query of queries) {
    try {
      await dataSource.query(query);
      console.log('✓ Executed successfully');
    } catch (err: any) {
      console.error('✗ Error:', err.message);
    }
  }

  await dataSource.destroy();
  console.log('\nMigration completed!');
}

runMigration().catch(console.error);
