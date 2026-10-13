# Developer workspace integration (internal foundation)

This module is not an HTTP server and must not be exposed directly from GitHub Pages. Public Spark ID Connect and OAuth/OIDC token issuance remain disabled.

## Implemented
- Trusted credential authentication on every call, requiring a verified subject and current approved/enabled developer record.
- Owner-scoped application listing, pending application registration, and owner-only redirect updates that reset review to pending.
- HTTPS-only redirect policy; native redirects currently require an HTTPS app-link path. Localhost, URL fragments, embedded credentials and query-bearing redirect registrations are rejected under this conservative initial policy.
- Persistent adapter contracts for applications, approvals and audit. An audit failure rejects the operation rather than reporting success.

## Required before deployment
1. Implement server-side Appwrite authentication, persistent application and approval collections, and append-only audit storage. Never ship server API keys in Android or GitHub Pages.
2. Define transaction/outbox behavior so persistence and audit cannot diverge on failure; handle duplicate IDs and concurrent updates atomically.
3. Add protected HTTPS routes with request validation, CSRF/CORS policy where applicable, rate limits, session handling and monitoring.
4. Add independent administrator application review, scope policy, verified redirect ownership and safe credential issuance.
5. Implement and independently review authorization code + PKCE, OIDC discovery/JWKS, token lifecycle, consent and revocation before connecting third-party apps.
6. Connect native Developer Hub to the deployed service; display server-derived state only.

## Local verification

From `authorization-server` run `npm.cmd test` on Windows or `npm test` elsewhere. No network or production Appwrite credentials are needed for unit tests.

## API contract

`createDeveloperWorkspace({authenticate, approvals, applications, audit, ids, clock})` returns `list(credential)`, `register(credential, {name,type,redirects})`, and `replaceRedirects(credential,appId,redirects)`. All adapters must run in a trusted server process.
