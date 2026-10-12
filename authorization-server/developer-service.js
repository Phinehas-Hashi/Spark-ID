"use strict";
// Internal integration seam only. No HTTP listener or built-in authentication.
// The injected authenticate() MUST independently validate credentials server-side.
const { createRegistration, getOwnedRegistration } = require("./registry");
function createDeveloperService({ directory, authenticate }) {
  if (typeof directory !== "string" || !directory || typeof authenticate !== "function")
    throw new Error("Trusted directory and authentication adapter required");
  async function ownerFor(credential) {
    // Reject accidental direct identity objects; only the adapter decides identity.
    if (typeof credential !== "string" || !credential || credential.length > 8192)
      throw new Error("Invalid credential");
    const principal = await authenticate(credential);
    if (!principal || principal.verified !== true ||
        typeof principal.subject !== "string" ||
        !/^[A-Za-z0-9_-]{3,128}$/.test(principal.subject))
      throw new Error("Unauthenticated developer");
    return principal.subject;
  }
  return Object.freeze({
    async register(credential, application) {
      const ownerId = await ownerFor(credential);
      return createRegistration(directory, ownerId, application);
    },
    async get(credential, clientId) {
      const ownerId = await ownerFor(credential);
      return getOwnedRegistration(directory, ownerId, clientId);
    }
  });
}
module.exports = { createDeveloperService };
