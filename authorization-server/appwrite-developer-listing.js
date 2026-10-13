"use strict";
const { createAppwriteAuthenticator } = require("./appwrite-auth");
const { createAuthoritativeAppwriteApprovals } = require("./authoritative-appwrite-approvals");

// Read-only composition root. Does not import legacy sequential write services.
function createAppwriteDeveloperListing({ auth, approvals, applications, authOptions, approvalOptions } = {}) {
  const authenticate = auth || createAppwriteAuthenticator(authOptions);
  const authority = approvals || createAuthoritativeAppwriteApprovals(approvalOptions);
  if (typeof authenticate !== "function" || !authority || typeof authority.get !== "function" ||
      !applications || typeof applications.listByOwner !== "function")
    throw new Error("Trusted developer listing adapters required");
  return async function list(credential) {
    if (typeof credential !== "string" || credential.length < 20 || credential.length > 8192)
      throw new Error("Authentication required");
    const principal = await authenticate(credential);
    if (!principal || principal.verified !== true || typeof principal.subject !== "string" ||
        !/^[A-Za-z0-9_-]{3,128}$/.test(principal.subject)) throw Object.assign(new Error("Developer access denied"), { code: "DEVELOPER_ACCESS_DENIED" });
    const approval = await authority.get(principal.subject);
    if (!approval || approval.subject !== principal.subject || approval.status !== "approved" || approval.enabled !== true)
      throw new Error("Developer access denied");
    const rows = await applications.listByOwner(principal.subject);
    if (!Array.isArray(rows) || rows.some(row => !row || row.ownerSubject !== principal.subject))
      throw new Error("Invalid application store response");
    return rows.map(({ id, name, type, redirects, status }) => ({ id, name, type, redirects, status }));
  };
}
module.exports = { createAppwriteDeveloperListing };
