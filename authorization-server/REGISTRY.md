# Local developer application registry

This is an **internal storage prototype**, not a developer API or OAuth server. `createRegistration(dir, ownerId, input)` accepts a trusted owner ID supplied by a future authenticated server; it does **not** authenticate the caller. Never expose it directly to public requests or accept a caller-provided owner ID as proof of identity.

- Validates name and exact canonical HTTPS redirect URIs with the existing validation module.
- Generates an unpredictable **public** client identifier, and persists a registration with `pending_review` status. This is not a client secret, and does not grant login or token privileges.
- Uses exclusive file creation and restrictive POSIX file permissions. Local JSON files are suitable only for development, not concurrent multi-instance production operation.
- `getOwnedRegistration` enforces an owner match as defense in depth, but caller authentication and access policy are still required.
- No HTTP listener, Appwrite privileged key, user password, consent, authorization code or token is implemented.

Run `npm.cmd test` on Windows from `authorization-server`. Production implementation must use a transactional database, server-side authentication, rate limiting, ownership checks, audit logs, review workflows, encryption/backups and controlled key management. Do not deploy the prototype as a public service.
