"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const tableNames = ["oidc_provider_state", "spark_oidc_accounts", "oidc_login_handoffs"];

function environment(overrides = {}) {
  return {
    SPARK_ID_OIDC_ENVIRONMENT: "staging",
    SPARK_ID_OIDC_ENABLE_STAGING: "true",
    SPARK_ID_OIDC_STAGING_DB_HOST: "staging-db.example.test",
    SPARK_ID_OIDC_STAGING_DB_NAME: "sparkid_staging",
    DATABASE_URL: "postgresql://test_user:test_password@staging-db.example.test/sparkid_staging",
    SPARK_ID_OIDC_ALLOW_STAGING_MIGRATION: "true",
    ...overrides,
  };
}

function fakePool(existingTables = []) {
  const calls = [];
  let migrationRan = false;
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("current_database()")) return { rows: [{ name: "sparkid_staging", schema: "public" }] };
      if (sql.includes("information_schema.tables")) {
        return { rows: (migrationRan ? tableNames : existingTables).map((table_name) => ({ table_name })) };
      }
      if (sql.startsWith("CREATE TABLE")) migrationRan = true;
      return { rows: [] };
    },
    async end() { calls.push({ sql: "end" }); },
  };
}

test("staging migration refuses production or mismatched database targets before connecting", async () => {
  const { migrateStagingDatabase } = await import("./migrate-staging.mjs");
  let constructed = false;
  const dependencies = { Pool: class { constructor() { constructed = true; } } };
  await assert.rejects(migrateStagingDatabase(environment({ SPARK_ID_OIDC_ENVIRONMENT: "production" }), dependencies), /only when OIDC staging/);
  await assert.rejects(migrateStagingDatabase(environment({ DATABASE_URL: "postgresql://u:p@other-db.test/sparkid_staging" }), dependencies), /allowed staging database/);
  assert.equal(constructed, false);
});

test("staging migration requires TLS and does not need reapply authorization when complete", async () => {
  const { migrateStagingDatabase } = await import("./migrate-staging.mjs");
  const pool = fakePool(tableNames);
  class Pool { constructor(options) {
    assert.equal(new URL(options.connectionString).searchParams.has("sslmode"), false);
    assert.deepEqual(options.ssl, { rejectUnauthorized: false });
    return pool;
  } }
  const result = await migrateStagingDatabase(environment({ SPARK_ID_OIDC_ALLOW_STAGING_MIGRATION: "false" }), { Pool });
  assert.equal(result, "already-applied");
  assert.equal(pool.calls.at(-1).sql, "end");
});

test("staging migration applies atomically only with explicit authorization", async () => {
  const { migrateStagingDatabase } = await import("./migrate-staging.mjs");
  const pool = fakePool();
  class Pool { constructor() { return pool; } }
  const result = await migrateStagingDatabase(environment(), { Pool, sql: "CREATE TABLE test_fixture (id integer);" });
  assert.equal(result, "applied");
  assert.deepEqual(pool.calls.filter((call) => ["BEGIN", "COMMIT"].includes(call.sql)).map((call) => call.sql), ["BEGIN", "COMMIT"]);
  assert.equal(pool.calls.some((call) => call.sql === "CREATE TABLE test_fixture (id integer);"), true);
});

test("staging migration refuses partial schemas", async () => {
  const { migrateStagingDatabase } = await import("./migrate-staging.mjs");
  const pool = fakePool([tableNames[0]]);
  class Pool { constructor() { return pool; } }
  await assert.rejects(migrateStagingDatabase(environment(), { Pool }), /partial OIDC schema/);
  assert.equal(pool.calls.some((call) => call.sql === "BEGIN"), false);
});
