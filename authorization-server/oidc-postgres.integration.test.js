"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

const { createPostgresOidcAdapter } = require("./postgres-oidc-adapter");
const { createOidcHandoffService } = require("./oidc-handoff-service");

test("OIDC migration, persistence adapter, and handoff work against isolated PostgreSQL", async (t) => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  t.after(async () => db.close());

  const migration = await readFile(
    path.join(__dirname, "sql", "002-oidc-provider-state.sql"),
    "utf8",
  );
  await db.exec(migration);

  const query = async (sql, params = []) => {
    const result = await db.query(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = {
    query,
    async connect() {
      return { query, release() {} };
    },
  };

  const Adapter = createPostgresOidcAdapter(pool);
  const Session = new Adapter("Session");
  const AccessToken = new Adapter("AccessToken");
  await Session.upsert("session-one", { uid: "user-one", accountId: "acct-one" }, 60);
  assert.deepEqual(await Session.find("session-one"), { uid: "user-one", accountId: "acct-one" });
  assert.deepEqual(await Session.findByUid("user-one"), { uid: "user-one", accountId: "acct-one" });
  await Session.upsert("session-one", { uid: "user-two" }, 60);
  assert.deepEqual(await Session.findByUid("user-one"), undefined);
  assert.deepEqual(await Session.findByUid("user-two"), { uid: "user-two" });

  await AccessToken.upsert("token-one", { grantId: "grant-one", scope: "openid" }, 60);
  await AccessToken.revokeByGrantId("grant-one");
  assert.equal(await AccessToken.find("token-one"), undefined);

  const service = createOidcHandoffService({
    pool,
    authenticateAppwriteJwt: async (jwt) => jwt === "test-jwt" ? {
      verified: true,
      subject: "spark-user-123",
      email: "test@example.com",
      emailVerified: true,
      name: "Test User",
    } : null,
  });
  const request = await service.create({
    interactionUid: "interaction-one",
    clientId: "spark-studio",
    clientName: "Spark Studio",
    redirectUri: "https://studio.example.com/oidc/callback",
    scopes: ["openid", "profile", "email"],
  });
  assert.equal((await service.details(request.ticket)).clientName, "Spark Studio");
  assert.equal(await service.status("interaction-one"), "pending");
  await service.approve({ ticket: request.ticket, appwriteJwt: "test-jwt" });
  assert.equal(await service.status("interaction-one"), "approved");
  assert.deepEqual(await service.approvedIdentity("interaction-one"), {
    subject: "spark-user-123",
    email: "test@example.com",
    emailVerified: true,
    name: "Test User",
    scopes: ["openid", "profile", "email"],
  });
  assert.equal(await service.details(request.ticket), null, "approved tickets cannot be reused");
});
