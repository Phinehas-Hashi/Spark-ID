"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

function validEnvironment(overrides = {}) {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signingKey = { ...privateKey.export({ format: "jwk" }), kid: "staging-test-key", alg: "RS256", use: "sig" };
  return {
    SPARK_ID_OIDC_ENVIRONMENT: "staging",
    SPARK_ID_OIDC_ENABLE_STAGING: "true",
    SPARK_ID_OIDC_STAGING_DB_HOST: "staging-db.example.test",
    SPARK_ID_OIDC_STAGING_DB_NAME: "sparkid_staging",
    DATABASE_URL: "postgresql://test_user:test_password@staging-db.example.test/sparkid_staging?sslmode=require",
    SPARK_ID_OIDC_ISSUER: "https://auth.example.test",
    SPARK_ID_OIDC_CLIENT_ID: "spark_studio_staging",
    SPARK_ID_OIDC_CLIENT_SECRET: "test-client-secret-that-is-long-enough-123",
    SPARK_ID_OIDC_REDIRECT_URIS: JSON.stringify(["https://studio.example.test/auth/v1/callback"]),
    SPARK_ID_OIDC_JWKS: JSON.stringify({ keys: [signingKey] }),
    SPARK_ID_OIDC_COOKIE_KEYS: JSON.stringify([crypto.randomBytes(32).toString("base64url")]),
    APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
    APPWRITE_PROJECT_ID: "appwrite-staging-project",
    SPARK_ID_OIDC_TRUSTED_PROXY: "true",
    PORT: "10000",
    ...overrides,
  };
}

test("staging startup requires explicit enablement and exact isolated database allowlist", async () => {
  const { loadStagingConfig } = await import("./oidc-staging.mjs");
  assert.throws(() => loadStagingConfig(validEnvironment({ SPARK_ID_OIDC_ENABLE_STAGING: "false" })), /explicitly enabled/);
  assert.throws(() => loadStagingConfig(validEnvironment({ SPARK_ID_OIDC_ENVIRONMENT: "production" })), /explicitly enabled/);
  assert.throws(() => loadStagingConfig(validEnvironment({
    DATABASE_URL: "postgresql://user:password@other-db.example.test/sparkid_staging?sslmode=require",
  })), /allowed staging database/);
  assert.throws(() => loadStagingConfig(validEnvironment({
    DATABASE_URL: "postgresql://user:password@staging-db.example.test/production?sslmode=require",
  })), /allowed staging database/);
  assert.throws(() => loadStagingConfig(validEnvironment({
    DATABASE_URL: "postgresql://user:password@staging-db.example.test/sparkid_staging?sslmode=disable",
  })), /sslmode.*must be require/);
});

test("staging configuration accepts an explicitly matched TLS database and emits no defaults", async () => {
  const { loadStagingConfig } = await import("./oidc-staging.mjs");
  const config = loadStagingConfig(validEnvironment());
  assert.equal(config.database.databaseName, "sparkid_staging");
  assert.equal(config.config.issuer, "https://auth.example.test");
  assert.equal(config.config.trustedProxy, true);
  assert.equal(config.port, 10000);
});

test("staging configuration requires TLS for Render's generated internal database URL", async () => {
  const { loadStagingConfig } = await import("./oidc-staging.mjs");
  const config = loadStagingConfig(validEnvironment({
    DATABASE_URL: "postgresql://test_user:test_password@staging-db.example.test/sparkid_staging",
  }));
  const url = new URL(config.database.connectionString);
  assert.equal(url.searchParams.get("sslmode"), "require");
});
