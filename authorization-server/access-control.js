"use strict";
// Internal authorization policy. The approval source MUST be trusted server-side storage.
// This module does not provide a public endpoint or an administrator approval mechanism.
const { createDeveloperService } = require("./developer-service");
function createApprovedDeveloperService({ directory, authenticate, lookupApproval }) {
  if (typeof authenticate !== "function" || typeof lookupApproval !== "function")
    throw new Error("Authentication and trusted approval adapters required");
  const approvedAuthenticate = async credential => {
    const principal = await authenticate(credential);
    if (!principal || principal.verified !== true ||
        typeof principal.subject !== "string" ||
        !/^[A-Za-z0-9_-]{3,128}$/.test(principal.subject)) return null;
    // Recheck approval on each operation; fail closed on storage outages or malformed records.
    try {
      const approval = await lookupApproval(principal.subject);
      if (!approval || approval.subject !== principal.subject ||
          approval.status !== "approved" || approval.enabled !== true) return null;
    } catch { return null; }
    return principal;
  };
  return createDeveloperService({ directory, authenticate: approvedAuthenticate });
}
module.exports = { createApprovedDeveloperService };
