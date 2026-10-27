"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

function config(overrides = {}) {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signingKey = {
    ...privateKey.export({ format: "jwk" }),
    kid: "local-test-signing-key",
    use: "sig",
    alg: "RS256",
  };
  return {
    issuer: "https://identity.example.test",
    client: {
      client_id: "spark_studio_test_client",
      client_secret: "local-test-client-secret-value-long-enough",
      redirect_uris: ["https://project.supabase.co/auth/v1/callback"],
    },
    jwks: { keys: [signingKey] },
    cookieKeys: [crypto.randomBytes(32).toString("base64url")],
    pool: { query: async () => ({ rowCount: 0, rows: [] }), connect: async () => ({ release() {} }) },
    authenticateAppwriteJwt: async () => null,
    trustedProxy: false,
    ...overrides,
  };
}

test("creates an inert OIDC server with one static client and private asymmetric keys", async () => {
  const { createSparkOidcServer } = await import("./oidc-server.mjs");
  const result = await createSparkOidcServer(config());
  assert.equal(result.provider.issuer, "https://identity.example.test");
  assert.equal(typeof result.provider.callback, "function");
  assert.equal(result.server.listening, false);
});

test("refuses insecure issuer, missing proxy policy, and symmetric-only signing keys", async () => {
  const { createSparkOidcServer } = await import("./oidc-server.mjs");
  await assert.rejects(createSparkOidcServer(config({ issuer: "http://identity.example.test" })), /canonical HTTPS/i);
  await assert.rejects(createSparkOidcServer(config({ trustedProxy: undefined })), /trustedProxy/i);
  await assert.rejects(createSparkOidcServer(config({ jwks: { keys: [{ kty: "oct", kid: "bad", d: "secret" }] } })), /RSA private signing key/i);
});

test("health probe returns static status without querying account storage", async () => {
  const { createSparkOidcServer } = await import("./oidc-server.mjs");
  let databaseReads = 0;
  const { server } = await createSparkOidcServer(config({
    pool: {
      async query() { databaseReads += 1; throw new Error("should not query storage"); },
      async connect() { throw new Error("should not connect to storage"); },
    },
  }));
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(databaseReads, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
