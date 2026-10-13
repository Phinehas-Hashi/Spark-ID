# Build 2.8 — isolated Appwrite integration gate

This integration is **opt-in** and read-only. It does not provision tables or generate test users. Do not point it at the production project. Do not paste JWTs or API keys into chat, shell history, Git, screenshots or logs.

Provision a separate isolated Appwrite project with private approvals and applications tables, and a verified, independently approved test account. The server API key needs the minimum permissions required to read those tables. Follow the schema used by `appwrite-approval-store.js` and `appwrite-application-store.js`.

Set the following locally using your secret manager or a private, untracked environment configuration:
- `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`
- `APPWRITE_DATABASE_ID`, `APPWRITE_APPROVALS_TABLE_ID`, `APPWRITE_APPLICATIONS_TABLE_ID`
- `SPARK_ID_ISOLATED_APPWRITE_PROJECT=true`
- `SPARK_ID_RUN_APPWRITE_INTEGRATION=true`
- `SPARK_ID_TEST_APPROVED_SUBJECT`: expected isolated test account ID
- `SPARK_ID_TEST_FIRST_PARTY_JWT`: short-lived JWT minted by that verified account after MFA

Run `npm test` from `authorization-server` while the credential is still valid. The test checks the JWT's account subject, approval, and owner-scoped listing. Without explicit opt-in, it is skipped. The existing PostgreSQL test is independently skipped unless configured.

Before deployment, independently exercise pending/revoked approvals, malformed authority records, cross-owner data, expired JWT, Appwrite outage and rate limiting. This positive-path integration test alone does not establish production readiness.
