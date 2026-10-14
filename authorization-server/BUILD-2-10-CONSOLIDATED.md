# Spark ID backend: consolidated local handoff

## Verified boundaries

- The current staging preflight is **read-only**. It checks a separately authenticated administrator, validates the exact staging project, and requires zero existing developer approval rows. It does not create, approve, revoke or audit a row.
- The production Appwrite project must not be used for staging fixtures.
- Existing Appwrite developer approvals remain authoritative for access decisions; pending, revoked and disabled records are denied.
- The existing sequential `approval-management.js` plus `appwrite-audit-store.js` is **not atomic**. Do not expose it as a live approval endpoint. The existing atomic command requires a real all-or-nothing persistence adapter; the PostgreSQL example must not silently replace Appwrite authority.
- The `developer-api.js` handler is dependency-injected and is not automatically mounted in `read-only-server.js`. It now rejects browser Origin requests and handles thrown non-Error values without leaking details.
- The existing developer workspace writes application records before appending an audit event. Audit failure is surfaced, but cannot undo an already-persisted application; do not describe that path as transactional.
- There is no deployed OAuth/OIDC token issuer, signing-key lifecycle, consent screen, public app approval, or production readiness certification.

## Next integration gate (deliberately not run by this package)

1. Design a durable, authoritative atomic approval+audit storage mechanism compatible with Appwrite's approval read authority; prove rollback and compare-and-swap under concurrency.
2. Independently verify the administrator's staging JWT using `/account`, without recording the token in source, logs or chat.
3. Provision and verify a private audit schema using a separately reviewed, create-only migration. Never rerun the original provisioning script on a populated database.
4. Only then allow a separately authorized, staging-only pending fixture write and opt-in integration tests.
5. Run the full local suite, integration suite in isolation, security review and API contract tests before considering deployment.

## Running

`npm.cmd test` (Windows PowerShell) or `npm test` (other shells). No live database calls are made by the new preflight tests. Do not commit `.env`, API keys or JWTs.
