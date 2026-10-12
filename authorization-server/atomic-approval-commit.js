"use strict";
const ID = /^[A-Za-z0-9_-]{3,128}$/;
const STATES = new Set(["pending", "approved", "revoked"]);

// Adapter for a database with atomic compare-and-swap plus audit insertion.
// transact MUST guarantee all-or-nothing durability and serializable conflict
// detection across processes; an in-memory lock is explicitly insufficient.
// The callback stages operations; transact owns their atomic commit.
function createAtomicApprovalCommit({ transact } = {}) {
  if (typeof transact !== "function") throw new Error("Atomic transaction adapter required");
  return async function commit(command) {
    if (!command || !ID.test(command.subject || "") || !STATES.has(command.expectedStatus) ||
        !STATES.has(command.status) || command.expectedStatus === command.status ||
        command.enabled !== (command.status === "approved") || !command.audit ||
        !ID.test(command.audit.id || "") || !ID.test(command.audit.actorSubject || "") ||
        command.audit.targetSubject !== command.subject || command.audit.previousStatus !== command.expectedStatus ||
        command.audit.status !== command.status || command.audit.enabled !== command.enabled ||
        command.audit.action !== command.status || !Number.isFinite(Date.parse(command.audit.occurredAt || "")))
      throw new Error("Invalid atomic approval command");
    const result = await transact(async tx => {
      if (!tx || typeof tx.getUniqueApproval !== "function" || typeof tx.compareAndSetApproval !== "function" ||
          typeof tx.insertAuditOnce !== "function") throw new Error("Incomplete transaction interface");
      const current = await tx.getUniqueApproval(command.subject);
      if (!current || current.subject !== command.subject || current.status !== command.expectedStatus ||
          current.enabled !== (current.status === "approved") || typeof current.version !== "string" || !current.version)
        throw new Error("Approval conflict or missing record");
      const changed = await tx.compareAndSetApproval({
        subject: command.subject, expectedVersion: current.version, expectedStatus: command.expectedStatus,
        status: command.status, enabled: command.enabled
      });
      if (changed !== true) throw new Error("Approval conflict");
      const inserted = await tx.insertAuditOnce({ ...command.audit });
      if (inserted !== true) throw new Error("Audit conflict");
      return { subject: command.subject, status: command.status, enabled: command.enabled, auditId: command.audit.id };
    });
    // transact must only return after durable commit, never after staging.
    if (!result || result.subject !== command.subject || result.status !== command.status ||
        result.enabled !== command.enabled || result.auditId !== command.audit.id)
      throw new Error("Atomic transaction not confirmed");
    return { committed: true, ...result };
  };
}
module.exports = { createAtomicApprovalCommit };
