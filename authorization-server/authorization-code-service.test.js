"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { CODE_TTL_MS, createAuthorizationCodeService } = require("./authorization-code-service");

const CLIENT_ID = "sid_" + "a".repeat(32);
const REDIRECT = "https://studio.example.com/auth/callback";
const VERIFIER = "v".repeat(43);
const CHALLENGE = crypto.createHash("sha256").update(VERIFIER).digest("base64url");
const STATE = "state_" + "x".repeat(24);
const CONSENT_ID = "c".repeat(43);
const APPWRITE_JWT = "header.payload.signature";

function createHarness({
  approvedClient = {
    id: CLIENT_ID,
    status: "approved",
    redirects: [REDIRECT],
    scopes: ["openid", "profile", "email"],
  },
  principal = { verified: true, subject: "spark_user_123" },
  time = 1_800_000_000_000,
} = {}) {
  const records = new Map();
  const consents = new Map([[CONSENT_ID, true]]);
  const calls = { authenticated: [], lookedUp: [] };
  const codeStore = {
    async putIfAbsent(key, record) {
      if (records.has(key)) return false;
      records.set(key, record);
      return true;
    },
    async consume(key, expected) {
      const record = records.get(key);
      if (!record) return null;
      if (
        record.expiresAt <= expected.now ||
        record.clientId !== expected.clientId ||
        record.redirectUri !== expected.redirectUri
      ) {
        return null;
      }
      records.delete(key);
      return record;
    },
  };
  const service = createAuthorizationCodeService({
    authenticateAppwriteJwt: async (jwt) => {
      calls.authenticated.push(jwt);
      return principal;
    },
    getApprovedClient: async (clientId) => {
      calls.lookedUp.push(clientId);
      return approvedClient;
    },
    consumeConsent: async (input) => {
      if (!consents.delete(input.consentId)) return false;
      return input.subject === "spark_user_123" &&
        input.clientId === CLIENT_ID &&
        input.redirectUri === REDIRECT &&
        input.scopes.every((scope) => approvedClient.scopes.includes(scope));
    },
    codeStore,
    now: () => time,
  });
  return { service, records, calls };
}

function request(overrides = {}) {
  return {
    appwriteJwt: APPWRITE_JWT,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    scopes: ["openid", "profile"],
    codeChallenge: CHALLENGE,
    codeChallengeMethod: "S256",
    state: STATE,
    nonce: "nonce_" + "n".repeat(24),
    consentId: CONSENT_ID,
    ...overrides,
  };
}

function codeFrom(result) {
  return new URL(result.redirectUrl).searchParams.get("code");
}

test("authorization binds a short-lived one-time code to verified identity and PKCE", async () => {
  const { service, records, calls } = createHarness();
  const result = await service.authorize(request());
  const callback = new URL(result.redirectUrl);
  const code = callback.searchParams.get("code");

  assert.equal(callback.origin + callback.pathname, REDIRECT);
  assert.equal(callback.searchParams.get("state"), STATE);
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(calls.authenticated[0], APPWRITE_JWT);
  assert.equal(calls.lookedUp[0], CLIENT_ID);
  assert.equal(records.size, 1);
  const [storedHash, storedRecord] = [...records.entries()][0];
  assert.equal(storedHash, crypto.createHash("sha256").update(code).digest("hex"));
  assert.equal(storedRecord.subject, "spark_user_123");
  assert.equal(storedRecord.expiresAt, 1_800_000_000_000 + CODE_TTL_MS);
  assert.equal(JSON.stringify(storedRecord).includes(code), false);

  const grant = await service.redeem({
    code,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    codeVerifier: VERIFIER,
  });
  assert.deepEqual({ ...grant, scopes: [...grant.scopes] }, {
    clientId: CLIENT_ID,
    subject: "spark_user_123",
    scopes: ["openid", "profile"],
    nonce: "nonce_" + "n".repeat(24),
  });
  assert.equal(records.size, 0);
  await assert.rejects(
    service.redeem({ code, clientId: CLIENT_ID, redirectUri: REDIRECT, codeVerifier: VERIFIER }),
    /Invalid or expired authorization code/,
  );
});

test("refuses requests without verified identity or a matching one-time consent", async () => {
  const unauthenticated = createHarness({ principal: null }).service;
  await assert.rejects(unauthenticated.authorize(request()), /Unauthenticated/);
  const unverified = createHarness({
    principal: { verified: false, subject: "spark_user_123" },
  }).service;
  await assert.rejects(unverified.authorize(request()), /Unauthenticated/);
  const { service, records } = createHarness();
  await assert.rejects(
    service.authorize(request({ consentId: "z".repeat(43) })),
    /consent is missing, expired or mismatched/,
  );
  assert.equal(records.size, 0);
});

test("rejects unapproved clients, redirects, and scopes before authentication", async () => {
  const redirect = createHarness().service;
  await assert.rejects(
    redirect.authorize(request({ redirectUri: "https://attacker.example/cb" })),
    /Client or redirect URI/,
  );
  await assert.rejects(
    redirect.authorize(request({ scopes: ["openid", "admin"] })),
    /Invalid authorization scopes/,
  );
  const limitedClient = createHarness({
    approvedClient: {
      id: CLIENT_ID,
      status: "approved",
      redirects: [REDIRECT],
      scopes: ["openid"],
    },
  });
  await assert.rejects(
    limitedClient.service.authorize(request({ scopes: ["openid", "email"] })),
    /not approved for this client/,
  );
  assert.deepEqual(limitedClient.calls.authenticated, []);
});

test("rejects pending registrations and non-S256 PKCE", async () => {
  const pending = createHarness({
    approvedClient: {
      id: CLIENT_ID,
      status: "pending",
      redirects: [REDIRECT],
      scopes: ["openid"],
    },
  }).service;
  await assert.rejects(pending.authorize(request()), /Client or redirect URI/);
  const { service, records } = createHarness();
  await assert.rejects(
    service.authorize(request({ codeChallengeMethod: "plain" })),
    /PKCE S256 required/,
  );
  assert.equal(records.size, 0);
});

test("a failed PKCE attempt consumes the code; wrong client or redirect cannot consume it", async () => {
  const { service, records } = createHarness();
  const code = codeFrom(await service.authorize(request()));

  await assert.rejects(
    service.redeem({
      code,
      clientId: CLIENT_ID,
      redirectUri: "https://other.example/cb",
      codeVerifier: VERIFIER,
    }),
    /Invalid or expired authorization code/,
  );
  assert.equal(records.size, 1);

  await assert.rejects(
    service.redeem({
      code,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT,
      codeVerifier: "w".repeat(43),
    }),
    /Invalid or expired authorization code/,
  );
  assert.equal(records.size, 0);
});

test("concurrent redemption succeeds at most once", async () => {
  const { service } = createHarness();
  const code = codeFrom(await service.authorize(request()));
  const grantRequest = {
    code,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    codeVerifier: VERIFIER,
  };
  const results = await Promise.allSettled([
    service.redeem(grantRequest),
    service.redeem(grantRequest),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("expired codes cannot be redeemed", async () => {
  let time = 1_800_000_000_000;
  const records = new Map();
  const codeStore = {
    async putIfAbsent(key, record) {
      records.set(key, record);
      return true;
    },
    async consume(key, expected) {
      const record = records.get(key);
      if (!record || record.expiresAt <= expected.now) return null;
      records.delete(key);
      return record;
    },
  };
  const service = createAuthorizationCodeService({
    authenticateAppwriteJwt: async () => ({ verified: true, subject: "spark_user_123" }),
    getApprovedClient: async () => ({
      id: CLIENT_ID,
      status: "approved",
      redirects: [REDIRECT],
      scopes: ["openid"],
    }),
    consumeConsent: async () => true,
    codeStore,
    now: () => time,
  });
  const code = codeFrom(await service.authorize(request({ scopes: ["openid"] })));
  time += CODE_TTL_MS;
  await assert.rejects(
    service.redeem({
      code,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    }),
    /Invalid or expired authorization code/,
  );
});

test("requires trusted adapters and atomic code storage", () => {
  assert.throws(() => createAuthorizationCodeService(), /Trusted authentication/);
  assert.throws(
    () => createAuthorizationCodeService({
      authenticateAppwriteJwt: async () => null,
      getApprovedClient: async () => null,
      consumeConsent: async () => false,
      codeStore: { putIfAbsent: async () => true },
    }),
    /Atomic authorization-code storage/,
  );
  assert.throws(
    () => createAuthorizationCodeService({
      authenticateAppwriteJwt: async () => null,
      getApprovedClient: async () => null,
      codeStore: { putIfAbsent: async () => true, consume: async () => null },
    }),
    /Trusted authentication, client lookup, consent and clock/,
  );
});
