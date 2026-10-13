"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresApprovalTransaction } = require("./postgres-approval-transaction");
const { createAtomicApprovalCommit } = require("./atomic-approval-commit");
const command = { subject: "developer_123", expectedStatus: "pending", status: "approved", enabled: true,
  audit: { id: "audit_event_123", actorSubject: "admin_123", targetSubject: "developer_123",
    action: "approved", previousStatus: "pending", status: "approved", enabled: true, occurredAt: "2026-10-12T12:00:00Z" } };
function fixture({ auditCount = 1, updateCount = 1, commitError = false } = {}) {
  const statements = [];
  let released = false;
  const client = {
    async query(sql, params) {
      statements.push([sql, params]);
      if (sql === "COMMIT" && commitError) throw new Error("commit failed");
      if (sql.startsWith("SELECT")) return { rows: [{ subject: command.subject, status: "pending", enabled: false, version: 1 }] };
      if (sql.startsWith("UPDATE")) return { rowCount: updateCount };
      if (sql.startsWith("INSERT")) return { rowCount: auditCount };
      return {};
    },
    release() { released = true; }
  };
  const transact = createPostgresApprovalTransaction({ pool: { async connect() { return client; } } });
  return { commit: createAtomicApprovalCommit({ transact }), statements, isReleased: () => released };
}
test("commits locked approval update and audit insert in one transaction", async () => {
  const f = fixture();
  assert.equal((await f.commit(command)).committed, true);
  assert.deepEqual(f.statements.map(([sql]) => sql.split(" ")[0]), ["BEGIN", "SELECT", "UPDATE", "INSERT", "COMMIT"]);
  assert.match(f.statements[1][0], /FOR UPDATE/);
  assert.match(f.statements[2][0], /version = version \+ 1/);
  assert.equal(f.isReleased(), true);
});
test("rolls back when audit ID conflicts", async () => {
  const f = fixture({ auditCount: 0 });
  await assert.rejects(f.commit(command), /Audit conflict/);
  assert.equal(f.statements.at(-1)[0], "ROLLBACK");
  assert.equal(f.isReleased(), true);
});
test("rolls back when approval compare-and-set fails", async () => {
  const f = fixture({ updateCount: 0 });
  await assert.rejects(f.commit(command), /Approval conflict/);
  assert.equal(f.statements.some(([sql]) => sql.startsWith("INSERT")), false);
  assert.equal(f.statements.at(-1)[0], "ROLLBACK");
});
test("commit errors do not produce a successful acknowledgement", async () => {
  const f = fixture({ commitError: true });
  await assert.rejects(f.commit(command), /commit failed/);
  assert.equal(f.statements.at(-1)[0], "ROLLBACK");
  assert.equal(f.isReleased(), true);
});
test("requires a database pool", () => {
  assert.throws(() => createPostgresApprovalTransaction(), /pool required/);
});
