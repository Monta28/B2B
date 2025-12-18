const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '123456789',
  database: 'mecacomm_b2b'
});

const migrations = [
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20) DEFAULT '#64748b'",
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) DEFAULT '#06b6d4'",
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS dark_mode_bg VARCHAR(20) DEFAULT '#1A1F2E'",
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS light_mode_bg VARCHAR(20) DEFAULT '#F5F3EF'",
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS login_bg_image VARCHAR(1000)",
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS login_bg_gradient VARCHAR(500)",
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS font_family VARCHAR(100) DEFAULT 'Inter'",
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS border_radius_style VARCHAR(20) DEFAULT 'rounded'",
  "ALTER TABLE app_config ADD COLUMN IF NOT EXISTS favicon_url VARCHAR(500)"
];

async function runMigrations() {
  try {
    await client.connect();
    console.log('Connected to database');

    for (const sql of migrations) {
      try {
        await client.query(sql);
        console.log('OK:', sql.substring(0, 60) + '...');
      } catch (err) {
        console.log('Skip (already exists or error):', err.message);
      }
    }

    console.log('\nMigration completed successfully!');
  } catch (err) {
    console.error('Connection error:', err.message);
  } finally {
    await client.end();
  }
}

runMigrations();
