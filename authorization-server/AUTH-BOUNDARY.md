# Authentication boundary (local-only)

`developer-service.js` introduces a dependency-injected authentication boundary between a future API and the local registry. The service accepts only a credential string and calls a trusted server-side `authenticate(credential)` adapter; only an adapter response with `{verified: true, subject: "..."}` can select the owner. Application input cannot select or override the owner. The test adapter uses fake local strings **only inside tests** and is not production authentication.

**No actual Appwrite credential validation is implemented.** Never use a client-supplied JSON principal or a function that merely decodes a token. Before deploying: implement independent credential verification using the supported Appwrite server-side session validation path or a separate hardened login bridge; validate expiry, issuer/audience as relevant, revocation and developer eligibility. Add rate limiting, audit trails, transactional storage, authenticated HTTP middleware, CSRF protections for cookie sessions, and review workflows. Do not expose this module as a public endpoint.

Run `npm.cmd test` in `authorization-server`. This milestone issues no developer credentials, OAuth codes or tokens.
