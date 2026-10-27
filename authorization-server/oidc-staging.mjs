import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createSparkOidcServer, parseJsonSecret } from './oidc-server.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { createAppwriteAuthenticator } = require('./appwrite-auth.js');

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value.trim();
}

function parseDatabaseUrl(env) {
  const raw = required(env, 'DATABASE_URL');
  let url;
  try { url = new URL(raw); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password ||
      url.searchParams.get('sslmode') !== 'require') {
    throw new Error('DATABASE_URL must require PostgreSQL TLS with sslmode=require');
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const expectedHost = required(env, 'SPARK_ID_OIDC_STAGING_DB_HOST').toLowerCase();
  const expectedDatabase = required(env, 'SPARK_ID_OIDC_STAGING_DB_NAME');
  if (url.hostname.toLowerCase() !== expectedHost || databaseName !== expectedDatabase ||
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) {
    throw new Error('DATABASE_URL does not match the explicitly allowed staging database');
  }
  return { raw, databaseName };
}

export function loadStagingConfig(env = process.env) {
  if (required(env, 'SPARK_ID_OIDC_ENVIRONMENT') !== 'staging' ||
      required(env, 'SPARK_ID_OIDC_ENABLE_STAGING') !== 'true') {
    throw new Error('OIDC startup is disabled unless staging is explicitly enabled');
  }

  const database = parseDatabaseUrl(env);
  const issuer = required(env, 'SPARK_ID_OIDC_ISSUER');
  const clientId = required(env, 'SPARK_ID_OIDC_CLIENT_ID');
  const clientSecret = required(env, 'SPARK_ID_OIDC_CLIENT_SECRET');
  const redirectUris = parseJsonSecret(required(env, 'SPARK_ID_OIDC_REDIRECT_URIS'), 'Spark Studio redirect URIs');
  const jwks = parseJsonSecret(required(env, 'SPARK_ID_OIDC_JWKS'), 'OIDC signing keys');
  const cookieKeys = parseJsonSecret(required(env, 'SPARK_ID_OIDC_COOKIE_KEYS'), 'OIDC cookie keys');
  const appwriteEndpoint = required(env, 'APPWRITE_ENDPOINT');
  const appwriteProjectId = required(env, 'APPWRITE_PROJECT_ID');
  const trustedProxyText = required(env, 'SPARK_ID_OIDC_TRUSTED_PROXY');
  if (!['true', 'false'].includes(trustedProxyText)) {
    throw new Error('SPARK_ID_OIDC_TRUSTED_PROXY must be true or false');
  }
  const portText = env.PORT ?? '10000';
  if (!/^\d{1,5}$/.test(String(portText))) throw new Error('PORT must be a valid TCP port');
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535');

  return Object.freeze({
    database,
    port,
    config: {
      issuer,
      client: { client_id: clientId, client_secret: clientSecret, redirect_uris: redirectUris },
      jwks,
      cookieKeys,
      trustedProxy: trustedProxyText === 'true',
    },
    appwrite: { endpoint: appwriteEndpoint, projectId: appwriteProjectId },
  });
}

export async function startStagingServer(env = process.env, dependencies = {}) {
  const settings = loadStagingConfig(env);
  const PoolClass = dependencies.Pool ?? Pool;
  const pool = new PoolClass({
    connectionString: settings.database.raw,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: false,
  });

  try {
    const databaseCheck = await pool.query('SELECT current_database() AS name');
    if (databaseCheck.rows.length !== 1 || databaseCheck.rows[0].name !== settings.database.databaseName) {
      throw new Error('Connected database does not match the configured staging database');
    }
    // A deployment must apply the migration explicitly before startup. Never
    // run schema changes automatically against a configured database.
    await pool.query(`SELECT 1 FROM oidc_provider_state, spark_oidc_accounts, oidc_login_handoffs LIMIT 0`);

    const authenticateAppwriteJwt = (dependencies.createAppwriteAuthenticator ?? createAppwriteAuthenticator)({
      endpoint: settings.appwrite.endpoint,
      projectId: settings.appwrite.projectId,
      includeProfile: true,
    });
    const oidc = await createSparkOidcServer({
      ...settings.config,
      pool,
      authenticateAppwriteJwt,
    });
    await new Promise((resolve, reject) => {
      oidc.server.once('error', reject);
      oidc.server.listen(settings.port, '0.0.0.0', resolve);
    });

    let stopping;
    const close = () => {
      if (!stopping) {
        stopping = new Promise((resolve) => {
          if (!oidc.server.listening) return resolve();
          oidc.server.close(() => resolve());
        }).then(() => pool.end());
      }
      return stopping;
    };
    return Object.freeze({ ...oidc, close, port: settings.port });
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  startStagingServer().then(({ close, port }) => {
    process.stdout.write(`Spark ID staging OIDC server is listening on port ${port}.\n`);
    const shutdown = () => { void close().finally(() => process.exit(0)); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }).catch(() => {
    process.stderr.write('Spark ID staging OIDC server did not start. Check staging configuration and database readiness. No secret values were logged.\n');
    process.exitCode = 1;
  });
}
