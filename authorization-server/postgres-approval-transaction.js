"use strict";

// PostgreSQL transaction driver for atomic-approval-commit.js.
// Requires a trusted pg Pool-compatible object with connect(). No SQL values
// are interpolated. Schema is fixed; use a dedicated least-privilege DB role.
function createPostgresApprovalTransaction({ pool } = {}) {
  if (!pool || typeof pool.connect !== "function") throw new Error("PostgreSQL pool required");
  return async function transact(work) {
    if (typeof work !== "function") throw new Error("Transaction callback required");
    const client = await pool.connect();
    let began = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      began = true;
      const tx = Object.freeze({
        async getUniqueApproval(subject) {
          const result = await client.query(
            "SELECT subject, status, enabled, version FROM developer_approvals WHERE subject = $1 FOR UPDATE", [subject]);
          if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) return null;
          const row = result.rows[0];
          return { subject: row.subject, status: row.status, enabled: row.enabled, version: String(row.version) };
        },
        async compareAndSetApproval({ subject, expectedVersion, expectedStatus, status, enabled }) {
          const result = await client.query(
            "UPDATE developer_approvals SET status = $1, enabled = $2, version = version + 1 WHERE subject = $3 AND version = $4 AND status = $5",
            [status, enabled, subject, expectedVersion, expectedStatus]);
          return result.rowCount === 1;
        },
        async insertAuditOnce(event) {
          const result = await client.query(
            "INSERT INTO developer_approval_audit (id, actor_subject, target_subject, action, previous_status, status, enabled, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING",
            [event.id, event.actorSubject, event.targetSubject, event.action, event.previousStatus, event.status, event.enabled, event.occurredAt]);
          return result.rowCount === 1;
        }
      });
      const result = await work(tx);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began) {
        try { await client.query("ROLLBACK"); }
        catch (rollbackError) { throw new AggregateError([error, rollbackError], "Transaction and rollback failed; outcome requires reconciliation"); }
      }
      throw error;
    } finally {
      client.release();
    }
  };
}
module.exports = { createPostgresApprovalTransaction };
