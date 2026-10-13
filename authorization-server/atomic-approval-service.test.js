"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAtomicApprovalService } = require("./atomic-approval-service");
const ADMIN = "admin_123", DEV = "developer_123", TOKEN = "long-valid-admin-test-token";
function setup(overrides = {}) {
  const commands = [];
  const service = createAtomicApprovalService({
    adminUserId: ADMIN, authenticate: async () => overrides.principal === undefined ?
      { verified: true, subject: ADMIN } : overrides.principal,
    ids: () => "audit_event_123", clock: () => "2026-10-12T12:00:00Z",
    commit: async command => { commands.push(command); return overrides.result === undefined ?
      { committed: true, subject: command.subject, status: command.status, enabled: command.enabled, auditId: command.audit.id } : overrides.result; }
  });
  return { service, commands };
}
test("passes expected state and audit in one atomic command", async () => {
  const { service, commands } = setup();
  assert.deepEqual(await service.change(TOKEN, DEV, "pending", "approved"), {
    subject: DEV, status: "approved", enabled: true, auditId: "audit_event_123"
  });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].expectedStatus, "pending");
  assert.equal(commands[0].audit.previousStatus, "pending");
});
test("rejects unverified or non-admin principals before commit", async () => {
  for (const principal of [null, { verified: false, subject: ADMIN }, { verified: true, subject: DEV }]) {
    const { service, commands } = setup({ principal });
    await assert.rejects(service.change(TOKEN, DEV, "pending", "approved"), /denied/);
    assert.equal(commands.length, 0);
  }
});
test("rejects stale, self-targeting and no-op command inputs", async () => {
  const { service, commands } = setup();
  await assert.rejects(service.change(TOKEN, ADMIN, "pending", "approved"), /Invalid/);
  await assert.rejects(service.change(TOKEN, DEV, "pending", "pending"), /Invalid/);
  await assert.rejects(service.change(TOKEN, DEV, "unknown", "approved"), /Invalid/);
  assert.equal(commands.length, 0);
});
test("never reports success without matching durable approval and audit acknowledgement", async () => {
  for (const result of [null, { committed: false }, { committed: true, subject: DEV, status: "approved", enabled: true, auditId: "wrong_id" }]) {
    const { service } = setup({ result });
    await assert.rejects(service.change(TOKEN, DEV, "pending", "approved"), /not confirmed/);
  }
});
test("requires atomic commit adapter; no sequential fallback", () => {
  assert.throws(() => createAtomicApprovalService({ authenticate: async () => {}, adminUserId: ADMIN }), /atomic commit/);
});
