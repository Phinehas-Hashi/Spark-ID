# Build 2.7 — developer listing response contract

The read-only listing endpoint is `GET /v1/developer/apps`.

- 200: current verified and independently approved developer; returns only their own application projections.
- 401: missing or malformed Bearer header (before authentication).
- 403: trusted listing policy explicitly denied access, including inactive or unapproved principal.
- 503: authentication adapter, authority lookup, or application storage unavailable or unexpected failure.

The typed internal `DEVELOPER_ACCESS_DENIED` code is created only by the trusted listing policy. Do not map arbitrary exception messages to authorization responses. The HTTP response never includes credentials, internal exception messages or database details.

The Android client remains disconnected by default until a reviewed HTTPS deployment passes real integration checks. Public OAuth/OIDC issuance remains disabled.
