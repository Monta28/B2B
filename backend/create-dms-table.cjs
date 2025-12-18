const { Client } = require('pg');

async function createDmsMappingsTable() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '123456789',
    database: 'mecacomm_b2b'
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Create the dms_mappings table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS dms_mappings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          mapping_type VARCHAR(50) NOT NULL,
          dms_table_name VARCHAR(255) NOT NULL,
          column_mappings TEXT NOT NULL,
          filter_clause TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await client.query(createTableSQL);
    console.log('dms_mappings table created successfully!');

    // Create index
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_dms_mappings_type ON dms_mappings(mapping_type);
    `;
    await client.query(createIndexSQL);
    console.log('Index created successfully!');

    // Verify table exists
    const verifySQL = `SELECT COUNT(*) as count FROM dms_mappings;`;
    const result = await client.query(verifySQL);
    console.log('Table verified, current row count:', result.rows[0].count);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
    console.log('Connection closed');
  }
}

createDmsMappingsTable();
