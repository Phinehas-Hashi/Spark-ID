# Approval authority decision: Appwrite

Appwrite is the **only authoritative developer approval store** for Spark ID. All developer authorization decisions must use the server-side `createAuthoritativeAppwriteApprovals` read adapter. It returns null for missing, duplicate, malformed or inconsistent status/enabled records. Client-side UI state is not an approval grant.

**Founder writes are disabled.** Do not expose `approval-management.js` or `appwrite-approval-management-store.js` as live approval endpoints: their sequential approval-then-audit operations cannot guarantee atomic consistency. The PostgreSQL driver and SQL migration are retained as experimental code, not wired to Appwrite or production. Do not run two approval authorities.

Before enabling writes: verify Appwrite transaction support and exact SDK semantics against the deployed version; implement approval update plus durable audit in one supported atomic transaction (including concurrency control), or redesign with a proven fail-closed workflow; add real Appwrite integration tests for conflicting writers, failed audit, rollback and authorization reads; enforce server-only API keys and least privilege; document migration and recovery. Never claim atomicity from an injected mock alone.

No infrastructure deployment or table migration is performed by this decision.
