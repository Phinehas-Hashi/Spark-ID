"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createOidcHandoffService, HANDOFF_TTL_MS } = require("./oidc-handoff-service");

function fixture({ principal } = {}) {
  const state = { status: "", ticketHash: "", subject: null, account: null, scopes: ["openid", "profile", "email"], expiresAt: null };
  const now = 1_800_000_000_000;
  let connects = 0;
  const pool = {
    async query(sql, params) {
      if (sql.includes("INSERT INTO oidc_login_handoffs")) {
        state.ticketHash = params[0];
        state.expiresAt = params[6];
        state.status = "pending";
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("SELECT client_name, scopes, expires_at")) {
        return state.ticketHash === params[0] && state.status === "pending"
          ? { rowCount: 1, rows: [{ client_name: "Spark Studio", scopes: state.scopes, expires_at: state.expiresAt }] }
          : { rowCount: 0, rows: [] };
      }
      if (sql.includes("UPDATE oidc_login_handoffs SET status = 'denied'")) {
        if (state.ticketHash === params[0] && state.status === "pending") {
          state.status = "denied";
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("SELECT status FROM oidc_login_handoffs")) {
        return state.status ? { rowCount: 1, rows: [{ status: state.status }] } : { rowCount: 0, rows: [] };
      }
      if (sql.includes("SELECT h.subject, a.email")) {
        return state.status === "approved"
          ? { rowCount: 1, rows: [{ subject: state.subject, email: state.account.email, email_verified: true, display_name: state.account.name, scopes: state.scopes }] }
          : { rowCount: 0, rows: [] };
      }
      throw new Error("Unexpected pool query");
    },
    async connect() {
      connects++;
      return {
        async query(sql, params) {
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rowCount: null, rows: [] };
          if (sql.includes("SELECT scopes FROM oidc_login_handoffs")) {
            return state.ticketHash === params[0] && state.status === "pending"
              ? { rowCount: 1, rows: [{ scopes: state.scopes }] }
              : { rowCount: 0, rows: [] };
          }
          if (sql.includes("INSERT INTO spark_oidc_accounts")) {
            state.account = { email: params[1], name: params[2] };
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes("UPDATE oidc_login_handoffs") && sql.includes("status = 'approved'")) {
            if (state.status !== "pending" || state.ticketHash !== params[0]) return { rowCount: 0, rows: [] };
            state.status = "approved";
            state.subject = params[1];
            return { rowCount: 1, rows: [] };
          }
          throw new Error("Unexpected transaction query");
        },
        release() {},
      };
    },
  };
  const authenticateAppwriteJwt = async (jwt) => jwt === "valid-jwt" ? principal ?? {
    verified: true,
    subject: "spark_user_123",
    email: "spark@example.com",
    emailVerified: true,
    name: "Spark User",
  } : null;
  const service = createOidcHandoffService({ pool, authenticateAppwriteJwt, now: () => now });
  return { service, state, now, get connects() { return connects; } };
}

async function createTicket(service) {
  return service.create({
    interactionUid: "interaction_123",
    clientId: "spark_studio_123",
    clientName: "Spark Studio",
    redirectUri: "https://project.supabase.co/auth/v1/callback",
    scopes: ["openid", "profile", "email"],
  });
}

test("creates a short-lived opaque ticket and stores only its hash", async () => {
  const { service, state, now } = fixture();
  const handoff = await createTicket(service);
  assert.match(handoff.ticket, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Date.parse(handoff.expiresAt), now + HANDOFF_TTL_MS);
  assert.equal(state.ticketHash, crypto.createHash("sha256").update(handoff.ticket, "ascii").digest("hex"));
  assert.notEqual(state.ticketHash, handoff.ticket);
});

test("allows only a verified Appwrite identity to approve once", async () => {
  const { service, state } = fixture();
  const handoff = await createTicket(service);
  assert.deepEqual(await service.approve({ ticket: handoff.ticket, appwriteJwt: "valid-jwt" }), { approved: true });
  assert.equal(state.status, "approved");
  assert.deepEqual(await service.approvedIdentity("interaction_123"), {
    subject: "spark_user_123",
    email: "spark@example.com",
    emailVerified: true,
    name: "Spark User",
    scopes: ["openid", "profile", "email"],
  });
  await assert.rejects(service.approve({ ticket: handoff.ticket, appwriteJwt: "valid-jwt" }), /invalid or expired/i);
});

test("rejects unverified and malformed accounts before opening a transaction", async () => {
  for (const principal of [
    { verified: false, subject: "spark_user_123", email: "spark@example.com", emailVerified: true, name: "Spark User" },
    { verified: true, subject: "spark_user_123", email: "spark@example.com", emailVerified: false, name: "Spark User" },
    { verified: true, subject: "../bad", email: "spark@example.com", emailVerified: true, name: "Spark User" },
  ]) {
    const { service, connects } = fixture({ principal });
    const handoff = await createTicket(service);
    await assert.rejects(service.approve({ ticket: handoff.ticket, appwriteJwt: "valid-jwt" }), /verified Spark ID account/i);
    assert.equal(connects, 0);
  }
});

test("declines a pending ticket and rejects invalid redirect or excessive scope", async () => {
  const { service } = fixture();
  const handoff = await createTicket(service);
  assert.equal(await service.deny(handoff.ticket), true);
  assert.equal(await service.status("interaction_123"), "denied");
  assert.equal(await service.details(handoff.ticket), null);
  await assert.rejects(service.create({
    interactionUid: "other_interaction",
    clientId: "spark_studio_123",
    clientName: "Spark Studio",
    redirectUri: "http://unsafe.example/callback",
    scopes: ["openid", "admin"],
  }), /invalid OIDC handoff request/i);
});
