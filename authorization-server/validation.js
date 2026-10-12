"use strict";
// Pre-registration validation only. This module does not issue credentials or tokens.
const { URL } = require("node:url");
const crypto = require("node:crypto");
const RESERVED = new Set(["openid", "profile", "email"]);
function validateRedirectUri(value, { allowLoopback = false } = {}) {
  if (typeof value !== "string" || value.length > 2048 || !value || /[\u0000-\u0020\\]/.test(value))
    throw new Error("Invalid redirect URI");
  let uri;
  try { uri = new URL(value); } catch { throw new Error("Invalid redirect URI"); }
  if (uri.username || uri.password || uri.hash || uri.search)
    throw new Error("Redirect URI must not contain credentials, fragment or query");
  if (uri.protocol !== "https:") {
    const loopback = uri.protocol === "http:" && (uri.hostname === "127.0.0.1" || uri.hostname === "[::1]");
    if (!allowLoopback || !loopback) throw new Error("HTTPS redirect URI required");
  }
  if (!uri.hostname || uri.hostname.endsWith(".") || uri.hostname === "localhost" || uri.port === "0")
    throw new Error("Invalid redirect host");
  if (uri.href !== value) throw new Error("Redirect URI must use canonical URL form");
  return value;
}
function validateRegistration(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid application");
  const name = input.name;
  if (typeof name !== "string" || name.trim().length < 3 || name.trim().length > 80) throw new Error("App name must be 3–80 characters");
  if (!Array.isArray(input.redirectUris) || input.redirectUris.length < 1 || input.redirectUris.length > 10)
    throw new Error("Provide 1–10 redirect URIs");
  const redirectUris = input.redirectUris.map(uri => validateRedirectUri(uri));
  if (new Set(redirectUris).size !== redirectUris.length) throw new Error("Duplicate redirect URI");
  return Object.freeze({ name: name.trim(), redirectUris: Object.freeze(redirectUris) });
}
function validatePkce({ challenge, method }) {
  if (method !== "S256" || typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge))
    throw new Error("PKCE S256 required");
  return challenge;
}
function verifyPkce(verifier, challenge) {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  try {
    validatePkce({ challenge, method: "S256" });
    const actual = crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(challenge));
  } catch { return false; }
}
function validateScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some(s => !RESERVED.has(s)) || new Set(scopes).size !== scopes.length)
    throw new Error("Invalid scopes");
  return [...scopes];
}
module.exports = { validateRedirectUri, validateRegistration, validatePkce, verifyPkce, validateScopes };
