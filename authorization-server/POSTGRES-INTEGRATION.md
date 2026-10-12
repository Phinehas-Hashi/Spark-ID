# Atomic approval database integration test

The PostgreSQL driver is **not deployed** and does not make Appwrite approval records authoritative. Do not expose live founder approval writes until a single authoritative store is chosen and all authorization reads use it.

Use a **disposable, isolated PostgreSQL database**. Apply `sql/001-atomic-approvals.sql` first. Do not run the integration test against production: it creates and deletes records.

Install the test-only PostgreSQL driver locally from `authorization-server` with `npm install --no-save pg`. Set `SPARK_ID_TEST_DATABASE_URL` to the disposable database's connection URL and run `node --test postgres-approval.integration.test.js`. Without the environment variable the test skips; a normal green `npm test` does **not** demonstrate real database integration.

The integration test checks a committed approval and audit, rejects stale status, and verifies that a duplicate audit ID rolls back an otherwise valid approval update. It cleans up its generated records. A real concurrent multi-connection stress test, migration plan, database permissions, transaction outcome reconciliation, and deployment configuration remain separate gates. Keep credentials out of Git and logs.
