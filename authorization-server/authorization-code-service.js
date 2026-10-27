"use strict";

// Local-only authorization-code core. It does not expose HTTP endpoints or issue tokens.
const crypto = require("node:crypto");
const {
  validatePkce,
  validateScopes,
  verifyPkce,
} = require("./validation");

const CODE_TTL_MS = 2 * 60 * 1000;
const CLIENT_ID = /^sid_[0-9a-f]{32}$/;
const STATE_VALUE = /^[\x21-\x7e]{16,512}$/;
const CODE_VALUE = /^[A-Za-z0-9_-]{43}$/;

function assertCodeStore(codeStore) {
  if (
    !codeStore ||
    typeof codeStore.putIfAbsent !== "function" ||
    typeof codeStore.consume !== "function"
  ) {
    throw new Error("Atomic authorization-code storage is required");
  }
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code, "ascii").digest("hex");
}

function validScopes(scopes) {
  try {
    return validateScopes(scopes);
  } catch {
    return null;
  }
}

function createAuthorizationCodeService({
  authenticateAppwriteJwt,
  getApprovedClient,
  consumeConsent,
  codeStore,
  now = Date.now,
} = {}) {
  if (
    typeof authenticateAppwriteJwt !== "function" ||
    typeof getApprovedClient !== "function" ||
    typeof consumeConsent !== "function" ||
    typeof now !== "function"
  ) {
    throw new Error(
      "Trusted authentication, client lookup, consent and clock required",
    );
  }
  assertCodeStore(codeStore);

  return Object.freeze({
    async authorize({
      appwriteJwt,
      clientId,
      redirectUri,
      scopes,
      codeChallenge,
      codeChallengeMethod,
      state,
      nonce,
      consentId,
    }) {
      if (
        typeof clientId !== "string" ||
        !CLIENT_ID.test(clientId) ||
        typeof redirectUri !== "string" ||
        typeof state !== "string" ||
        !STATE_VALUE.test(state) ||
        typeof consentId !== "string" ||
        !CODE_VALUE.test(consentId) ||
        (nonce !== undefined &&
          (typeof nonce !== "string" || !STATE_VALUE.test(nonce)))
      ) {
        throw new Error("Invalid authorization request");
      }
      validatePkce({
        challenge: codeChallenge,
        method: codeChallengeMethod,
      });
      const requestedScopes = validScopes(scopes);
      if (!requestedScopes) throw new Error("Invalid authorization scopes");

      const client = await getApprovedClient(clientId);
      if (
        !client ||
        client.id !== clientId ||
        client.status !== "approved" ||
        !Array.isArray(client.redirects) ||
        !client.redirects.includes(redirectUri) ||
        !Array.isArray(client.scopes)
      ) {
        throw new Error("Client or redirect URI is not approved");
      }
      const allowedScopes = validScopes(client.scopes);
      if (
        !allowedScopes ||
        requestedScopes.some((scope) => !allowedScopes.includes(scope))
      ) {
        throw new Error("Requested scopes are not approved for this client");
      }

      const principal = await authenticateAppwriteJwt(appwriteJwt);
      if (
        !principal ||
        principal.verified !== true ||
        typeof principal.subject !== "string" ||
        !/^[A-Za-z0-9_-]{3,128}$/.test(principal.subject)
      ) {
        throw new Error("Unauthenticated Spark ID account");
      }

      const issuedAt = now();
      if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) {
        throw new Error("Invalid authorization server clock");
      }
      const consentAccepted = await consumeConsent({
        consentId,
        clientId,
        redirectUri,
        subject: principal.subject,
        scopes: requestedScopes,
        now: issuedAt,
      });
      if (consentAccepted !== true) {
        throw new Error("Authorization consent is missing, expired or mismatched");
      }
      let code;
      let stored = false;
      for (let attempt = 0; attempt < 3 && !stored; attempt++) {
        code = crypto.randomBytes(32).toString("base64url");
        stored = (await codeStore.putIfAbsent(hashCode(code), {
          clientId,
          redirectUri,
          subject: principal.subject,
          scopes: requestedScopes,
          codeChallenge,
          nonce: nonce ?? null,
          expiresAt: issuedAt + CODE_TTL_MS,
        })) === true;
      }
      if (!stored) throw new Error("Could not create authorization code");

      const callback = new URL(redirectUri);
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", state);
      return Object.freeze({ redirectUrl: callback.toString() });
    },

    async redeem({ code, clientId, redirectUri, codeVerifier }) {
      if (
        typeof code !== "string" ||
        !CODE_VALUE.test(code) ||
        typeof clientId !== "string" ||
        !CLIENT_ID.test(clientId) ||
        typeof redirectUri !== "string"
      ) {
        throw new Error("Invalid authorization code grant");
      }
      const currentTime = now();
      if (!Number.isSafeInteger(currentTime) || currentTime < 0) {
        throw new Error("Invalid authorization server clock");
      }
      const record = await codeStore.consume(hashCode(code), {
        clientId,
        redirectUri,
        now: currentTime,
      });
      if (
        !record ||
        !verifyPkce(codeVerifier, record.codeChallenge) ||
        record.clientId !== clientId ||
        record.redirectUri !== redirectUri ||
        !/^[A-Za-z0-9_-]{3,128}$/.test(record.subject || "") ||
        !validScopes(record.scopes)
      ) {
        throw new Error("Invalid or expired authorization code");
      }
      return Object.freeze({
        clientId: record.clientId,
        subject: record.subject,
        scopes: Object.freeze([...record.scopes]),
        nonce: record.nonce,
      });
    },
  });
}

module.exports = { CODE_TTL_MS, createAuthorizationCodeService };
