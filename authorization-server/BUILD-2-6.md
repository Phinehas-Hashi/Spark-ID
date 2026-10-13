# Build 2.6 — deployment readiness gate

This is a **read-only local foundation**, not a production-ready identity provider.

## Current endpoints
- `GET /healthz`: static process liveness only; does not attest to Appwrite or database readiness.
- `GET /v1/developer/apps`: first-party Appwrite JWT required, verified identity, current approved/enabled developer, owner-scoped application list.
- No browser-origin requests, public registration, approval mutation, OAuth/OIDC token issuance or public listener in this entry point.

## Before any public deployment
1. Provision private Appwrite approvals and applications tables with correct schema and indexes; provision server-only credentials through a secret manager. Never commit credentials or place them in Android.
2. Verify the real Appwrite JWT, revoked/pending approval, owner isolation, malformed records and storage outages against an isolated environment.
3. Put service behind reviewed HTTPS ingress with a fixed hostname, TLS termination, proxy policy, request and per-identity rate limits, observability and incident response. Do not expose the local opt-in entry point directly.
4. Review authentication failure handling and ensure a denied developer is not represented as an empty approved list.
5. Verify any write route's persistence/audit consistency and independent founder review before enabling writes.
6. Only after deployment validation, configure Android with the exact trusted HTTPS origin and perform end-to-end tests.

Run `npm test` from this directory. PostgreSQL integration remains opt-in and skipped without an isolated test database. The health probe confirms process liveness only.
