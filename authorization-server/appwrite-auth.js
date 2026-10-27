"use strict";
// Internal, server-side validation of a short-lived FIRST-PARTY Appwrite JWT.
// Never forward this credential to third-party OAuth clients.
const DEFAULT_ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";
const DEFAULT_PROJECT = process.env.APPWRITE_PROJECT_ID || "6accc223002dbb161c74";
function createAppwriteAuthenticator({ endpoint = DEFAULT_ENDPOINT, projectId = DEFAULT_PROJECT, fetchImpl = globalThis.fetch, timeoutMs = 5000, includeProfile = false } = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/v1" || !projectId || typeof fetchImpl !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 || typeof includeProfile !== "boolean")
    throw new Error("Invalid Appwrite authentication configuration");
  const accountUrl = url.origin + "/v1/account";
  return async function authenticate(jwt) {
    if (typeof jwt !== "string" || jwt.length < 20 || jwt.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt))
      return null;
    try {
      const response = await fetchImpl(accountUrl, {
        method: "GET",
        headers: { "X-Appwrite-Project": projectId, "X-Appwrite-JWT": jwt, "Accept": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        cache: "no-store"
      });
      if (!response.ok) return null;
      const account = await response.json();
      if (!account || typeof account.$id !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(account.$id) || account.status !== true)
        return null;
      const principal = { verified: true, subject: account.$id };
      if (includeProfile) {
        principal.email = typeof account.email === "string" ? account.email : "";
        principal.emailVerified = account.emailVerification === true;
        principal.name = typeof account.name === "string" ? account.name : "";
      }
      return principal;
    } catch { return null; } // Fail closed; never log JWTs or leak Appwrite response.
  };
}
module.exports = { createAppwriteAuthenticator };
