"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApprovalManagementService } = require("./approval-management");

const ADMIN = "6accc331003881f2cb4a";
const DEV = "developer_123";
const TOKEN = "a-valid-test-credential-long-enough";

function setup(overrides = {}) {
  const rows = new Map([[DEV, { subject: DEV, status: "pending", enabled: false }]]);
  const events = [];
  const calls = [];
  const service = createApprovalManagementService({
    adminUserId: ADMIN,
    authenticate: async token => {
      calls.push(token);
      if (overrides.authError) throw new Error("offline");
      if (token === "other-user-credential-long-enough") {
        return { verified: true, subject: DEV };
      }
      if (token === "unverified-credential-long-enough") {
        return { verified: false, subject: ADMIN };
      }
      return { verified: true, subject: ADMIN };
    },
    approvals: {
      async get(subject) {
        if (overrides.readError) throw new Error("database offline");
        return rows.get(subject) || null;
      },
      async setStatus(next) {
        if (overrides.writeError) throw new Error("write failed");
        rows.set(next.subject, { ...next });
        return rows.get(next.subject);
      }
    },
    audit: {
      async append(event) {
        if (overrides.auditError) throw new Error("audit offline");
        events.push(event);
      }
    },
    clock: () => "2026-10-12T12:00:00.000Z"
  });
  return { service, rows, events, calls };
}

test("verified administrator can approve and audit a developer", async () => {
  const { service, rows, events } = setup();
  assert.deepEqual(await service.setDeveloperStatus(TOKEN, DEV, "approved"), {
    subject: DEV, status: "approved", enabled: true
  });
  assert.deepEqual(rows.get(DEV), { subject: DEV, status: "approved", enabled: true });
  assert.deepEqual(events, [{
    actorSubject: ADMIN, targetSubject: DEV, action: "approved",
    previousStatus: "pending", status: "approved", enabled: true,
    occurredAt: "2026-10-12T12:00:00.000Z"
  }]);
});

test("verified administrator can revoke and disable a developer", async () => {
  const { service, rows } = setup();
  await service.setDeveloperStatus(TOKEN, DEV, "revoked");
  assert.deepEqual(rows.get(DEV), { subject: DEV, status: "revoked", enabled: false });
});

test("rejects non-admin, unverified, malformed, and unavailable authentication", async () => {
  for (const [overrides, credential] of [
    [{}, "other-user-credential-long-enough"],
    [{}, "unverified-credential-long-enough"],
    [{ authError: true }, TOKEN]
  ]) {
    const { service } = setup(overrides);
    await assert.rejects(service.setDeveloperStatus(credential, DEV, "approved"));
  }
  const { service } = setup();
  await assert.rejects(service.setDeveloperStatus("short", DEV, "approved"));
});

test("rejects self-approval and invalid status without touching storage", async () => {
  const { service, events } = setup();
  await assert.rejects(service.setDeveloperStatus(TOKEN, ADMIN, "approved"), /own account/);
  await assert.rejects(service.setDeveloperStatus(TOKEN, DEV, "superuser"), /Invalid approval status/);
  assert.equal(events.length, 0);
});

test("fails closed for missing records and database outages", async () => {
  const { service } = setup();
  await assert.rejects(service.setDeveloperStatus(TOKEN, "missing_user", "approved"), /valid developer approval record/);
  const broken = setup({ readError: true });
  await assert.rejects(broken.service.setDeveloperStatus(TOKEN, DEV, "approved"), /database offline/);
});

test("does not report success if persistence or audit fails", async () => {
  await assert.rejects(setup({ writeError: true }).service.setDeveloperStatus(TOKEN, DEV, "approved"), /write failed/);
  await assert.rejects(setup({ auditError: true }).service.setDeveloperStatus(TOKEN, DEV, "approved"), /audit offline/);
});

test("requires persistent approval and audit adapters", () => {
  assert.throws(() => createApprovalManagementService({
    authenticate: async () => ({ verified: true, subject: ADMIN }),
    adminUserId: ADMIN
  }), /persistent approval store/);
});
