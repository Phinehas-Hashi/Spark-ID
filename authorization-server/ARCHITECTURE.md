# Spark ID authorization server — engineering boundary (v0.2 foundation)

Status: **design and local validation only**. No deployed server, public app registration, OAuth/OIDC endpoints, signing keys, or credentials exist in this milestone. Do not connect third-party apps to Appwrite account cookies.

## Trust boundaries
- Appwrite authenticates Spark ID's first-party accounts; a separate confidential server must securely validate that identity and manage its own authorization transactions.
- Third-party applications are OAuth clients, never recipients of Appwrite session cookies, user passwords, or privileged Appwrite keys.
- A protected developer console registers clients and verifies developer ownership. Registration requests require authentication, abuse controls and audit logs; validation alone is not authorization.
- A durable transactional database holds client registrations, exact redirect URIs, one-time hashed authorization codes, consents and revocations. No tokens or secrets in GitHub Pages.
- Production issuer uses a controlled HTTPS domain and managed asymmetric signing keys with rotation, discovery metadata and JWKS.

## Required before any live release
1. Threat model, domain ownership, production hosting and secret management.
2. Authenticated developer registration, verified app ownership, review, strict redirect allowlist and least-privilege scope policy.
3. Authorization-code flow: authenticate user, bind transaction to client/redirect/subject/scopes, validate state and PKCE S256, show consent; short-lived single-use code with atomic redemption and replay rejection.
4. Token endpoint: confidential-client authentication where applicable, PKCE verifier validation, issuer/audience/expiry/nonce checks, asymmetric signed ID tokens, scoped audience-bound access tokens, rotation/revocation policies.
5. Discovery, JWKS, userinfo where supported, rate limiting, monitoring, audit logging, anti-CSRF, phishing protections and account recovery risk review.
6. Independent security review, conformance tests and first-party pilot before issuing third-party credentials.

## Initial local-only module
`authorization-server/validation.js` is dependency-free CommonJS and contains conservative registration, HTTPS redirect URI, PKCE S256 and scope validation. It intentionally **does not** expose HTTP routes or persist applications. Loopback HTTP is opt-in for a future native-client policy; it is not enabled for registrations. Run `node --test authorization-server/validation.test.js` with Node 20+.

## Scope note
The initial `openid`, `profile`, `email` names are an illustrative allowlist, not live supported scopes. Ignite Pay financial privileges are explicitly outside this default identity scope.
