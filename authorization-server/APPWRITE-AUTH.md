# First-party Appwrite JWT authentication adapter

`appwrite-auth.js` creates a **server-side** authenticator that calls `GET /v1/account` using `X-Appwrite-Project` and `X-Appwrite-JWT`. Appwrite independently validates the supplied JWT; the adapter returns a principal only for a successful response with an active account and well-formed user ID. Network errors, timeouts and unexpected responses fail closed. It does not decode a JWT and trust its unverified claims. See Appwrite's REST documentation: https://appwrite.io/docs/apis/rest

This is a module and mocked test suite, **not a deployed endpoint or a tested live Appwrite connection**. Only a trusted first-party component should mint the short-lived JWT through Appwrite's authenticated Account API and transmit it securely to a controlled backend. Never paste JWTs into terminals, issue them to third-party clients, put them in URLs, or log them. Do not confuse an Appwrite JWT with a Spark ID OAuth access/ID token.

For future deployment: verify Appwrite JWT lifetime and account eligibility; apply transport security, replay/abuse protections, rate limits and developer enrollment checks. Prefer a separate first-party web session/BFF for developer console operations. The adapter alone does not implement developer eligibility or complete OAuth/OIDC.
