// Script to run username migration
const { Client } = require('pg');
require('dotenv').config({ path: '../.env' });

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_DATABASE || 'mecacomm_b2b',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '123456789',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if username column exists
    const checkColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'username'
    `);

    if (checkColumn.rows.length === 0) {
      console.log('Adding username column...');
      await client.query(`ALTER TABLE users ADD COLUMN username VARCHAR(50) UNIQUE`);
      console.log('Username column added');
    } else {
      console.log('Username column already exists');
    }

    // Check if index exists
    const checkIndex = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'idx_users_username'
    `);

    if (checkIndex.rows.length === 0) {
      console.log('Creating index on username...');
      await client.query(`CREATE INDEX idx_users_username ON users(username)`);
      console.log('Index created');
    } else {
      console.log('Index already exists');
    }

    // Make dms_client_code nullable (check current state first)
    const checkNullable = await client.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'dms_client_code'
    `);

    if (checkNullable.rows.length > 0 && checkNullable.rows[0].is_nullable === 'NO') {
      console.log('Making dms_client_code nullable...');
      await client.query(`ALTER TABLE users ALTER COLUMN dms_client_code DROP NOT NULL`);
      console.log('dms_client_code is now nullable');
    } else {
      console.log('dms_client_code is already nullable');
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
