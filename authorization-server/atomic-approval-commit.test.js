"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAtomicApprovalCommit } = require("./atomic-approval-commit");
const command = { subject: "developer_123", expectedStatus: "pending", status: "approved", enabled: true,
  audit: { id: "audit_event_123", actorSubject: "admin_123", targetSubject: "developer_123",
    previousStatus: "pending", status: "approved", enabled: true, action: "approved", occurredAt: "2026-10-12T12:00:00Z" } };
function fixture(options = {}) {
  const staged = [];
  const commit = createAtomicApprovalCommit({ transact: async callback => {
    const result = await callback({
      getUniqueApproval: async () => options.current === undefined ?
        { subject: command.subject, status: "pending", enabled: false, version: "version_1" } : options.current,
      compareAndSetApproval: async change => { staged.push(["approval", change]); return options.cas !== false; },
      insertAuditOnce: async event => { staged.push(["audit", event]); return options.audit !== false; }
    });
    return options.confirm === false ? null : result;
  } });
  return { commit, staged };
}
test("stages version-checked approval and audit together", async () => {
  const { commit, staged } = fixture();
  assert.deepEqual(await commit(command), { committed: true, subject: command.subject, status: "approved", enabled: true, auditId: command.audit.id });
  assert.equal(staged[0][1].expectedVersion, "version_1");
  assert.equal(staged[1][1].id, command.audit.id);
});
test("stale approval never stages any writes", async () => {
  const { commit, staged } = fixture({ current: { subject: command.subject, status: "revoked", enabled: false, version: "version_2" } });
  await assert.rejects(commit(command), /conflict/);
  assert.equal(staged.length, 0);
});
test("CAS conflict prevents audit staging", async () => {
  const { commit, staged } = fixture({ cas: false });
  await assert.rejects(commit(command), /conflict/);
  assert.equal(staged.length, 1);
});
test("audit insertion failure rejects the transaction", async () => {
  await assert.rejects(fixture({ audit: false }).commit(command), /Audit conflict/);
});
test("missing durable acknowledgement cannot report success", async () => {
  await assert.rejects(fixture({ confirm: false }).commit(command), /not confirmed/);
});
test("invalid command and missing transaction adapter fail closed", async () => {
  assert.throws(() => createAtomicApprovalCommit(), /transaction adapter/);
  const { commit } = fixture();
  await assert.rejects(commit({ ...command, enabled: false }), /Invalid/);
});
