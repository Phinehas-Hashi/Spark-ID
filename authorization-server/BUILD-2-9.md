# Build 2.9 — isolated negative-path integration gate

The opt-in `isolated-appwrite.integration.test.js` now includes a read-only invalid-credential case alongside the approved-owner case. Both require `SPARK_ID_RUN_APPWRITE_INTEGRATION=true`, `SPARK_ID_ISOLATED_APPWRITE_PROJECT=true`, and the validated isolated Appwrite environment. Neither writes to Appwrite or logs credentials.

The negative test checks malformed credentials fail locally, a syntactically valid but invalid JWT is rejected by real Appwrite account verification, and the developer listing denies that JWT before listing applications.

Run `npm test` for the default suite; the real Appwrite cases remain skipped until explicitly opted in. Never commit or paste JWTs or API keys. The test does not establish revoked-approval or foreign-owner behavior against real fixtures: those still require a dedicated isolated-project fixture plan and must not be claimed as verified. Production deployment and Android backend connection remain disabled.
