# Build 2.1 — First-party developer console integration boundary

Status: implementation scaffold, not deployed or connected to a public backend.

## Android authentication
`SparkAuth.createFirstPartyJwt` checks `GET /account` before minting `POST /account/jwts`. Appwrite must accept the fully authenticated session (including MFA). The returned JWT is short-lived, callback-only, and must never be persisted, logged, included in URLs, or given to third-party apps.

## Server authentication and authorization
Use `createAppwriteAuthenticator` from `appwrite-auth.js` as the trusted server-side `authenticate` adapter. The API must independently check developer approval against the authoritative Appwrite record for **every** operation. No client-supplied subject or approval flag is trusted.

The repository contains internal handlers for owner-scoped developer workspace operations and a local-only `developer-http.js` prototype. They are **not** a deployed production API. Do not expose them directly on a public port. The local file registry is not the production approval or application store.

## Integration sequence
1. Choose a controlled HTTPS API origin and configure backend secret management.
2. Bind Appwrite authentication and authoritative approval adapters to the production workspace handler; use durable owner-scoped app storage and audited review changes.
3. Enforce request size limits, rate limits, HTTPS, error redaction, and no-store responses.
4. Add a first-party Android API client that requests a JWT only when the user explicitly enters or refreshes the Developer Hub, passes it in an Authorization header to the trusted API origin, and discards it after use. Never log it.
5. Handle 401 by requiring fresh sign-in/MFA; handle 403 as not approved; never allow founder self-approval.
6. Test with approved, pending, revoked and cross-owner accounts before deployment.

No OAuth/OIDC authorization-code, consent, token, discovery, or JWKS endpoint is live. A first-party Appwrite JWT is not a third-party Spark ID access token.
