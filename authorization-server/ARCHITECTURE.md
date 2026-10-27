# Spark ID authorization server — engineering boundary (v0.3 foundation)

Status: **local integration foundation only**. `oidc-server.mjs` now composes the OIDC protocol library, PostgreSQL storage and an explicit Spark ID app handoff. It has not been activated, hosted, or connected to Spark Studio. No production issuer, signing keys, or client credentials exist in this milestone. Do not connect third-party apps to Appwrite account cookies. Spark Studio remains on its current Supabase login until a production provider and backend identity bridge are deployed and verified.

## Trust boundaries
- Appwrite authenticates Spark ID's first-party accounts; a separate confidential server must securely validate that identity and manage its own authorization transactions.
- Third-party applications are OAuth clients, never recipients of Appwrite session cookies, user passwords, or privileged Appwrite keys.
- A protected developer console registers clients and verifies developer ownership. Registration requests require authentication, abuse controls and audit logs; validation alone is not authorization.
- A durable transactional database holds client registrations, exact redirect URIs, one-time hashed authorization codes, consents and revocations. No tokens or secrets in GitHub Pages.
- Production issuer uses a controlled HTTPS domain and managed asymmetric signing keys with rotation, discovery metadata and JWKS.

## Required before any live release
GitHub Pages is a static host and can serve the email callback UI, but cannot host the dynamic authorization, token, consent or discovery endpoints.
1. Threat model, domain ownership, production hosting and secret management.
2. Authenticated developer registration, verified app ownership, review, strict redirect allowlist and least-privilege scope policy.
3. Authorization-code flow: authenticate user, bind transaction to client/redirect/subject/scopes, validate state and PKCE S256, show consent; short-lived single-use code with atomic redemption and replay rejection.
4. Token endpoint: confidential-client authentication where applicable, PKCE verifier validation, issuer/audience/expiry/nonce checks, asymmetric signed ID tokens, scoped audience-bound access tokens, rotation/revocation policies.
5. Discovery, JWKS, userinfo where supported, rate limiting, monitoring, audit logging, anti-CSRF, phishing protections and account recovery risk review.
6. Independent security review, conformance tests and first-party pilot before issuing third-party credentials.

## Initial local-only module
`authorization-server/validation.js` is dependency-free CommonJS and contains conservative registration, HTTPS redirect URI, PKCE S256 and scope validation. It intentionally **does not** expose HTTP routes or persist applications. Loopback HTTP is opt-in for a future native-client policy; it is not enabled for registrations. Run `node --test authorization-server/validation.test.js` with Node 20+.

## Local-only authorization-code core
`authorization-server/authorization-code-service.js` is a local-only authorization-code core. It independently validates the Appwrite JWT through an injected trusted authenticator, requires an approved client, exact redirect match, allowlisted scopes, a server-verified one-time consent record, and PKCE S256. It stores only a hash of the short-lived code through an injected atomic store and consumes the code on a failed PKCE attempt. Its returned grant is for a future trusted token endpoint only. There is no production consent UI, durable consent/code adapter, HTTP route, ID/access-token signer, discovery document, or JWKS; do not expose this module or use it for real accounts.

## Local-only OIDC storage groundwork
`authorization-server/postgres-oidc-adapter.js` implements persistence for `oidc-provider` state, and `authorization-server/oidc-server.mjs` composes a single static client with PKCE, asymmetric signing keys, a verified Appwrite JWT handoff, and browser-bound interactions. The schema is in `authorization-server/sql/002-oidc-provider-state.sql`. No listener starts on import. The interaction implementation is unverified and local-only; follow `authorization-server/OIDC-LOCAL-FOUNDATION.md`. Apply the migration only to a disposable local database until a reviewed deployment plan exists.

## Scope note
The initial `openid`, `profile`, `email` names are an illustrative allowlist, not live supported scopes. Ignite Pay financial privileges are explicitly outside this default identity scope.
