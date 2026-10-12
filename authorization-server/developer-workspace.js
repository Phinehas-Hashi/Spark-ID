"use strict";

// Trusted server-side developer workspace. No public route is exposed by this module.
// Every operation authenticates against the trusted adapter and reads current approval.
const ID = /^[A-Za-z0-9_-]{3,128}$/;
const APP_ID = /^[A-Za-z0-9_-]{8,128}$/;
const TYPES = new Set(["web", "native", "confidential"]);
function validateRedirect(uri, type) {
  if (typeof uri !== "string" || uri.length > 2048 || uri.includes("#")) throw new Error("Invalid redirect URI");
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error("Invalid redirect URI"); }
  if (parsed.username || parsed.password || !parsed.hostname || parsed.search) throw new Error("Invalid redirect URI");
  if (type === "native") {
    if (parsed.protocol !== "https:" || !parsed.pathname || parsed.pathname === "/") throw new Error("Native redirect requires an approved HTTPS app link");
  } else if (parsed.protocol !== "https:") throw new Error("HTTPS redirect required");
  if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost")) throw new Error("Local redirects require a separate reviewed development policy");
  return parsed.href;
}
function createDeveloperWorkspace({ authenticate, approvals, applications, audit, ids, clock = () => new Date().toISOString() } = {}) {
  if (typeof authenticate !== "function" || !approvals || typeof approvals.get !== "function" ||
      !applications || typeof applications.create !== "function" || typeof applications.listByOwner !== "function" ||
      typeof applications.get !== "function" || typeof applications.update !== "function" ||
      !audit || typeof audit.append !== "function" || typeof ids !== "function") throw new Error("Trusted persistent adapters required");
  async function ownerFor(credential) {
    if (typeof credential !== "string" || credential.length < 20 || credential.length > 8192) throw new Error("Unauthenticated developer");
    let principal;
    try { principal = await authenticate(credential); } catch { throw new Error("Developer authentication unavailable"); }
    if (!principal || principal.verified !== true || typeof principal.subject !== "string" || !ID.test(principal.subject)) throw new Error("Verified developer required");
    const approval = await approvals.get(principal.subject);
    if (!approval || approval.subject !== principal.subject || approval.status !== "approved" || approval.enabled !== true) throw new Error("Developer approval required");
    return principal.subject;
  }
  async function owned(credential, appId) {
    const subject = await ownerFor(credential);
    if (typeof appId !== "string" || !APP_ID.test(appId)) throw new Error("Invalid application ID");
    const app = await applications.get(appId);
    if (!app || app.ownerSubject !== subject || app.id !== appId) throw new Error("Application not found");
    return { subject, app };
  }
  return Object.freeze({
    async list(credential) {
      const subject = await ownerFor(credential);
      const rows = await applications.listByOwner(subject);
      if (!Array.isArray(rows) || rows.some(row => !row || row.ownerSubject !== subject)) throw new Error("Invalid application store response");
      return rows.map(({ id, name, type, redirects, status }) => ({ id, name, type, redirects, status }));
    },
    async register(credential, input) {
      const subject = await ownerFor(credential);
      if (!input || typeof input.name !== "string" || input.name.trim().length < 3 || input.name.trim().length > 80 || !TYPES.has(input.type) ||
          !Array.isArray(input.redirects) || input.redirects.length < 1 || input.redirects.length > 10) throw new Error("Invalid application registration");
      const redirects = input.redirects.map(uri => validateRedirect(uri, input.type));
      if (new Set(redirects).size !== redirects.length) throw new Error("Duplicate redirect URI");
      const id = ids();
      if (typeof id !== "string" || !APP_ID.test(id)) throw new Error("Invalid generated application ID");
      const record = { id, ownerSubject: subject, name: input.name.trim(), type: input.type, redirects, status: "pending", createdAt: clock() };
      const stored = await applications.create(record);
      if (!stored || stored.id !== id || stored.ownerSubject !== subject || stored.status !== "pending") throw new Error("Application store did not confirm registration");
      await audit.append({ actorSubject: subject, appId: id, action: "application_registered", occurredAt: clock() });
      return { id, name: record.name, type: record.type, redirects, status: "pending" };
    },
    async replaceRedirects(credential, appId, redirects) {
      const { subject, app } = await owned(credential, appId);
      if (!Array.isArray(redirects) || redirects.length < 1 || redirects.length > 10) throw new Error("Invalid redirect list");
      const validated = redirects.map(uri => validateRedirect(uri, app.type));
      if (new Set(validated).size !== validated.length) throw new Error("Duplicate redirect URI");
      const next = await applications.update(appId, { redirects: validated, status: "pending" });
      if (!next || next.id !== appId || next.ownerSubject !== subject || next.status !== "pending") throw new Error("Application store did not confirm update");
      await audit.append({ actorSubject: subject, appId, action: "redirects_changed_review_required", occurredAt: clock() });
      return { id: appId, redirects: validated, status: "pending" };
    }
  });
}
module.exports = { createDeveloperWorkspace, validateRedirect };
