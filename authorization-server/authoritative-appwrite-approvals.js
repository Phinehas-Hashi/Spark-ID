"use strict";
const { createAppwriteApprovalLookup } = require("./appwrite-approval-store");

// One authoritative source for developer access decisions: Appwrite.
// Intentionally exposes no mutation interface. Legacy sequential writes and
// PostgreSQL transaction drivers must not be wired to production approval routes.
function createAuthoritativeAppwriteApprovals(options = {}) {
  const lookup = createAppwriteApprovalLookup(options);
  return Object.freeze({
    async get(subject) {
      const row = await lookup(subject);
      if (!row || row.enabled !== (row.status === "approved")) return null;
      return Object.freeze({ subject: row.subject, status: row.status, enabled: row.enabled });
    }
  });
}
module.exports = { createAuthoritativeAppwriteApprovals };
