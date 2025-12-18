const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '123456789',
};

async function setup() {
  console.log('🚀 Configuration de la base de données...');

  // Connect to postgres database to create mecacomm_b2b
  const adminClient = new Client({
    ...config,
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    console.log('✅ Connecté à PostgreSQL');

    // Check if database exists
    const dbCheck = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'mecacomm_b2b'"
    );

    if (dbCheck.rows.length > 0) {
      console.log('⚠️  Suppression de l\'ancienne base de données...');
      // Terminate all connections to the database
      await adminClient.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = 'mecacomm_b2b' AND pid <> pg_backend_pid()
      `);
      await adminClient.query('DROP DATABASE mecacomm_b2b');
      console.log('✅ Ancienne base supprimée');
    }

    console.log('📦 Création de la base de données mecacomm_b2b...');
    await adminClient.query('CREATE DATABASE mecacomm_b2b');
    console.log('✅ Base de données créée');

    await adminClient.end();

    // Connect to mecacomm_b2b to run init script
    const dbClient = new Client({
      ...config,
      database: 'mecacomm_b2b',
    });

    await dbClient.connect();
    console.log('✅ Connecté à mecacomm_b2b');

    // Read and execute init.sql
    const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    console.log('📄 Exécution du script init.sql...');

    await dbClient.query(initSql);
    console.log('✅ Script init.sql exécuté avec succès');

    await dbClient.end();
    console.log('\n🎉 Configuration terminée!');
    console.log('Vous pouvez maintenant lancer: npm run seed');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

setup();
