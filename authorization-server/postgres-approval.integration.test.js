"use strict";
// Opt-in real PostgreSQL integration test. Requires a disposable database with
// sql/001-atomic-approvals.sql applied and pg installed.
// Run: SPARK_ID_TEST_DATABASE_URL=... node --test postgres-approval.integration.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createPostgresApprovalTransaction } = require("./postgres-approval-transaction");
const { createAtomicApprovalCommit } = require("./atomic-approval-commit");
const url = process.env.SPARK_ID_TEST_DATABASE_URL;
test("real database: commit, stale-write rejection, and audit rollback", { skip: !url && "Set SPARK_ID_TEST_DATABASE_URL for isolated PostgreSQL integration tests" }, async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: url, max: 3 });
  const subject = "it_" + randomUUID().replaceAll("-", "");
  const actor = "admin_" + randomUUID().replaceAll("-", "");
  const auditIds = ["evt_" + randomUUID().replaceAll("-", ""), "evt_" + randomUUID().replaceAll("-", "")];
  const commit = createAtomicApprovalCommit({ transact: createPostgresApprovalTransaction({ pool }) });
  const command = (id, previous, next) => ({
    subject, expectedStatus: previous, status: next, enabled: next === "approved",
    audit: { id, actorSubject: actor, targetSubject: subject, action: next,
      previousStatus: previous, status: next, enabled: next === "approved", occurredAt: new Date().toISOString() }
  });
  try {
    await pool.query("INSERT INTO developer_approvals(subject,status,enabled) VALUES($1,'pending',false)", [subject]);
    assert.equal((await commit(command(auditIds[0], "pending", "approved"))).committed, true);
    let state = await pool.query("SELECT status,enabled,version FROM developer_approvals WHERE subject=$1", [subject]);
    assert.equal(state.rows[0].status, "approved");
    assert.equal(state.rows[0].enabled, true);
    assert.equal(Number(state.rows[0].version), 2);
    await assert.rejects(commit(command(auditIds[1], "pending", "revoked")), /conflict/);
    await assert.rejects(commit(command(auditIds[0], "approved", "revoked")), /Audit conflict/);
    state = await pool.query("SELECT status,version FROM developer_approvals WHERE subject=$1", [subject]);
    assert.equal(state.rows[0].status, "approved");
    assert.equal(Number(state.rows[0].version), 2);
    const events = await pool.query("SELECT id FROM developer_approval_audit WHERE target_subject=$1", [subject]);
    assert.deepEqual(events.rows.map(r => r.id), [auditIds[0]]);
  } finally {
    try {
      await pool.query("BEGIN");
      await pool.query("DELETE FROM developer_approval_audit WHERE target_subject=$1", [subject]);
      await pool.query("DELETE FROM developer_approvals WHERE subject=$1", [subject]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { await pool.end(); }
  }
});
