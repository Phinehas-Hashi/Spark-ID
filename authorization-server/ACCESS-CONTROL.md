# Developer Access Control v0.1 — internal-only policy

The `access-control.js` service composes the existing authenticated developer service with a separate, trusted server-side `lookupApproval(subject)` adapter. A verified Appwrite identity alone is insufficient: the returned approval must match the authenticated subject, have `status: "approved"` and `enabled: true`. Approval is checked again on **every** registry operation. Errors fail closed.

This is a **policy seam**, not a deployed approval database or public API. The approval adapter used in tests is an in-memory fixture and must not be copied into production as a self-approval endpoint. A request body's `ownerId`, `status` or `approved` fields do not determine identity, developer eligibility, or registration status. New applications remain `pending_review`.

Production prerequisites: independently verified first-party authentication, authenticated and audited administrator workflow, durable approval records with transaction safety, revocation propagation, rate limits, developer terms and review process, and secure backend deployment. Never allow public callers to mutate approval records. This module does not issue OAuth credentials or tokens.

Run `npm.cmd test` from `authorization-server`.
