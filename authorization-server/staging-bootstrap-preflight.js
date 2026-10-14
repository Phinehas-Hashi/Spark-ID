"use strict";
// Read-only, fail-closed staging fixture preflight. No create/update/delete methods.
const { validateStagingBootstrap } = require("./staging-bootstrap-policy");
const ID = /^[A-Za-z0-9_-]{3,128}$/;
function createStagingBootstrapPreflight({ authenticate, listApprovalRows, administratorSubject } = {}) {
  if (typeof authenticate !== "function" || typeof listApprovalRows !== "function" ||
      typeof administratorSubject !== "string" || !ID.test(administratorSubject))
    throw new Error("Trusted preflight adapters required");
  return Object.freeze({
    async inspect({ credential, endpoint, projectId, confirmedProjectId, developerSubject } = {}) {
      const plan = validateStagingBootstrap({ endpoint, projectId, confirmedProjectId,
        administratorSubject, developerSubject });
      if (typeof credential !== "string" || credential.length < 20 || credential.length > 8192)
        throw new Error("Verified administrator required");
      let principal;
      try { principal = await authenticate(credential); }
      catch { throw new Error("Administrator verification unavailable"); }
      if (!principal || principal.verified !== true || principal.subject !== administratorSubject)
        throw new Error("Administrator access denied");
      // Adapter must query the exact subject with an explicit limit of two, so
      // ambiguity is visible rather than silently selecting the first row.
      const rows = await listApprovalRows(developerSubject, 2);
      if (!Array.isArray(rows) || rows.length !== 0)
        throw new Error("Bootstrap target is not confirmed absent");
      return Object.freeze({ ...plan, eligibleForSeparateReview: true, writePerformed: false });
    }
  });
}
module.exports = { createStagingBootstrapPreflight };
