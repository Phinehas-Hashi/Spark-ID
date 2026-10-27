import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const migrationPath = new URL('./sql/002-oidc-provider-state.sql', import.meta.url);
const expectedTables = ['oidc_provider_state', 'spark_oidc_accounts', 'oidc_login_handoffs'];

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value.trim();
}

function stagingDatabase(env) {
  if (required(env, 'SPARK_ID_OIDC_ENVIRONMENT') !== 'staging' ||
      required(env, 'SPARK_ID_OIDC_ENABLE_STAGING') !== 'true') {
    throw new Error('Migration is allowed only when OIDC staging is explicitly enabled');
  }
  const url = new URL(required(env, 'DATABASE_URL'));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password) {
    throw new Error('DATABASE_URL must be a credentialed PostgreSQL URL');
  }
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode !== null && sslmode !== 'require') throw new Error('DATABASE_URL must use sslmode=require');
  // Render's private Postgres endpoint uses a self-signed certificate. Keep
  // TLS encryption and disable CA validation only after checking the host.
  url.searchParams.delete('sslmode');
  const host = required(env, 'SPARK_ID_OIDC_STAGING_DB_HOST').toLowerCase();
  const databaseName = required(env, 'SPARK_ID_OIDC_STAGING_DB_NAME');
  if (url.hostname.toLowerCase() !== host || decodeURIComponent(url.pathname.slice(1)) !== databaseName ||
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) {
    throw new Error('DATABASE_URL does not match the explicitly allowed staging database');
  }
  return {
    connectionString: url.toString(),
    databaseName,
    ssl: { rejectUnauthorized: false },
  };
}

export async function migrateStagingDatabase(env = process.env, dependencies = {}) {
  const database = stagingDatabase(env);
  const PoolClass = dependencies.Pool ?? Pool;
  const pool = new PoolClass({
    connectionString: database.connectionString,
    ssl: database.ssl,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
  });
  try {
    const identity = await pool.query('SELECT current_database() AS name, current_schema() AS schema');
    if (identity.rows.length !== 1 || identity.rows[0].name !== database.databaseName || identity.rows[0].schema !== 'public') {
      throw new Error('Connected database identity does not match the staging allowlist');
    }
    const existing = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [expectedTables],
    );
    const found = new Set(existing.rows.map((row) => row.table_name));
    if (expectedTables.every((name) => found.has(name))) return 'already-applied';
    if (found.size !== 0) throw new Error('Staging database has a partial OIDC schema; refusing migration');
    if (required(env, 'SPARK_ID_OIDC_ALLOW_STAGING_MIGRATION') !== 'true') {
      throw new Error('Set SPARK_ID_OIDC_ALLOW_STAGING_MIGRATION=true for the first staging migration');
    }
    const sql = dependencies.sql ?? await readFile(fileURLToPath(migrationPath), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      const verification = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [expectedTables],
      );
      const created = new Set(verification.rows.map((row) => row.table_name));
      if (!expectedTables.every((name) => created.has(name))) throw new Error('Migration verification failed');
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK').catch(() => {});
      throw error;
    }
    return 'applied';
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrateStagingDatabase().then((result) => {
    process.stdout.write(`Spark ID staging schema migration ${result}.\n`);
  }).catch(() => {
    process.stderr.write('Spark ID staging schema migration failed. No database credentials were logged.\n');
    process.exitCode = 1;
  });
}
