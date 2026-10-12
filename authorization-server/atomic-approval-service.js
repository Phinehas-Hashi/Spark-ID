"use strict";
const { randomUUID } = require("node:crypto");
const SUBJECT = /^[A-Za-z0-9_-]{3,128}$/;
const STATUSES = new Set(["pending", "approved", "revoked"]);

// Production-oriented approval command boundary: the injected commit MUST
// atomically compare the expected state and persist both approval + audit.
// This module intentionally provides no unsafe sequential-write fallback.
function createAtomicApprovalService({ authenticate, adminUserId, commit, clock = () => new Date().toISOString(), ids = randomUUID } = {}) {
  if (typeof authenticate !== "function" || !SUBJECT.test(adminUserId || "") ||
      typeof commit !== "function" || typeof clock !== "function" || typeof ids !== "function")
    throw new Error("Verified administrator and atomic commit adapter required");
  return Object.freeze({
    async change(credential, targetSubject, expectedStatus, status) {
      if (typeof credential !== "string" || credential.length < 20 || credential.length > 8192)
        throw new Error("Administrator authentication required");
      let principal;
      try { principal = await authenticate(credential); } catch { throw new Error("Administrator authentication unavailable"); }
      if (!principal || principal.verified !== true || principal.subject !== adminUserId)
        throw new Error("Administrator access denied");
      if (!SUBJECT.test(targetSubject || "") || targetSubject === adminUserId ||
          !STATUSES.has(expectedStatus) || !STATUSES.has(status) || expectedStatus === status)
        throw new Error("Invalid approval transition");
      const eventId = ids();
      const occurredAt = clock();
      if (typeof eventId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(eventId) ||
          typeof occurredAt !== "string" || !Number.isFinite(Date.parse(occurredAt)))
        throw new Error("Invalid audit metadata");
      const command = Object.freeze({
        subject: targetSubject, expectedStatus, status, enabled: status === "approved",
        audit: Object.freeze({ id: eventId, actorSubject: adminUserId, targetSubject,
          action: status, previousStatus: expectedStatus, status, enabled: status === "approved", occurredAt })
      });
      // Only the adapter may assert success, after a durable atomic commit.
      const result = await commit(command);
      if (!result || result.committed !== true || result.subject !== targetSubject ||
          result.status !== status || result.enabled !== command.enabled || result.auditId !== eventId)
        throw new Error("Atomic approval and audit commit not confirmed");
      return Object.freeze({ subject: targetSubject, status, enabled: command.enabled, auditId: eventId });
    }
  });
}
module.exports = { createAtomicApprovalService };
