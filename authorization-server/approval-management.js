"use strict";

// Internal approval-management service. No HTTP route is created here.
// Persistent storage and audit adapters must be server-side Appwrite adapters.

const ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const STATUSES = new Set(["pending", "approved", "revoked"]);

function createApprovalManagementService({
  authenticate,
  adminUserId = process.env.SPARK_ID_BOOTSTRAP_ADMIN_USER_ID,
  approvals,
  audit,
  clock = () => new Date().toISOString()
} = {}) {
  if (typeof authenticate !== "function") {
    throw new Error("A trusted authentication adapter is required");
  }
  if (typeof adminUserId !== "string" || !ID_PATTERN.test(adminUserId)) {
    throw new Error("A valid bootstrap administrator ID is required");
  }
  if (!approvals || typeof approvals.get !== "function" ||
      typeof approvals.setStatus !== "function") {
    throw new Error("A persistent approval store is required");
  }
  if (!audit || typeof audit.append !== "function") {
    throw new Error("A persistent audit store is required");
  }
  if (typeof clock !== "function") throw new Error("A clock adapter is required");

  async function administratorFor(credential) {
    if (typeof credential !== "string" || credential.length < 20 ||
        credential.length > 8192) {
      throw new Error("Unauthenticated administrator");
    }
    let principal;
    try { principal = await authenticate(credential); }
    catch { throw new Error("Administrator authentication unavailable"); }
    if (!principal || principal.verified !== true ||
        typeof principal.subject !== "string" ||
        !ID_PATTERN.test(principal.subject) ||
        principal.subject !== adminUserId) {
      throw new Error("Administrator access denied");
    }
    return principal.subject;
  }

  return Object.freeze({
    async setDeveloperStatus(credential, targetSubject, status) {
      const actor = await administratorFor(credential);
      if (typeof targetSubject !== "string" || !ID_PATTERN.test(targetSubject)) {
        throw new Error("Invalid developer subject");
      }
      if (targetSubject === actor) {
        throw new Error("Administrators cannot approve or revoke their own account");
      }
      if (!STATUSES.has(status)) throw new Error("Invalid approval status");

      // Read first so missing/ambiguous records cannot be silently created by an action.
      const current = await approvals.get(targetSubject);
      if (!current || current.subject !== targetSubject ||
          !STATUSES.has(current.status) || typeof current.enabled !== "boolean") {
        throw new Error("A single valid developer approval record is required");
      }

      const enabled = status === "approved";
      const updated = await approvals.setStatus({
        subject: targetSubject,
        status,
        enabled
      });
      if (!updated || updated.subject !== targetSubject ||
          updated.status !== status || updated.enabled !== enabled) {
        throw new Error("Approval store did not confirm the requested change");
      }

      // Audit failure is surfaced; callers must not report success if audit is unavailable.
      await audit.append({
        actorSubject: actor,
        targetSubject,
        action: status,
        previousStatus: current.status,
        status,
        enabled,
        occurredAt: clock()
      });

      return Object.freeze({
        subject: updated.subject,
        status: updated.status,
        enabled: updated.enabled
      });
    }
  });
}

module.exports = { createApprovalManagementService };
