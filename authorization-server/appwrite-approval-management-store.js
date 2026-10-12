"use strict";
const SUBJECT = /^[A-Za-z0-9_-]{3,128}$/;
const STATUS = new Set(["pending", "approved", "revoked"]);

// Inject a trusted server-side TablesDB client and Query.equal.
// A subject must resolve to exactly one row; no implicit approval creation.
function createAppwriteApprovalManagementStore({ databaseId, tableId, tablesDB, queryEqual } = {}) {
  if (typeof databaseId !== "string" || !databaseId || typeof tableId !== "string" || !tableId ||
      !tablesDB || typeof tablesDB.listRows !== "function" || typeof tablesDB.updateRow !== "function" ||
      typeof queryEqual !== "function") throw new Error("Persistent approval management adapters required");
  const config = { databaseId, tableId };
  async function find(subject) {
    if (typeof subject !== "string" || !SUBJECT.test(subject)) return null;
    const result = await tablesDB.listRows({ ...config, queries: [queryEqual("subject", subject)], total: false });
    if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) return null;
    const row = result.rows[0];
    if (!row || typeof row.$id !== "string" || !SUBJECT.test(row.$id) ||
        row.subject !== subject || !STATUS.has(row.status) || typeof row.enabled !== "boolean") return null;
    return row;
  }
  return Object.freeze({
    async get(subject) {
      const row = await find(subject);
      return row ? { subject: row.subject, status: row.status, enabled: row.enabled } : null;
    },
    async setStatus({ subject, status, enabled } = {}) {
      if (typeof subject !== "string" || !SUBJECT.test(subject) || !STATUS.has(status) ||
          enabled !== (status === "approved")) throw new Error("Invalid approval transition");
      const current = await find(subject);
      if (!current) throw new Error("A unique existing approval record is required");
      const updated = await tablesDB.updateRow({ ...config, rowId: current.$id, data: { status, enabled } });
      if (!updated || updated.$id !== current.$id || updated.subject !== subject ||
          updated.status !== status || updated.enabled !== enabled) throw new Error("Approval update not confirmed");
      return { subject, status, enabled };
    }
  });
}
module.exports = { createAppwriteApprovalManagementStore };
