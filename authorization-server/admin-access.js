"use strict";

// Internal Spark ID administrator authorization.
// This module grants no privileges based on an unverified user ID.

const ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

function createAdminAuthorizer({
  authenticate,
  adminUserId = process.env.SPARK_ID_BOOTSTRAP_ADMIN_USER_ID
} = {}) {
  if (typeof authenticate !== "function") {
    throw new Error("A trusted authentication adapter is required");
  }

  if (typeof adminUserId !== "string" || !ID_PATTERN.test(adminUserId)) {
    throw new Error("A valid bootstrap administrator ID is required");
  }

  return async function isAdministrator(credential) {
    if (
      typeof credential !== "string" ||
      credential.length < 20 ||
      credential.length > 8192
    ) {
      return false;
    }

    try {
      const principal = await authenticate(credential);

      return Boolean(
        principal &&
        principal.verified === true &&
        typeof principal.subject === "string" &&
        ID_PATTERN.test(principal.subject) &&
        principal.subject === adminUserId
      );
    } catch {
      return false;
    }
  };
}

module.exports = { createAdminAuthorizer };